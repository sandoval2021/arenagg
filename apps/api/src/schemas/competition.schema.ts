import { z } from 'zod';

export const createCompetitionSchema = z.object({
  name: z.string().trim().min(3).max(80),
  type: z.enum(['LEAGUE', 'KNOCKOUT', 'GROUPS_KNOCKOUT']),
  isHomeAndAway: z.boolean().default(false),
  teamSelection: z.enum(['FREE', 'RANDOM']).default('FREE'),
  matchPace: z.enum(['QUICK', 'SCHEDULED']).default('QUICK'),
  requireValidation: z.boolean().default(false),
});
