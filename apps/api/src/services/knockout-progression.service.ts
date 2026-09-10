import type { Prisma } from '@prisma/client';
import { resolveWinner } from '../domain/bracket/knockout';

type Tx = Prisma.TransactionClient;

export type AdvanceableKnockoutMatch = {
  id: string;
  stageId: string;
  roundId: string | null;
  bracketPosition: number | null;
  leg: number;
  nextMatchId: string | null;
  nextMatchSlot: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
};

export class AggregateTieRequiresPenaltiesError extends Error {
  constructor() {
    super('KNOCKOUT_AGGREGATE_DRAW_REQUIRES_PENALTIES');
    this.name = 'AggregateTieRequiresPenaltiesError';
  }
}

async function assignWinner(
  tx: Tx,
  nextMatchId: string,
  nextMatchSlot: string,
  winnerTeamId: string,
): Promise<void> {
  const target = await tx.match.findUnique({
    where: { id: nextMatchId },
    select: { homeTeamId: true, awayTeamId: true },
  });
  if (!target) throw new Error('NEXT_MATCH_NOT_FOUND');

  const current = nextMatchSlot === 'HOME' ? target.homeTeamId : target.awayTeamId;
  if (current && current !== winnerTeamId) throw new Error('BRACKET_SLOT_CONFLICT');
  if (current === winnerTeamId) return;

  await tx.match.update({
    where: { id: nextMatchId },
    data: nextMatchSlot === 'HOME'
      ? { homeTeamId: winnerTeamId }
      : { awayTeamId: winnerTeamId },
  });
}

function resolveSingleMatchWinner(match: AdvanceableKnockoutMatch): string | null {
  if (
    !match.homeTeamId
    || !match.awayTeamId
    || match.homeScore == null
    || match.awayScore == null
  ) return null;

  return resolveWinner({
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    homePenaltyScore: match.homePenaltyScore,
    awayPenaltyScore: match.awayPenaltyScore,
  });
}

export async function advanceKnockoutMatch(
  tx: Tx,
  match: AdvanceableKnockoutMatch,
): Promise<void> {
  if (!match.nextMatchId || !match.nextMatchSlot) return;

  // Legacy/single-leg brackets keep the established behavior.
  if (!match.roundId || match.bracketPosition == null) {
    const winnerId = resolveSingleMatchWinner(match);
    if (winnerId) await assignWinner(tx, match.nextMatchId, match.nextMatchSlot, winnerId);
    return;
  }

  // Serialize both legs of the same semifinal so concurrent confirmations can
  // never advance two different teams to the same Final slot.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`knockout-series:${match.stageId}:${match.roundId}:${match.bracketPosition}`}))`;

  const series = await tx.match.findMany({
    where: {
      stageId: match.stageId,
      roundId: match.roundId,
      bracketPosition: match.bracketPosition,
      status: { not: 'CANCELED' },
    },
    orderBy: { leg: 'asc' },
    select: {
      id: true,
      status: true,
      leg: true,
      nextMatchId: true,
      nextMatchSlot: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      homePenaltyScore: true,
      awayPenaltyScore: true,
    },
  });

  if (series.length <= 1) {
    const winnerId = resolveSingleMatchWinner(match);
    if (winnerId) await assignWinner(tx, match.nextMatchId, match.nextMatchSlot, winnerId);
    return;
  }

  // The new Top-4 format has exactly two semifinal legs. Existing one-leg
  // championships are untouched; anything else is rejected instead of guessed.
  const leg1 = series.find((row) => row.leg === 1);
  const leg2 = series.find((row) => row.leg === 2);
  if (!leg1 || !leg2 || series.length !== 2) throw new Error('INVALID_KNOCKOUT_SERIES');
  if (leg1.status !== 'FINISHED' || leg2.status !== 'FINISHED') return;

  const rows = [leg1, leg2];
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.homeTeamId || !row.awayTeamId || row.homeScore == null || row.awayScore == null) {
      throw new Error('MATCH_TEAMS_NOT_READY');
    }
    totals.set(row.homeTeamId, (totals.get(row.homeTeamId) ?? 0) + row.homeScore);
    totals.set(row.awayTeamId, (totals.get(row.awayTeamId) ?? 0) + row.awayScore);
  }
  if (totals.size !== 2) throw new Error('INVALID_KNOCKOUT_SERIES_TEAMS');

  const [first, second] = [...totals.entries()];
  let winnerId: string;
  if (first[1] !== second[1]) {
    winnerId = first[1] > second[1] ? first[0] : second[0];
  } else {
    // Empate no agregado é decidido nos pênaltis do jogo de volta.
    if (
      leg2.homePenaltyScore == null
      || leg2.awayPenaltyScore == null
      || leg2.homePenaltyScore === leg2.awayPenaltyScore
      || !leg2.homeTeamId
      || !leg2.awayTeamId
    ) {
      throw new AggregateTieRequiresPenaltiesError();
    }
    winnerId = leg2.homePenaltyScore > leg2.awayPenaltyScore
      ? leg2.homeTeamId
      : leg2.awayTeamId;
  }

  const relation = rows.find((row) => row.nextMatchId && row.nextMatchSlot);
  if (!relation?.nextMatchId || !relation.nextMatchSlot) throw new Error('KNOCKOUT_NEXT_MATCH_NOT_CONFIGURED');
  await assignWinner(tx, relation.nextMatchId, relation.nextMatchSlot, winnerId);
}
