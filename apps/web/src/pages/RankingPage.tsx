import { useQuery } from '@tanstack/react-query';
import { Crown, Medal, Shield, Trophy, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { ConsoleBadges } from '../components/profile/ConsoleBadges';
import { getGlobalRanking, type RankingEntry } from '../lib/ranking-api';

export function RankingPage() {
  const ranking = useQuery({
    queryKey: ['global-ranking'],
    queryFn: getGlobalRanking,
    staleTime: 30_000,
  });

  const entries = ranking.data?.entries ?? [];
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="min-h-dvh bg-white pb-28 text-slate-950">
      <main className="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="py-3">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-[#073B8C]">Chavea competitivo</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Ranking Global</h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">Top 100 jogadores por MMR.</p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 shadow-lg shadow-amber-100"><Crown className="h-6 w-6" /></span>
          </div>
        </header>

        {ranking.isLoading && <GlobalLoader mode="section" label="Calculando o ranking…" />}
        {ranking.isError && <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">Não foi possível carregar o ranking agora.</div>}

        {!ranking.isLoading && !ranking.isError && entries.length === 0 && (
          <div className="mt-5 rounded-[2rem] border border-dashed border-blue-200 bg-blue-50/50 p-6 text-center">
            <Trophy className="mx-auto h-7 w-7 text-[#073B8C]" />
            <h2 className="mt-3 text-lg font-black">O ranking ainda está aberto.</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Finalize partidas para começar a disputar posições.</p>
          </div>
        )}

        {podium.length > 0 && (
          <section className="mt-5 grid gap-3 sm:grid-cols-3">
            {podium.map((entry) => <PodiumCard key={entry.userId} entry={entry} />)}
          </section>
        )}

        {rest.length > 0 && (
          <section className="mt-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-4 sm:px-5"><p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Classificação completa</p><h2 className="mt-1 text-lg font-black">Top 100 Global</h2></div>
            <div className="divide-y divide-slate-100">
              {rest.map((entry) => <RankingRow key={entry.userId} entry={entry} />)}
            </div>
          </section>
        )}
      </main>
      <BottomNavigation />
    </div>
  );
}

function PodiumCard({ entry }: { entry: RankingEntry }) {
  const medalTone = entry.rank === 1
    ? 'from-amber-300 to-orange-500 text-slate-950'
    : entry.rank === 2
      ? 'from-slate-200 to-slate-400 text-slate-900'
      : 'from-orange-200 to-amber-700 text-white';

  return (
    <Link to={`/profile/${encodeURIComponent(entry.userId)}`} className={`relative overflow-hidden rounded-[2rem] border p-4 shadow-md transition active:scale-[.99] ${entry.isCurrentUser ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
      <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-amber-200/30 blur-3xl" />
      <div className="relative flex items-center justify-between gap-2">
        <span className={`grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br font-black shadow-sm ${medalTone}`}>#{entry.rank}</span>
        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-black text-white">{entry.mmr} MMR</span>
      </div>
      <div className="relative mt-4 flex items-center gap-3 sm:block">
        <Avatar entry={entry} size="lg" />
        <div className="min-w-0 flex-1 sm:mt-3">
          <h2 className="truncate text-base font-black">{entry.name}</h2>
          <div className="mt-1"><ConsoleBadges consoles={entry.consoles} /></div>
          <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{entry.totalWins} vitórias · {entry.championshipsWon} títulos</p>
        </div>
      </div>
    </Link>
  );
}

function RankingRow({ entry }: { entry: RankingEntry }) {
  return (
    <Link to={`/profile/${encodeURIComponent(entry.userId)}`} className={`flex min-h-20 items-center gap-3 px-4 py-3 transition hover:bg-blue-50/40 sm:px-5 ${entry.isCurrentUser ? 'bg-blue-50/70' : ''}`}>
      <span className="w-8 shrink-0 text-center text-sm font-black text-slate-400">#{entry.rank}</span>
      <Avatar entry={entry} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-black">{entry.name}</h3>{entry.isCurrentUser && <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black uppercase text-[#073B8C]">Você</span>}</div>
        <div className="mt-1"><ConsoleBadges consoles={entry.consoles} /></div>
      </div>
      <div className="shrink-0 text-right"><p className="text-base font-black text-[#073B8C]">{entry.mmr}</p><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">MMR</p></div>
    </Link>
  );
}

function Avatar({ entry, size }: { entry: RankingEntry; size: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-11 w-11 rounded-xl';
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden border border-slate-200 bg-slate-50 ${box}`}>
      {entry.crest?.logoUrl ? <img src={entry.crest.logoUrl} alt="" className="h-full w-full object-contain p-1" loading="lazy" decoding="async" /> : entry.avatarUrl ? <img src={entry.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <UserRound className="h-5 w-5 text-[#073B8C]" />}
      {entry.crest && !entry.crest.logoUrl && <Shield className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 text-slate-400" />}
    </span>
  );
}
