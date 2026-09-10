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
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
  });
  const isGroupStage = competition.data?.type === 'GROUPS_KNOCKOUT';

  const snapshot = useQuery({
    queryKey: ['group-stage', competitionId],
    queryFn: () => getGroupStageSnapshot(competitionId),
    enabled: Boolean(competitionId) && isGroupStage,
    staleTime: 1_000,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
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
    <section className="mx-auto mt-4 max-w-5xl px-3 sm:mt-5 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-lg shadow-blue-100/40 sm:rounded-[2rem]">
        <header className="bg-gradient-to-r from-[#073B8C] via-blue-700 to-cyan-600 p-3 text-white sm:p-5">
          <div className="flex items-start gap-2.5 sm:gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-12 sm:w-12 sm:rounded-2xl"><Table2 className="h-5 w-5 sm:h-6 sm:w-6" /></span>
            <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[.16em] text-blue-100 sm:text-[10px] sm:tracking-[.2em]">Champions Style</p><h2 className="mt-0.5 text-lg font-black sm:mt-1 sm:text-xl">Tabela de Classificação</h2><p className="mt-0.5 text-[10px] font-semibold text-blue-100 sm:mt-1 sm:text-xs">Atualiza automaticamente a cada 3s · os 2 melhores avançam.</p></div>
            {data && <span className="shrink-0 rounded-full bg-white/15 px-2 py-1 text-[10px] font-black ring-1 ring-white/20 sm:px-3 sm:text-xs">{data.finishedMatches}/{data.totalMatches}</span>}
          </div>
        </header>

        {snapshot.isLoading && <div className="flex min-h-32 items-center justify-center gap-2 text-xs font-bold text-slate-500 sm:min-h-40 sm:text-sm"><LoaderCircle className="h-5 w-5 animate-spin" />Carregando grupos…</div>}
        {snapshot.isError && <div className="p-4 text-center text-xs font-bold text-rose-600 sm:p-5 sm:text-sm">Não foi possível carregar a classificação agora.</div>}

        {data && data.groups.length === 0 && (
          <div className="p-4 text-center sm:p-6"><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#073B8C] sm:h-12 sm:w-12 sm:rounded-2xl"><Shield className="h-5 w-5 sm:h-6 sm:w-6" /></span><h3 className="mt-2 text-sm font-black text-slate-900 sm:mt-3 sm:text-base">Os grupos serão sorteados ao iniciar</h3><p className="mt-1 text-[10px] font-semibold text-slate-500 sm:text-xs">Depois do sorteio, a tabela aparece aqui automaticamente.</p></div>
        )}

        {data && data.groups.length > 0 && (
          <div className="p-2.5 sm:p-5">
            <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-2">
              {data.groups.map((group) => (
                <article key={group.id} className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:rounded-3xl">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-2.5 py-2 sm:px-4 sm:py-3"><div><p className="text-[8px] font-black uppercase tracking-[.14em] text-[#073B8C] sm:text-[9px]">Classificação</p><h3 className="text-sm font-black text-slate-950 sm:text-base">{group.name}</h3></div><Trophy className="h-4 w-4 text-amber-500 sm:h-5 sm:w-5" /></div>
                  <table className="w-full table-fixed border-collapse text-[9px] text-slate-700 sm:text-[10px]">
                    <colgroup>
                      <col className="w-[7%]" />
                      <col className="w-[31%]" />
                      <col className="w-[10.33%]" />
                      <col className="w-[10.33%]" />
                      <col className="w-[10.33%]" />
                      <col className="w-[10.33%]" />
                      <col className="w-[10.33%]" />
                      <col className="w-[10.35%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-100 bg-white text-[8px] font-black uppercase tracking-normal text-slate-400">
                        <th className="px-0.5 py-1.5 text-center">#</th>
                        <th className="px-1 py-1.5 text-left">Time</th>
                        <th className="px-0.5 py-1.5 text-center">PTS</th>
                        <th className="px-0.5 py-1.5 text-center">J</th>
                        <th className="px-0.5 py-1.5 text-center">V</th>
                        <th className="px-0.5 py-1.5 text-center">E</th>
                        <th className="px-0.5 py-1.5 text-center">D</th>
                        <th className="px-0.5 py-1.5 text-center">SG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.standings.map((row, index) => {
                        const qualified = index < 2;
                        return (
                          <tr key={row.teamId} className={`border-b border-slate-100 last:border-b-0 ${qualified ? 'bg-emerald-50/70' : 'bg-white'}`}>
                            <td className="px-0.5 py-1.5 text-center"><span className={`inline-grid h-5 w-5 place-items-center rounded-md text-[8px] font-black ${qualified ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span></td>
                            <td className="min-w-0 px-1 py-1.5">
                              <div className="flex min-w-0 items-center gap-1">
                                {row.team.logoUrl ? <img src={row.team.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded-md border border-slate-200 bg-white object-cover" loading="lazy" /> : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-blue-50 text-[7px] font-black text-[#073B8C]">{row.team.name.slice(0, 2).toUpperCase()}</span>}
                                <div className="min-w-0"><p className="max-w-[70px] truncate text-[9px] font-black leading-tight text-slate-900">{row.team.name}</p>{qualified && <p className="max-w-[70px] truncate text-[6px] font-black uppercase leading-tight text-emerald-600">Classifica</p>}</div>
                              </div>
                            </td>
                            <td className="px-0.5 py-1.5 text-center text-[10px] font-black text-[#073B8C]">{row.points}</td>
                            <td className="px-0.5 py-1.5 text-center font-bold text-slate-600">{row.played}</td>
                            <td className="px-0.5 py-1.5 text-center font-bold text-emerald-700">{row.wins}</td>
                            <td className="px-0.5 py-1.5 text-center font-bold text-slate-600">{row.draws}</td>
                            <td className="px-0.5 py-1.5 text-center font-bold text-rose-600">{row.losses}</td>
                            <td className={`px-0.5 py-1.5 text-center font-black ${row.goalDifference > 0 ? 'text-emerald-700' : row.goalDifference < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </article>
              ))}
            </div>

            <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-blue-50 px-2.5 py-2 text-[9px] font-bold text-[#073B8C] sm:mt-3 sm:rounded-2xl sm:px-3 sm:py-2.5 sm:text-[10px]"><Sparkles className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />PTS, J, V, E, D e SG ficam visíveis juntos no celular.</div>

            {data.knockoutGenerated && <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-black text-emerald-700 sm:mt-3 sm:rounded-2xl sm:p-3 sm:text-sm"><CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />Mata-mata gerado. A chave decisiva já está disponível.</div>}
            {data.canGenerateKnockout && <button type="button" disabled={generate.isPending} onClick={() => { if (window.confirm('Gerar o mata-mata com os 2 melhores de cada grupo?')) generate.mutate(); }} className="mt-2.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-3 text-xs font-black text-slate-950 shadow-lg shadow-amber-200 disabled:opacity-50 sm:mt-3 sm:min-h-14 sm:rounded-2xl sm:px-4 sm:text-sm"><GitBranch className="h-4 w-4 sm:h-5 sm:w-5" />{generate.isPending ? 'Gerando chave…' : 'Gerar Mata-Mata'}</button>}
            {data.groupStageFinished && !data.knockoutGenerated && !data.canGenerateKnockout && <div className="mt-2.5 rounded-xl bg-amber-50 p-2.5 text-center text-[10px] font-bold text-amber-800 sm:mt-3 sm:rounded-2xl sm:p-3 sm:text-xs">Fase de grupos concluída. Aguardando o Host gerar a chave.</div>}
            {generate.isError && <p className="mt-2 rounded-xl bg-rose-50 p-2 text-center text-xs font-bold text-rose-700">Não foi possível gerar o mata-mata. Atualize a tabela e tente novamente.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
