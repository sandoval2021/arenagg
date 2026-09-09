import { z } from 'zod';

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => value.startsWith('https://'), 'Use uma URL HTTPS');

export const createCompetitionSchema = z.object({
  name: z.string().trim().min(3).max(80),
  type: z.enum(['LEAGUE', 'KNOCKOUT', 'GROUPS_KNOCKOUT']),
  isHomeAndAway: z.boolean().default(false),
  teamSelection: z.enum(['FREE', 'RANDOM']).default('FREE'),
  maxParticipants: z.coerce.number().int().min(2).max(20).default(20),
  matchPace: z.enum(['QUICK', 'SCHEDULED']).default('QUICK'),
  requireValidation: z.boolean().default(false),
});

export const updateMyTeamSchema = z.object({
  teamName: z.string().trim().min(2).max(60),
  teamLogoUrl: z.union([httpsUrl, z.literal(''), z.null()]).optional(),
});
