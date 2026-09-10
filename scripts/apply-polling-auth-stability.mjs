import { readFileSync, writeFileSync } from 'node:fs';

function patch(path, mutations) {
  let source = readFileSync(path, 'utf8');
  for (const [needle, replacement, label] of mutations) {
    if (!source.includes(needle)) {
      throw new Error(`${path}: missing patch target: ${label}`);
    }
    source = source.replace(needle, replacement);
  }
  writeFileSync(path, source);
}

patch('apps/web/src/lib/api.ts', [
  [
    "import { getSupabaseAccessToken, refreshSupabaseAccessToken } from './supabase-auth';",
    "import {\n  getSupabaseAccessTokenForRequest,\n  refreshSupabaseAccessToken,\n  SupabaseAuthRestoringError,\n} from './supabase-auth';",
    'api auth imports',
  ],
  [
`  const accessToken = getSupabaseAccessToken();
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', \`Bearer \${accessToken}\`);
  }

  let response = await fetchApi(path, init, headers);`,
`  let accessToken: string | null = null;
  if (!isSessionIssuingPath(path)) {
    try {
      accessToken = await getSupabaseAccessTokenForRequest();
    } catch (error) {
      if (error instanceof SupabaseAuthRestoringError) {
        // Do not poison polling/prefetch caches with an anonymous 401 while a
        // persisted iOS session is still being hydrated/refreshed.
        throw new ApiError(0, 'AUTH_RESTORING', { message: error.message });
      }
      throw error;
    }
  }

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', \`Bearer \${accessToken}\`);
  }

  let response = await fetchApi(path, init, headers);`,
    'central bearer barrier',
  ],
]);

patch('apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx', [
  [
`type CompetitionTab = 'standings' | 'rounds' | 'scorers' | 'feed';
type Participation = CompetitionDetail['participations'][number];
type CompetitionMatch = CompetitionDetail['matches'][number];`,
`type CompetitionTab = 'standings' | 'rounds' | 'scorers' | 'feed';
type Participation = CompetitionDetail['participations'][number];
type CompetitionMatch = CompetitionDetail['matches'][number];

function isRealNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function retryLiveQuery(failureCount: number, error: unknown): boolean {
  if (isRealNotFound(error)) return false;
  return failureCount < 3;
}`,
    'live query helpers',
  ],
  [
`  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getCompetition(competitionId),
    enabled: Boolean(competitionId),
    staleTime: 8_000,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
  });`,
`  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getCompetition(competitionId),
    enabled: Boolean(competitionId),
    staleTime: 8_000,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
    retry: retryLiveQuery,
  });`,
    'competition resilient query',
  ],
  [
`  const standings = useQuery({
    queryKey: ['standings', competitionId],
    queryFn: () => getStandings(competitionId),
    enabled: Boolean(competitionId) && activeTab === 'standings',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });`,
`  const standings = useQuery({
    queryKey: ['standings', competitionId],
    queryFn: () => getStandings(competitionId),
    enabled: Boolean(competitionId) && activeTab === 'standings',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
    retry: retryLiveQuery,
  });`,
    'standings resilient polling',
  ],
  [
`  const roundMatches = useQuery({
    queryKey: ['competition-matches', competitionId, selectedRound ?? 'current'],
    queryFn: () => getCompetitionMatches(competitionId, selectedRound ?? undefined),
    enabled: Boolean(competitionId) && activeTab === 'rounds',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });`,
`  const roundMatches = useQuery({
    queryKey: ['competition-matches', competitionId, selectedRound ?? 'current'],
    queryFn: () => getCompetitionMatches(competitionId, selectedRound ?? undefined),
    enabled: Boolean(competitionId) && activeTab === 'rounds',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
    retry: retryLiveQuery,
  });`,
    'rounds resilient polling',
  ],
  [
`  const matchStats = useQuery({
    queryKey: ['match-stats', competitionId],
    queryFn: () => getCompetitionMatchStats(competitionId),
    enabled: Boolean(competitionId) && activeTab === 'rounds',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });`,
`  const matchStats = useQuery({
    queryKey: ['match-stats', competitionId],
    queryFn: () => getCompetitionMatchStats(competitionId),
    enabled: Boolean(competitionId) && activeTab === 'rounds',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
    retry: retryLiveQuery,
  });`,
    'stats resilient polling',
  ],
  [
`  if (competition.isLoading) return <Loading />;
  if (competition.isError || !data) return <ErrorState />;`,
`  const firstLoadNotFound = data === undefined && isRealNotFound(competition.error);
  if (data === undefined && (competition.isLoading || competition.isFetching) && !firstLoadNotFound) {
    return <Loading />;
  }
  if (firstLoadNotFound) return <ErrorState />;
  if (data === undefined) {
    return <RecoverableCompetitionError onRetry={() => void competition.refetch()} />;
  }`,
    'competition fallback semantics',
  ],
  [
`              {activeTab === 'standings' && <>{standings.isLoading && <GlobalLoader mode="section" label="Carregando classificação…" />}{standings.isError && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">Não foi possível carregar a classificação.</div>}{!standings.isLoading && !standings.isError && <StandingsTable standings={standings.data ?? []} userIdByTeam={userIdByTeam} />}</>}`,
`              {activeTab === 'standings' && <>
                {standings.data === undefined && standings.isLoading && <GlobalLoader mode="section" label="Carregando classificação…" />}
                {standings.data === undefined && standings.isError && <LiveSyncRetry label="Classificação indisponível por alguns segundos. Tentando reconectar…" onRetry={() => void standings.refetch()} />}
                {standings.data !== undefined && <StandingsTable standings={standings.data} userIdByTeam={userIdByTeam} />}
              </>}`,
    'standings stale-data rendering',
  ],
  [
`              {activeTab === 'rounds' && <>
                {roundMatches.isLoading && <RoundSkeleton />}
                {roundMatches.isError && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">Não foi possível carregar esta rodada.</div>}
                {!roundMatches.isLoading && !roundMatches.isError && <RoundsView`,
`              {activeTab === 'rounds' && <>
                {roundMatches.data === undefined && roundMatches.isLoading && <RoundSkeleton />}
                {roundMatches.data === undefined && roundMatches.isError && <LiveSyncRetry label="Rodada indisponível por alguns segundos. Tentando reconectar…" onRetry={() => void roundMatches.refetch()} />}
                {roundMatches.data !== undefined && <RoundsView`,
    'rounds stale-data rendering',
  ],
  [
`function ErrorState() { return <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900"><div className="max-w-sm text-center"><h1 className="text-xl font-black">Campeonato não encontrado</h1><p className="mt-2 text-sm font-medium text-slate-500">Você precisa participar desta copa para visualizar os detalhes.</p><Link to="/competitions" className="mt-5 inline-flex rounded-2xl bg-[#073B8C] px-5 py-3 font-black text-white">Ver minhas copas</Link></div></main>; }`,
`function LiveSyncRetry({ label, onRetry }: { label: string; onRetry: () => void }) {
  return <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-center text-xs font-bold text-amber-800"><p>{label}</p><button type="button" onClick={onRetry} className="mt-2 rounded-xl bg-white px-3 py-2 text-[#073B8C] shadow-sm">Tentar agora</button></div>;
}
function RecoverableCompetitionError({ onRetry }: { onRetry: () => void }) {
  return <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900"><div className="max-w-sm text-center"><h1 className="text-xl font-black">Reconectando à Copa</h1><p className="mt-2 text-sm font-medium text-slate-500">Sua participação não foi removida. Houve uma falha temporária ao atualizar os dados.</p><button type="button" onClick={onRetry} className="mt-5 inline-flex rounded-2xl bg-[#073B8C] px-5 py-3 font-black text-white">Tentar novamente</button></div></main>;
}
function ErrorState() { return <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900"><div className="max-w-sm text-center"><h1 className="text-xl font-black">Campeonato não encontrado</h1><p className="mt-2 text-sm font-medium text-slate-500">Este campeonato não existe mais ou o endereço está incorreto.</p><Link to="/competitions" className="mt-5 inline-flex rounded-2xl bg-[#073B8C] px-5 py-3 font-black text-white">Ver minhas copas</Link></div></main>; }`,
    'recoverable and 404 states',
  ],
]);

console.log('Polling/auth stability patches applied.');
