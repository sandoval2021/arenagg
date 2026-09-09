import { useQuery } from '@tanstack/react-query';
import { Equal, Flame, Shield, Swords, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GlobalLoader } from '../brand/GlobalLoader';
import { getHeadToHead } from '../../lib/phase-one-api';

export function HeadToHeadCard({ userId, opponentName }: { userId: string; opponentName: string }) {
  const query = useQuery({
    queryKey: ['head-to-head', userId],
    queryFn: () => getHeadToHead(userId),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  return (
    <section className="mt-5 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <header className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-r from-slate-950 via-[#073B8C] to-blue-700 px-4 py-5 text-white sm:px-5">
        <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Swords className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-100">Resenha entre vocês</p>
            <h3 className="truncate text-lg font-black">Histórico de Confrontos</h3>
          </div>
          <Flame className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </header>

      {query.isLoading && <GlobalLoader mode="section" label="Buscando confrontos…" />}

      {query.isError && (
        <div className="p-4 text-center text-sm font-bold text-slate-500">Não foi possível carregar o retrospecto agora.</div>
      )}

      {query.data && (
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <ScoreSide label="Você" value={query.data.viewerWins} tone="blue" />
            <div className="flex flex-col items-center gap-1 px-1">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200"><Equal className="h-4 w-4" /></span>
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{query.data.draws} empates</span>
            </div>
            <ScoreSide label={opponentName} value={query.data.opponentWins} tone="amber" />
          </div>

          {query.data.totalMatches === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-4 text-center">
              <Swords className="mx-auto h-5 w-5 text-[#073B8C]" />
              <p className="mt-2 text-sm font-black text-slate-900">Ainda não rolou o tira-teima.</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Quando vocês se enfrentarem em uma Copa, o placar direto aparece aqui.</p>
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Últimos duelos</p>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">{query.data.totalMatches} jogos</span>
              </div>
              <div className="mt-2 space-y-2">
                {query.data.recentMatches.map((match) => (
                  <Link key={match.id} to={`/competitions/${encodeURIComponent(match.competitionId)}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${match.result === 'WIN' ? 'bg-emerald-50 text-emerald-700' : match.result === 'LOSS' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                      {match.result === 'DRAW' ? <Shield className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black text-slate-900">{match.competitionName}</p>
                      <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">{match.viewerTeam?.name ?? 'Seu time'} × {match.opponentTeam?.name ?? opponentName}</p>
                    </div>
                    <span className="shrink-0 rounded-xl bg-slate-950 px-2.5 py-1.5 text-sm font-black text-white">{match.viewerScore}×{match.opponentScore}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ScoreSide({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'amber' }) {
  const toneClass = tone === 'blue' ? 'from-blue-600 to-cyan-500 text-white' : 'from-amber-300 to-orange-500 text-slate-950';
  return (
    <div className="min-w-0 text-center">
      <div className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br text-3xl font-black shadow-md ${toneClass}`}>{value}</div>
      <p className="mx-auto mt-2 max-w-28 truncate text-[10px] font-black uppercase tracking-wider text-slate-600">{label}</p>
      <p className="text-[9px] font-bold text-slate-400">vitórias</p>
    </div>
  );
}
