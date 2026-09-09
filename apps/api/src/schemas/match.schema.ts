import { z } from 'zod';

const scorerSideSchema = z.enum(['HOME', 'AWAY']);

export const scorerInputSchema = z.object({
  side: scorerSideSchema,
  playerName: z.string().trim().min(2).max(60),
  goals: z.coerce.number().int().min(1).max(99),
});

const scorersSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.array(scorerInputSchema).max(40)).optional().default([]);

const optionalClipUrlSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((value) => value.startsWith('https://'), 'O link do clipe deve usar HTTPS')
    .optional(),
);

export const scoreFields = z
  .object({
    homeScore: z.coerce.number().int().min(0).max(99),
    awayScore: z.coerce.number().int().min(0).max(99),
    homePenaltyScore: z.coerce.number().int().min(0).max(99).optional(),
    awayPenaltyScore: z.coerce.number().int().min(0).max(99).optional(),
    version: z.coerce.number().int().positive(),
    scorers: scorersSchema,
    clipUrl: optionalClipUrlSchema,
  })
  .superRefine((value, ctx) => {
    const homeScorerGoals = value.scorers
      .filter((scorer) => scorer.side === 'HOME')
      .reduce((sum, scorer) => sum + scorer.goals, 0);
    const awayScorerGoals = value.scorers
      .filter((scorer) => scorer.side === 'AWAY')
      .reduce((sum, scorer) => sum + scorer.goals, 0);

    if (homeScorerGoals > value.homeScore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scorers'],
        message: `Os goleadores do mandante somam ${homeScorerGoals}, acima do placar ${value.homeScore}.`,
      });
    }
    if (awayScorerGoals > value.awayScore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scorers'],
        message: `Os goleadores do visitante somam ${awayScorerGoals}, acima do placar ${value.awayScore}.`,
      });
    }
  });

// Base para Liga Infinita: o clube escolhido é um snapshot da partida e não
// substitui a relação homeTeam/awayTeam, que continua identificando os jogadores.
export const endlessMatchTeamNamesSchema = z.object({
  homeTeamName: z.string().trim().min(2).max(80).optional(),
  awayTeamName: z.string().trim().min(2).max(80).optional(),
});

export const approveSchema = z.object({ version: z.number().int().positive() });

export const resolveSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('RESOLVE'),
    homeScore: z.number().int().min(0).max(99),
    awayScore: z.number().int().min(0).max(99),
    homePenaltyScore: z.number().int().min(0).max(99).optional(),
    awayPenaltyScore: z.number().int().min(0).max(99).optional(),
    version: z.number().int().positive(),
  }),
  z.object({ action: z.literal('CANCEL'), version: z.number().int().positive() }),
]);

const statsCounter = z.coerce.number().int().min(0).max(999);
const passesCounter = z.coerce.number().int().min(0).max(5000);

export const matchStatsSchema = z
  .object({
    homePossession: z.coerce.number().int().min(0).max(100),
    awayPossession: z.coerce.number().int().min(0).max(100),
    homeShots: statsCounter,
    awayShots: statsCounter,
    homeShotsOnGoal: statsCounter,
    awayShotsOnGoal: statsCounter,
    homePasses: passesCounter,
    awayPasses: passesCounter,
    homeTackles: statsCounter,
    awayTackles: statsCounter,
    homeFouls: statsCounter,
    awayFouls: statsCounter,
  })
  .superRefine((value, ctx) => {
    if (value.homePossession + value.awayPossession !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['homePossession'],
        message: 'A soma da posse de bola deve ser 100%.',
      });
    }
    if (value.homeShotsOnGoal > value.homeShots) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['homeShotsOnGoal'],
        message: 'Chutes a gol não podem superar os chutes.',
      });
    }
    if (value.awayShotsOnGoal > value.awayShots) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['awayShotsOnGoal'],
        message: 'Chutes a gol não podem superar os chutes.',
      });
    }
  });
