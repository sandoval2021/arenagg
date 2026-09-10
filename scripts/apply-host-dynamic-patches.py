from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise SystemExit(f"missing patch target in {path}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, minimum: int = 1) -> None:
    text = read(path)
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f"expected >= {minimum} occurrences in {path}, got {count}: {old!r}")
    write(path, text.replace(old, new))


# Modular knockout progression: a LEAGUE competition may now own a later
# KNOCKOUT Stage. nextMatchId is the source of truth; league matches have none.
replace_once(
    'apps/api/src/routes/match-score.routes.ts',
    "if (match.competition.type === 'LEAGUE' || !match.nextMatchId) return;",
    "if (!match.nextMatchId) return;",
)
replace_once(
    'apps/api/src/routes/match-approval.routes.ts',
    "if (match.competition.type === 'LEAGUE' || !match.nextMatchId || !match.nextMatchSlot) return;",
    "if (!match.nextMatchId || !match.nextMatchSlot) return;",
)
replace_once(
    'apps/api/src/routes/matches.routes.ts',
    "if (match.competition.type === 'LEAGUE' || !match.nextMatchId) return;",
    "if (!match.nextMatchId) return;",
)
replace_once(
    'apps/api/src/routes/phase-three-match.routes.ts',
    "if (match.competition.type === 'LEAGUE' || !match.nextMatchId || !match.nextMatchSlot) return;",
    "if (!match.nextMatchId || !match.nextMatchSlot) return;",
)
replace_all(
    'apps/api/src/routes/phase-three-match.routes.ts',
    'await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${matchId}))`;',
    'await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${matchId}))`;',
)

# A canceled group match is terminal for progression, but syncGroupStandings
# already reads FINISHED only, so it contributes zero games/points.
phase_six = 'apps/api/src/routes/phase-six-competition.routes.ts'
replace_all(phase_six, "status: { not: 'FINISHED' }", "status: { notIn: ['FINISHED', 'CANCELED'] }", minimum=2)
replace_all(
    phase_six,
    'await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${competitionId}))`;',
    'await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${competitionId}))`;',
)

# Competition detail exposes whether a modular knockout Stage exists.
competitions = 'apps/api/src/routes/competitions.routes.ts'
replace_once(
    competitions,
    "  const baseInclude = {\n    host: { select: { id: true, name: true, displayName: true } },",
    "  const baseInclude = {\n    host: { select: { id: true, name: true, displayName: true } },\n    stages: {\n      orderBy: { order: 'asc' as const },\n      select: { id: true, type: true, status: true, order: true },\n    },",
)
replace_all(
    competitions,
    "      hasJoined: competition.participations.some((participation) => participation.userId === user.id),",
    "      hasJoined: competition.participations.some((participation) => participation.userId === user.id),\n      hasKnockoutStage: competition.stages.some((stage) => stage.type === 'KNOCKOUT'),",
    minimum=2,
)

# Freeze a League table to its LEAGUE Stage. Later playoff matches never alter it.
text = read(competitions)
pattern = re.compile(r"competitions\.get\('/:id/standings', async \(c\) => \{.*?\n\}\);\s*$", re.S)
replacement = r'''competitions.get('/:id/standings', async (c) => {
  const db = c.get('prisma');
  const id = c.req.param('id');
  const user = c.get('user');

  const competition = await db.competition.findFirst({
    where: {
      id,
      OR: [
        { hostId: user.id },
        { participations: { some: { userId: user.id, status: 'ACTIVE' } } },
      ],
    },
    select: {
      id: true,
      type: true,
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
  });
  if (!competition) return c.json({ error: 'COMPETITION_NOT_FOUND' }, 404);

  const matches = await db.match.findMany({
    where: {
      competitionId: id,
      status: 'FINISHED',
      ...(competition.type === 'LEAGUE' ? { stage: { type: 'LEAGUE' as const } } : {}),
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
  });

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
new_text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'failed to replace standings route; matches={count}')
write(competitions, new_text)

# Champion finalization prioritizes an explicit KNOCKOUT Stage regardless of
# the competition's original type. League-only championships remain compatible
# and treat CANCELED as terminal while excluding it from the points table.
profile_stats = 'apps/api/src/services/profile-stats.service.ts'
text = read(profile_stats)
pattern = re.compile(r"async function maybeFinalizeCompetition\(tx: Tx, competitionId: string\): Promise<void> \{.*?\n\}\n\n/\*\*", re.S)
new_function = r'''async function maybeFinalizeCompetition(tx: Tx, competitionId: string): Promise<void> {
  await lockCompetition(tx, competitionId);

  const competition = await tx.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      type: true,
      status: true,
      legFormat: true,
      championshipProfileAppliedAt: true,
    },
  });

  if (
    !competition ||
    competition.championshipProfileAppliedAt ||
    !['IN_PROGRESS', 'FINISHED'].includes(competition.status) ||
    competition.type === 'ENDLESS'
  ) return;

  let championTeamId: string | null = null;
  const knockoutStage = await tx.stage.findFirst({
    where: { competitionId, type: 'KNOCKOUT' },
    orderBy: { order: 'desc' },
    select: { id: true },
  });

  if (knockoutStage) {
    // Preserve the legacy safety restriction for direct two-leg knockouts.
    if (competition.type === 'KNOCKOUT' && competition.legFormat !== 'SINGLE') return;

    const final = await tx.match.findFirst({
      where: { competitionId, stageId: knockoutStage.id, leg: 1 },
      orderBy: [{ round: { number: 'desc' } }, { bracketPosition: 'desc' }],
      select: {
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        homePenaltyScore: true,
        awayPenaltyScore: true,
      },
    });
    if (
      !final ||
      final.status !== 'FINISHED' ||
      !final.homeTeamId ||
      !final.awayTeamId ||
      final.homeScore == null ||
      final.awayScore == null
    ) return;
    try {
      championTeamId = resolveWinner({
        homeTeamId: final.homeTeamId,
        awayTeamId: final.awayTeamId,
        homeScore: final.homeScore,
        awayScore: final.awayScore,
        homePenaltyScore: final.homePenaltyScore,
        awayPenaltyScore: final.awayPenaltyScore,
      });
    } catch {
      return;
    }
  } else if (competition.type === 'LEAGUE') {
    const matches = await tx.match.findMany({
      where: { competitionId, stage: { type: 'LEAGUE' } },
      select: {
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    });
    if (
      matches.length === 0 ||
      matches.some((match) => !['FINISHED', 'CANCELED'].includes(match.status))
    ) return;

    const finished = matches.filter((match) =>
      match.status === 'FINISHED' &&
      match.homeTeamId &&
      match.awayTeamId &&
      match.homeScore != null &&
      match.awayScore != null
    );
    if (finished.length === 0) return;

    const teams = await tx.team.findMany({ where: { competitionId }, select: { id: true } });
    championTeamId = calculateStandings(
      teams.map((team) => team.id),
      finished.map((match) => ({
        homeTeamId: match.homeTeamId!,
        awayTeamId: match.awayTeamId!,
        homeScore: match.homeScore!,
        awayScore: match.awayScore!,
      })),
    )[0]?.teamId ?? null;
  } else {
    // GROUPS_KNOCKOUT can only finish after its KNOCKOUT Stage exists.
    return;
  }

  if (!championTeamId) return;
  const champion = await tx.team.findUnique({
    where: { id: championTeamId },
    select: { participation: { select: { userId: true } } },
  });
  if (!champion?.participation.userId) return;

  const now = new Date();
  const claimed = await tx.competition.updateMany({
    where: {
      id: competitionId,
      championshipProfileAppliedAt: null,
      status: { in: ['IN_PROGRESS', 'FINISHED'] },
    },
    data: {
      status: 'FINISHED',
      endsAt: now,
      championshipProfileAppliedAt: now,
    },
  });
  if (claimed.count === 1) {
    if (knockoutStage) {
      await tx.stage.updateMany({ where: { id: knockoutStage.id }, data: { status: 'FINISHED' } });
    }
    await awardChampionship(tx, champion.participation.userId);
    await creditStickerPacks(tx, champion.participation.userId, 'PREMIUM', 3);
  }
}

/**'''
new_text, count = pattern.subn(new_function, text, count=1)
if count != 1:
    raise SystemExit(f'failed to replace maybeFinalizeCompetition; matches={count}')
write(profile_stats, new_text)

# Frontend contract advertises the dynamic knockout Stage.
api = 'apps/web/src/lib/api.ts'
replace_once(
    api,
    "  hasJoined: boolean;\n  participations: Array<{",
    "  hasJoined: boolean;\n  hasKnockoutStage?: boolean;\n  participations: Array<{",
)

# Main competition menu gets a true Mata-Mata tab without duplicating score UI.
page = 'apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx'
replace_once(page, "  Gamepad2,\n  Link2,", "  Gamepad2,\n  GitBranch,\n  Link2,")
replace_once(
    page,
    "import { StandingsTable } from '../../components/standings/StandingsTable';",
    "import { StandingsTable } from '../../components/standings/StandingsTable';\nimport { CompetitionPlayoffTab } from '../../components/bracket/CompetitionPlayoffTab';",
)
replace_once(
    page,
    "type CompetitionTab = 'standings' | 'rounds' | 'scorers' | 'feed';",
    "type CompetitionTab = 'standings' | 'rounds' | 'scorers' | 'feed' | 'knockout';",
)
replace_once(
    page,
    '<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">',
    '<div className="grid grid-cols-2 gap-2 sm:grid-cols-5">',
)
replace_once(
    page,
    '                <TabButton active={activeTab === \'feed\'} onClick={() => setActiveTab(\'feed\')} icon={MessageCircleMore} label="Feed" />',
    '                <TabButton active={activeTab === \'feed\'} onClick={() => setActiveTab(\'feed\')} icon={MessageCircleMore} label="Feed" />\n                {data.hasKnockoutStage && <TabButton active={activeTab === \'knockout\'} onClick={() => setActiveTab(\'knockout\')} icon={GitBranch} label="Mata-Mata" />}',
)
replace_once(
    page,
    "              {activeTab === 'feed' && <CompetitionFeedPanel competitionId={data.id} />}",
    "              {activeTab === 'feed' && <CompetitionFeedPanel competitionId={data.id} />}\n              {activeTab === 'knockout' && <CompetitionPlayoffTab competitionId={data.id} />}",
)

# Host actions are rendered immediately after the main competition experience,
# not hidden behind a far-below IntersectionObserver threshold.
experience = 'apps/web/src/pages/competitions/CompetitionDetailExperience.tsx'
# Already patched directly on this branch; assert it remains wired.
if 'CompetitionHostActionsPanel' not in read(experience):
    raise SystemExit('CompetitionHostActionsPanel missing from CompetitionDetailExperience')

# Product requested this exact residual copy removed permanently.
for path in [
    'apps/web/src/pages/competitions/StandingsPage.tsx',
    'apps/web/src/components/standings/StandingsTable.tsx',
    'apps/web/src/components/competition/GroupStagePanel.tsx',
]:
    text = read(path)
    text = text.replace('PTS, J, V, E, D e SG ficam sempre disponíveis. Arraste horizontalmente se necessário.', '')
    write(path, text)

print('host dynamic management patches applied')
