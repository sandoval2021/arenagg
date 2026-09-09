import { z } from 'zod';

export const scoreFields = z.object({
  homeScore: z.coerce.number().int().min(0).max(99),
  awayScore: z.coerce.number().int().min(0).max(99),
  homePenaltyScore: z.coerce.number().int().min(0).max(99).optional(),
  awayPenaltyScore: z.coerce.number().int().min(0).max(99).optional(),
  version: z.coerce.number().int().positive(),
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
