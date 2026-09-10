from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Backend: lightweight competition detail + round-scoped matches endpoint.
# ---------------------------------------------------------------------------
path = 'apps/api/src/routes/competitions.routes.ts'
text = read(path)
start = text.index("competitions.get('/:id', async (c) => {")
end = text.index("competitions.patch('/:id/my-team'", start)
new_detail = r'''competitions.get('/:id', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');
  const operationsView = c.req.query('view') === 'operations';
  const where: Prisma.CompetitionWhereInput = {
    id,
    OR: [
      { hostId: user.id },
      { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
    ],
  };
  const baseInclude = {
    host: { select: { id: true, name: true, displayName: true } },
    participations: {
      where: { status: 'ACTIVE' as const },
      orderBy: { joinedAt: 'asc' as const },
      select: {
        id: true,
        userId: true,
        teamName: true,
        teamLogoUrl: true,
        user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
        team: { select: { id: true, name: true, logoUrl: true } },
      },
    },
  } satisfies Prisma.CompetitionInclude;

  if (!operationsView) {
    const competition = await db.competition.findFirst({ where, include: baseInclude });
    if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

    return c.json({
      ...competition,
      matches: [],
      currentUserId: user.id,
      isHost: competition.hostId === user.id,
      hasJoined: competition.participations.some((participation) => participation.userId === user.id),
    });
  }

  const competition = await db.competition.findFirst({
    where,
    include: {
      ...baseInclude,
      matches: {
        where: { status: { not: 'FINISHED' } },
        take: 120,
        orderBy: [{ round: { number: 'asc' } }, { bracketPosition: 'asc' }, { leg: 'asc' }],
        include: {
          round: { select: { id: true, number: true, name: true } },
          homeTeam: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              participation: { select: { teamLogoUrl: true, user: { select: { avatarUrl: true } } } },
            },
          },
          awayTeam: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              participation: { select: { teamLogoUrl: true, user: { select: { avatarUrl: true } } } },
            },
          },
        },
      },
    },
  });

  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  return c.json({
    ...competition,
    matches: competition.matches.map((match) => ({
      ...match,
      homeTeam: match.homeTeam
        ? {
            id: match.homeTeam.id,
            name: match.homeTeam.name,
            logoUrl: match.homeTeam.logoUrl ?? match.homeTeam.participation.teamLogoUrl ?? null,
            user: { avatarUrl: match.homeTeam.participation.user.avatarUrl },
          }
        : null,
      awayTeam: match.awayTeam
        ? {
            id: match.awayTeam.id,
            name: match.awayTeam.name,
            logoUrl: match.awayTeam.logoUrl ?? match.awayTeam.participation.teamLogoUrl ?? null,
            user: { avatarUrl: match.awayTeam.participation.user.avatarUrl },
          }
        : null,
    })),
    currentUserId: user.id,
    isHost: competition.hostId === user.id,
    hasJoined: competition.participations.some((participation) => participation.userId === user.id),
  });
});

competitions.get('/:id/matches', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');
  const rawRound = c.req.query('round');
  const requestedRound = rawRound ? Number(rawRound) : null;
  if (requestedRound !== null && (!Number.isInteger(requestedRound) || requestedRound < 1)) {
    return c.json({ error: 'INVALID_ROUND' }, 400);
  }

  const accessWhere: Prisma.CompetitionWhereInput = {
    id,
    OR: [
      { hostId: user.id },
      { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
    ],
  };

  const [competition, roundRows] = await Promise.all([
    db.competition.findFirst({ where: accessWhere, select: { id: true } }),
    db.round.findMany({
      where: { stage: { competitionId: id, status: 'ACTIVE' } },
      select: { id: true, number: true, status: true },
      orderBy: { number: 'asc' },
    }),
  ]);
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  const rounds = [...new Set(roundRows.map((round) => round.number))].sort((a, b) => a - b);
  const currentRound = roundRows.find((round) => round.status === 'ACTIVE')?.number ?? rounds[0] ?? null;
  const selectedRound = requestedRound ?? currentRound;
  if (selectedRound === null) return c.json({ items: [], round: null, rounds: [], hasMore: false });
  if (!rounds.includes(selectedRound)) return c.json({ error: 'ROUND_NOT_FOUND' }, 404);

  const roundIds = roundRows.filter((round) => round.number === selectedRound).map((round) => round.id);
  const rows = await db.match.findMany({
    where: { competitionId: id, roundId: { in: roundIds } },
    take: 41,
    orderBy: [{ bracketPosition: 'asc' }, { leg: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      status: true,
      leg: true,
      version: true,
      homeTeamName: true,
      awayTeamName: true,
      homeScore: true,
      awayScore: true,
      round: { select: { id: true, number: true, name: true } },
      homeTeam: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          participation: { select: { teamLogoUrl: true, user: { select: { avatarUrl: true } } } },
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          participation: { select: { teamLogoUrl: true, user: { select: { avatarUrl: true } } } },
        },
      },
    },
  });

  const visible = rows.slice(0, 40).map((match) => ({
    ...match,
    homeTeam: match.homeTeam
      ? {
          id: match.homeTeam.id,
          name: match.homeTeam.name,
          logoUrl: match.homeTeam.logoUrl ?? match.homeTeam.participation.teamLogoUrl ?? null,
          user: { avatarUrl: match.homeTeam.participation.user.avatarUrl },
        }
      : null,
    awayTeam: match.awayTeam
      ? {
          id: match.awayTeam.id,
          name: match.awayTeam.name,
          logoUrl: match.awayTeam.logoUrl ?? match.awayTeam.participation.teamLogoUrl ?? null,
          user: { avatarUrl: match.awayTeam.participation.user.avatarUrl },
        }
      : null,
  }));

  return c.json({ items: visible, round: selectedRound, rounds, hasMore: rows.length > 40 });
});

'''
text = text[:start] + new_detail + text[end:]

standings_start = text.index("competitions.get('/:id/standings', async (c) => {")
new_standings = r'''competitions.get('/:id/standings', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');

  const [competition, matches] = await Promise.all([
    db.competition.findFirst({
      where: {
        id,
        OR: [
          { hostId: user.id },
          { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
        ],
      },
      select: {
        id: true,
        teams: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            participation: {
              select: {
                teamLogoUrl: true,
                user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    }),
    db.match.findMany({
      where: {
        competitionId: id,
        status: 'FINISHED',
        homeTeamId: { not: null },
        awayTeamId: { not: null },
        homeScore: { not: null },
        awayScore: { not: null },
      },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    }),
  ]);
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  const teamById = new Map(competition.teams.map((team) => [team.id, team]));
  return c.json(
    calculateStandings(competition.teams.map((team) => team.id), matches as never).map((row, index) => {
      const team = teamById.get(row.teamId);
      return {
        ...row,
        position: index + 1,
        team: team?.name ?? 'Time',
        logoUrl: team?.logoUrl ?? team?.participation.teamLogoUrl ?? undefined,
        user: team
          ? { id: team.participation.user.id, avatarUrl: team.participation.user.avatarUrl }
          : null,
        playerName:
          team?.participation.user.displayName ?? team?.participation.user.name ?? 'Jogador',
      };
    }),
  );
});
'''
text = text[:standings_start] + new_standings
write(path, text)

# ---------------------------------------------------------------------------
# Frontend API: separate round-scoped matches from lightweight detail.
# ---------------------------------------------------------------------------
path = 'apps/web/src/lib/api.ts'
text = read(path)
needle = "};\n\nexport type Standing = {"
insert = "};\n\nexport type CompetitionMatch = CompetitionDetail['matches'][number];\n\nexport type CompetitionMatchesPage = {\n  items: CompetitionMatch[];\n  round: number | null;\n  rounds: number[];\n  hasMore: boolean;\n};\n\nexport type Standing = {"
text = replace_once(text, needle, insert, 'competition matches response types')
old = r'''export async function getCompetition(competitionId: string): Promise<CompetitionDetail> {
  const competition = await apiRequest<CompetitionDetail>(
    `/api/competitions/${encodeURIComponent(competitionId)}`,
  );

  return {
    ...competition,
    game: competition.game ?? null,
    platform: competition.platform ?? null,
    matches: competition.matches.map((match) => ({
      ...match,
      homeTeamName: match.homeTeamName ?? null,
      awayTeamName: match.awayTeamName ?? null,
    })),
  };
}
'''
new = r'''export async function getCompetition(competitionId: string): Promise<CompetitionDetail> {
  const competition = await apiRequest<CompetitionDetail>(
    `/api/competitions/${encodeURIComponent(competitionId)}`,
  );

  return {
    ...competition,
    game: competition.game ?? null,
    platform: competition.platform ?? null,
    matches: (competition.matches ?? []).map((match) => ({
      ...match,
      homeTeamName: match.homeTeamName ?? null,
      awayTeamName: match.awayTeamName ?? null,
    })),
  };
}

export async function getCompetitionMatches(
  competitionId: string,
  round?: number,
): Promise<CompetitionMatchesPage> {
  const params = new URLSearchParams();
  if (round) params.set('round', String(round));
  const suffix = params.size ? `?${params.toString()}` : '';
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/matches${suffix}`);
}
'''
text = replace_once(text, old, new, 'getCompetition/getCompetitionMatches')
write(path, text)

# Phase-three operational consumers explicitly opt into the heavier view.
path = 'apps/web/src/lib/phase-three-api.ts'
text = read(path)
text = replace_once(
    text,
    "return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}`);",
    "return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}?view=operations`);",
    'phase-three operations view',
)
write(path, text)

# ---------------------------------------------------------------------------
# Dashboard: parallel initial fetch, rounds on demand, 3s live polling, skeleton.
# ---------------------------------------------------------------------------
path = 'apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx'
text = read(path)
text = replace_once(text, "  getCompetition,\n  getCompetitionMatchStats,", "  getCompetition,\n  getCompetitionMatches,\n  getCompetitionMatchStats,", 'import getCompetitionMatches')
text = replace_once(text, "  const [activeTab, setActiveTab] = useState<CompetitionTab>('standings');", "  const [activeTab, setActiveTab] = useState<CompetitionTab>('standings');\n  const [selectedRound, setSelectedRound] = useState<number | null>(null);", 'selectedRound state')
old_standings = r'''  const standings = useQuery({
    queryKey: ['standings', competitionId],
    queryFn: () => getStandings(competitionId),
    enabled: Boolean(competitionId) && Boolean(isStarted) && activeTab === 'standings',
    staleTime: 8_000,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
  });
'''
new_standings_q = r'''  // Runs in parallel with the competition detail on the first render. Waiting
  // for `isStarted` here created a real network waterfall on mobile.
  const standings = useQuery({
    queryKey: ['standings', competitionId],
    queryFn: () => getStandings(competitionId),
    enabled: Boolean(competitionId) && activeTab === 'standings',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });

  const roundMatches = useQuery({
    queryKey: ['competition-matches', competitionId, selectedRound ?? 'current'],
    queryFn: () => getCompetitionMatches(competitionId, selectedRound ?? undefined),
    enabled: Boolean(competitionId) && activeTab === 'rounds',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });
'''
text = replace_once(text, old_standings, new_standings_q, 'parallel standings and round matches')
old_stats = r'''  const matchStats = useQuery({
    queryKey: ['match-stats', competitionId],
    queryFn: () => getCompetitionMatchStats(competitionId),
    enabled: Boolean(competitionId) && Boolean(isStarted) && activeTab === 'rounds',
    staleTime: 8_000,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
  });
'''
new_stats = r'''  const matchStats = useQuery({
    queryKey: ['match-stats', competitionId],
    queryFn: () => getCompetitionMatchStats(competitionId),
    enabled: Boolean(competitionId) && activeTab === 'rounds',
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });
'''
text = replace_once(text, old_stats, new_stats, 'match stats polling')
text = replace_once(text, "  const rounds = groupMatchesByRound(data.matches);", "  const rounds = groupMatchesByRound(roundMatches.data?.items ?? []);", 'round data source')
text = text.replace(
    "queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),",
    "queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),\n        queryClient.invalidateQueries({ queryKey: ['competition-matches', competitionId] }),",
)
old_round_render = "              {activeTab === 'rounds' && <RoundsView rounds={rounds} competitionId={data.id} myTeamId={myTeamId} isHost={data.isHost} requireValidation={data.requireValidation} statsByMatch={statsByMatch} statsLoading={matchStats.isLoading} />}"
new_round_render = r'''              {activeTab === 'rounds' && <>
                {roundMatches.isLoading && <RoundSkeleton />}
                {roundMatches.isError && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">Não foi possível carregar esta rodada.</div>}
                {!roundMatches.isLoading && !roundMatches.isError && <RoundsView
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
              </>}'''
text = replace_once(text, old_round_render, new_round_render, 'rounds tab render')
round_start = text.index('function RoundsView(')
round_end = text.index('\nfunction MatchCard(', round_start)
new_round_view = r'''function RoundsView({ rounds, availableRounds, selectedRound, onSelectRound, competitionId, myTeamId, isHost, requireValidation, statsByMatch, statsLoading }: { rounds: Array<{ number: number; name: string; matches: CompetitionMatch[] }>; availableRounds: number[]; selectedRound: number | null; onSelectRound: (round: number) => void; competitionId: string; myTeamId?: string; isHost: boolean; requireValidation: boolean; statsByMatch: Map<string, MatchStats>; statsLoading: boolean }) {
  return <div className="space-y-3 sm:space-y-5">
    {availableRounds.length > 1 && <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Selecionar rodada">{availableRounds.map((round) => <button key={round} type="button" onClick={() => onSelectRound(round)} className={`min-h-9 shrink-0 rounded-full border px-3 text-[11px] font-black transition ${selectedRound === round ? 'border-[#073B8C] bg-[#073B8C] text-white' : 'border-slate-200 bg-white text-slate-500'}`}>Rodada {round}</button>)}</div>}
    {rounds.length === 0 && <div className="rounded-[1.5rem] border border-slate-200 bg-white p-3 text-center text-sm font-bold text-slate-500 shadow-sm sm:rounded-[2rem] sm:p-6">As partidas desta rodada estão sendo preparadas.</div>}
    {rounds.map((round) => <section key={round.number} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-md shadow-slate-200/50 sm:rounded-[2rem]"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-5 sm:py-4"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Fase de jogos</p><h3 className="mt-1 text-lg font-black">{round.name}</h3></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-500">{round.matches.length} jogos</span></div><div className="grid gap-2 p-2.5 sm:gap-3 sm:p-4 lg:grid-cols-2">{round.matches.map((match) => { const canEdit = isHost || Boolean(myTeamId && (match.homeTeam?.id === myTeamId || match.awayTeam?.id === myTeamId)); return <MatchCard key={`${match.id}:${match.version}`} match={match} competitionId={competitionId} canEdit={canEdit} isHost={isHost} requireValidation={requireValidation} stats={statsByMatch.get(match.id)} statsLoading={statsLoading} />; })}</div></section>)}
  </div>;
}

function RoundSkeleton() {
  return <div className="space-y-2" aria-hidden="true"><div className="h-9 w-48 animate-pulse rounded-full bg-slate-100" /><div className="rounded-[1.5rem] border border-slate-100 bg-white p-3"><div className="h-12 animate-pulse rounded-xl bg-slate-100" /><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /><div className="h-28 animate-pulse rounded-2xl bg-slate-100" /></div></div></div>;
}'''
text = text[:round_start] + new_round_view + text[round_end:]
old_loading = "function Loading() { return <GlobalLoader mode=\"screen\" label=\"Carregando campeonato…\" />; }"
new_loading = r'''function Loading() {
  return <main className="min-h-dvh bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] text-slate-900" aria-label="Abrindo campeonato">
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="flex items-center gap-3 py-3"><div className="h-11 w-11 rounded-2xl bg-slate-100" /><div className="flex-1"><div className="h-3 w-28 rounded bg-blue-100" /><div className="mt-2 h-6 w-48 rounded bg-slate-100" /></div><div className="h-11 w-11 rounded-2xl bg-amber-100" /></div>
      <div className="mt-3 flex gap-2"><div className="h-8 w-28 rounded-full bg-slate-100" /><div className="h-8 w-24 rounded-full bg-slate-100" /><div className="h-8 w-32 rounded-full bg-slate-100" /></div>
      <div className="mt-7 rounded-[2rem] border border-slate-100 bg-white p-2"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-12 rounded-2xl bg-slate-100" />)}</div></div>
      <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-100"><div className="h-14 bg-slate-50" /><div className="space-y-2 p-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-11 rounded-xl bg-slate-100" />)}</div></div>
    </div>
  </main>;
}'''
text = replace_once(text, old_loading, new_loading, 'competition skeleton')
write(path, text)

# ---------------------------------------------------------------------------
# Prefetch lightweight detail on touch/pointer before navigation.
# ---------------------------------------------------------------------------
path = 'apps/web/src/components/competition/CompetitionCard.tsx'
text = read(path)
text = replace_once(text, "import { ChevronRight, Trophy, Users } from 'lucide-react';", "import { useQueryClient } from '@tanstack/react-query';\nimport { ChevronRight, Trophy, Users } from 'lucide-react';", 'competition card query client import')
text = replace_once(text, "import type { CompetitionStatus, CompetitionSummary } from '../../lib/api';", "import { getCompetition, type CompetitionStatus, type CompetitionSummary } from '../../lib/api';", 'competition card API import')
text = replace_once(text, "export function CompetitionCard({ competition }: { competition: CompetitionSummary }) {\n  const showRound", "export function CompetitionCard({ competition }: { competition: CompetitionSummary }) {\n  const queryClient = useQueryClient();\n  const prefetch = () => void queryClient.prefetchQuery({ queryKey: ['competition', competition.id], queryFn: () => getCompetition(competition.id), staleTime: 30_000 });\n  const showRound", 'competition card prefetch')
text = replace_once(text, "    <Link to={`/competitions/${competition.id}`} className=\"block rounded-3xl", "    <Link to={`/competitions/${competition.id}`} onPointerEnter={prefetch} onPointerDown={prefetch} onFocus={prefetch} className=\"block rounded-3xl", 'competition card link prefetch handlers')
write(path, text)

# Standalone standings view also receives 3s live updates.
path = 'apps/web/src/pages/competitions/StandingsPage.tsx'
text = read(path)
text = replace_once(text, "    enabled: Boolean(competitionId),\n  });", "    enabled: Boolean(competitionId),\n    staleTime: 1_000,\n    refetchInterval: 3_000,\n    refetchIntervalInBackground: false,\n  });", 'standings page live polling')
write(path, text)

# Operational panels must not reuse the lightweight detail cache entry.
for path in [
    'apps/web/src/components/competition/CompetitionPhaseFiveCenter.tsx',
    'apps/web/src/components/competition/CompetitionPrizePanel.tsx',
    'apps/web/src/components/matches/CompetitionMatchAutomationPanel.tsx',
]:
    text = read(path)
    text = replace_once(text, "queryKey: ['competition', competitionId],", "queryKey: ['competition-operations', competitionId],", f'{path} operational query key')
    text = text.replace(
        "queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),",
        "queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),\n      queryClient.invalidateQueries({ queryKey: ['competition-operations', competitionId] }),",
    )
    write(path, text)

print('competition dashboard performance patch applied')
