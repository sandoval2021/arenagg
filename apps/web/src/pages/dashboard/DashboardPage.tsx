import { useQuery } from '@tanstack/react-query';
import { Bell, Plus, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CompetitionCard } from '../../components/competition/CompetitionCard';
import { BottomNavigation } from '../../components/navigation/BottomNavigation';
import { getMyCompetitions } from '../../lib/api';

export function DashboardPage() {
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['competitions', 'mine'], queryFn: getMyCompetitions });

  return (
    <div className="min-h-dvh bg-white pb-24 text-black">
      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between py-3">
          <div><p className="text-sm font-semibold text-slate-500">Bem-vindo de volta</p><h1 className="text-2xl font-black tracking-tight">Olá, Sandoval</h1></div>
          <button aria-label="Notificações" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm"><Bell className="h-5 w-5" /></button>
        </header>

        <section className="mt-5 rounded-2xl bg-[#073B8C] p-5 text-white shadow-md">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-100">ArenaGG</p><h2 className="mt-1 text-xl font-black">Sua arena. Suas regras.</h2></div><Trophy className="h-12 w-12 opacity-90 drop-shadow" /></div>
          <p className="mt-2 max-w-xs text-sm text-blue-100">Organize copas, acompanhe jogos e veja a classificação em tempo real.</p>
        </section>

        <section className="mt-7">
          <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#073B8C]">Em andamento</p><h2 className="text-xl font-black">Meus campeonatos</h2></div></div>
          <div className="space-y-3">
            {isLoading && [1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}
            {isError && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-[#E31B23]">Não foi possível carregar seus campeonatos.</div>}
            {!isLoading && !isError && data.map((competition) => <CompetitionCard key={competition.id} competition={competition} />)}
          </div>
        </section>

        <Link to="/competitions/new" className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#073B8C] px-5 text-sm font-extrabold text-white shadow-md transition active:scale-[.98]"><Plus className="h-5 w-5" />Criar Campeonato</Link>
      </main>
      <BottomNavigation />
    </div>
  );
}
