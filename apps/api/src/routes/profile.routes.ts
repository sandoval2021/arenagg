import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import {
  isUploadFile,
  ShieldUploadError,
  uploadShield,
} from '../services/shield-storage.service';

export const profile = new Hono<Env>();

const CONSOLES = ['PS5', 'PS4', 'PC', 'Xbox', 'Nintendo', 'PS3', 'Outros'] as const;
const FORMATIONS = ['4-3-3', '4-2-4', '4-4-2', '4-4-1-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1'] as const;
const PLAYSTYLES = [
  'Troca de Passes (Tiki-Taka)',
  'Contra-ataque',
  'Jogo Equilibrado',
  'Retranca',
  'Lançamento Longo',
  'Pressão Alta',
] as const;
const consoleSchema = z.enum(CONSOLES);
const formationSchema = z.enum(FORMATIONS);
const playstyleSchema = z.enum(PLAYSTYLES);
const builtInAvatar = z.string().regex(/^\/icons\/avatars\/[a-z0-9-]+\.svg$/);

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  consoles: z.array(consoleSchema).max(CONSOLES.length).optional(),
  favoriteFormation: z.union([formationSchema, z.null()]).optional(),
  playstyle: z.union([playstyleSchema, z.null()]).optional(),
  avatarUrl: z.union([builtInAvatar, z.null()]).optional(),
});

function statsSelect() {
  return {
    totalWins: true,
    totalDraws: true,
    totalLosses: true,
    totalGoalsScored: true,
    totalGoalsConceded: true,
    championshipsWon: true,
    consoles: true,
    favoriteFormation: true,
    playstyle: true,
  } as const;
}

profile.get('/me', async (c) => {
  const db = c.get('prisma');
  const sessionUser = c.get('user');

  const [user, stats] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: sessionUser.id },
      select: { id: true, name: true, displayName: true, avatarUrl: true, email: true, phone: true },
    }),
    db.userProfile.upsert({
      where: { userId: sessionUser.id },
      create: { userId: sessionUser.id },
      update: {},
      select: statsSelect(),
    }),
  ]);

  return c.json({ ...user, ...stats });
});

profile.patch('/me', async (c) => {
  const user = c.get('user');
  const db = c.get('prisma');
  const parsed = updateProfileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'INVALID_PROFILE_INPUT', issues: parsed.error.flatten() }, 400);
  }

  const updated = await db.$transaction(async (tx) => {
    const userRow = await tx.user.update({
      where: { id: user.id },
      data: {
        ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl } : {}),
      },
      select: { id: true, name: true, displayName: true, avatarUrl: true, email: true, phone: true },
    });

    const profileCreate = {
      userId: user.id,
      consoles: parsed.data.consoles ?? [],
      favoriteFormation: parsed.data.favoriteFormation ?? null,
      playstyle: parsed.data.playstyle ?? null,
    };
    const profileUpdate = {
      ...(parsed.data.consoles !== undefined ? { consoles: parsed.data.consoles } : {}),
      ...(parsed.data.favoriteFormation !== undefined
        ? { favoriteFormation: parsed.data.favoriteFormation }
        : {}),
      ...(parsed.data.playstyle !== undefined ? { playstyle: parsed.data.playstyle } : {}),
    };

    const stats = await tx.userProfile.upsert({
      where: { userId: user.id },
      create: profileCreate,
      update: profileUpdate,
      select: statsSelect(),
    });

    return { ...userRow, ...stats };
  });

  return c.json(updated);
});

profile.post('/me/avatar', async (c) => {
  const user = c.get('user');
  const db = c.get('prisma');
  const requestId = crypto.randomUUID();
  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch (error) {
    console.error('[profile.avatar-upload] multipart parse failed', {
      requestId,
      userId: user.id,
      contentType: c.req.header('content-type'),
      contentLength: c.req.header('content-length'),
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: 'IMAGE_REQUIRED', requestId }, 400);
  }

  const file = form.get('file');
  if (!isUploadFile(file)) {
    console.warn('[profile.avatar-upload] image missing', {
      requestId,
      userId: user.id,
      contentType: c.req.header('content-type'),
      userAgent: c.req.header('user-agent'),
    });
    return c.json({ error: 'IMAGE_REQUIRED', requestId }, 400);
  }

  console.info('[profile.avatar-upload] request accepted', {
    requestId,
    userId: user.id,
    fileName: file.name?.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'unnamed',
    fileSize: file.size,
    declaredType: file.type || 'unknown',
  });

  try {
    const uploaded = await uploadShield(c.env, file, 'profiles', user.id);
    await db.user.update({ where: { id: user.id }, data: { avatarUrl: uploaded.publicUrl } });
    return c.json({ avatarUrl: uploaded.publicUrl, requestId: uploaded.requestId }, 201);
  } catch (error) {
    console.error('[profile.avatar-upload] failed', {
      requestId,
      storageRequestId: error instanceof ShieldUploadError ? error.requestId : undefined,
      userId: user.id,
      fileSize: file.size,
      declaredType: file.type || 'unknown',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ShieldUploadError) {
      const status = error.code === 'STORAGE_NOT_CONFIGURED'
        ? 503
        : error.code === 'STORAGE_UPLOAD_FAILED'
          ? 502
          : 400;
      return c.json({ error: error.code, requestId: error.requestId }, status);
    }
    return c.json({ error: 'PROFILE_AVATAR_UPLOAD_FAILED', requestId }, 500);
  }
});

profile.get('/:userId', async (c) => {
  const viewer = c.get('user');
  const db = c.get('prisma');
  const userId = c.req.param('userId');
  if (!z.string().uuid().safeParse(userId).success) return c.json({ error: 'USER_NOT_FOUND' }, 404);

  const target = await db.user.findFirst({
    where: { id: userId, isActive: true },
    select: {
      id: true,
      name: true,
      displayName: true,
      avatarUrl: true,
      profile: { select: statsSelect() },
    },
  });
  if (!target) return c.json({ error: 'USER_NOT_FOUND' }, 404);

  const friendship = viewer.id === userId
    ? null
    : await db.friendship.findFirst({
        where: {
          OR: [
            { requesterId: viewer.id, addresseeId: userId },
            { requesterId: userId, addresseeId: viewer.id },
          ],
        },
        select: { id: true, requesterId: true, status: true },
      });

  return c.json({
    id: target.id,
    name: target.name,
    displayName: target.displayName,
    avatarUrl: target.avatarUrl,
    ...(target.profile ?? {
      totalWins: 0,
      totalDraws: 0,
      totalLosses: 0,
      totalGoalsScored: 0,
      totalGoalsConceded: 0,
      championshipsWon: 0,
      consoles: [],
      favoriteFormation: null,
      playstyle: null,
    }),
    friendship: friendship
      ? {
          id: friendship.id,
          status: friendship.status,
          direction: friendship.requesterId === viewer.id ? 'OUTGOING' : 'INCOMING',
        }
      : null,
  });
});
