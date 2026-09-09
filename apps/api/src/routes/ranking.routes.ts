import { Hono } from 'hono';
import type { Env } from '../types/env';

export const ranking = new Hono<Env>();

ranking.get('/', async (c) => {
  const db = c.get('prisma');
  const viewer = c.get('user');

  const profiles = await db.userProfile.findMany({
    where: { user: { isActive: true } },
    orderBy: [
      { mmr: 'desc' },
      { totalWins: 'desc' },
      { championshipsWon: 'desc' },
      { userId: 'asc' },
    ],
    take: 100,
    select: {
      userId: true,
      mmr: true,
      totalWins: true,
      totalDraws: true,
      totalLosses: true,
      championshipsWon: true,
      consoles: true,
      user: {
        select: {
          name: true,
          displayName: true,
          avatarUrl: true,
          participations: {
            where: { status: 'ACTIVE' },
            orderBy: { joinedAt: 'desc' },
            take: 1,
            select: {
              teamName: true,
              teamLogoUrl: true,
              team: { select: { name: true, logoUrl: true } },
            },
          },
        },
      },
    },
  });

  return c.json({
    entries: profiles.map((profile, index) => {
      const latestParticipation = profile.user.participations[0];
      return {
        rank: index + 1,
        userId: profile.userId,
        name: profile.user.displayName?.trim() || profile.user.name,
        avatarUrl: profile.user.avatarUrl,
        consoles: profile.consoles,
        mmr: profile.mmr,
        totalWins: profile.totalWins,
        totalDraws: profile.totalDraws,
        totalLosses: profile.totalLosses,
        championshipsWon: profile.championshipsWon,
        isCurrentUser: profile.userId === viewer.id,
        crest: latestParticipation
          ? {
              name: latestParticipation.team?.name ?? latestParticipation.teamName,
              logoUrl: latestParticipation.team?.logoUrl ?? latestParticipation.teamLogoUrl,
            }
          : null,
      };
    }),
  });
});
