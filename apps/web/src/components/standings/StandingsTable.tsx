import type { Standing } from '../../lib/api';

export function StandingsTable({ standings }: { standings: Standing[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="sticky left-0 z-10 bg-slate-50 px-3 py-3 text-center">POS</th><th className="sticky left-10 z-10 min-w-40 bg-slate-50 px-3 py-3 text-left">TIME</th>{['PTS','J','V','E','D','GP','GC','SG'].map((column) => <th key={column} className="px-3 py-3 text-center">{column}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {standings.map((row, index) => <tr key={row.teamId} className="bg-white"><td className="sticky left-0 bg-white px-3 py-4 text-center font-black"><span className={`inline-grid h-7 w-7 place-items-center rounded-lg ${index < 2 ? 'bg-[#073B8C] text-white' : 'bg-slate-100 text-black'}`}>{index + 1}</span></td><td className="sticky left-10 bg-white px-3 py-4 font-extrabold text-black"><div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-[10px] font-black text-[#073B8C]">{row.team.slice(0,2).toUpperCase()}</div><span className="truncate">{row.team}</span></div></td><td className="px-3 py-4 text-center text-sm font-black text-[#073B8C]">{row.points}</td><td className="px-3 py-4 text-center font-bold">{row.played}</td><td className="px-3 py-4 text-center font-bold">{row.wins}</td><td className="px-3 py-4 text-center font-bold">{row.draws}</td><td className="px-3 py-4 text-center font-bold">{row.losses}</td><td className="px-3 py-4 text-center font-bold">{row.goalsFor}</td><td className="px-3 py-4 text-center font-bold">{row.goalsAgainst}</td><td className={`px-3 py-4 text-center font-black ${row.goalDifference < 0 ? 'text-[#E31B23]' : 'text-slate-900'}`}>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-3 text-[11px] font-medium text-slate-500">Deslize horizontalmente para ver todas as estatísticas.</p>
    </div>
  );
}
