import { useQuery } from '@tanstack/react-query';
import { Plus, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo';
import { GlobalLoader } from '../../components/brand/GlobalLoader';
import { CompetitionCard } from '../../components/competition/CompetitionCard';
import { BottomNavigation } from '../../components/navigation/BottomNavigation';
import { getMyCompetitions } from '../../lib/api';
import { PRIMARY_NAV_STALE_TIME } from '../../lib/query-cache';

export function CompetitionsPage() {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['competitions', 'mine'],
    queryFn: getMyCompetitions,
    staleTime: PRIMARY_NAV_STALE_TIME,
  });

  return (
    <div className="min-h-dvh bg-white pb-28 text-black">
      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3">
          <Link to="/dashboard" className="shrink-0 rounded-2xl px-1 py-1" aria-label="Chavea - início"><Logo size="sm" /></Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Chavea</p>
            <h1 className="truncate text-2xl font-black tracking-tight">Minhas Copas 🏆</h1>
          </div>
          <Link to="/competitions/new" aria-label="Criar campeonato" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#073B8C] text-white shadow-md"><Plus className="h-5 w-5" /></Link>
        </header>

        <section className="mt-5 space-y-3">
          {isLoading && <GlobalLoader mode="section" label="Carregando suas Copas…" />}
          {isError && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-[#E31B23]">Não foi possível carregar seus campeonatos.</div>}
          {!isLoading && !isError && data.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><Trophy /></span>
              <h2 className="mt-4 text-lg font-black">Sua primeira copa começa aqui</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">Crie uma competição e mande o link no grupo para chamar a galera.</p>
              <Link to="/competitions/new" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#073B8C] px-5 font-black text-white"><Plus className="h-4 w-4" />Criar campeonato</Link>
            </div>
          )}
          {data.map((competition) => <CompetitionCard key={competition.id} competition={competition} />)}
        </section>
      </main>
      <BottomNavigation />
    </div>
  );
}
