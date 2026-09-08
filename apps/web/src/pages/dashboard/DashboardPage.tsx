import { useQuery } from '@tanstack/react-query';
import { Bell, Plus, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CompetitionCard } from '../../components/competition/CompetitionCard';
import { BottomNavigation } from '../../components/navigation/BottomNavigation';
import { getMyCompetitions } from '../../lib/api';

export function DashboardPage() {
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['competitions', 'mine'], queryFn: getMyCompetitions });

  return (
    <div className="min-h-dvh bg-white pb-28 text-black">
      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between py-3">
          <div><p className="text-sm font-semibold text-zinc-500">Bem-vindo de volta</p><h1 className="text-2xl font-black tracking-tight">Olá, Sandoval</h1></div>
          <button aria-label="Notificações" className="grid h-11 w-11 place-items-center rounded-2xl border border-black/5 bg-white shadow-sm"><Bell className="h-5 w-5" /></button>
        </header>

        <section className="relative mt-5 overflow-hidden rounded-2xl bg-[#073B8C] p-5 text-white shadow-md">
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-xl" />
          <div className="relative flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-blue-100">Chavea</p><h2 className="mt-1 text-xl font-black">Sua competição. Sua chave.</h2></div><div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 shadow-inner backdrop-blur"><Trophy className="h-10 w-10 drop-shadow" /></div></div>
          <p className="relative mt-3 max-w-xs text-sm font-medium text-blue-100">Organize copas, valide placares e acompanhe a classificação em tempo real.</p>
        </section>

        <section className="mt-7">
          <div className="mb-3"><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Em andamento</p><h2 className="text-xl font-black">Meus campeonatos</h2></div>
          <div className="space-y-3">
            {isLoading && [1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-zinc-100" />)}
            {isError && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-[#E31B23]">Não foi possível carregar seus campeonatos.</div>}
            {!isLoading && !isError && data.map((competition) => <CompetitionCard key={competition.id} competition={competition} />)}
          </div>
        </section>

        <Link to="/competitions/new" className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#073B8C] px-5 text-sm font-black text-white shadow-md transition active:scale-[.98]"><Plus className="h-5 w-5" />Criar Campeonato</Link>
      </main>
      <BottomNavigation />
    </div>
  );
}
