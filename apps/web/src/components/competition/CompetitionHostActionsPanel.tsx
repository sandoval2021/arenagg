import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronDown, GitBranch, RotateCw, Settings2, ShieldAlert } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, getCompetition } from '../../lib/api';
import {
  cancelHostMatch,
  generateExtraTurn,
  getHostActions,
  startHostPlayoffs,
} from '../../lib/host-actions-api';

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : 'Não foi possível concluir esta ação.';
  const details = error.details as { message?: string; error?: string } | undefined;
  if (details?.message) return details.message;
  const code = details?.error ?? error.code;
  const messages: Record<string, string> = {
    HOST_ONLY: 'Somente o Host pode executar esta ação.',
    COMPETITION_NOT_IN_PROGRESS: 'A Copa precisa estar em andamento.',
    MATCH_ALREADY_FINALIZED: 'Partidas já finalizadas não podem ser anuladas.',
    KNOCKOUT_MATCH_CANCEL_FORBIDDEN: 'Partidas do mata-mata não podem ser puladas porque isso quebraria a progressão da chave.',
    UNRESOLVED_RESULTS_EXIST: 'Existem placares aguardando aprovação ou em disputa. Resolva-os antes de iniciar os playoffs.',
    PLAYOFFS_ALREADY_EXIST: 'A Fase Final já foi criada.',
    ACTIVE_LEAGUE_STAGE_NOT_FOUND: 'Não existe uma fase de Liga ativa para esta ação.',
    NO_FINISHED_LEAGUE_MATCHES: 'Finalize pelo menos uma partida da Liga antes de gerar a Fase Final.',
    NOT_ENOUGH_TEAMS_FOR_PLAYOFFS: 'Não há jogadores suficientes para esse tamanho de Fase Final.',
    PLAYOFFS_ALREADY_STARTED: 'Não é possível gerar turno extra depois que o mata-mata começou.',
  };
  return messages[code] ?? code.replaceAll('_', ' ');
}

export function CompetitionHostActionsPanel() {
  const { competitionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [success, setSuccess] = useState<string | null>(null);

  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getCompetition(competitionId),
    enabled: Boolean(competitionId),
    staleTime: 3_000,
  });
  const enabled = Boolean(competitionId && competition.data?.isHost && competition.data.status === 'IN_PROGRESS');
  const actions = useQuery({
    queryKey: ['host-actions', competitionId],
    queryFn: () => getHostActions(competitionId),
    enabled,
    staleTime: 2_000,
  });

  const selected = useMemo(
    () => actions.data?.cancelableMatches.find((match) => match.id === selectedMatchId) ?? null,
    [actions.data?.cancelableMatches, selectedMatchId],
  );

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['competitions', 'mine'] }),
      queryClient.invalidateQueries({ queryKey: ['competition-matches', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['group-stage', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['host-actions', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['playoffs', competitionId] }),
    ]);
  }

  const cancelMatch = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Selecione uma partida.');
      if (!window.confirm(`Anular ${selected.homeName} x ${selected.awayName}? A partida ficará cancelada e não contará na classificação.`)) {
        return null;
      }
      return cancelHostMatch(competitionId, selected.id);
    },
    onSuccess: async (result) => {
      if (!result) return;
      setSuccess('Partida anulada. Ela não soma jogos nem pontos.');
      setSelectedMatchId('');
      await refreshAll();
    },
  });

  const playoffs = useMutation({
    mutationFn: (size: 4 | 8) => startHostPlayoffs(competitionId, size),
    onSuccess: async (result) => {
      setSuccess(`Fase Final Top ${result.playoffSize} criada com ${result.bracketMatchCount} partidas.`);
      await refreshAll();
    },
  });

  const extraTurn = useMutation({
    mutationFn: () => generateExtraTurn(competitionId),
    onSuccess: async (result) => {
      setSuccess(`Turno extra ${result.extraTurnNumber} criado: ${result.roundsAdded} rodadas e ${result.matchesAdded} partidas.`);
      await refreshAll();
    },
  });

  if (!enabled) return null;

  const pending = cancelMatch.isPending || playoffs.isPending || extraTurn.isPending;
  const mutationError = [cancelMatch.error, playoffs.error, extraTurn.error].find(Boolean);

  return (
    <section className="mx-auto mt-4 max-w-5xl px-4 sm:px-6" aria-label="Ações do Host">
      <div className="overflow-hidden rounded-[1.75rem] border border-blue-200 bg-gradient-to-br from-white via-blue-50/60 to-cyan-50/40 shadow-md shadow-blue-100/50">
        <header className="flex items-center gap-3 border-b border-blue-100 px-4 py-3 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#073B8C] text-white shadow-sm"><Settings2 className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Controle dinâmico</p><h2 className="truncate text-lg font-black text-slate-950">Ações do Host</h2></div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">Sem apagar histórico</span>
        </header>

        <div className="grid gap-3 p-3 md:grid-cols-3 md:p-5">
          <ActionCard icon={Ban} title="Pular partida" description="Anula um confronto pendente. A partida cancelada vale 0 jogo e 0 ponto.">
            <label className="relative block">
              <select
                value={selectedMatchId}
                onChange={(event) => setSelectedMatchId(event.target.value)}
                disabled={pending || !actions.data?.cancelableMatches.length}
                className="min-h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-9 text-xs font-bold text-slate-800 outline-none focus:border-blue-300"
              >
                <option value="">{actions.data?.cancelableMatches.length ? 'Escolha a partida' : 'Nenhuma partida anulável'}</option>
                {(actions.data?.cancelableMatches ?? []).map((match) => <option key={match.id} value={match.id}>{match.round ? `R${match.round.number} · ` : ''}{match.homeName} x {match.awayName}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </label>
            <button disabled={!selected || pending} onClick={() => cancelMatch.mutate()} className="mt-2 min-h-10 w-full rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 disabled:opacity-40">Cancelar / Pular</button>
          </ActionCard>

          <ActionCard icon={GitBranch} title="Fase Final" description="Congela a Liga e cria um novo Stage de mata-mata com os melhores colocados.">
            <div className="grid grid-cols-2 gap-2">
              {([4, 8] as const).map((size) => {
                const allowed = actions.data?.allowedPlayoffSizes.includes(size) ?? false;
                return <button key={size} disabled={!allowed || pending} onClick={() => playoffs.mutate(size)} className="min-h-10 rounded-xl bg-[#073B8C] px-3 text-xs font-black text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400">Top {size}</button>;
              })}
            </div>
            {actions.data?.knockoutStage && <p className="mt-2 text-[10px] font-bold text-emerald-700">Mata-mata já criado: {actions.data.knockoutStage.name}</p>}
          </ActionCard>

          <ActionCard icon={RotateCw} title="Turno Extra" description="Adiciona outro turno completo de jogos únicos depois da última rodada existente.">
            <button disabled={!actions.data?.leagueStage || Boolean(actions.data?.knockoutStage) || pending} onClick={() => extraTurn.mutate()} className="min-h-10 w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-3 text-xs font-black text-white shadow-sm disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400">Gerar Turno Extra</button>
            <p className="mt-2 text-[10px] font-bold text-slate-500">Turnos extras já gerados: {actions.data?.extraTurnCount ?? 0}</p>
          </ActionCard>
        </div>

        {success && <p className="mx-3 mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 md:mx-5 md:mb-5">{success}</p>}
        {mutationError && <p className="mx-3 mb-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 md:mx-5 md:mb-5"><ShieldAlert className="h-4 w-4 shrink-0" />{messageFor(mutationError)}</p>}
      </div>
    </section>
  );
}

function ActionCard({ icon: Icon, title, description, children }: { icon: typeof Ban; title: string; description: string; children: ReactNode }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#073B8C]"><Icon className="h-4 w-4" /></span><h3 className="text-sm font-black text-slate-900">{title}</h3></div><p className="my-2 min-h-10 text-[11px] font-medium leading-5 text-slate-500">{description}</p>{children}</article>;
}
