import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../types/env';
import {
  isUploadFile,
  removeShield,
  ShieldUploadError,
  uploadShield,
  type UploadFile,
} from '../services/shield-storage.service';

export const teamSettings = new Hono<Env>();

type TeamRouteError =
  | 'COMPETITION_NOT_FOUND'
  | 'NOT_A_PARTICIPANT'
  | 'TEAM_CONFIGURATION_LOCKED'
  | 'TEAM_CONFIGURATION_NOT_ALLOWED'
  | 'TEAM_NAME_TAKEN';

const CHAVEA_WEB_ORIGIN = 'https://chavea.pages.dev';
const BUILT_IN_TEAM_ICON_PATH = /^\/icons\/teams\/[a-z0-9-]+\.svg(?:#[a-z0-9-]+)?$/;

const httpsUrl = z
  .string()
  .trim()
  .max(4096)
  .url()
  .refine((value) => value.startsWith('https://'), 'Use uma URL HTTPS');

const builtInTeamIcon = z
  .string()
  .trim()
  .max(512)
  .regex(BUILT_IN_TEAM_ICON_PATH, 'Ícone padrão inválido');

const updateTeamSchema = z.object({
  teamName: z.string().trim().min(2).max(60),
  teamLogoUrl: z.union([httpsUrl, builtInTeamIcon, z.literal(''), z.null()]).optional(),
});

function normalizeTeamLogoUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  return BUILT_IN_TEAM_ICON_PATH.test(value) ? `${CHAVEA_WEB_ORIGIN}${value}` : value;
}

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
    columnName: typeof error.meta?.column_name === 'string' ? error.meta.column_name : undefined,
    constraint: typeof error.meta?.constraint === 'string' ? error.meta.constraint : undefined,
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
  const body = { error: error.code, requestId: error.requestId };
  switch (error.code) {
    case 'STORAGE_NOT_CONFIGURED':
      return { status: 503 as const, body };
    case 'INVALID_IMAGE':
    case 'IMAGE_TOO_LARGE':
      return { status: 400 as const, body };
    case 'STORAGE_UPLOAD_FAILED':
      return { status: 502 as const, body };
  }
}

async function readMultipartImage(request: Request): Promise<UploadFile | null> {
  try {
    const form = await request.formData();
    const value = form.get('file');
    return isUploadFile(value) ? value : null;
  } catch (error) {
    console.error('[team.logo-upload] multipart parse failed', {
      contentType: request.headers.get('content-type'),
      contentLength: request.headers.get('content-length'),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
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

  if (!competition) return { ok: false as const, error: 'COMPETITION_NOT_FOUND' as const };
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

async function saveTeamRow(
  tx: Prisma.TransactionClient,
  input: {
    competitionId: string;
    participationId: string;
    createdById: string;
    name: string;
    logoUrl: string | null;
  },
) {
  return tx.team.upsert({
    where: { participationId: input.participationId },
    update: { name: input.name, logoUrl: input.logoUrl },
    create: {
      competitionId: input.competitionId,
      participationId: input.participationId,
      createdById: input.createdById,
      name: input.name,
      logoUrl: input.logoUrl,
    },
  });
}

teamSettings.patch('/:id/my-team', async (c) => {
  const competitionId = c.req.param('id');
  const user = c.get('user');
  const requestId = crypto.randomUUID();
  const raw = await c.req.json().catch(() => null);
  const parsed = updateTeamSchema.safeParse(raw);

  if (!parsed.success) {
    console.warn('[team.update] invalid input', {
      requestId,
      competitionId,
      userId: user.id,
      fields: parsed.error.flatten().fieldErrors,
    });
    return c.json({ error: 'INVALID_TEAM_INPUT', requestId, issues: parsed.error.flatten() }, 400);
  }

  const db = c.get('prisma');
  const { teamName } = parsed.data;
  const suppliedLogo = normalizeTeamLogoUrl(parsed.data.teamLogoUrl);

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
          NOT: { participationId: participation.id },
        },
        select: { id: true },
      });

      if (collision) return { ok: false as const, error: 'TEAM_NAME_TAKEN' as const };

      const teamLogoUrl = suppliedLogo === undefined
        ? participation.teamLogoUrl
        : suppliedLogo;

      await tx.participation.update({
        where: { id: participation.id },
        data: { teamName, teamLogoUrl },
      });

      await saveTeamRow(tx, {
        competitionId,
        participationId: participation.id,
        createdById: user.id,
        name: teamName,
        logoUrl: teamLogoUrl,
      });

      return { ok: true as const, teamName, teamLogoUrl };
    });

    if (!result.ok) {
      const mapped = mapBusinessError(result.error);
      return c.json({ ...mapped.body, requestId }, mapped.status);
    }

    console.info('[team.update] saved', {
      requestId,
      competitionId,
      userId: user.id,
      builtInLogo: typeof parsed.data.teamLogoUrl === 'string' && BUILT_IN_TEAM_ICON_PATH.test(parsed.data.teamLogoUrl),
      hasLogo: Boolean(result.teamLogoUrl),
    });

    return c.json({ teamName: result.teamName, teamLogoUrl: result.teamLogoUrl, requestId }, 200);
  } catch (error) {
    const prisma = safePrismaMeta(error);
    console.error('[team.update] failed', {
      requestId,
      competitionId,
      userId: user.id,
      teamNameLength: teamName.length,
      suppliedLogo: suppliedLogo !== undefined,
      logoLength: typeof suppliedLogo === 'string' ? suppliedLogo.length : 0,
      prisma,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return c.json({ error: 'TEAM_NAME_TAKEN', requestId }, 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return c.json({ error: 'TEAM_DATABASE_ERROR', prismaCode: error.code, requestId }, 500);
    }
    return c.json({ error: 'TEAM_UPDATE_FAILED', requestId }, 500);
  }
});

teamSettings.post('/:id/my-team/logo', async (c) => {
  const db = c.get('prisma');
  const competitionId = c.req.param('id');
  const user = c.get('user');
  const uploadRequestId = crypto.randomUUID();
  const file = await readMultipartImage(c.req.raw);

  if (!file) {
    console.warn('[team.logo-upload] image missing after multipart parse', {
      uploadRequestId,
      competitionId,
      userId: user.id,
      contentType: c.req.header('content-type'),
      contentLength: c.req.header('content-length'),
      userAgent: c.req.header('user-agent'),
    });
    return c.json({ error: 'IMAGE_REQUIRED', requestId: uploadRequestId }, 400);
  }

  console.info('[team.logo-upload] request accepted', {
    uploadRequestId,
    competitionId,
    userId: user.id,
    fileName: file.name?.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'unnamed',
    fileSize: file.size,
    declaredType: file.type || 'unknown',
  });

  const initial = await db.$transaction(async (tx) => {
    await lockCompetition(tx, competitionId);
    return loadEditableParticipation(tx, competitionId, user.id);
  });

  if (!initial.ok) {
    const mapped = mapBusinessError(initial.error);
    return c.json({ ...mapped.body, requestId: uploadRequestId }, mapped.status);
  }

  let uploaded: { publicUrl: string; storagePath: string; requestId: string } | undefined;

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

      await saveTeamRow(tx, {
        competitionId,
        participationId: participation.id,
        createdById: user.id,
        name: participation.teamName,
        logoUrl: uploaded!.publicUrl,
      });

      return { ok: true as const, teamLogoUrl: uploaded!.publicUrl };
    });

    if (!result.ok) {
      await removeShield(c.env, uploaded.storagePath).catch(() => undefined);
      const mapped = mapBusinessError(result.error);
      return c.json({ ...mapped.body, requestId: uploadRequestId }, mapped.status);
    }

    return c.json({ teamLogoUrl: result.teamLogoUrl, requestId: uploaded.requestId }, 201);
  } catch (error) {
    if (uploaded) await removeShield(c.env, uploaded.storagePath).catch(() => undefined);

    console.error('[team.logo-upload] failed', {
      uploadRequestId,
      storageRequestId: error instanceof ShieldUploadError ? error.requestId : uploaded?.requestId,
      competitionId,
      userId: user.id,
      fileSize: file.size,
      declaredType: file.type || 'unknown',
      prisma: safePrismaMeta(error),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ShieldUploadError) {
      const mapped = mapStorageError(error);
      return c.json(mapped.body, mapped.status);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return c.json({ error: 'TEAM_DATABASE_ERROR', prismaCode: error.code, requestId: uploadRequestId }, 500);
    }
    return c.json({ error: 'TEAM_LOGO_UPLOAD_FAILED', requestId: uploadRequestId }, 500);
  }
});
