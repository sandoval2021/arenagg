import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  ChevronRight,
  GitBranch,
  LoaderCircle,
  Maximize2,
  Save,
  Shield,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  ApiError,
  getCompetition,
  getCompetitionMatchStats,
  submitMatchScore,
  type CompetitionDetail,
  type MatchStats,
} from '../../lib/api';
import { MatchStatsPanelLight } from '../matches/MatchStatsPanelLight';
import {
  MatchScorersEditor,
  compactScorerDrafts,
  validateScorerDrafts,
  type ScorerDraft,
} from '../matches/MatchScorersEditor';

type BaseMatch = CompetitionDetail['matches'][number];
type BracketMatch = BaseMatch & {
  bracketPosition?: number | null;
  nextMatchId?: string | null;
  nextMatchSlot?: string | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
};

type BracketMatchup = {
  key: string;
  position: number;
  matches: BracketMatch[];
};

type BracketRound = {
  number: number;
  name: string;
  matchups: BracketMatchup[];
};

const BASE_SLOT_HEIGHT = 164;
const CARD_WIDTH = 224;
const CONNECTOR_X = 248;
const COLUMN_GAP = 64;

export function KnockoutBracketDock() {
  const { competitionId = '' } = useParams();
  const [open, setOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null);

  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getCompetition(competitionId),
    enabled: Boolean(competitionId),
  });

  const data = competition.data;
  const bracketMatches = useMemo(() => {
    if (!data) return [] as BracketMatch[];
    const matches = data.matches as BracketMatch[];
    if (data.type === 'KNOCKOUT') return matches.filter((match) => match.round);
    return matches.filter((match) => match.bracketPosition != null);
  }, [data]);

  const rounds = useMemo(() => buildBracketRounds(bracketMatches), [bracketMatches]);
  const isStarted = data?.status === 'IN_PROGRESS' || data?.status === 'FINISHED';
  const hasBracket = Boolean(isStarted && rounds.length > 0 && (data?.type === 'KNOCKOUT' || bracketMatches.some((match) => match.bracketPosition != null)));

  const statsQuery = useQuery({
    queryKey: ['match-stats', competitionId],
    queryFn: () => getCompetitionMatchStats(competitionId),
    enabled: Boolean(competitionId) && hasBracket,
    staleTime: 5_000,
  });

  const statsByMatch = useMemo(() => {
    const map = new Map<string, MatchStats>();
    for (const stats of statsQuery.data ?? []) map.set(stats.matchId, stats);
    return map;
  }, [statsQuery.data]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (selectedMatch) setSelectedMatch(null);
      else setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, selectedMatch]);

  if (!hasBracket || !data) return null;

  const myParticipation = data.participations.find((participant) => participant.userId === data.currentUserId);
  const myTeamId = myParticipation?.team?.id;
  const canEditMatch = (match: BracketMatch) => data.isHost || Boolean(myTeamId && (match.homeTeam?.id === myTeamId || match.awayTeam?.id === myTeamId));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-40 flex min-h-14 items-center gap-2 rounded-2xl border border-blue-200 bg-[#073B8C] px-4 text-sm font-black text-white shadow-xl shadow-blue-950/20 transition active:scale-[.98] sm:right-6"
      >
        <GitBranch className="h-5 w-5" />
        Chaveamento
        <Maximize2 className="h-4 w-4 text-blue-200" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 p-0 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-label="Árvore de mata-mata">
          <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white shadow-2xl sm:mx-auto sm:max-w-7xl sm:rounded-[2rem] sm:border sm:border-slate-200">
            <header className="shrink-0 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur sm:px-6 sm:pt-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-100 to-yellow-50 text-amber-600 shadow-sm"><Trophy className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Caminho até o título</p>
                  <h2 className="truncate text-xl font-black text-slate-950">Chaveamento · {data.name}</h2>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar chaveamento" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-blue-50 px-3 py-2 text-xs font-bold text-[#073B8C]">
                <Sparkles className="h-4 w-4 shrink-0" />
                Arraste para os lados para acompanhar o caminho até a final. Toque em um confronto para abrir placar e estatísticas.
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(to_right,#073B8C08_1px,transparent_1px),linear-gradient(to_bottom,#073B8C08_1px,transparent_1px)] bg-[size:28px_28px]">
              <div className="overflow-x-auto overscroll-x-contain scroll-smooth px-4 py-5 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:px-6 touch-pan-x">
                <div className="flex min-w-max items-start gap-16 pr-16">
                  {rounds.map((round, roundIndex) => (
                    <BracketColumn
                      key={round.number}
                      round={round}
                      roundIndex={roundIndex}
                      isLast={roundIndex === rounds.length - 1}
                      onSelect={setSelectedMatch}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {selectedMatch && (
            <MatchDetailSheet
              key={`${selectedMatch.id}:${selectedMatch.version}`}
              match={selectedMatch}
              competitionId={competitionId}
              requireValidation={data.requireValidation}
              isHost={data.isHost}
              canEdit={canEditMatch(selectedMatch)}
              stats={statsByMatch.get(selectedMatch.id)}
              statsLoading={statsQuery.isLoading}
              onClose={() => setSelectedMatch(null)}
            />
          )}
        </div>
      )}
    </>
  );
}

function BracketColumn({
  round,
  roundIndex,
  isLast,
  onSelect,
}: {
  round: BracketRound;
  roundIndex: number;
  isLast: boolean;
  onSelect: (match: BracketMatch) => void;
}) {
  const slotHeight = BASE_SLOT_HEIGHT * 2 ** roundIndex;

  return (
    <section className="w-[240px] shrink-0 snap-start" aria-label={round.name}>
      <div className="sticky top-0 z-10 mb-2 flex h-12 items-center justify-between rounded-2xl border border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-slate-400">Fase {roundIndex + 1}</p>
          <h3 className="text-sm font-black text-slate-900">{round.name}</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">{round.matchups.length}</span>
      </div>

      <div>
        {round.matchups.map((matchup, index) => {
          const resolved = Boolean(getMatchupResult(matchup).winnerTeamId);
          const pairMate = index % 2 === 0 ? round.matchups[index + 1] : undefined;
          const pairResolved = resolved && Boolean(pairMate && getMatchupResult(pairMate).winnerTeamId);
          const lineTone = resolved ? 'border-[#073B8C]' : 'border-slate-300';
          const pairTone = pairResolved ? 'border-[#073B8C]' : 'border-slate-300';

          return (
            <div key={matchup.key} className="relative flex items-center" style={{ height: `${slotHeight}px` }}>
              <MatchupCard matchup={matchup} onSelect={onSelect} />

              {!isLast && (
                <>
                  <span aria-hidden="true" className={`pointer-events-none absolute left-[224px] top-1/2 w-6 border-t-2 ${lineTone}`} />
                  {index % 2 === 0 && pairMate && (
                    <>
                      <span aria-hidden="true" className={`pointer-events-none absolute left-[248px] top-1/2 h-full border-l-2 ${pairTone}`} />
                      <span aria-hidden="true" className={`pointer-events-none absolute left-[248px] top-full w-14 border-t-2 ${pairTone}`} />
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MatchupCard({ matchup, onSelect }: { matchup: BracketMatchup; onSelect: (match: BracketMatch) => void }) {
  const result = getMatchupResult(matchup);
  const primary = matchup.matches[0];
  const home = primary?.homeTeam ?? null;
  const away = primary?.awayTeam ?? null;
  const preferredMatch = choosePreferredMatch(matchup.matches);

  function activate() {
    if (preferredMatch) onSelect(preferredMatch);
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }}
      className="group relative z-[1] w-[224px] cursor-pointer rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#073B8C]/25 active:scale-[.99]"
    >
      <TeamRow team={home} score={result.homeScore} winner={result.winnerTeamId === home?.id} loser={Boolean(result.winnerTeamId && result.winnerTeamId !== home?.id)} />
      <div className="my-2 h-px bg-slate-100" />
      <TeamRow team={away} score={result.awayScore} winner={result.winnerTeamId === away?.id} loser={Boolean(result.winnerTeamId && result.winnerTeamId !== away?.id)} />

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <span className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">{matchup.matches.length > 1 ? 'Agregado' : statusLabel(primary?.status)}</span>
        <span className="flex items-center gap-1 text-[10px] font-black text-[#073B8C]">Abrir <ChevronRight className="h-3 w-3" /></span>
      </div>

      {matchup.matches.length > 1 && (
        <div className="mt-2 flex gap-1.5">
          {matchup.matches.map((match) => (
            <button
              key={match.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(match);
              }}
              className="min-h-7 flex-1 rounded-lg bg-slate-100 px-2 text-[9px] font-black text-slate-600 transition hover:bg-blue-50 hover:text-[#073B8C]"
            >
              {match.leg === 2 ? 'Volta' : 'Ida'} {formatLegScore(match)}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function TeamRow({
  team,
  score,
  winner,
  loser,
}: {
  team: BracketMatch['homeTeam'];
  score: number | null;
  winner: boolean;
  loser: boolean;
}) {
  const name = team?.name ?? 'A definir';
  return (
    <div className={`flex items-center gap-2.5 transition ${loser ? 'opacity-50' : 'opacity-100'}`}>
      {team?.logoUrl ? (
        <img src={team.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 bg-white object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400"><Shield className="h-4 w-4" /></span>
      )}
      <span className={`min-w-0 flex-1 truncate text-xs text-slate-800 ${winner ? 'font-black' : 'font-bold'}`}>{name}</span>
      <span className={`grid min-w-7 place-items-center rounded-lg px-1.5 py-1 text-sm ${winner ? 'bg-blue-50 font-black text-[#073B8C]' : 'bg-slate-50 font-bold text-slate-700'}`}>{score ?? '–'}</span>
    </div>
  );
}

function MatchDetailSheet({
  match,
  competitionId,
  requireValidation,
  isHost,
  canEdit,
  stats,
  statsLoading,
  onClose,
}: {
  match: BracketMatch;
  competitionId: string;
  requireValidation: boolean;
  isHost: boolean;
  canEdit: boolean;
  stats?: MatchStats;
  statsLoading: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [homeScore, setHomeScore] = useState(match.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(match.awayScore ?? 0);
  const [scorers, setScorers] = useState<ScorerDraft[]>([]);
  const [evidence, setEvidence] = useState<File | undefined>();
  const [localError, setLocalError] = useState<string | null>(null);
  const editable = canEdit && match.status === 'PENDING' && Boolean(match.homeTeam && match.awayTeam);

  const score = useMutation({
    mutationFn: () => submitMatchScore(match.id, {
      homeScore,
      awayScore,
      version: match.version,
      evidence,
      scorers: compactScorerDrafts(scorers),
    }),
    onSuccess: async () => {
      setLocalError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['match-stats', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['top-scorers', competitionId] }),
      ]);
      onClose();
    },
  });

  function saveScore() {
    if (requireValidation && !evidence) {
      setLocalError('Anexe a foto do placar para enviar o resultado.');
      return;
    }
    const scorerError = validateScorerDrafts(scorers, homeScore, awayScore);
    if (scorerError) {
      setLocalError(scorerError);
      return;
    }
    setLocalError(null);
    score.mutate();
  }

  return (
    <div className="absolute inset-0 z-[60] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Detalhes da partida">
      <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-slate-200 bg-white p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-[2rem] sm:p-5">
        <header className="flex items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#073B8C]">Confronto</p><h3 className="truncate text-lg font-black text-slate-950">{match.homeTeam?.name ?? 'A definir'} × {match.awayTeam?.name ?? 'A definir'}</h3></div>
          <button type="button" onClick={onClose} aria-label="Fechar partida" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500"><X className="h-4 w-4" /></button>
        </header>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <CompactTeam team={match.homeTeam} align="right" />
          <div className="flex items-center gap-1.5">
            <ScoreBox value={homeScore} onChange={setHomeScore} disabled={!editable} label="Placar mandante" />
            <span className="font-black text-slate-300">×</span>
            <ScoreBox value={awayScore} onChange={setAwayScore} disabled={!editable} label="Placar visitante" />
          </div>
          <CompactTeam team={match.awayTeam} align="left" />
        </div>

        {editable && (
          <MatchScorersEditor
            value={scorers}
            onChange={setScorers}
            homeTeamName={match.homeTeam?.name ?? 'Mandante'}
            awayTeamName={match.awayTeam?.name ?? 'Visitante'}
            homeScore={homeScore}
            awayScore={awayScore}
          />
        )}

        {editable && requireValidation && (
          <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-xs font-black text-slate-600">
            <Camera className="h-4 w-4 text-[#073B8C]" />{evidence ? evidence.name : 'Anexar foto do placar'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setEvidence(event.target.files?.[0])} />
          </label>
        )}

        {editable && (
          <button type="button" onClick={saveScore} disabled={score.isPending} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#073B8C] text-xs font-black text-white shadow-sm disabled:opacity-50">
            {score.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{score.isPending ? 'Enviando…' : 'Registrar placar'}
          </button>
        )}

        {(localError || score.isError) && <p className="mt-2 rounded-xl bg-red-50 p-2 text-center text-[11px] font-bold text-red-700">{localError ?? scoreError(score.error)}</p>}

        <MatchStatsPanelLight
          competitionId={competitionId}
          match={match}
          stats={stats}
          statsLoading={statsLoading}
          canEdit={canEdit}
          isHost={isHost}
        />
      </section>
    </div>
  );
}

function CompactTeam({ team, align }: { team: BracketMatch['homeTeam']; align: 'left' | 'right' }) {
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {team?.logoUrl ? <img src={team.logoUrl} alt="" className={`h-9 w-9 rounded-xl border border-slate-200 bg-white object-cover ${align === 'right' ? 'ml-auto' : ''}`} /> : <span className={`grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 ${align === 'right' ? 'ml-auto' : ''}`}><Shield className="h-4 w-4" /></span>}
      <p className="mt-1 truncate text-[10px] font-black text-slate-700">{team?.name ?? 'A definir'}</p>
    </div>
  );
}

function ScoreBox({ value, onChange, disabled, label }: { value: number; onChange: (value: number) => void; disabled: boolean; label: string }) {
  return <input aria-label={label} type="number" inputMode="numeric" min={0} max={99} disabled={disabled} value={value} onChange={(event) => onChange(Math.min(99, Math.max(0, Number(event.target.value) || 0)))} className="h-11 w-11 rounded-xl border border-slate-200 bg-white text-center text-lg font-black text-slate-950 outline-none focus:border-[#073B8C] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500" />;
}

function buildBracketRounds(matches: BracketMatch[]): BracketRound[] {
  const byRound = new Map<number, BracketMatch[]>();
  for (const match of matches) {
    const number = match.round?.number ?? 0;
    if (!number) continue;
    const current = byRound.get(number) ?? [];
    current.push(match);
    byRound.set(number, current);
  }

  return [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, roundMatches]) => {
      const byPosition = new Map<string, BracketMatch[]>();
      for (const match of roundMatches) {
        const position = match.bracketPosition ?? Number.MAX_SAFE_INTEGER;
        const key = match.bracketPosition != null ? String(match.bracketPosition) : match.id;
        const current = byPosition.get(key) ?? [];
        current.push(match);
        byPosition.set(key, current);
        void position;
      }

      const matchups = [...byPosition.entries()]
        .map(([key, grouped]) => ({
          key: `${number}:${key}`,
          position: grouped[0]?.bracketPosition ?? Number.MAX_SAFE_INTEGER,
          matches: grouped.sort((a, b) => a.leg - b.leg),
        }))
        .sort((a, b) => a.position - b.position);

      return {
        number,
        name: phaseName(matchups.length, roundMatches[0]?.round?.name),
        matchups,
      };
    });
}

function phaseName(matchupCount: number, fallback?: string | null): string {
  if (matchupCount === 1) return 'Final';
  if (matchupCount === 2) return 'Semifinal';
  if (matchupCount === 4) return 'Quartas de Final';
  if (matchupCount === 8) return 'Oitavas de Final';
  if (matchupCount === 16) return '16 avos de Final';
  return fallback?.trim() || 'Mata-mata';
}

function choosePreferredMatch(matches: BracketMatch[]): BracketMatch | undefined {
  return matches.find((match) => match.status !== 'FINISHED' && match.status !== 'CANCELED') ?? matches[matches.length - 1];
}

function getMatchupResult(matchup: BracketMatchup): { homeScore: number | null; awayScore: number | null; winnerTeamId: string | null } {
  const first = matchup.matches[0];
  const homeId = first?.homeTeam?.id;
  const awayId = first?.awayTeam?.id;
  if (!first || !homeId || !awayId) return { homeScore: null, awayScore: null, winnerTeamId: null };

  let homeScore = 0;
  let awayScore = 0;
  let hasAnyScore = false;
  let allFinished = true;

  for (const match of matchup.matches) {
    if (match.homeScore == null || match.awayScore == null) {
      allFinished = false;
      continue;
    }
    hasAnyScore = true;
    if (match.homeTeam?.id === homeId) {
      homeScore += match.homeScore;
      awayScore += match.awayScore;
    } else if (match.awayTeam?.id === homeId) {
      homeScore += match.awayScore;
      awayScore += match.homeScore;
    }
    if (match.status !== 'FINISHED') allFinished = false;
  }

  if (!hasAnyScore) return { homeScore: null, awayScore: null, winnerTeamId: null };
  if (!allFinished) return { homeScore, awayScore, winnerTeamId: null };
  if (homeScore > awayScore) return { homeScore, awayScore, winnerTeamId: homeId };
  if (awayScore > homeScore) return { homeScore, awayScore, winnerTeamId: awayId };

  const last = matchup.matches[matchup.matches.length - 1];
  if (last?.homePenaltyScore != null && last.awayPenaltyScore != null && last.homePenaltyScore !== last.awayPenaltyScore) {
    const penaltyWinnerId = last.homePenaltyScore > last.awayPenaltyScore ? last.homeTeam?.id : last.awayTeam?.id;
    return { homeScore, awayScore, winnerTeamId: penaltyWinnerId ?? null };
  }

  return { homeScore, awayScore, winnerTeamId: null };
}

function formatLegScore(match: BracketMatch): string {
  if (match.homeScore == null || match.awayScore == null) return '–';
  return `${match.homeScore}×${match.awayScore}`;
}

function statusLabel(status?: string): string {
  if (!status) return 'A definir';
  if (status === 'FINISHED') return 'Finalizado';
  if (status === 'AWAITING_APPROVAL') return 'Aguardando aprovação';
  if (status === 'DISPUTED') return 'Em disputa';
  if (status === 'CANCELED') return 'Cancelado';
  return 'Pendente';
}

function scoreError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível registrar o placar.';
  if (error.code === 'EVIDENCE_REQUIRED') return 'A foto do placar é obrigatória nesta Copa.';
  if (error.code === 'SCORER_TOTAL_EXCEEDS_SCORE') return 'A soma dos gols dos goleadores não pode ultrapassar o placar.';
  if (error.code === 'INVALID_MATCH_TRANSITION') return 'Este jogo não aceita um novo placar neste momento.';
  if (error.code === 'FORBIDDEN') return 'Você não pode registrar o placar deste jogo.';
  return 'Falha ao registrar o placar.';
}

// Connector geometry (all CSS/Tailwind, no SVG):
// card right edge = 224px; first horizontal segment ends at x=248px;
// the even matchup draws a vertical h-full line from its center to the sibling
// center, then a 56px horizontal segment reaches the next column. With a 64px
// column gap, the three segments meet exactly at the next round's card center.
void CARD_WIDTH;
void CONNECTOR_X;
void COLUMN_GAP;
