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
      <div className="w-full pb-1">
        <table className="w-full table-fixed border-collapse text-[10px] text-slate-700 sm:text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase tracking-[.1em] text-slate-500 sm:text-[10px] sm:tracking-[.16em]">
              <th className="w-6 px-1 py-1 text-center text-[10px] sm:w-12 sm:px-2 sm:py-2">#</th>
              <th className="w-[92px] px-1 py-1 text-left text-[10px] sm:w-auto sm:px-2 sm:py-2">Time</th>
              {['PTS', 'J', 'V', 'E', 'D', 'SG'].map((column) => <th key={column} className="w-7 px-1 py-1 text-center text-[10px] sm:w-10 sm:px-2 sm:py-2">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => {
              const podium = index < 3;
              const userId = userIdByTeam[row.teamId];
              const rank = userId ? rankByUser.get(userId) : undefined;
              const identity = <><div className="relative shrink-0"><TeamLogo name={row.team} logoUrl={row.user?.avatarUrl ?? row.logoUrl} podium={podium} />{rank && <span className="absolute -bottom-2 -right-2"><RankEmblem rank={rank} compact /></span>}</div><div className="min-w-0 flex-1"><p className="max-w-[70px] truncate text-[10px] font-black text-slate-900 sm:max-w-none sm:text-sm">{row.team}</p><p className="mt-0.5 max-w-[70px] truncate text-[8px] font-bold uppercase tracking-wide text-slate-400 sm:max-w-none sm:text-[10px]">{row.playerName}{rank ? ` · ${rank.label}` : ''}</p></div>{userId && <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-[#073B8C] sm:block" />}</>;
              return (
                <tr key={row.teamId} className="border-b border-slate-100 bg-white transition hover:bg-blue-50/30 last:border-b-0">
                  <td className="w-6 px-1 py-1 text-center text-[10px] sm:w-12 sm:px-2 sm:py-2"><span className={`inline-grid h-6 w-6 place-items-center rounded-lg border text-[10px] font-black sm:h-9 sm:w-9 sm:rounded-xl sm:text-sm ${podium ? podiumStyles[index] : 'border-slate-200 bg-slate-50 text-slate-600 shadow-sm'}`}>{index + 1}</span></td>
                  <td className="w-[92px] px-1 py-1 sm:w-auto sm:px-2 sm:py-2">{userId ? <Link to={`/profile/${encodeURIComponent(userId)}`} className="group flex min-h-9 min-w-0 items-center gap-1.5 rounded-xl transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:min-h-12 sm:gap-3 sm:px-1 sm:py-1" aria-label={`Abrir perfil de ${row.playerName}`}>{identity}</Link> : <div className="flex min-h-9 min-w-0 items-center gap-1.5 sm:min-h-12 sm:gap-3 sm:px-1 sm:py-1">{identity}</div>}</td>
                  <td className="w-7 px-1 py-1 text-center text-[10px] font-black text-[#073B8C] sm:w-10 sm:px-2 sm:py-2 sm:text-sm">{row.points}</td>
                  <td className="w-7 px-1 py-1 text-center text-[10px] font-extrabold text-slate-600 sm:w-10 sm:px-2 sm:py-2">{row.played}</td>
                  <td className="w-7 px-1 py-1 text-center text-[10px] font-extrabold text-emerald-700 sm:w-10 sm:px-2 sm:py-2">{row.wins}</td>
                  <td className="w-7 px-1 py-1 text-center text-[10px] font-extrabold text-slate-600 sm:w-10 sm:px-2 sm:py-2">{row.draws}</td>
                  <td className="w-7 px-1 py-1 text-center text-[10px] font-extrabold text-rose-600 sm:w-10 sm:px-2 sm:py-2">{row.losses}</td>
                  <td className={`w-7 px-1 py-1 text-center text-[10px] font-black sm:w-10 sm:px-2 sm:py-2 ${row.goalDifference > 0 ? 'text-emerald-700' : row.goalDifference < 0 ? 'text-rose-600' : 'text-slate-600'}`}>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {standings.length === 0 && <div className="grid min-h-40 place-items-center px-6 text-center"><div><Shield className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">A tabela aparece assim que os resultados forem finalizados.</p></div></div>}
      <p className="border-t border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] font-semibold text-slate-500 sm:px-5 sm:py-3">PTS, J, V, E, D e SG aparecem juntos no celular. Toque no jogador para abrir o perfil público.</p>
    </div>
  );
}

function TeamLogo({ name, logoUrl, podium }: { name: string; logoUrl?: string; podium: boolean }) {
  const frame = `h-7 w-7 shrink-0 rounded-lg border sm:h-10 sm:w-10 sm:rounded-xl ${podium ? 'border-blue-200' : 'border-slate-200'}`;
  if (logoUrl) return <img src={logoUrl} alt="" className={`${frame} bg-white object-cover shadow-sm`} loading="lazy" referrerPolicy="no-referrer" />;
  return <div className={`grid ${frame} place-items-center bg-slate-50 text-[8px] font-black text-slate-600 ${podium ? 'bg-blue-50 text-[#073B8C]' : ''}`}>{name.slice(0, 2).toUpperCase()}</div>;
}
