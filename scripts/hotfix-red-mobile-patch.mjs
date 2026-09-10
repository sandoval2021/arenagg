import fs from 'node:fs';

function patchFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [from, to] of replacements) {
    if (!content.includes(from)) {
      throw new Error(`Missing patch target in ${path}: ${from.slice(0, 120)}`);
    }
    content = content.replace(from, to);
  }
  fs.writeFileSync(path, content);
}

patchFile('apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx', [
  [
    "<TeamAvatar name={participant.teamName} logoUrl={participant.team?.logoUrl ?? participant.user.avatarUrl ?? participant.teamLogoUrl ?? undefined} />",
    "<TeamAvatar name={participant.teamName} logoUrl={participant.user.avatarUrl ?? participant.team?.logoUrl ?? participant.teamLogoUrl ?? undefined} />",
  ],
  [
    "return <div className=\"space-y-3 sm:space-y-5\">{rounds.map((round) => <section key={round.number} className=\"overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-md shadow-slate-200/50 sm:rounded-[2rem]\"><div className=\"flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-5 sm:py-4\">",
    "return <div className=\"space-y-2 sm:space-y-4\">{rounds.map((round) => <section key={round.number} className=\"overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm sm:rounded-[2rem]\"><div className=\"flex items-center justify-between border-b border-slate-200 bg-slate-50 px-2 py-2 sm:px-5 sm:py-4\">",
  ],
  [
    "</span></div><div className=\"grid gap-2 p-2.5 sm:gap-3 sm:p-4 lg:grid-cols-2\">",
    "</span></div><div className=\"grid gap-2 p-2 sm:gap-3 sm:p-4 lg:grid-cols-2\">",
  ],
  [
    "return <article className=\"rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4\">",
    "return <article className=\"rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:rounded-3xl sm:p-4\">",
  ],
  [
    "<TeamAvatar name={team?.name ?? 'A definir'} logoUrl={team?.logoUrl ?? undefined} compact /><p className=\"mt-2 truncate text-xs font-black text-slate-900\">",
    "<TeamAvatar name={team?.name ?? 'A definir'} logoUrl={team?.logoUrl ?? undefined} compact /><p className=\"mt-1 truncate text-[10px] font-black leading-tight text-slate-900 sm:mt-2 sm:text-xs\">",
  ],
  [
    "const size = compact ? 'h-10 w-10' : 'h-11 w-11';",
    "const size = compact ? 'h-8 w-8 sm:h-10 sm:w-10' : 'h-10 w-10 sm:h-11 sm:w-11';",
  ],
  [
    "className=\"h-11 w-11 rounded-xl border border-slate-200 bg-slate-50 text-center text-lg font-black text-slate-900 outline-none focus:border-blue-400 disabled:text-slate-400\"",
    "className=\"h-9 w-9 rounded-lg border border-slate-200 bg-slate-50 text-center text-base font-black text-slate-900 outline-none focus:border-blue-400 disabled:text-slate-400 sm:h-11 sm:w-11 sm:rounded-xl sm:text-lg\"",
  ],
]);

patchFile('apps/api/src/routes/competitions.routes.ts', [
  [
    "logoUrl: match.homeTeam.logoUrl\n              ?? match.homeTeam.participation.user.avatarUrl\n              ?? match.homeTeam.participation.teamLogoUrl",
    "logoUrl: match.homeTeam.participation.user.avatarUrl\n              ?? match.homeTeam.logoUrl\n              ?? match.homeTeam.participation.teamLogoUrl",
  ],
  [
    "logoUrl: match.awayTeam.logoUrl\n              ?? match.awayTeam.participation.user.avatarUrl\n              ?? match.awayTeam.participation.teamLogoUrl",
    "logoUrl: match.awayTeam.participation.user.avatarUrl\n              ?? match.awayTeam.logoUrl\n              ?? match.awayTeam.participation.teamLogoUrl",
  ],
  [
    "team?.logoUrl\n          ?? team?.participation.user.avatarUrl\n          ?? team?.participation.teamLogoUrl",
    "team?.participation.user.avatarUrl\n          ?? team?.logoUrl\n          ?? team?.participation.teamLogoUrl",
  ],
]);

patchFile('apps/api/src/routes/phase-six-competition.routes.ts', [
  [
    "logoUrl: row.team.logoUrl\n            ?? row.team.participation.user.avatarUrl\n            ?? row.team.participation.teamLogoUrl",
    "logoUrl: row.team.participation.user.avatarUrl\n            ?? row.team.logoUrl\n            ?? row.team.participation.teamLogoUrl",
  ],
]);

console.log('red mobile hotfix patches applied');
