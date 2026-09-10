import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, GitBranch, LoaderCircle, Shield, Sparkles, Table2, Trophy } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { getCompetition } from '../../lib/api';
import { generateGroupStageKnockout, getGroupStageSnapshot } from '../../lib/phase-six-api';

export function GroupStagePanel() {
  const { competitionId = '' } = useParams();
  const queryClient = useQueryClient();
  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getCompetition(competitionId),
    enabled: Boolean(competitionId),
  });
  const isGroupStage = competition.data?.type === 'GROUPS_KNOCKOUT';

  const snapshot = useQuery({
    queryKey: ['group-stage', competitionId],
    queryFn: () => getGroupStageSnapshot(competitionId),
    enabled: Boolean(competitionId) && isGroupStage,
    staleTime: 5_000,
    refetchInterval: (query) => query.state.data?.knockoutGenerated ? false : 10_000,
  });

  const generate = useMutation({
    mutationFn: () => generateGroupStageKnockout(competitionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group-stage', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competition-feed', competitionId] }),
      ]);
    },
  });

  if (!isGroupStage) return null;
  const data = snapshot.data;

  return (
    <section className="mx-auto mt-5 max-w-5xl px-4 sm:px-6">
      <div className="overflow-hidden rounded-[2rem] border border-blue-200 bg-white shadow-lg shadow-blue-100/40">
        <header className="bg-gradient-to-r from-[#073B8C] via-blue-700 to-cyan-600 p-3 text-white sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20"><Table2 className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-100">Champions Style</p><h2 className="mt-1 text-xl font-black">Tabela de Classificação</h2><p className="mt-1 text-xs font-semibold text-blue-100">Os 2 melhores de cada grupo avançam para o mata-mata.</p></div>
            {data && <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-black ring-1 ring-white/20">{data.finishedMatches}/{data.totalMatches}</span>}
          </div>
        </header>

        {snapshot.isLoading && <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-bold text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Carregando grupos…</div>}
        {snapshot.isError && <div className="p-5 text-center text-sm font-bold text-rose-600">Não foi possível carregar a classificação agora.</div>}

        {data && data.groups.length === 0 && (
          <div className="p-6 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><Shield className="h-6 w-6" /></span><h3 className="mt-3 text-base font-black text-slate-900">Os grupos serão sorteados ao iniciar</h3><p className="mt-1 text-xs font-semibold text-slate-500">Depois do sorteio, a tabela aparece aqui automaticamente.</p></div>
        )}

        {data && data.groups.length > 0 && (
          <div className="p-3 sm:p-5">
            <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:-mx-5 sm:px-5">
              <div className="flex w-max snap-x snap-mandatory gap-3 pr-4">
                {data.groups.map((group) => (
                  <article key={group.id} className="w-[min(92vw,420px)] shrink-0 snap-center overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2.5 sm:px-4 sm:py-3"><div><p className="text-[9px] font-black uppercase tracking-[.16em] text-[#073B8C]">Classificação</p><h3 className="text-base font-black text-slate-950">{group.name}</h3></div><Trophy className="h-5 w-5 text-amber-500" /></div>
                    <div
                      className="w-full overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch]"
                      style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
                      role="region"
                      aria-label={`${group.name}: classificação com rolagem horizontal`}
                      tabIndex={0}
                    >
                      <table className="w-full min-w-[520px] border-collapse text-[10px] text-slate-700">
                        <thead>
                          <tr className="border-b border-slate-100 bg-white text-[8px] font-black uppercase tracking-wide text-slate-400">
                            <th className="w-8 px-2 py-1.5 text-center">#</th>
                            <th className="min-w-40 px-2 py-1.5 text-left">Time</th>
                            <th className="px-2 py-1.5 text-center">PTS</th>
                            <th className="px-2 py-1.5 text-center">J</th>
                            <th className="px-2 py-1.5 text-center">V</th>
                            <th className="px-2 py-1.5 text-center">E</th>
                            <th className="px-2 py-1.5 text-center">D</th>
                            <th className="px-2 py-1.5 text-center">SG</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.standings.map((row, index) => {
                            const qualified = index < 2;
                            return (
                              <tr key={row.teamId} className={`border-b border-slate-100 last:border-b-0 ${qualified ? 'bg-emerald-50/70' : 'bg-white'}`}>
                                <td className="px-2 py-1.5 text-center"><span className={`inline-grid h-6 w-6 place-items-center rounded-lg text-[10px] font-black ${qualified ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span></td>
                                <td className="px-2 py-1.5">
                                  <div className="flex min-w-0 items-center gap-2">
                                    {row.team.logoUrl ? <img src={row.team.logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-lg border border-slate-200 bg-white object-cover" loading="lazy" /> : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-[8px] font-black text-[#073B8C]">{row.team.name.slice(0, 2).toUpperCase()}</span>}
                                    <div className="min-w-0"><p className="max-w-32 truncate text-[11px] font-black text-slate-900">{row.team.name}</p>{qualified && <p className="text-[8px] font-black uppercase text-emerald-600">Zona de classificação</p>}</div>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 text-center text-xs font-black text-[#073B8C]">{row.points}</td>
                                <td className="px-2 py-1.5 text-center text-[10px] font-bold text-slate-600">{row.played}</td>
                                <td className="px-2 py-1.5 text-center text-[10px] font-bold text-emerald-700">{row.wins}</td>
                                <td className="px-2 py-1.5 text-center text-[10px] font-bold text-slate-600">{row.draws}</td>
                                <td className="px-2 py-1.5 text-center text-[10px] font-bold text-rose-600">{row.losses}</td>
                                <td className={`px-2 py-1.5 text-center text-[10px] font-black ${row.goalDifference > 0 ? 'text-emerald-700' : row.goalDifference < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-blue-50 px-3 py-2.5 text-[10px] font-bold text-[#073B8C]"><Sparkles className="h-4 w-4 shrink-0" />Arraste a tabela para o lado no celular. Critérios: pontos, vitórias, saldo de gols e gols marcados.</div>

            {data.knockoutGenerated && <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-black text-emerald-700"><CheckCircle2 className="h-5 w-5" />Mata-mata gerado. A chave decisiva já está disponível.</div>}
            {data.canGenerateKnockout && <button type="button" disabled={generate.isPending} onClick={() => { if (window.confirm('Gerar o mata-mata com os 2 melhores de cada grupo?')) generate.mutate(); }} className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 text-sm font-black text-slate-950 shadow-lg shadow-amber-200 disabled:opacity-50"><GitBranch className="h-5 w-5" />{generate.isPending ? 'Gerando chave…' : 'Gerar Mata-Mata'}</button>}
            {data.groupStageFinished && !data.knockoutGenerated && !data.canGenerateKnockout && <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-center text-xs font-bold text-amber-800">Fase de grupos concluída. Aguardando o Host gerar a chave.</div>}
            {generate.isError && <p className="mt-2 rounded-xl bg-rose-50 p-2 text-center text-xs font-bold text-rose-700">Não foi possível gerar o mata-mata. Atualize a tabela e tente novamente.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
