export const DEFAULT_MMR = 1500;
export const ELO_K_FACTOR = 32;
const ELO_SCALE = 400;
const MAX_EXPONENT = 8;

export type EloOutcome = 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';

export type EloResult = {
  homeDelta: number;
  awayDelta: number;
  expectedHome: number;
  expectedAway: number;
};

function expectedScore(rating: number, opponentRating: number): number {
  const exponent = Math.max(
    -MAX_EXPONENT,
    Math.min(MAX_EXPONENT, (opponentRating - rating) / ELO_SCALE),
  );
  return 1 / (1 + 10 ** exponent);
}

/**
 * Zero-sum Elo update. We calculate and round one side only, then apply the
 * exact inverse to the opponent. This prevents rating inflation caused by
 * independent rounding.
 */
export function calculateElo(
  homeRating: number,
  awayRating: number,
  outcome: EloOutcome,
): EloResult {
  const expectedHome = expectedScore(homeRating, awayRating);
  const expectedAway = 1 - expectedHome;
  const actualHome = outcome === 'HOME_WIN' ? 1 : outcome === 'DRAW' ? 0.5 : 0;
  const homeDelta = Math.round(ELO_K_FACTOR * (actualHome - expectedHome));

  return {
    homeDelta,
    awayDelta: -homeDelta,
    expectedHome,
    expectedAway,
  };
}
