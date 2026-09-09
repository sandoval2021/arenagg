import { z } from 'zod';

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => value.startsWith('https://'), 'Use uma URL HTTPS');

export const competitionTypeSchema = z.enum([
  'LEAGUE',
  'KNOCKOUT',
  'GROUPS_KNOCKOUT',
  'ENDLESS',
]);

export const competitionMetadataSchema = z.object({
  game: z.string().trim().min(2).max(60).optional(),
  platform: z.string().trim().min(2).max(40).optional(),
});

// ENDLESS já existe no domínio/banco, mas a criação fica fail-closed até o
// ciclo próprio de Liga Infinita (desafios contínuos, sem geração automática
// de chave/rodadas) ser implementado. Isso evita tratá-la como mata-mata por engano.
const creatableCompetitionTypeSchema = competitionTypeSchema.exclude(['ENDLESS']);

export const createCompetitionSchema = z.object({
  name: z.string().trim().min(3).max(80),
  type: creatableCompetitionTypeSchema,
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
