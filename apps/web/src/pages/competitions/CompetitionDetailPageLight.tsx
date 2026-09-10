import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Copy,
  Crown,
  Dices,
  Gamepad2,
  Link2,
  LockKeyhole,
  Medal,
  MessageCircleMore,
  Play,
  Repeat2,
  Save,
  Shield,
  Swords,
  Target,
  Trash2,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  ApiError,
  getCompetition,
  getCompetitionMatches,
  getCompetitionMatchStats,
  getCompetitionTopScorers,
  getStandings,
  startCompetition,
  submitMatchScore,
  type CompetitionDetail,
  type MatchStats,
} from '../../lib/api';
import { removeCompetitionParticipant } from '../../lib/competition-moderation-api';
import { PRIMARY_NAV_STALE_TIME } from '../../lib/query-cache';
import { getPublicGamerProfile } from '../../lib/social-api';
import { GlobalLoader } from '../../components/brand/GlobalLoader';
import { CompetitionFeedPanel } from '../../components/competition/CompetitionFeedPanel';
import { TeamConfiguratorLight } from '../../components/competition/TeamConfiguratorLight';
import { MatchStatsPanelLight } from '../../components/matches/MatchStatsPanelLight';
import {
  MatchScorersEditor,
  compactScorerDrafts,
  validateScorerDrafts,
  type ScorerDraft,
} from '../../components/matches/MatchScorersEditor';
import { TopScorersPanel } from '../../components/scorers/TopScorersPanel';
import { StandingsTable } from '../../components/standings/StandingsTable';

type CompetitionTab = 'standings' | 'rounds' | 'scorers' | 'feed';
type Participation = CompetitionDetail['participations'][number];
type CompetitionMatch = CompetitionDetail['matches'][number];

function isRealNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function retryLiveQuery(failureCount: number, error: unknown): boolean {
  if (isRealNotFound(error)) return false;
  return failureCount < 3;
}

export function CompetitionDetailPageLight() {
  const { competitionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<CompetitionTab>('standings');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getCompetition(competitionId),
    enabled: Boolean(competitionId),
    staleTime: 8_000,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
    retry: retryLiveQuery,
  });

  const data = competition.data;
  const isStarted = data?.status === 'IN_PROGRESS' || data?.status === 'FINISHED';

  // Runs in parallel with the competition detail on the first render. Waiting
  // for `isStarted` here created a real network waterfall on mobile.
  const standings = useQuery({
    queryKey: ['standings', competitionId],
    queryFn: () => getStandings(competitionId),
    enabled: Boolean(competitionId) && activeTab === 'standings',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
    retry: retryLiveQuery,
  });

  const roundMatches = useQuery({
    queryKey: ['competition-matches', competitionId, selectedRound ?? 'current'],
    queryFn: () => getCompetitionMatches(competitionId, selectedRound ?? undefined),
    enabled: Boolean(competitionId) && activeTab === 'rounds',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
    retry: retryLiveQuery,
  });

  const topScorers = useQuery({
    queryKey: ['top-scorers', competitionId],
    queryFn: () => getCompetitionTopScorers(competitionId),
    enabled: Boolean(competitionId) && Boolean(isStarted) && activeTab === 'scorers',
    staleTime: 5_000,
  });

  const matchStats = useQuery({
    queryKey: ['match-stats', competitionId],
    queryFn: () => getCompetitionMatchStats(competitionId),
    enabled: Boolean(competitionId) && activeTab === 'rounds',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
    retry: retryLiveQuery,
  });

  const statsByMatch = useMemo(() => {
    const map = new Map<string, MatchStats>();
    for (const item of matchStats.data ?? []) map.set(item.matchId, item);
    return map;
  }, [matchStats.data]);

  const start = useMutation({
    mutationFn: () => startCompetition(competitionId),
    onSuccess: async () => {
      setActiveTab('standings');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competitions', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competition-matches', competitionId] }),
      ]);
    },
  });

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${competitionId}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch (error) {
      console.error('[invite] clipboard failed', error);
    }
  }

  const firstLoadNotFound = data === undefined && isRealNotFound(competition.error);
  if (data === undefined && (competition.isLoading || competition.isFetching) && !firstLoadNotFound) {
    return <Loading />;
  }
  if (firstLoadNotFound) return <ErrorState />;
  if (data === undefined) {
    return <RecoverableCompetitionError onRetry={() => void competition.refetch()} />;
  }

  const isRegistrationOpen = ['REGISTRATION', 'READY'].includes(data.status);
  const isFull = data.participations.length >= data.maxParticipants;
  const canStart = data.isHost && isRegistrationOpen && data.participations.length >= 2;
  const myParticipation = data.participations.find((participant) => participant.userId === data.currentUserId);
  const myTeamId = myParticipation?.team?.id;
  const rounds = groupMatchesByRound(roundMatches.data?.items ?? []);
  const userIdByTeam = Object.fromEntries(
    data.participations.flatMap((participant) =>
      participant.team?.id ? [[participant.team.id, participant.userId] as const] : [],
    ),
  );

  return (
    <div className="relative min-h-dvh overflow-hidden bg-white text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#073B8C08_1px,transparent_1px),linear-gradient(to_bottom,#073B8C08_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="pointer-events-none absolute -left-28 top-20 h-80 w-80 rounded-full bg-blue-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 top-80 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />

      <main className="relative mx-auto max-w-5xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="flex items-center gap-3 py-3">
          <Link to="/competitions" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.22em] text-[#073B8C]">{isStarted ? 'Arena em andamento' : 'Lobby da competição'}</p><h1 className="truncate text-xl font-black sm:text-2xl">{data.name}</h1></div>
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600 shadow-sm"><Trophy className="h-5 w-5" /></span>
        </header>

        <section className="mt-3 flex flex-wrap gap-2" aria-label="Regras da competição">
          <RuleBadge icon={Repeat2} label={data.legFormat === 'HOME_AWAY' ? 'Ida e volta' : 'Jogo único'} tone="violet" />
          <RuleBadge icon={data.teamSelection === 'RANDOM' ? Dices : Gamepad2} label={data.teamSelection === 'RANDOM' ? 'Sorteio cego' : 'Times livres'} tone="amber" />
          <RuleBadge icon={UsersRound} label={`${data.participations.length}/${data.maxParticipants} jogadores`} tone={isFull ? 'rose' : 'blue'} />
          {data.requireValidation && <RuleBadge icon={Camera} label="Placar com foto" tone="emerald" />}
        </section>

        {!isStarted && (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.08fr_.92fr]">
            <div className="space-y-5">
              {data.isHost && (
                <section className="relative overflow-hidden rounded-[2rem] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-5 shadow-md shadow-blue-100/60">
                  <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-blue-300/20 blur-3xl" />
                  <div className="relative"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#073B8C]"><Crown className="h-4 w-4" /> Você é o Host</p><h2 className="mt-2 text-2xl font-black">Monte o lobby e dê o start quando quiser.</h2><p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-600">Entrar na copa nunca dispara o sorteio. As partidas só são criadas quando você tocar no botão de início.</p><button disabled={isFull} onClick={copyInvite} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#073B8C] px-4 font-black text-white shadow-md transition active:scale-[.99] disabled:bg-slate-300 disabled:text-slate-600">{isFull ? <LockKeyhole className="h-5 w-5" /> : copied ? <Check className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}{isFull ? 'Limite de jogadores atingido' : copied ? 'Link copiado! ✅' : '🔗 Convidar Amigos'}</button></div>
                </section>
              )}
              <Lobby competitionId={data.id} participants={data.participations} hostId={data.hostId} maxParticipants={data.maxParticipants} isHost={data.isHost} />
            </div>

            <div className="space-y-5">
              {data.teamSelection === 'FREE' && myParticipation && isRegistrationOpen && <TeamConfiguratorLight competitionId={data.id} participant={myParticipation} />}
              {data.isHost && isRegistrationOpen && (
                <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-md shadow-slate-200/60">
                  <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><Dices className="h-6 w-6" /></span><div><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Gatilho manual</p><h2 className="text-lg font-black">Gerar partidas</h2></div></div>
                  <p className="mt-4 text-sm font-medium leading-6 text-slate-500">Ao iniciar, o lobby fecha para novas entradas, todas as rodadas são persistidas e a Copa muda para <strong className="text-slate-900">IN_PROGRESS</strong>.</p>
                  <button disabled={!canStart || start.isPending} onClick={() => start.mutate()} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 font-black text-white shadow-md transition active:scale-[.99] disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-500">{start.isPending ? <GlobalLoader mode="inline" label="" className="scale-[.72]" /> : <Play className="h-5 w-5 fill-current" />}{start.isPending ? 'Criando rodadas…' : '🎲 Gerar Partidas e Começar!'}</button>
                  {data.participations.length < 2 && <p className="mt-3 text-center text-xs font-bold text-amber-700">Falta pelo menos 1 amigo entrar.</p>}
                  {start.isError && <p className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{startError(start.error)}</p>}
                </section>
              )}
              {!data.isHost && <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3 text-[#073B8C]"><Shield className="h-5 w-5" /><p className="text-sm font-black">Aguardando o Host</p></div><p className="mt-2 text-sm font-medium leading-6 text-slate-500">Você já está no lobby. O sorteio só acontece quando o Host iniciar manualmente.</p></section>}
            </div>
          </div>
        )}

        {isStarted && (
          <section className="mt-7">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-2 shadow-sm">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <TabButton active={activeTab === 'standings'} onClick={() => setActiveTab('standings')} icon={Medal} label="Classificação" />
                <TabButton active={activeTab === 'rounds'} onClick={() => setActiveTab('rounds')} icon={Swords} label="Rodadas" />
                <TabButton active={activeTab === 'scorers'} onClick={() => setActiveTab('scorers')} icon={Target} label="Artilharia" />
                <TabButton active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} icon={MessageCircleMore} label="Feed" />
              </div>
            </div>
            <div className="mt-5">
              {activeTab === 'standings' && <>
                {standings.data === undefined && standings.isLoading && <GlobalLoader mode="section" label="Carregando classificação…" />}
                {standings.data === undefined && standings.isError && <LiveSyncRetry label="Classificação indisponível por alguns segundos. Tentando reconectar…" onRetry={() => void standings.refetch()} />}
                {standings.data !== undefined && <StandingsTable standings={standings.data} userIdByTeam={userIdByTeam} />}
              </>}
              {activeTab === 'rounds' && <>
                {roundMatches.data === undefined && roundMatches.isLoading && <RoundSkeleton />}
                {roundMatches.data === undefined && roundMatches.isError && <LiveSyncRetry label="Rodada indisponível por alguns segundos. Tentando reconectar…" onRetry={() => void roundMatches.refetch()} />}
                {roundMatches.data !== undefined && <RoundsView
                  rounds={rounds}
                  availableRounds={roundMatches.data?.rounds ?? []}
                  selectedRound={roundMatches.data?.round ?? selectedRound}
                  onSelectRound={setSelectedRound}
                  competitionId={data.id}
                  myTeamId={myTeamId}
                  isHost={data.isHost}
                  requireValidation={data.requireValidation}
                  statsByMatch={statsByMatch}
                  statsLoading={matchStats.isLoading}
                />}
              </>}
              {activeTab === 'scorers' && <TopScorersPanel scorers={topScorers.data ?? []} loading={topScorers.isLoading} error={topScorers.isError} />}
              {activeTab === 'feed' && <CompetitionFeedPanel competitionId={data.id} />}
            </div>
          </section>
        )}

        {data.isHost && !isStarted && <button disabled={isFull} onClick={copyInvite} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600 shadow-sm disabled:opacity-40"><Copy className="h-4 w-4" />Copiar convite</button>}
      </main>
    </div>
  );
}

function Lobby({ competitionId, participants, hostId, maxParticipants, isHost }: { competitionId: string; participants: Participation[]; hostId: string; maxParticipants: number; isHost: boolean }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (participationId: string) => removeCompetitionParticipant(competitionId, participationId),
    onMutate: async (participationId) => {
      await queryClient.cancelQueries({ queryKey: ['competition', competitionId] });
      const previous = queryClient.getQueryData<CompetitionDetail>(['competition', competitionId]);
      if (previous) {
        queryClient.setQueryData<CompetitionDetail>(['competition', competitionId], {
          ...previous,
          participations: previous.participations.filter((participant) => participant.id !== participationId),
        });
      }
      return { previous };
    },
    onError: (_error, _participationId, context) => {
      if (context?.previous) queryClient.setQueryData(['competition', competitionId], context.previous);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competitions', 'mine'] }),
      ]);
    },
  });

  function prefetchProfile(userId: string) {
    void queryClient.prefetchQuery({
      queryKey: ['gamer-profile', userId],
      queryFn: () => getPublicGamerProfile(userId),
      staleTime: PRIMARY_NAV_STALE_TIME,
    });
  }

  function askRemove(participant: Participation) {
    const playerName = participant.user.displayName ?? participant.user.name;
    if (!window.confirm(`Remover ${playerName} deste lobby?`)) return;
    remove.mutate(participant.id);
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-md shadow-slate-200/50">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-[#073B8C]">Lobby</p><h2 className="mt-1 text-xl font-black">Jogadores <span className="text-slate-400">{participants.length}/{maxParticipants}</span></h2></div>
        <UsersRound className="h-6 w-6 text-slate-300" />
      </div>
      <div className="mt-4 space-y-2">
        {participants.map((participant, index) => {
          const canRemove = isHost && participant.userId !== hostId;
          const removingThis = remove.isPending && remove.variables === participant.id;
          return (
            <div key={participant.id} className="flex items-stretch gap-2">
              <Link
                to={`/profile/${encodeURIComponent(participant.userId)}`}
                onPointerEnter={() => prefetchProfile(participant.userId)}
                onFocus={() => prefetchProfile(participant.userId)}
                onTouchStart={() => prefetchProfile(participant.userId)}
                className="group flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-blue-200 hover:bg-blue-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:scale-[.99]"
                aria-label={`Abrir perfil de ${participant.user.displayName ?? participant.user.name}`}
              >
                <TeamAvatar name={participant.teamName} logoUrl={participant.team?.logoUrl ?? participant.user.avatarUrl ?? participant.teamLogoUrl ?? undefined} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-slate-900">{participant.teamName || participant.team?.name || 'Time pendente'}</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">#{index + 1} · {participant.user.displayName ?? participant.user.name}</p>
                </div>
                {participant.userId === hostId && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">HOST</span>}
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-[#073B8C]" />
              </Link>
              {canRemove && (
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => askRemove(participant)}
                  className="grid w-12 shrink-0 place-items-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-100 active:scale-95 disabled:opacity-40"
                  aria-label={`Remover ${participant.user.displayName ?? participant.user.name} do lobby`}
                >
                  {removingThis ? <span className="text-[9px] font-black">...</span> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {remove.isError && <p className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">{removeParticipantError(remove.error)}</p>}
    </section>
  );
}

function RoundsView({ rounds, availableRounds, selectedRound, onSelectRound, competitionId, myTeamId, isHost, requireValidation, statsByMatch, statsLoading }: { rounds: Array<{ number: number; name: string; matches: CompetitionMatch[] }>; availableRounds: number[]; selectedRound: number | null; onSelectRound: (round: number) => void; competitionId: string; myTeamId?: string; isHost: boolean; requireValidation: boolean; statsByMatch: Map<string, MatchStats>; statsLoading: boolean }) {
  return <div className="space-y-3 sm:space-y-5">
    {availableRounds.length > 1 && <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Selecionar rodada">{availableRounds.map((round) => <button key={round} type="button" onClick={() => onSelectRound(round)} className={`min-h-9 shrink-0 rounded-full border px-3 text-[11px] font-black transition ${selectedRound === round ? 'border-[#073B8C] bg-[#073B8C] text-white' : 'border-slate-200 bg-white text-slate-500'}`}>Rodada {round}</button>)}</div>}
    {rounds.length === 0 && <div className="rounded-[1.5rem] border border-slate-200 bg-white p-3 text-center text-sm font-bold text-slate-500 shadow-sm sm:rounded-[2rem] sm:p-6">As partidas desta rodada estão sendo preparadas.</div>}
    {rounds.map((round) => <section key={round.number} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-md shadow-slate-200/50 sm:rounded-[2rem]"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-5 sm:py-4"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Fase de jogos</p><h3 className="mt-1 text-lg font-black">{round.name}</h3></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-500">{round.matches.length} jogos</span></div><div className="grid gap-2 p-2.5 sm:gap-3 sm:p-4 lg:grid-cols-2">{round.matches.map((match) => { const canEdit = isHost || Boolean(myTeamId && (match.homeTeam?.id === myTeamId || match.awayTeam?.id === myTeamId)); return <MatchCard key={`${match.id}:${match.version}`} match={match} competitionId={competitionId} canEdit={canEdit} isHost={isHost} requireValidation={requireValidation} stats={statsByMatch.get(match.id)} statsLoading={statsLoading} />; })}</div></section>)}
  </div>;
}

function RoundSkeleton() {
  return <div className="space-y-2" aria-hidden="true"><div className="h-9 w-48 animate-pulse rounded-full bg-slate-100" /><div className="rounded-[1.5rem] border border-slate-100 bg-white p-3"><div className="h-12 animate-pulse rounded-xl bg-slate-100" /><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /></div></div></div>;
}
function MatchCard({ match, competitionId, canEdit, isHost, requireValidation, stats, statsLoading }: { match: CompetitionMatch; competitionId: string; canEdit: boolean; isHost: boolean; requireValidation: boolean; stats?: MatchStats; statsLoading: boolean }) {
  const queryClient = useQueryClient();
  const [homeScore, setHomeScore] = useState(match.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(match.awayScore ?? 0);
  const [scorers, setScorers] = useState<ScorerDraft[]>([]);
  const [evidence, setEvidence] = useState<File | undefined>();
  const [localError, setLocalError] = useState<string | null>(null);
  const editable = canEdit && match.status === 'PENDING' && Boolean(match.homeTeam && match.awayTeam);
  const score = useMutation({
    mutationFn: () => submitMatchScore(match.id, { homeScore, awayScore, version: match.version, evidence, scorers: compactScorerDrafts(scorers) }),
    onSuccess: async () => {
      setLocalError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competition-matches', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['top-scorers', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competition-feed', competitionId] }),
      ]);
    },
  });

  function saveScore() {
    if (requireValidation && !evidence) { setLocalError('Anexe a foto do placar para enviar o resultado.'); return; }
    const scorerError = validateScorerDrafts(scorers, homeScore, awayScore);
    if (scorerError) { setLocalError(scorerError); return; }
    setLocalError(null);
    score.mutate();
  }

  return <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4"><div className="mb-2 flex items-center justify-between gap-2 sm:mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400"><span>{match.leg === 2 ? 'Jogo de volta' : match.leg === 1 ? 'Jogo de ida' : 'Confronto'}</span><span className="rounded-full bg-slate-100 px-2 py-1">{match.status.replaceAll('_', ' ')}</span></div><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3"><TeamSide team={match.homeTeam} align="right" /><div className="flex items-center gap-1.5"><ScoreInput value={homeScore} onChange={setHomeScore} disabled={!editable} label="Placar mandante" /><span className="font-black text-slate-300">×</span><ScoreInput value={awayScore} onChange={setAwayScore} disabled={!editable} label="Placar visitante" /></div><TeamSide team={match.awayTeam} align="left" /></div>{editable && <MatchScorersEditor value={scorers} onChange={setScorers} homeTeamName={match.homeTeam?.name ?? 'Mandante'} awayTeamName={match.awayTeam?.name ?? 'Visitante'} homeScore={homeScore} awayScore={awayScore} />}{editable && requireValidation && <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50 px-3 text-xs font-black text-[#073B8C]"><Camera className="h-4 w-4" />{evidence ? evidence.name : 'Anexar foto do placar'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setEvidence(event.target.files?.[0])} /></label>}{editable && <button onClick={saveScore} disabled={score.isPending} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-black text-[#073B8C] disabled:opacity-40">{score.isPending ? <GlobalLoader mode="inline" label="" className="scale-[.65]" /> : <Save className="h-4 w-4" />}{score.isPending ? 'Enviando…' : 'Registrar placar'}</button>}{(localError || score.isError) && <p className="mt-2 text-center text-[11px] font-bold text-red-600">{localError ?? scoreError(score.error)}</p>}<MatchStatsPanelLight competitionId={competitionId} match={match} stats={stats} statsLoading={statsLoading} canEdit={canEdit} isHost={isHost} /></article>;
}

function TeamSide({ team, align }: { team: CompetitionMatch['homeTeam']; align: 'left' | 'right' }) { return <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}><TeamAvatar name={team?.name ?? 'A definir'} logoUrl={team?.user?.avatarUrl ?? team?.logoUrl ?? undefined} compact /><p className="mt-2 truncate text-xs font-black text-slate-900">{team?.name ?? 'A definir'}</p></div>; }
function TeamAvatar({ name, logoUrl, compact = false }: { name: string; logoUrl?: string; compact?: boolean }) { const size = compact ? 'h-10 w-10' : 'h-11 w-11'; if (logoUrl) return <img src={logoUrl} alt="" className={`${size} inline-block shrink-0 rounded-xl border border-slate-200 bg-white object-cover shadow-sm`} loading="lazy" referrerPolicy="no-referrer" />; return <span className={`inline-grid ${size} shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-[10px] font-black text-[#073B8C]`}>{name.slice(0, 2).toUpperCase()}</span>; }
function ScoreInput({ value, onChange, disabled, label }: { value: number; onChange: (value: number) => void; disabled: boolean; label: string }) { return <input aria-label={label} type="number" inputMode="numeric" min={0} max={99} disabled={disabled} value={value} onChange={(event) => onChange(Math.min(99, Math.max(0, Number(event.target.value) || 0)))} className="h-11 w-11 rounded-xl border border-slate-200 bg-slate-50 text-center text-lg font-black text-slate-900 outline-none focus:border-blue-400 disabled:text-slate-400" />; }
function scoreError(error: unknown): string { if (!(error instanceof ApiError)) return 'Não foi possível registrar o placar.'; if (error.code === 'EVIDENCE_REQUIRED') return 'A foto do placar é obrigatória nesta Copa.'; if (error.code === 'SCORER_TOTAL_EXCEEDS_SCORE') return 'A soma dos gols dos goleadores não pode ultrapassar o placar.'; if (error.code === 'INVALID_MATCH_TRANSITION') return 'Este jogo não aceita um novo placar neste momento.'; if (error.code === 'FORBIDDEN') return 'Você não pode registrar o placar deste jogo.'; return 'Falha ao registrar o placar.'; }
function startError(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.details as { error?: unknown; message?: unknown; requestId?: unknown } | undefined;
    const apiMessage = typeof details?.message === 'string' && details.message.trim()
      ? details.message.trim()
      : typeof details?.error === 'string' && details.error.trim()
        ? details.error.trim()
        : error.message || error.code;
    const requestId = typeof details?.requestId === 'string' && details.requestId.trim() ? details.requestId.trim() : null;
    return requestId ? `${apiMessage} · Ref. ${requestId.slice(0, 8)}` : apiMessage;
  }
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'Falha desconhecida ao gerar as partidas.');
}
function removeParticipantError(error: unknown): string { if (!(error instanceof ApiError)) return 'Não foi possível remover este jogador.'; if (error.code === 'HOST_CANNOT_REMOVE_SELF') return 'O Host não pode remover a si mesmo.'; if (error.code === 'LOBBY_LOCKED') return 'O lobby já foi encerrado e não aceita remoções.'; if (error.code === 'PARTICIPANT_NOT_FOUND') return 'Esse jogador já não está no lobby.'; if (error.code === 'HOST_ONLY') return 'Somente o Host pode remover jogadores.'; return 'Não foi possível remover este jogador agora.'; }
function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Medal; label: string }) { return <button type="button" onClick={onClick} className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-2 text-[11px] font-black transition sm:gap-2 sm:text-sm ${active ? 'bg-[#073B8C] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span></button>; }
type RuleTone = 'blue' | 'violet' | 'amber' | 'emerald' | 'rose';
function RuleBadge({ icon: Icon, label, tone }: { icon: typeof Repeat2; label: string; tone: RuleTone }) { const tones: Record<RuleTone, string> = { blue: 'border-blue-200 bg-blue-50 text-[#073B8C]', violet: 'border-violet-200 bg-violet-50 text-violet-700', amber: 'border-amber-200 bg-amber-50 text-amber-700', emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700', rose: 'border-rose-200 bg-rose-50 text-rose-700' }; return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black ${tones[tone]}`}><Icon className="h-3.5 w-3.5" />{label}</span>; }
function groupMatchesByRound(matches: CompetitionMatch[]) { const grouped = new Map<number, CompetitionMatch[]>(); for (const match of matches) { const number = match.round?.number ?? 0; const bucket = grouped.get(number) ?? []; bucket.push(match); grouped.set(number, bucket); } return [...grouped.entries()].sort(([a], [b]) => a - b).map(([number, roundMatches]) => ({ number, name: roundMatches[0]?.round?.name || (number > 0 ? `Rodada ${number}` : 'Partidas'), matches: roundMatches })); }
function Loading() {
  return <main className="min-h-dvh bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] text-slate-900" aria-label="Abrindo campeonato">
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="flex items-center gap-3 py-3"><div className="h-11 w-11 rounded-2xl bg-slate-100" /><div className="flex-1"><div className="h-3 w-28 rounded bg-blue-100" /><div className="mt-2 h-6 w-48 rounded bg-slate-100" /></div><div className="h-11 w-11 rounded-2xl bg-amber-100" /></div>
      <div className="mt-3 flex gap-2"><div className="h-8 w-28 rounded-full bg-slate-100" /><div className="h-8 w-24 rounded-full bg-slate-100" /><div className="h-8 w-32 rounded-full bg-slate-100" /></div>
      <div className="mt-7 rounded-[2rem] border border-slate-100 bg-white p-2"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-12 rounded-2xl bg-slate-100" />)}</div></div>
      <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-100"><div className="h-14 bg-slate-50" /><div className="space-y-2 p-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-11 rounded-xl bg-slate-100" />)}</div></div>
    </div>
  </main>;
}
function LiveSyncRetry({ label, onRetry }: { label: string; onRetry: () => void }) {
  return <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-center text-xs font-bold text-amber-800"><p>{label}</p><button type="button" onClick={onRetry} className="mt-2 rounded-xl bg-white px-3 py-2 text-[#073B8C] shadow-sm">Tentar agora</button></div>;
}
function RecoverableCompetitionError({ onRetry }: { onRetry: () => void }) {
  return <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900"><div className="max-w-sm text-center"><h1 className="text-xl font-black">Reconectando à Copa</h1><p className="mt-2 text-sm font-medium text-slate-500">Sua participação não foi removida. Houve uma falha temporária ao atualizar os dados.</p><button type="button" onClick={onRetry} className="mt-5 inline-flex rounded-2xl bg-[#073B8C] px-5 py-3 font-black text-white">Tentar novamente</button></div></main>;
}
function ErrorState() { return <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900"><div className="max-w-sm text-center"><h1 className="text-xl font-black">Campeonato não encontrado</h1><p className="mt-2 text-sm font-medium text-slate-500">Este campeonato não existe mais ou o endereço está incorreto.</p><Link to="/competitions" className="mt-5 inline-flex rounded-2xl bg-[#073B8C] px-5 py-3 font-black text-white">Ver minhas copas</Link></div></main>; }
