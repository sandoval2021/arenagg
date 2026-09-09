import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../types/env';
import { removeShield, ShieldUploadError, uploadShield } from '../services/shield-storage.service';

export const teamSettings = new Hono<Env>();

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

function storageErrorResponse(error: ShieldUploadError) {
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
  if (!competition) return { error: 'COMPETITION_NOT_FOUND' as const };
  if (!['REGISTRATION', 'READY'].includes(competition.status)) {
    return { error: 'TEAM_CONFIGURATION_LOCKED' as const };
  }
  if (competition.teamSelection !== 'FREE') {
    return { error: 'TEAM_CONFIGURATION_NOT_ALLOWED' as const };
  }

  const participation = await tx.participation.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    include: { team: true },
  });
  if (!participation || participation.status !== 'ACTIVE') {
    return { error: 'NOT_A_PARTICIPANT' as const };
  }

  return { competition, participation };
}

function businessError(error: string) {
  switch (error) {
    case 'COMPETITION_NOT_FOUND':
      return { status: 404 as const, body: { error } };
    case 'NOT_A_PARTICIPANT':
    case 'TEAM_CONFIGURATION_NOT_ALLOWED':
      return { status: 403 as const, body: { error } };
    case 'TEAM_CONFIGURATION_LOCKED':
    case 'TEAM_NAME_TAKEN':
      return { status: 409 as const, body: { error } };
    default:
      return { status: 500 as const, body: { error: 'TEAM_UPDATE_FAILED' } };
  }
}

teamSettings.patch('/:id/my-team', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = updateTeamSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[team.update] invalid input', {
      competitionId: c.req.param('id'),
      userId: c.get('user').id,
      fields: parsed.error.flatten().fieldErrors,
    });
    return c.json({ error: 'INVALID_TEAM_INPUT', issues: parsed.error.flatten() }, 400);
  }

  const db = c.get('prisma');
  const competitionId = c.req.param('id');
  const user = c.get('user');
  const teamName = parsed.data.teamName;
  const suppliedLogo = parsed.data.teamLogoUrl;

  try {
    const result = await db.$transaction(async (tx) => {
      await lockCompetition(tx, competitionId);
      const access = await loadEditableParticipation(tx, competitionId, user.id);
      if ('error' in access) return access;

      const { participation } = access;
      const collision = await tx.team.findFirst({
        where: {
          competitionId,
          name: teamName,
          ...(participation.team ? { NOT: { id: participation.team.id } } : {}),
        },
        select: { id: true },
      });
      if (collision) return { error: 'TEAM_NAME_TAKEN' as const };

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

      return { teamName, teamLogoUrl };
    });

    if ('error' in result) {
      const mapped = businessError(result.error);
      return c.json(mapped.body, mapped.status);
    }

    return c.json(result);
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
  if ('error' in initial) {
    const mapped = businessError(initial.error);
    return c.json(mapped.body, mapped.status);
  }

  let uploaded: { publicUrl: string; storagePath: string } | undefined;
  try {
    uploaded = await uploadShield(c.env, file, 'teams', `${competitionId}/${user.id}`);

    const result = await db.$transaction(async (tx) => {
      await lockCompetition(tx, competitionId);
      const access = await loadEditableParticipation(tx, competitionId, user.id);
      if ('error' in access) return access;

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

      return { teamLogoUrl: uploaded!.publicUrl };
    });

    if ('error' in result) {
      await removeShield(c.env, uploaded.storagePath).catch(() => undefined);
      const mapped = businessError(result.error);
      return c.json(mapped.body, mapped.status);
    }

    return c.json(result, 201);
  } catch (error) {
    if (uploaded) await removeShield(c.env, uploaded.storagePath).catch(() => undefined);

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
      const mapped = storageErrorResponse(error);
      return c.json(mapped.body, mapped.status);
    }
    return c.json({ error: 'TEAM_LOGO_UPLOAD_FAILED' }, 500);
  }
});
