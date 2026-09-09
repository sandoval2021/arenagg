import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types/env';
import { createCompetitionSchema } from '../schemas/competition.schema';

export const phaseThreeCompetitions = new Hono<Env>();

const MAX_ENTRY_FEE_CENTS = 10_000_000;

function isValidPrizeDistribution(value: string): boolean {
  const parts = value.split(',').map((part) => Number(part));
  return (
    parts.length === 3 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 100) &&
    parts.reduce((sum, part) => sum + part, 0) === 100
  );
}

const prizeDistributionSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3},\d{1,3},\d{1,3}$/)
  .refine(isValidPrizeDistribution, 'A distribuição deve somar exatamente 100%');

const financeSchema = z.object({
  entryFee: z.coerce.number().int().min(0).max(MAX_ENTRY_FEE_CENTS).default(0),
  prizeDistribution: prizeDistributionSchema.default('60,30,10'),
});

// createCompetitionSchema has cross-field refinements in Phase 6, therefore
// intersection (`and`) preserves those refinements while composing finance.
const createPhaseThreeCompetitionSchema = createCompetitionSchema.and(financeSchema);

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 56);

  return `${base || 'campeonato'}-${crypto.randomUUID().slice(0, 8)}`;
}

function initialTeamName(user: Env['Variables']['user']): string {
  return (user.displayName ?? user.name).trim().slice(0, 60) || 'Jogador';
}

/**
 * Rota canônica de criação. Competition.type permanece para compatibilidade
 * histórica; Competition.format é o contrato explícito da Fase 6.
 */
phaseThreeCompetitions.post('/', async (c) => {
  const parsed = createPhaseThreeCompetitionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'INVALID_INPUT', issues: parsed.error.flatten() }, 400);
  }

  const db = c.get('prisma');
  const host = c.get('user');
  const input = parsed.data;
  const teamName = initialTeamName(host);
  const format = input.format ?? (input.type === 'GROUPS_KNOCKOUT' ? 'GROUP_STAGE' : 'KNOCKOUT');
  const persistedType = format === 'GROUP_STAGE'
    ? 'GROUPS_KNOCKOUT' as const
    : input.type === 'GROUPS_KNOCKOUT'
      ? 'KNOCKOUT' as const
      : input.type;

  const competition = await db.$transaction(async (tx) => {
    const created = await tx.competition.create({
      data: {
        hostId: host.id,
        name: input.name,
        slug: slugify(input.name),
        type: persistedType,
        format,
        groupCount: format === 'GROUP_STAGE' ? input.groupCount ?? 4 : null,
        qualifiersPerGroup: format === 'GROUP_STAGE' ? 2 : null,
        game: input.game,
        platform: input.platform,
        legFormat: input.isHomeAndAway ? 'HOME_AWAY' : 'SINGLE',
        matchPace: input.matchPace,
        teamSelection: input.teamSelection,
        maxParticipants: input.maxParticipants,
        requireValidation: input.requireValidation,
        entryFee: input.entryFee,
        prizeDistribution: input.prizeDistribution,
        status: 'REGISTRATION',
      },
    });

    const participation = await tx.participation.create({
      data: {
        competitionId: created.id,
        userId: host.id,
        status: 'ACTIVE',
        teamName,
      },
    });

    await tx.team.create({
      data: {
        competitionId: created.id,
        participationId: participation.id,
        createdById: host.id,
        name: teamName,
      },
    });

    return created;
  });

  return c.json({ id: competition.id, name: competition.name }, 201);
});

phaseThreeCompetitions.patch('/:id/prize', async (c) => {
  const parsed = financeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'INVALID_PRIZE_INPUT', issues: parsed.error.flatten() }, 400);
  }

  const db = c.get('prisma');
  const user = c.get('user');
  const competitionId = c.req.param('id');

  const competition = await db.competition.findUnique({
    where: { id: competitionId },
    select: { hostId: true, status: true },
  });
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);
  if (competition.hostId !== user.id) return c.json({ error: 'HOST_ONLY' }, 403);
  if (competition.status === 'FINISHED' || competition.status === 'CANCELLED') {
    return c.json({ error: 'PRIZE_SETTINGS_LOCKED' }, 409);
  }

  const updated = await db.competition.update({
    where: { id: competitionId },
    data: {
      entryFee: parsed.data.entryFee,
      prizeDistribution: parsed.data.prizeDistribution,
    },
    select: { entryFee: true, prizeDistribution: true },
  });

  return c.json(updated);
});
