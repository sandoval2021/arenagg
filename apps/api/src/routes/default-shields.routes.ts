import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { removeShield, ShieldUploadError, uploadShield } from '../services/shield-storage.service';

export const defaultShields = new Hono<Env>();
export const ownerShields = new Hono<Env>();

const shieldName = z.string().trim().min(2).max(40);

function storageResponse(error: ShieldUploadError) {
  switch (error.code) {
    case 'STORAGE_NOT_CONFIGURED':
      return { status: 503 as const, error: error.code };
    case 'INVALID_IMAGE':
    case 'IMAGE_TOO_LARGE':
      return { status: 400 as const, error: error.code };
    case 'STORAGE_UPLOAD_FAILED':
      return { status: 502 as const, error: error.code };
  }
}

defaultShields.get('/', async (c) => {
  const rows = await c.get('prisma').defaultShield.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, name: true, url: true },
  });
  return c.json(rows);
});

ownerShields.get('/', async (c) => {
  const rows = await c.get('prisma').defaultShield.findMany({
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  return c.json(rows);
});

ownerShields.post('/', async (c) => {
  const body = await c.req.parseBody();
  const parsedName = shieldName.safeParse(body.name);
  const file = body.file;

  if (!parsedName.success) {
    return c.json({ error: 'INVALID_SHIELD_NAME', issues: parsedName.error.flatten() }, 400);
  }
  if (!(file instanceof File)) {
    return c.json({ error: 'IMAGE_REQUIRED' }, 400);
  }

  const user = c.get('user');
  let uploaded: { publicUrl: string; storagePath: string } | undefined;

  try {
    uploaded = await uploadShield(c.env, file, 'defaults', user.id);
    const row = await c.get('prisma').defaultShield.create({
      data: {
        name: parsedName.data,
        url: uploaded.publicUrl,
        storagePath: uploaded.storagePath,
        createdById: user.id,
      },
      select: { id: true, name: true, url: true, isActive: true, sortOrder: true },
    });
    return c.json(row, 201);
  } catch (error) {
    if (uploaded) await removeShield(c.env, uploaded.storagePath).catch(() => undefined);
    console.error('[default-shield.create] failed', {
      userId: user.id,
      fileSize: file.size,
      fileType: file.type,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ShieldUploadError) {
      const mapped = storageResponse(error);
      return c.json({ error: mapped.error }, mapped.status);
    }
    return c.json({ error: 'DEFAULT_SHIELD_CREATE_FAILED' }, 500);
  }
});

ownerShields.patch('/:id', async (c) => {
  const parsed = z
    .object({
      name: shieldName.optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(9999).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, 'No changes supplied')
    .safeParse(await c.req.json().catch(() => null));

  if (!parsed.success) return c.json({ error: 'INVALID_INPUT', issues: parsed.error.flatten() }, 400);

  try {
    const row = await c.get('prisma').defaultShield.update({
      where: { id: c.req.param('id') },
      data: parsed.data,
    });
    return c.json(row);
  } catch (error) {
    console.error('[default-shield.update] failed', {
      id: c.req.param('id'),
      userId: c.get('user').id,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: 'DEFAULT_SHIELD_UPDATE_FAILED' }, 500);
  }
});

ownerShields.delete('/:id', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const row = await db.defaultShield.findUnique({ where: { id } });
  if (!row) return c.json({ error: 'DEFAULT_SHIELD_NOT_FOUND' }, 404);

  try {
    await db.defaultShield.delete({ where: { id } });
    await removeShield(c.env, row.storagePath).catch((error) => {
      console.warn('[default-shield.delete] storage cleanup failed', {
        id,
        storagePath: row.storagePath,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
    return c.body(null, 204);
  } catch (error) {
    console.error('[default-shield.delete] failed', {
      id,
      userId: c.get('user').id,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: 'DEFAULT_SHIELD_DELETE_FAILED' }, 500);
  }
});
