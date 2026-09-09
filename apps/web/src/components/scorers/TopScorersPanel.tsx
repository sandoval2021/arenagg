import { Medal, Shield, Target, Trophy } from 'lucide-react';
import type { TopScorer } from '../../lib/api';

export function TopScorersPanel({ scorers, loading, error }: { scorers: TopScorer[]; loading: boolean; error: boolean }) {
  if (loading) {
    return <div className="h-80 animate-pulse rounded-[2rem] border border-slate-200 bg-slate-50" />;
  }

  if (error) {
    return <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">Não foi possível carregar a artilharia.</div>;
  }

  if (scorers.length === 0) {
    return (
      <section className="rounded-[2rem] border border-dashed border-amber-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-8 text-center shadow-sm">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-amber-700 shadow-sm"><Target className="h-7 w-7" /></span>
        <h3 className="mt-4 text-lg font-black text-slate-900">A chuteira de ouro ainda está sem dono.</h3>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">Registre os goleadores ao lançar os próximos placares e o ranking aparece aqui automaticamente.</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-md shadow-slate-200/50">
      <header className="relative overflow-hidden border-b border-amber-100 bg-gradient-to-r from-amber-50 via-white to-yellow-50 px-5 py-5">
        <div className="absolute -right-10 -top-14 h-36 w-36 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-yellow-300 to-amber-500 text-white shadow-lg shadow-amber-200"><Trophy className="h-6 w-6" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-700">Chuteira de Ouro</p>
            <h2 className="text-xl font-black text-slate-950">Artilharia da Copa</h2>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-400 sm:px-5">
        <span>Pos.</span>
        <span>Goleador / Time</span>
        <span className="text-right">Gols</span>
      </div>

      <div className="divide-y divide-slate-100">
        {scorers.map((scorer) => (
          <ScorerRow key={`${scorer.teamId}:${scorer.playerName}:${scorer.position}`} scorer={scorer} />
        ))}
      </div>
    </section>
  );
}

function ScorerRow({ scorer }: { scorer: TopScorer }) {
  const first = scorer.position === 1;
  const podium = scorer.position <= 3;

  return (
    <article className={`relative flex items-center gap-3 px-4 py-4 sm:px-5 ${first ? 'bg-gradient-to-r from-amber-50/90 via-white to-yellow-50/70' : 'bg-white'}`}>
      {first && <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-yellow-300 to-amber-500" />}

      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black ${first ? 'bg-gradient-to-br from-yellow-300 to-amber-500 text-white shadow-md shadow-amber-200' : podium ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'}`} aria-label={`${scorer.position}º lugar`}>
        {first ? <Medal className="h-5 w-5" /> : scorer.position}
      </span>

      {scorer.teamLogoUrl ? (
        <img src={scorer.teamLogoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-white object-cover shadow-sm" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400"><Shield className="h-5 w-5" /></span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className={`truncate text-sm text-slate-950 ${first ? 'font-black' : 'font-extrabold'}`}>{scorer.playerName}</h3>
          {first && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800">Líder</span>}
        </div>
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{scorer.teamName}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className={`text-2xl font-black leading-none ${first ? 'text-amber-600' : 'text-[#073B8C]'}`}>{scorer.goals}</p>
        <p className="mt-1 text-[9px] font-black uppercase tracking-[.14em] text-slate-400">gols</p>
      </div>
    </article>
  );
}
