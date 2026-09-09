import { Crown, Shield } from 'lucide-react';
import type { Standing } from '../../lib/api';

const podiumStyles = [
  'border-amber-300 bg-gradient-to-br from-amber-100 via-yellow-300 to-amber-500 text-amber-950 shadow-md shadow-amber-200/60',
  'border-slate-300 bg-gradient-to-br from-white via-slate-200 to-slate-400 text-slate-800 shadow-md shadow-slate-200/70',
  'border-orange-300 bg-gradient-to-br from-orange-100 via-orange-300 to-amber-700 text-orange-950 shadow-md shadow-orange-200/60',
] as const;

export function StandingsTable({ standings }: { standings: Standing[] }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-md shadow-slate-200/60 ring-1 ring-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-white via-blue-50/60 to-white px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-[#073B8C]">ArenaGG Ranking</p>
          <h3 className="mt-1 text-lg font-black text-slate-900">Classificação</h3>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600 shadow-sm">
          <Crown className="h-5 w-5" />
        </span>
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[690px] border-collapse text-xs text-slate-700">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-[.16em] text-slate-500">
              <th className="sticky left-0 z-20 w-14 bg-slate-50 px-3 py-3 text-center">Pos</th>
              <th className="sticky left-14 z-20 min-w-52 bg-slate-50 px-3 py-3 text-left">Time</th>
              {['PTS', 'J', 'V', 'E', 'D', 'SG'].map((column) => (
                <th key={column} className="px-3 py-3 text-center">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => {
              const podium = index < 3;
              return (
                <tr key={row.teamId} className="border-b border-slate-100 bg-white transition hover:bg-blue-50/30 last:border-b-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-3 text-center">
                    <span className={`inline-grid h-9 w-9 place-items-center rounded-xl border text-sm font-black ${podium ? podiumStyles[index] : 'border-slate-200 bg-slate-50 text-slate-600 shadow-sm'}`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="sticky left-14 z-10 bg-white px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <TeamLogo name={row.team} logoUrl={row.logoUrl} podium={podium} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{row.team}</p>
                        <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{row.playerName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-base font-black text-[#073B8C]">{row.points}</td>
                  <td className="px-3 py-3 text-center font-extrabold text-slate-600">{row.played}</td>
                  <td className="px-3 py-3 text-center font-extrabold text-emerald-700">{row.wins}</td>
                  <td className="px-3 py-3 text-center font-extrabold text-slate-600">{row.draws}</td>
                  <td className="px-3 py-3 text-center font-extrabold text-rose-600">{row.losses}</td>
                  <td className={`px-3 py-3 text-center font-black ${row.goalDifference > 0 ? 'text-emerald-700' : row.goalDifference < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                    {row.goalDifference > 0 ? '+' : ''}{row.goalDifference}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {standings.length === 0 && (
        <div className="grid min-h-40 place-items-center px-6 text-center">
          <div><Shield className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">A tabela aparece assim que os resultados forem finalizados.</p></div>
        </div>
      )}

      <p className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-semibold text-slate-500">Deslize para o lado no celular para ver todas as estatísticas.</p>
    </div>
  );
}

function TeamLogo({ name, logoUrl, podium }: { name: string; logoUrl?: string; podium: boolean }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" className={`h-10 w-10 shrink-0 rounded-xl border bg-white object-cover shadow-sm ${podium ? 'border-blue-200' : 'border-slate-200'}`} loading="lazy" referrerPolicy="no-referrer" />;
  }

  return (
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-[10px] font-black ${podium ? 'border-blue-200 bg-blue-50 text-[#073B8C]' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}
