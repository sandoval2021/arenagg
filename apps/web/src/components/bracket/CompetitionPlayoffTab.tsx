import { useQuery } from '@tanstack/react-query';
import { GitBranch, Shield, Trophy } from 'lucide-react';
import { getCompetitionPlayoffs, type PlayoffMatch } from '../../lib/host-actions-api';
import { GlobalLoader } from '../brand/GlobalLoader';

export function CompetitionPlayoffTab({ competitionId }: { competitionId: string }) {
  const playoffs = useQuery({
    queryKey: ['playoffs', competitionId],
    queryFn: () => getCompetitionPlayoffs(competitionId),
    enabled: Boolean(competitionId),
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
  });

  if (playoffs.data === undefined && playoffs.isLoading) {
    return <GlobalLoader mode="section" label="Carregando mata-mata…" />;
  }
  if (playoffs.data === undefined && playoffs.isError) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">Reconectando ao mata-mata…</div>;
  }
  if (!playoffs.data?.exists || !playoffs.data.stage) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><GitBranch className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-sm font-black text-slate-800">Fase Final ainda não criada</p><p className="mt-1 text-xs font-medium text-slate-500">Quando o Host iniciar os playoffs, a chave aparece aqui automaticamente.</p></div>;
  }

  const stage = playoffs.data.stage;
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-amber-50 via-white to-blue-50 px-3 py-3 sm:px-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-600"><Trophy className="h-5 w-5" /></span>
        <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#073B8C]">Fase decisiva</p><h2 className="text-base font-black text-slate-950">{stage.name}</h2></div>
      </header>

      <div className="w-full overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch] touch-pan-x">
        <div className="flex min-w-max items-start gap-3 p-3 sm:gap-4 sm:p-4">
          {stage.rounds.map((round) => (
            <section key={round.id} className="w-[220px] shrink-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-[9px] font-black uppercase tracking-[.16em] text-slate-400">Fase {round.number}</p><h3 className="text-sm font-black text-slate-900">{round.name ?? `Rodada ${round.number}`}</h3></div><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-slate-500 shadow-sm">{round.matches.length}</span></div>
              <div className="space-y-2">
                {round.matches.map((match) => <PlayoffMatchCard key={match.id} match={match} showLeg={round.matches.filter((item) => item.bracketPosition === match.bracketPosition).length > 1} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlayoffMatchCard({ match, showLeg }: { match: PlayoffMatch; showLeg: boolean }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">{showLeg && <p className="mb-2 text-[9px] font-black uppercase tracking-[.14em] text-[#073B8C]">Jogo {match.leg} · {match.leg === 1 ? 'Ida' : 'Volta'}</p>}<TeamRow name={match.homeTeam?.name ?? 'A definir'} logoUrl={match.homeTeam?.logoUrl} score={match.homeScore} /><div className="my-2 h-px bg-slate-100" /><TeamRow name={match.awayTeam?.name ?? 'A definir'} logoUrl={match.awayTeam?.logoUrl} score={match.awayScore} /><p className="mt-2 border-t border-slate-100 pt-2 text-[9px] font-black uppercase tracking-[.12em] text-slate-400">{statusLabel(match.status)}</p></article>;
}

function TeamRow({ name, logoUrl, score }: { name: string; logoUrl?: string | null; score: number | null }) {
  return <div className="flex items-center gap-2">{logoUrl ? <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-lg border border-slate-200 object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400"><Shield className="h-3.5 w-3.5" /></span>}<span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{name}</span><span className="min-w-6 rounded-md bg-slate-50 px-1.5 py-1 text-center text-xs font-black text-slate-800">{score ?? '–'}</span></div>;
}

function statusLabel(status: string) {
  if (status === 'FINISHED') return 'Finalizada';
  if (status === 'AWAITING_APPROVAL') return 'Aguardando aprovação';
  if (status === 'DISPUTED') return 'Em disputa';
  if (status === 'CANCELED') return 'Cancelada';
  return 'A jogar';
}
