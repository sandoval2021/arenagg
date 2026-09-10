import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, Shield } from 'lucide-react';
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
    <div className="w-full overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-md shadow-slate-200/60 ring-1 ring-slate-100 sm:rounded-[2rem]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-white via-blue-50/60 to-white px-3 py-2.5 sm:px-5 sm:py-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-[#073B8C] sm:text-[10px]">Chavea Ranking</p>
          <h3 className="mt-0.5 text-base font-black text-slate-900 sm:mt-1 sm:text-lg">Classificação</h3>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600 shadow-sm sm:h-11 sm:w-11 sm:rounded-2xl"><Crown className="h-4 w-4 sm:h-5 sm:w-5" /></span>
      </div>

      <table className="w-full table-fixed border-collapse text-[9px] leading-tight text-slate-700 sm:text-xs">
        <colgroup>
          <col className="w-[7%]" />
          <col className="w-[37%]" />
          {['PTS', 'J', 'V', 'E', 'D', 'SG'].map((column) => <col key={column} className="w-[9.333%]" />)}
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[8px] font-black uppercase tracking-tight text-slate-500 sm:text-[10px] sm:tracking-[.08em]">
            <th className="px-0.5 py-1.5 text-center sm:px-2 sm:py-2">#</th>
            <th className="px-1 py-1.5 text-left sm:px-2 sm:py-2">Time</th>
            {['PTS', 'J', 'V', 'E', 'D', 'SG'].map((column) => <th key={column} className="px-0 py-1.5 text-center sm:px-1 sm:py-2">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {standings.map((row, index) => {
            const podium = index < 3;
            const userId = userIdByTeam[row.teamId];
            const rank = userId ? rankByUser.get(userId) : undefined;
            const effectiveLogo = row.logoUrl ?? row.user?.avatarUrl ?? undefined;
            const identity = (
              <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                <div className="relative shrink-0">
                  <TeamLogo name={row.team} logoUrl={effectiveLogo} podium={podium} />
                  {rank && <span className="absolute -bottom-1 -right-1 scale-75 sm:scale-90"><RankEmblem rank={rank} compact /></span>}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block max-w-[80px] truncate text-[9px] font-black text-slate-900 sm:max-w-none sm:text-xs">{row.team}</span>
                  <span className="block max-w-[80px] truncate text-[7px] font-bold text-slate-400 sm:max-w-none sm:text-[9px]">{row.playerName}</span>
                </span>
              </div>
            );

            return (
              <tr key={row.teamId} className="border-b border-slate-100 bg-white transition hover:bg-blue-50/30 last:border-b-0">
                <td className="px-0.5 py-1.5 text-center sm:px-2 sm:py-2">
                  <span className={`inline-grid h-5 w-5 place-items-center rounded-md border text-[8px] font-black sm:h-7 sm:w-7 sm:rounded-lg sm:text-xs ${podium ? podiumStyles[index] : 'border-slate-200 bg-slate-50 text-slate-600 shadow-sm'}`}>{index + 1}</span>
                </td>
                <td className="min-w-0 px-1 py-1.5 sm:px-2 sm:py-2">
                  {userId ? <Link to={`/profile/${encodeURIComponent(userId)}`} className="block min-w-0" aria-label={`Abrir perfil de ${row.playerName}`}>{identity}</Link> : identity}
                </td>
                <td className="px-0 py-1.5 text-center text-[10px] font-black text-[#073B8C] sm:px-1 sm:py-2 sm:text-xs">{row.points}</td>
                <td className="px-0 py-1.5 text-center font-extrabold text-slate-600 sm:px-1 sm:py-2">{row.played}</td>
                <td className="px-0 py-1.5 text-center font-extrabold text-emerald-700 sm:px-1 sm:py-2">{row.wins}</td>
                <td className="px-0 py-1.5 text-center font-extrabold text-slate-600 sm:px-1 sm:py-2">{row.draws}</td>
                <td className="px-0 py-1.5 text-center font-extrabold text-rose-600 sm:px-1 sm:py-2">{row.losses}</td>
                <td className={`px-0 py-1.5 text-center font-black sm:px-1 sm:py-2 ${row.goalDifference > 0 ? 'text-emerald-700' : row.goalDifference < 0 ? 'text-rose-600' : 'text-slate-600'}`}>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {standings.length === 0 && <div className="grid min-h-40 place-items-center px-6 text-center"><div><Shield className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">A tabela aparece assim que os resultados forem finalizados.</p></div></div>}
      <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[9px] font-semibold text-slate-500 sm:px-5 sm:py-3 sm:text-[10px]">PTS, J, V, E, D e SG ficam visíveis juntos também no celular.</p>
    </div>
  );
}

function TeamLogo({ name, logoUrl, podium }: { name: string; logoUrl?: string; podium: boolean }) {
  const frame = `h-6 w-6 shrink-0 rounded-md border sm:h-8 sm:w-8 sm:rounded-lg ${podium ? 'border-blue-200' : 'border-slate-200'}`;
  if (logoUrl) return <img src={logoUrl} alt="" className={`${frame} bg-white object-cover shadow-sm`} loading="lazy" referrerPolicy="no-referrer" />;
  return <div className={`grid ${frame} place-items-center bg-slate-50 text-[7px] font-black text-slate-600 ${podium ? 'bg-blue-50 text-[#073B8C]' : ''}`}>{name.slice(0, 2).toUpperCase()}</div>;
}
