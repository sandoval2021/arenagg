import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Env } from '../types/env';

export const matchMedia = new Hono<Env>();

const MAX_CLIPS_PER_MATCH = 5;

const clipUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => value.startsWith('https://'), 'O link do clipe deve usar HTTPS')
  .refine((value) => {
    try {
      const url = new URL(value);
      return !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Link de clipe inválido');

const clipSchema = z.object({ url: clipUrlSchema });

const accessInclude = {
  competition: { select: { hostId: true } },
  homeTeam: { select: { participation: { select: { userId: true } } } },
  awayTeam: { select: { participation: { select: { userId: true } } } },
} satisfies Prisma.MatchInclude;

function canManageMatch(
  match: Prisma.MatchGetPayload<{ include: typeof accessInclude }>,
  userId: string,
): boolean {
  return (
    match.competition.hostId === userId ||
    match.homeTeam?.participation.userId === userId ||
    match.awayTeam?.participation.userId === userId
  );
}

export function detectClipPlatform(value: string): string {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'YOUTUBE';
    if (host.endsWith('twitch.tv')) return 'TWITCH';
    if (host.endsWith('tiktok.com')) return 'TIKTOK';
    return 'LINK';
  } catch {
    return 'LINK';
  }
}

matchMedia.get('/:id/clips', async (c) => {
  const db = c.get('prisma');
  const user = c.get('user');
  const matchId = c.req.param('id');
  const match = await db.match.findUnique({ where: { id: matchId }, include: accessInclude });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  if (!canManageMatch(match, user.id)) return c.json({ error: 'FORBIDDEN' }, 403);

  const clips = await db.matchMedia.findMany({
    where: { matchId },
    orderBy: { createdAt: 'desc' },
    take: MAX_CLIPS_PER_MATCH,
    select: { id: true, url: true, platform: true, createdAt: true, createdById: true },
  });
  return c.json(clips.map((clip) => ({ ...clip, createdAt: clip.createdAt.toISOString() })));
});

matchMedia.post('/:id/clips', async (c) => {
  const parsed = clipSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'INVALID_CLIP_URL', issues: parsed.error.flatten() }, 400);

  const db = c.get('prisma');
  const user = c.get('user');
  const matchId = c.req.param('id');
  const match = await db.match.findUnique({ where: { id: matchId }, include: accessInclude });
  if (!match) return c.json({ error: 'MATCH_NOT_FOUND' }, 404);
  if (!canManageMatch(match, user.id)) return c.json({ error: 'FORBIDDEN' }, 403);
  if (match.status !== 'FINISHED') return c.json({ error: 'MATCH_NOT_FINISHED' }, 409);

  const existing = await db.matchMedia.findUnique({
    where: { matchId_url: { matchId, url: parsed.data.url } },
    select: { id: true, url: true, platform: true, createdAt: true, createdById: true },
  });
  if (existing) return c.json({ ...existing, createdAt: existing.createdAt.toISOString() });

  const count = await db.matchMedia.count({ where: { matchId } });
  if (count >= MAX_CLIPS_PER_MATCH) return c.json({ error: 'MATCH_CLIP_LIMIT_REACHED' }, 409);

  const clip = await db.matchMedia.create({
    data: {
      matchId,
      createdById: user.id,
      url: parsed.data.url,
      platform: detectClipPlatform(parsed.data.url),
    },
    select: { id: true, url: true, platform: true, createdAt: true, createdById: true },
  });
  return c.json({ ...clip, createdAt: clip.createdAt.toISOString() }, 201);
});
