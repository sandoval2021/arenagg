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

export const competitionFormatSchema = z.enum(['KNOCKOUT', 'GROUP_STAGE']);

export const competitionMetadataSchema = z.object({
  game: z.string().trim().min(2).max(60).optional(),
  platform: z.string().trim().min(2).max(40).optional(),
});

// ENDLESS já existe no domínio/banco, mas a criação fica fail-closed até o
// ciclo próprio de Liga Infinita ser implementado.
const creatableCompetitionTypeSchema = competitionTypeSchema.exclude(['ENDLESS']);

export const createCompetitionSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    type: creatableCompetitionTypeSchema,
    format: competitionFormatSchema.optional(),
    groupCount: z.coerce.number().int().refine((value) => [2, 4, 8].includes(value), 'Use 2, 4 ou 8 grupos').optional(),
    isHomeAndAway: z.boolean().default(false),
    teamSelection: z.enum(['FREE', 'RANDOM']).default('FREE'),
    maxParticipants: z.coerce.number().int().min(2).max(20).default(20),
    matchPace: z.enum(['QUICK', 'SCHEDULED']).default('QUICK'),
    requireValidation: z.boolean().default(false),
  })
  .merge(competitionMetadataSchema)
  .superRefine((input, context) => {
    const format = input.format ?? (input.type === 'GROUPS_KNOCKOUT' ? 'GROUP_STAGE' : 'KNOCKOUT');
    const groupCount = input.groupCount ?? 4;
    if (format === 'GROUP_STAGE' && input.maxParticipants < groupCount * 2) {
      context.addIssue({
        code: 'custom',
        path: ['maxParticipants'],
        message: `Com ${groupCount} grupos, permita ao menos ${groupCount * 2} jogadores para haver Top 2 em cada grupo.`,
      });
    }
  });

export const updateMyTeamSchema = z.object({
  teamName: z.string().trim().min(2).max(60),
  teamLogoUrl: z.union([httpsUrl, z.literal(''), z.null()]).optional(),
});
