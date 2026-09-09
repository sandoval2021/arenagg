import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Info, Trophy } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { GlobalLoader } from '../../components/brand/GlobalLoader';
import { StandingsTable } from '../../components/standings/StandingsTable';
import { getStandings } from '../../lib/api';

export function StandingsPage() {
  const { competitionId = '' } = useParams();
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['standings', competitionId], queryFn: () => getStandings(competitionId), enabled: Boolean(competitionId) });

  return (
    <div className="min-h-dvh bg-white text-black">
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3"><Link to={`/competitions/${competitionId}`} aria-label="Voltar" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 shadow-sm"><ArrowLeft className="h-5 w-5" /></Link><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-[#073B8C]">Copa Champions GG</p><h1 className="truncate text-xl font-black">Classificação</h1></div></header>
        <section className="mt-5 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#073B8C] text-white"><Trophy className="h-5 w-5" /></span><div><p className="text-sm font-extrabold">Tabela atualizada</p><p className="text-xs font-medium text-slate-600">PTS → SG → GP → Vitórias</p></div></section>
        <section className="mt-5">
          {isLoading && <GlobalLoader mode="section" label="Carregando classificação…" />}
          {isError && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-[#E31B23]">Não foi possível carregar a classificação.</div>}
          {!isLoading && !isError && <StandingsTable standings={data} />}
        </section>
        <div className="mt-4 flex gap-2 rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-500"><Info className="h-4 w-4 shrink-0" /><p>A classificação é calculada pelo servidor a partir das partidas finalizadas. A interface apenas apresenta o resultado.</p></div>
      </main>
    </div>
  );
}
