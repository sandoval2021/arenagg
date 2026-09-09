import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../types/env';
import { removeShield, ShieldUploadError, uploadShield } from '../services/shield-storage.service';

export const teamSettings = new Hono<Env>();

type TeamRouteError =
  | 'COMPETITION_NOT_FOUND'
  | 'NOT_A_PARTICIPANT'
  | 'TEAM_CONFIGURATION_LOCKED'
  | 'TEAM_CONFIGURATION_NOT_ALLOWED'
  | 'TEAM_NAME_TAKEN';

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => value.startsWith('https://'), 'Use uma URL HTTPS');

const updateTeamSchema = z.object({
  teamName: z.string().trim().min(2).max(60),
  teamLogoUrl: z.union([httpsUrl, z.literal(''), z.null()]).optional(),
});

async function lockCompetition(tx: Prisma.TransactionClient, competitionId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${competitionId}))`;
}

function safePrismaMeta(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  return {
    code: error.code,
    target:
      typeof error.meta?.target === 'string' || Array.isArray(error.meta?.target)
        ? error.meta.target
        : undefined,
  };
}

function mapBusinessError(error: TeamRouteError) {
  switch (error) {
    case 'COMPETITION_NOT_FOUND':
      return { status: 404 as const, body: { error } };
    case 'NOT_A_PARTICIPANT':
    case 'TEAM_CONFIGURATION_NOT_ALLOWED':
      return { status: 403 as const, body: { error } };
    case 'TEAM_CONFIGURATION_LOCKED':
    case 'TEAM_NAME_TAKEN':
      return { status: 409 as const, body: { error } };
  }
}

function mapStorageError(error: ShieldUploadError) {
  switch (error.code) {
    case 'STORAGE_NOT_CONFIGURED':
      return { status: 503 as const, body: { error: error.code } };
    case 'INVALID_IMAGE':
    case 'IMAGE_TOO_LARGE':
      return { status: 400 as const, body: { error: error.code } };
    case 'STORAGE_UPLOAD_FAILED':
      return { status: 502 as const, body: { error: error.code } };
  }
}

async function loadEditableParticipation(
  tx: Prisma.TransactionClient,
  competitionId: string,
  userId: string,
) {
  const competition = await tx.competition.findUnique({
    where: { id: competitionId },
    select: { id: true, status: true, teamSelection: true },
  });

  if (!competition) {
    return { ok: false as const, error: 'COMPETITION_NOT_FOUND' as const };
  }
  if (!['REGISTRATION', 'READY'].includes(competition.status)) {
    return { ok: false as const, error: 'TEAM_CONFIGURATION_LOCKED' as const };
  }
  if (competition.teamSelection !== 'FREE') {
    return { ok: false as const, error: 'TEAM_CONFIGURATION_NOT_ALLOWED' as const };
  }

  const participation = await tx.participation.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    include: { team: true },
  });

  if (!participation || participation.status !== 'ACTIVE') {
    return { ok: false as const, error: 'NOT_A_PARTICIPANT' as const };
  }

  return { ok: true as const, participation };
}

teamSettings.patch('/:id/my-team', async (c) => {
  const competitionId = c.req.param('id');
  const user = c.get('user');
  const raw = await c.req.json().catch(() => null);
  const parsed = updateTeamSchema.safeParse(raw);

  if (!parsed.success) {
    console.warn('[team.update] invalid input', {
      competitionId,
      userId: user.id,
      fields: parsed.error.flatten().fieldErrors,
    });
    return c.json({ error: 'INVALID_TEAM_INPUT', issues: parsed.error.flatten() }, 400);
  }

  const db = c.get('prisma');
  const { teamName, teamLogoUrl: suppliedLogo } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      await lockCompetition(tx, competitionId);
      const access = await loadEditableParticipation(tx, competitionId, user.id);
      if (!access.ok) return access;

      const { participation } = access;
      const collision = await tx.team.findFirst({
        where: {
          competitionId,
          name: teamName,
          ...(participation.team ? { NOT: { id: participation.team.id } } : {}),
        },
        select: { id: true },
      });

      if (collision) {
        return { ok: false as const, error: 'TEAM_NAME_TAKEN' as const };
      }

      // Omitting teamLogoUrl means "keep the current shield". This prevents a
      // name-only update from accidentally clearing a previously uploaded image.
      const teamLogoUrl = suppliedLogo === undefined
        ? participation.teamLogoUrl
        : suppliedLogo || null;

      await tx.participation.update({
        where: { id: participation.id },
        data: { teamName, teamLogoUrl },
      });

      if (participation.team) {
        await tx.team.update({
          where: { id: participation.team.id },
          data: { name: teamName, logoUrl: teamLogoUrl },
        });
      } else {
        await tx.team.create({
          data: {
            competitionId,
            participationId: participation.id,
            createdById: user.id,
            name: teamName,
            logoUrl: teamLogoUrl,
          },
        });
      }

      return { ok: true as const, teamName, teamLogoUrl };
    });

    if (!result.ok) {
      const mapped = mapBusinessError(result.error);
      return c.json(mapped.body, mapped.status);
    }

    return c.json({ teamName: result.teamName, teamLogoUrl: result.teamLogoUrl });
  } catch (error) {
    const prisma = safePrismaMeta(error);
    console.error('[team.update] failed', {
      competitionId,
      userId: user.id,
      teamNameLength: teamName.length,
      suppliedLogo: suppliedLogo !== undefined,
      prisma,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return c.json({ error: 'TEAM_NAME_TAKEN' }, 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return c.json({ error: 'TEAM_DATABASE_ERROR', prismaCode: error.code }, 500);
    }
    return c.json({ error: 'TEAM_UPDATE_FAILED' }, 500);
  }
});

teamSettings.post('/:id/my-team/logo', async (c) => {
  const db = c.get('prisma');
  const competitionId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File)) {
    return c.json({ error: 'IMAGE_REQUIRED' }, 400);
  }

  const initial = await db.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    return loadEditableParticipation(tx, competitionId, user.id);
  });

  if (!initial.ok) {
    const mapped = mapBusinessError(initial.error);
    return c.json(mapped.body, mapped.status);
  }

  let uploaded: { publicUrl: string; storagePath: string } | undefined;

  try {
    uploaded = await uploadShield(c.env, file, 'teams', `${competitionId}/${user.id}`);

    const result = await db.$transaction(async (tx) => {
      await lockCompetition(tx, competitionId);
      const access = await loadEditableParticipation(tx, competitionId, user.id);
      if (!access.ok) return access;

      const { participation } = access;
      await tx.participation.update({
        where: { id: participation.id },
        data: { teamLogoUrl: uploaded!.publicUrl },
      });

      if (participation.team) {
        await tx.team.update({
          where: { id: participation.team.id },
          data: { logoUrl: uploaded!.publicUrl },
        });
      } else {
        await tx.team.create({
          data: {
            competitionId,
            participationId: participation.id,
            createdById: user.id,
            name: participation.teamName,
            logoUrl: uploaded!.publicUrl,
          },
        });
      }

      return { ok: true as const, teamLogoUrl: uploaded!.publicUrl };
    });

    if (!result.ok) {
      await removeShield(c.env, uploaded.storagePath).catch(() => undefined);
      const mapped = mapBusinessError(result.error);
      return c.json(mapped.body, mapped.status);
    }

    return c.json({ teamLogoUrl: result.teamLogoUrl }, 201);
  } catch (error) {
    if (uploaded) {
      await removeShield(c.env, uploaded.storagePath).catch(() => undefined);
    }

    console.error('[team.logo-upload] failed', {
      competitionId,
      userId: user.id,
      fileSize: file.size,
      fileType: file.type,
      prisma: safePrismaMeta(error),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ShieldUploadError) {
      const mapped = mapStorageError(error);
      return c.json(mapped.body, mapped.status);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return c.json({ error: 'TEAM_DATABASE_ERROR', prismaCode: error.code }, 500);
    }
    return c.json({ error: 'TEAM_LOGO_UPLOAD_FAILED' }, 500);
  }
});
