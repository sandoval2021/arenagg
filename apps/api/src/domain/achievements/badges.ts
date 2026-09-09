export const BADGE_CODES = {
  FIRST_MATCH: 'FIRST_MATCH',
  RELENTLESS_SCORER: 'RELENTLESS_SCORER',
  WALL: 'WALL',
} as const;

export type BadgeCode = (typeof BADGE_CODES)[keyof typeof BADGE_CODES];

export function badgesForResult(input: {
  goalsScored: number;
  goalsConceded: number;
  won: boolean;
}): BadgeCode[] {
  const badges: BadgeCode[] = [BADGE_CODES.FIRST_MATCH];

  if (input.goalsScored >= 5) badges.push(BADGE_CODES.RELENTLESS_SCORER);
  if (input.won && input.goalsConceded === 0) badges.push(BADGE_CODES.WALL);

  return badges;
}
