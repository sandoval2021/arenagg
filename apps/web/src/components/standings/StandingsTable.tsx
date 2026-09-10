import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Crown, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Standing } from '../../lib/api';
import { getPlayerRanks } from '../../lib/gamification-api';
import { RankEmblem } from '../profile/RankBadge';

const podiumStyles = [
  'border-amber-300 bg-gradient-to-br from-amber-100 via-yellow-300 to-amber-500 text-amber-950 shadow-md shadow-amber-200/60',
  'border-slate-300 bg-gradient-to-br from-white via-slate-200 to-slate-400 text-slate-800 shadow-md shadow-slate-200/70',
  'border-orange-300 bg-gradient-to-br from-orange-100 via-orange-300 to-amber-700 text-orange-950 shadow-md shadow-orange-200/60',
] as const;

export function StandingsTable({ standings, userIdByTeam = {} }: { standings: Standing[]; userIdByTeam?: Record<string, string> }) {
  const userIds = useMemo(() => [...new Set(Object.values(userIdByTeam))].sort(), [userIdByTeam]);
  const ranks = useQuery({
    queryKey: ['player-ranks', userIds.join(',')],
    queryFn: () => getPlayerRanks(userIds),
    enabled: userIds.length > 0,
    staleTime: 30_000,
  });
  const rankByUser = useMemo(() => new Map((ranks.data ?? []).map((entry) => [entry.userId, entry.rank])), [ranks.data]);

  return (
    <div className="w-full overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-md shadow-slate-200/60 ring-1 ring-slate-100 sm:rounded-[2rem]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-white via-blue-50/60 to-white px-3 py-3 sm:px-5 sm:py-4"><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-[#073B8C]">Chavea Ranking</p><h3 className="mt-1 text-lg font-black text-slate-900">Classificação</h3></div><span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600 shadow-sm sm:h-11 sm:w-11 sm:rounded-2xl"><Crown className="h-5 w-5" /></span></div>
      <div
        className="w-full overflow-x-auto pb-2 overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]"
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
        role="region"
        aria-label="Tabela de classificação com rolagem horizontal"
        tabIndex={0}
      >
        <table className="w-full min-w-[520px] border-collapse text-[10px] text-slate-700 sm:text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-[.12em] text-slate-500">
              <th className="w-9 px-1.5 py-2 text-center">Pos</th>
              <th className="w-[112px] px-1.5 py-2 text-left">Time</th>
              <th className="px-1.5 py-2 text-center">PTS</th>
              <th className="px-1.5 py-2 text-center">J</th>
              <th className="px-1.5 py-2 text-center">V</th>
              <th className="px-1.5 py-2 text-center">E</th>
              <th className="px-1.5 py-2 text-center">D</th>
              <th className="px-1.5 py-2 text-center">SG</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => {
              const podium = index < 3;
              const userId = userIdByTeam[row.teamId];
              const rank = userId ? rankByUser.get(userId) : undefined;
              return (
                <tr key={row.teamId} className="border-b border-slate-100 bg-white transition hover:bg-blue-50/30 last:border-b-0">
                  <td className="px-1.5 py-2 text-center"><span className={`inline-grid h-7 w-7 place-items-center rounded-lg border text-xs font-black ${podium ? podiumStyles[index] : 'border-slate-200 bg-slate-50 text-slate-600 shadow-sm'}`}>{index + 1}</span></td>
                  <td className="px-1.5 py-2">
                    {userId ? (
                      <Link to={`/profile/${encodeURIComponent(userId)}`} className="group flex min-w-0 items-center gap-1.5 rounded-lg" aria-label={`Abrir perfil de ${row.playerName}`}>
                        <TeamLogo name={row.team} logoUrl={row.logoUrl} podium={podium} />
                        <span className="min-w-0">
                          <span className="block max-w-[80px] truncate text-[11px] font-black text-slate-900">{row.team}</span>
                          <span className="block max-w-[80px] truncate text-[8px] font-bold uppercase text-slate-400">{row.playerName}</span>
                        </span>
                        {rank && <span className="hidden"><RankEmblem rank={rank} compact /></span>}
                        <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />
                      </Link>
                    ) : (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <TeamLogo name={row.team} logoUrl={row.logoUrl} podium={podium} />
                        <span className="block max-w-[80px] truncate text-[11px] font-black text-slate-900">{row.team}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-1.5 py-2 text-center text-xs font-black text-[#073B8C]">{row.points}</td>
                  <td className="px-1.5 py-2 text-center font-extrabold text-slate-600">{row.played}</td>
                  <td className="px-1.5 py-2 text-center font-extrabold text-emerald-700">{row.wins}</td>
                  <td className="px-1.5 py-2 text-center font-extrabold text-slate-600">{row.draws}</td>
                  <td className="px-1.5 py-2 text-center font-extrabold text-rose-600">{row.losses}</td>
                  <td className={`px-1.5 py-2 text-center font-black ${row.goalDifference > 0 ? 'text-emerald-700' : row.goalDifference < 0 ? 'text-rose-600' : 'text-slate-600'}`}>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {standings.length === 0 && <div className="grid min-h-40 place-items-center px-6 text-center"><div><Shield className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">A tabela aparece assim que os resultados forem finalizados.</p></div></div>}
      <p className="border-t border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] font-semibold text-slate-500 sm:px-5 sm:py-3">PTS, J, V, E, D e SG ficam sempre disponíveis. Arraste horizontalmente se necessário.</p>
    </div>
  );
}

function TeamLogo({ name, logoUrl, podium }: { name: string; logoUrl?: string; podium: boolean }) {
  const frame = `h-7 w-7 shrink-0 rounded-lg border ${podium ? 'border-blue-200' : 'border-slate-200'}`;
  if (logoUrl) return <img src={logoUrl} alt="" className={`${frame} bg-white object-cover shadow-sm`} loading="lazy" referrerPolicy="no-referrer" />;
  return <div className={`grid ${frame} place-items-center bg-slate-50 text-[8px] font-black text-slate-600 ${podium ? 'bg-blue-50 text-[#073B8C]' : ''}`}>{name.slice(0, 2).toUpperCase()}</div>;
}
