import { Crown, Shield } from 'lucide-react';
import type { Standing } from '../../lib/api';

const podiumStyles = [
  'border-yellow-300/50 bg-gradient-to-br from-yellow-100 via-amber-400 to-yellow-700 text-slate-950 shadow-lg shadow-amber-500/20',
  'border-slate-200/60 bg-gradient-to-br from-white via-slate-300 to-slate-500 text-slate-950 shadow-lg shadow-slate-300/10',
  'border-orange-300/40 bg-gradient-to-br from-orange-200 via-amber-700 to-orange-950 text-white shadow-lg shadow-orange-900/20',
] as const;

export function StandingsTable({ standings }: { standings: Standing[] }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-slate-900 via-slate-950 to-black shadow-2xl shadow-black/50 ring-1 ring-white/5">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-300">ArenaGG Ranking</p>
          <h3 className="mt-1 text-lg font-black text-white">Classificação</h3>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-yellow-300/20 bg-yellow-300/10 text-yellow-300 shadow-inner shadow-yellow-100/5">
          <Crown className="h-5 w-5" />
        </span>
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[690px] border-collapse text-xs text-slate-200">
          <thead>
            <tr className="border-b border-white/10 bg-white/[.035] text-[10px] font-black uppercase tracking-[.16em] text-slate-400">
              <th className="sticky left-0 z-20 w-14 bg-slate-950/95 px-3 py-3 text-center backdrop-blur-xl">Pos</th>
              <th className="sticky left-14 z-20 min-w-52 bg-slate-950/95 px-3 py-3 text-left backdrop-blur-xl">Time</th>
              {['PTS', 'J', 'V', 'E', 'D', 'SG'].map((column) => (
                <th key={column} className="px-3 py-3 text-center">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => {
              const podium = index < 3;
              return (
                <tr key={row.teamId} className="border-b border-white/[.07] bg-white/[.015] transition hover:bg-white/[.04] last:border-b-0">
                  <td className="sticky left-0 z-10 bg-slate-950/95 px-3 py-3 text-center backdrop-blur-xl">
                    <span className={`inline-grid h-9 w-9 place-items-center rounded-xl border text-sm font-black ${podium ? podiumStyles[index] : 'border-white/10 bg-white/[.06] text-slate-300 shadow-inner'}`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="sticky left-14 z-10 bg-slate-950/95 px-3 py-3 backdrop-blur-xl">
                    <div className="flex min-w-0 items-center gap-3">
                      <TeamLogo name={row.team} logoUrl={row.logoUrl} podium={podium} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">{row.team}</p>
                        <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{row.playerName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-base font-black text-cyan-300">{row.points}</td>
                  <td className="px-3 py-3 text-center font-extrabold text-slate-300">{row.played}</td>
                  <td className="px-3 py-3 text-center font-extrabold text-emerald-300">{row.wins}</td>
                  <td className="px-3 py-3 text-center font-extrabold text-slate-300">{row.draws}</td>
                  <td className="px-3 py-3 text-center font-extrabold text-rose-300">{row.losses}</td>
                  <td className={`px-3 py-3 text-center font-black ${row.goalDifference > 0 ? 'text-emerald-300' : row.goalDifference < 0 ? 'text-rose-300' : 'text-slate-300'}`}>
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
          <div><Shield className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-3 text-sm font-bold text-slate-400">A tabela aparece assim que os resultados forem finalizados.</p></div>
        </div>
      )}

      <p className="border-t border-white/10 bg-black/20 px-5 py-3 text-[10px] font-semibold text-slate-500">Deslize para o lado no celular para ver todas as estatísticas.</p>
    </div>
  );
}

function TeamLogo({ name, logoUrl, podium }: { name: string; logoUrl?: string; podium: boolean }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" className={`h-10 w-10 shrink-0 rounded-xl border object-cover shadow-lg ${podium ? 'border-white/30' : 'border-white/10'}`} loading="lazy" referrerPolicy="no-referrer" />;
  }

  return (
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-[10px] font-black ${podium ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200' : 'border-white/10 bg-white/[.06] text-slate-300'}`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}
