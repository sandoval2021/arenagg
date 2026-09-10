import fs from 'node:fs';

function replaceOnce(file, before, after) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes(after)) return;
  if (!content.includes(before)) throw new Error(`Patch target not found in ${file}: ${before.slice(0, 120)}`);
  fs.writeFileSync(file, content.replace(before, after));
}

function replaceAllChecked(file, before, after, minCount = 1) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes(after) && !content.includes(before)) return;
  const count = content.split(before).length - 1;
  if (count < minCount) throw new Error(`Expected at least ${minCount} matches in ${file}, found ${count}`);
  fs.writeFileSync(file, content.split(before).join(after));
}

// 1) Persistent/sliding PWA session cookie: explicit 30-day Max-Age and renewal on /me.
replaceOnce(
  'apps/api/src/routes/auth.routes.ts',
  `const auth = new Hono<Env>();\nconst password = z.string().min(10).max(128);`,
  `const auth = new Hono<Env>();\nconst SESSION_COOKIE_MAX_AGE_SECONDS = 2_592_000; // 30 days; explicit for mobile/PWA persistence.\nconst password = z.string().min(10).max(128);`,
);
replaceOnce(
  'apps/api/src/routes/auth.routes.ts',
  `  maxAge: 60 * 60 * 24 * 30,`,
  `  maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,`,
);
replaceOnce(
  'apps/api/src/routes/auth.routes.ts',
  `  const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);\n  return c.json({ user, rewards: { dailyPackGranted } });`,
  `  // Refresh the first-party HttpOnly cookie on every successful bootstrap.\n  // This keeps standalone mobile PWAs on a real persistent 30-day lifecycle\n  // instead of behaving like a browser-session cookie after app termination.\n  setCookie(c, 'chavea_session', token, {\n    ...cookieOptions,\n    expires: new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1_000),\n  });\n\n  const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);\n  return c.json({ user, rewards: { dailyPackGranted } });`,
);
replaceOnce(
  'apps/api/src/services/auth.service.ts',
  `  if (Date.now() - session.lastUsedAt.getTime() > 5 * 60_000) {\n    await prisma.session.update({\n      where: { id: session.id },\n      data: { lastUsedAt: new Date() },\n    });\n  }`,
  `  const now = Date.now();\n  if (now - session.lastUsedAt.getTime() > 5 * 60_000) {\n    const refreshedAt = new Date(now);\n    await prisma.session.update({\n      where: { id: session.id },\n      data: {\n        lastUsedAt: refreshedAt,\n        expiresAt: new Date(now + SESSION_TTL_MS),\n      },\n    });\n  }`,
);

// 2/4) Competition detail: hydrate match teams with participant avatar and flatten an effective display logo.
replaceOnce(
  'apps/api/src/routes/competitions.routes.ts',
  `          homeTeam: { select: { id: true, name: true, logoUrl: true } },\n          awayTeam: { select: { id: true, name: true, logoUrl: true } },`,
  `          homeTeam: {\n            select: {\n              id: true,\n              name: true,\n              logoUrl: true,\n              participation: {\n                select: { teamLogoUrl: true, user: { select: { avatarUrl: true } } },\n              },\n            },\n          },\n          awayTeam: {\n            select: {\n              id: true,\n              name: true,\n              logoUrl: true,\n              participation: {\n                select: { teamLogoUrl: true, user: { select: { avatarUrl: true } } },\n              },\n            },\n          },`,
);
replaceOnce(
  'apps/api/src/routes/competitions.routes.ts',
  `  return c.json({\n    ...competition,\n    currentUserId: user.id,`,
  `  return c.json({\n    ...competition,\n    matches: competition.matches.map((match) => ({\n      ...match,\n      homeTeam: match.homeTeam\n        ? {\n            id: match.homeTeam.id,\n            name: match.homeTeam.name,\n            logoUrl:\n              match.homeTeam.logoUrl\n              ?? match.homeTeam.participation.user.avatarUrl\n              ?? match.homeTeam.participation.teamLogoUrl\n              ?? null,\n          }\n        : null,\n      awayTeam: match.awayTeam\n        ? {\n            id: match.awayTeam.id,\n            name: match.awayTeam.name,\n            logoUrl:\n              match.awayTeam.logoUrl\n              ?? match.awayTeam.participation.user.avatarUrl\n              ?? match.awayTeam.participation.teamLogoUrl\n              ?? null,\n          }\n        : null,\n    })),\n    currentUserId: user.id,`,
);
replaceOnce(
  'apps/api/src/routes/competitions.routes.ts',
  `              user: { select: { id: true, name: true, displayName: true } },`,
  `              user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },`,
);
replaceOnce(
  'apps/api/src/routes/competitions.routes.ts',
  `        logoUrl: team?.logoUrl ?? team?.participation.teamLogoUrl ?? undefined,`,
  `        logoUrl:\n          team?.logoUrl\n          ?? team?.participation.user.avatarUrl\n          ?? team?.participation.teamLogoUrl\n          ?? undefined,`,
);

// GroupStanding snapshot gets the same effective teamLogo -> user avatar -> legacy fallback.
replaceOnce(
  'apps/api/src/routes/phase-six-competition.routes.ts',
  `                      participation: {\n                        select: { user: { select: { id: true, name: true, displayName: true } } },\n                      },`,
  `                      participation: {\n                        select: {\n                          teamLogoUrl: true,\n                          user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },\n                        },\n                      },`,
);
replaceOnce(
  'apps/api/src/routes/phase-six-competition.routes.ts',
  `    groups: groupStage?.groups ?? [],`,
  `    groups: (groupStage?.groups ?? []).map((group) => ({\n      ...group,\n      standings: group.standings.map((row) => ({\n        ...row,\n        team: {\n          ...row.team,\n          logoUrl:\n            row.team.logoUrl\n            ?? row.team.participation.user.avatarUrl\n            ?? row.team.participation.teamLogoUrl\n            ?? null,\n        },\n      })),\n    })),`,
);

// 2) General standings: every stat stays visible; compact, horizontally scrollable mobile table.
replaceOnce(
  'apps/web/src/components/standings/StandingsTable.tsx',
  `      <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-white via-blue-50/60 to-white px-5 py-4">`,
  `      <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-white via-blue-50/60 to-white px-3 py-3 sm:px-5 sm:py-4">`,
);
replaceOnce(
  'apps/web/src/components/standings/StandingsTable.tsx',
  `      <div className="overflow-x-auto overscroll-x-contain">\n        <table className="w-full min-w-[690px] border-collapse text-xs text-slate-700">`,
  `      <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]">\n        <table className="w-full min-w-[560px] border-collapse text-[10px] text-slate-700 sm:text-xs">`,
);
replaceOnce(
  'apps/web/src/components/standings/StandingsTable.tsx',
  `<th className="sticky left-0 z-20 w-14 bg-slate-50 px-3 py-3 text-center">Pos</th><th className="sticky left-14 z-20 min-w-52 bg-slate-50 px-3 py-3 text-left">Time</th>{['PTS', 'J', 'V', 'E', 'D', 'SG'].map((column) => <th key={column} className="px-3 py-3 text-center">{column}</th>)}`,
  `<th className="sticky left-0 z-20 w-10 bg-slate-50 px-2 py-2 text-center sm:w-14 sm:px-3 sm:py-3">Pos</th><th className="sticky left-10 z-20 min-w-36 bg-slate-50 px-2 py-2 text-left sm:left-14 sm:min-w-52 sm:px-3 sm:py-3">Time</th>{['PTS', 'J', 'V', 'E', 'D', 'SG'].map((column) => <th key={column} className="px-2 py-2 text-center sm:px-3 sm:py-3">{column}</th>)}`,
);
replaceOnce(
  'apps/web/src/components/standings/StandingsTable.tsx',
  `<td className="sticky left-0 z-10 bg-white px-3 py-3 text-center"><span className={`inline-grid h-9 w-9 place-items-center rounded-xl border text-sm font-black ${podium ? podiumStyles[index] : 'border-slate-200 bg-slate-50 text-slate-600 shadow-sm'}`}>{index + 1}</span></td>`,
  `<td className="sticky left-0 z-10 bg-white px-2 py-2 text-center sm:px-3 sm:py-3"><span className={`inline-grid h-7 w-7 place-items-center rounded-lg border text-xs font-black sm:h-9 sm:w-9 sm:rounded-xl sm:text-sm ${podium ? podiumStyles[index] : 'border-slate-200 bg-slate-50 text-slate-600 shadow-sm'}`}>{index + 1}</span></td>`,
);
replaceOnce(
  'apps/web/src/components/standings/StandingsTable.tsx',
  `<td className="sticky left-14 z-10 bg-white px-3 py-2">`,
  `<td className="sticky left-10 z-10 bg-white px-2 py-1.5 sm:left-14 sm:px-3 sm:py-2">`,
);
replaceAllChecked(
  'apps/web/src/components/standings/StandingsTable.tsx',
  `className="px-3 py-3 text-center`,
  `className="px-2 py-2 text-center sm:px-3 sm:py-3`,
  6,
);
replaceOnce(
  'apps/web/src/components/standings/StandingsTable.tsx',
  `className="truncate text-sm font-black text-slate-900"`,
  `className="truncate text-xs font-black text-slate-900 sm:text-sm"`,
);
replaceOnce(
  'apps/web/src/components/standings/StandingsTable.tsx',
  `className="group flex min-h-12 min-w-0 items-center gap-3 rounded-xl px-1 py-1`,
  `className="group flex min-h-10 min-w-0 items-center gap-2 rounded-xl px-0.5 py-0.5 sm:min-h-12 sm:gap-3 sm:px-1 sm:py-1`,
);
replaceOnce(
  'apps/web/src/components/standings/StandingsTable.tsx',
  `className="flex min-h-12 min-w-0 items-center gap-3 px-1 py-1"`,
  `className="flex min-h-10 min-w-0 items-center gap-2 px-0.5 py-0.5 sm:min-h-12 sm:gap-3 sm:px-1 sm:py-1"`,
);
replaceAllChecked(
  'apps/web/src/components/standings/StandingsTable.tsx',
  `h-10 w-10 shrink-0 rounded-xl`,
  `h-8 w-8 shrink-0 rounded-lg sm:h-10 sm:w-10 sm:rounded-xl`,
  2,
);

// 3) Main game list: compact cards and vertical rhythm on mobile.
replaceOnce(
  'apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx',
  `function RoundsView({ rounds, competitionId, myTeamId, isHost, requireValidation, statsByMatch, statsLoading }: { rounds: Array<{ number: number; name: string; matches: CompetitionMatch[] }>; competitionId: string; myTeamId?: string; isHost: boolean; requireValidation: boolean; statsByMatch: Map<string, MatchStats>; statsLoading: boolean }) {\n  if (rounds.length === 0) return <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center text-sm font-bold text-slate-500 shadow-sm">As partidas estão sendo preparadas.</div>;\n  return <div className="space-y-5">{rounds.map((round) => <section key={round.number} className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-md shadow-slate-200/50"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">`,
  `function RoundsView({ rounds, competitionId, myTeamId, isHost, requireValidation, statsByMatch, statsLoading }: { rounds: Array<{ number: number; name: string; matches: CompetitionMatch[] }>; competitionId: string; myTeamId?: string; isHost: boolean; requireValidation: boolean; statsByMatch: Map<string, MatchStats>; statsLoading: boolean }) {\n  if (rounds.length === 0) return <div className="rounded-[1.5rem] border border-slate-200 bg-white p-3 text-center text-sm font-bold text-slate-500 shadow-sm sm:rounded-[2rem] sm:p-6">As partidas estão sendo preparadas.</div>;\n  return <div className="space-y-3 sm:space-y-5">{rounds.map((round) => <section key={round.number} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-md shadow-slate-200/50 sm:rounded-[2rem]"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-5 sm:py-4">`,
);
replaceOnce(
  'apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx',
  `<div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">`,
  `<div className="grid gap-2 p-2.5 sm:gap-3 sm:p-4 lg:grid-cols-2">`,
);
replaceOnce(
  'apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx',
  `return <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-2`,
  `return <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4"><div className="mb-2 flex items-center justify-between gap-2 sm:mb-3`,
);
replaceOnce(
  'apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx',
  `<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">`,
  `<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">`,
);

// 3/4) W.O. automation panel: compact mobile card density. Effective logo is supplied by competition detail API.
replaceOnce(
  'apps/web/src/components/matches/CompetitionMatchAutomationPanel.tsx',
  `<section className="mx-auto mt-5 max-w-5xl px-4 sm:px-6">\n      <div className="rounded-[2rem] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-5 shadow-lg shadow-blue-100/50">`,
  `<section className="mx-auto mt-3 max-w-5xl px-2.5 sm:mt-5 sm:px-6">\n      <div className="rounded-[1.5rem] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-3 shadow-lg shadow-blue-100/50 sm:rounded-[2rem] sm:p-5">`,
);
replaceOnce(
  'apps/web/src/components/matches/CompetitionMatchAutomationPanel.tsx',
  `<span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#073B8C] text-white shadow-md"><Gamepad2 className="h-6 w-6" /></span>`,
  `<span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#073B8C] text-white shadow-md sm:h-12 sm:w-12 sm:rounded-2xl"><Gamepad2 className="h-5 w-5 sm:h-6 sm:w-6" /></span>`,
);
replaceOnce(
  'apps/web/src/components/matches/CompetitionMatchAutomationPanel.tsx',
  `<h2 className="mt-1 text-xl font-black text-slate-950">Check-in, clipe e W.O.</h2><p className="mt-1 text-sm font-semibold text-slate-500">`,
  `<h2 className="mt-0.5 text-lg font-black text-slate-950 sm:mt-1 sm:text-xl">Check-in, clipe e W.O.</h2><p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500 sm:mt-1 sm:text-sm">`,
);
replaceOnce(
  'apps/web/src/components/matches/CompetitionMatchAutomationPanel.tsx',
  `<div className="mt-5 grid gap-3 lg:grid-cols-2">`,
  `<div className="mt-3 grid gap-2 sm:mt-5 sm:gap-3 lg:grid-cols-2">`,
);
replaceOnce(
  'apps/web/src/components/matches/CompetitionMatchAutomationPanel.tsx',
  `className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"`,
  `className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4"`,
);
replaceOnce(
  'apps/web/src/components/matches/CompetitionMatchAutomationPanel.tsx',
  `<div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">`,
  `<div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:mt-3 sm:gap-3">`,
);
replaceOnce(
  'apps/web/src/components/matches/CompetitionMatchAutomationPanel.tsx',
  `className={`mt-3 flex min-h-12 w-full`,
  `className={`mt-2 flex min-h-10 w-full sm:mt-3 sm:min-h-12`,
);
replaceOnce(
  'apps/web/src/components/matches/CompetitionMatchAutomationPanel.tsx',
  `<div className="mt-3 border-t border-slate-100 pt-3">`,
  `<div className="mt-2 border-t border-slate-100 pt-2 sm:mt-3 sm:pt-3">`,
);
replaceOnce(
  'apps/web/src/components/matches/CompetitionMatchAutomationPanel.tsx',
  `<label className="mt-4 block rounded-2xl border border-violet-100 bg-violet-50/60 p-3">`,
  `<label className="mt-2 block rounded-xl border border-violet-100 bg-violet-50/60 p-2.5 sm:mt-4 sm:rounded-2xl sm:p-3">`,
);

// 2/4) Group-stage mobile classification: include E/D too and keep density tight.
replaceOnce(
  'apps/web/src/components/competition/GroupStagePanel.tsx',
  `<header className="bg-gradient-to-r from-[#073B8C] via-blue-700 to-cyan-600 p-5 text-white">`,
  `<header className="bg-gradient-to-r from-[#073B8C] via-blue-700 to-cyan-600 p-3 text-white sm:p-5">`,
);
replaceOnce(
  'apps/web/src/components/competition/GroupStagePanel.tsx',
  `<div className="p-4 sm:p-5">`,
  `<div className="p-3 sm:p-5">`,
);
replaceAllChecked(
  'apps/web/src/components/competition/GroupStagePanel.tsx',
  `grid-cols-[28px_minmax(0,1fr)_34px_28px_28px_34px]`,
  `grid-cols-[24px_minmax(0,1fr)_30px_24px_24px_24px_24px_30px]`,
  2,
);
replaceOnce(
  'apps/web/src/components/competition/GroupStagePanel.tsx',
  `<span className="text-center">PTS</span><span className="text-center">J</span><span className="text-center">V</span><span className="text-center">SG</span>`,
  `<span className="text-center">PTS</span><span className="text-center">J</span><span className="text-center">V</span><span className="text-center">E</span><span className="text-center">D</span><span className="text-center">SG</span>`,
);
replaceOnce(
  'apps/web/src/components/competition/GroupStagePanel.tsx',
  `<span className="text-center text-sm font-black text-[#073B8C]">{row.points}</span><span className="text-center text-xs font-bold text-slate-600">{row.played}</span><span className="text-center text-xs font-bold text-emerald-700">{row.wins}</span><span className={`text-center text-xs font-black`,
  `<span className="text-center text-xs font-black text-[#073B8C]">{row.points}</span><span className="text-center text-[10px] font-bold text-slate-600">{row.played}</span><span className="text-center text-[10px] font-bold text-emerald-700">{row.wins}</span><span className="text-center text-[10px] font-bold text-slate-600">{row.draws}</span><span className="text-center text-[10px] font-bold text-rose-600">{row.losses}</span><span className={`text-center text-[10px] font-black`,
);

// Production CI must reject any regression back to a browser-session cookie.
replaceOnce(
  '.github/workflows/deploy.yml',
  `          grep -qi '^set-cookie: chavea_session=' /tmp/register.headers\n`,
  `          grep -qi '^set-cookie: chavea_session=' /tmp/register.headers\n          grep -qi 'max-age=2592000' /tmp/register.headers\n`,
);

console.log('Mobile/PWA hotfix patches applied.');
