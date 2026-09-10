import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Gavel,
  LoaderCircle,
  Save,
  ShieldCheck,
  Swords,
  X,
} from 'lucide-react';
import {
  ApiError,
  approveMatchStats,
  disputeMatchStats,
  submitMatchStats,
  type CompetitionDetail,
  type MatchStats,
  type MatchStatsInput,
} from '../../lib/api';

type CompetitionMatch = CompetitionDetail['matches'][number];

type Props = {
  competitionId: string;
  match: CompetitionMatch;
  stats?: MatchStats;
  statsLoading: boolean;
  canEdit: boolean;
  isHost: boolean;
};

type CounterKey = Exclude<keyof MatchStatsInput, 'homePossession' | 'awayPossession'>;

const statRows: Array<{
  label: string;
  home: CounterKey;
  away: CounterKey;
  max: number;
}> = [
  { label: 'Chutes', home: 'homeShots', away: 'awayShots', max: 999 },
  { label: 'Chutes a Gol', home: 'homeShotsOnGoal', away: 'awayShotsOnGoal', max: 999 },
  { label: 'Passes', home: 'homePasses', away: 'awayPasses', max: 5000 },
  { label: 'Desarmes', home: 'homeTackles', away: 'awayTackles', max: 999 },
  { label: 'Faltas', home: 'homeFouls', away: 'awayFouls', max: 999 },
];

const emptyStats: MatchStatsInput = {
  homePossession: 50,
  awayPossession: 50,
  homeShots: 0,
  awayShots: 0,
  homeShotsOnGoal: 0,
  awayShotsOnGoal: 0,
  homePasses: 0,
  awayPasses: 0,
  homeTackles: 0,
  awayTackles: 0,
  homeFouls: 0,
  awayFouls: 0,
};

function statsToInput(stats?: MatchStats): MatchStatsInput {
  if (!stats) return { ...emptyStats };
  return {
    homePossession: stats.homePossession,
    awayPossession: stats.awayPossession,
    homeShots: stats.homeShots,
    awayShots: stats.awayShots,
    homeShotsOnGoal: stats.homeShotsOnGoal,
    awayShotsOnGoal: stats.awayShotsOnGoal,
    homePasses: stats.homePasses,
    awayPasses: stats.awayPasses,
    homeTackles: stats.homeTackles,
    awayTackles: stats.awayTackles,
    homeFouls: stats.homeFouls,
    awayFouls: stats.awayFouls,
  };
}

export function MatchStatsPanel({ competitionId, match, stats, statsLoading, canEdit, isHost }: Props) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MatchStatsInput>(() => statsToInput(stats));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['match-stats', competitionId] });
  };

  const submit = useMutation({
    mutationFn: () => submitMatchStats(match.id, form),
    onSuccess: async () => {
      setModalOpen(false);
      await refresh();
    },
  });

  const approve = useMutation({
    mutationFn: () => approveMatchStats(match.id),
    onSuccess: refresh,
  });

  const dispute = useMutation({
    mutationFn: () => disputeMatchStats(match.id),
    onSuccess: refresh,
  });

  const teamsReady = Boolean(match.homeTeam && match.awayTeam);
  const canOpenEditor =
    canEdit &&
    teamsReady &&
    !statsLoading &&
    (!stats || isHost || (stats.statsStatus === 'PENDING_APPROVAL' && stats.submittedByMe));

  function openEditor() {
    setForm(statsToInput(stats));
    setModalOpen(true);
  }

  const actionPending = approve.isPending || dispute.isPending;

  return (
    <div className="mt-3 border-t border-white/[.07] pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-300" />
          <span className="text-[11px] font-black uppercase tracking-[.14em] text-slate-400">Estatísticas</span>
        </div>
        <StatsStatusBadge stats={stats} loading={statsLoading} />
      </div>

      {!statsLoading && !stats && canOpenEditor && (
        <button type="button" onClick={openEditor} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-xs font-black text-cyan-200 transition active:scale-[.99]">
          <BarChart3 className="h-4 w-4" />📊 Adicionar Estatísticas
        </button>
      )}

      {stats?.statsStatus === 'PENDING_APPROVAL' && (
        <div className={`mt-3 rounded-2xl border p-3 ${stats.canApprove ? 'border-amber-300/20 bg-amber-300/10' : 'border-blue-300/15 bg-blue-300/[.07]'}`}>
          <div className="flex items-start gap-2">
            <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${stats.canApprove ? 'text-amber-300' : 'text-blue-300'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-white">
                {stats.canApprove
                  ? isHost
                    ? 'Estatísticas aguardando sua decisão de Host.'
                    : 'Estatísticas enviadas pelo adversário. Validar?'
                  : 'Estatísticas enviadas. Aguardando o adversário.'}
              </p>
              <p className="mt-1 text-[11px] font-medium leading-5 text-slate-400">
                {stats.canApprove
                  ? 'Confira os números antes de aprovar. O Host sempre funciona como juiz final.'
                  : 'Você pode ajustar os números enquanto o adversário ainda não respondeu.'}
              </p>
            </div>
          </div>

          {stats.canApprove && (
            <div className={`mt-3 grid gap-2 ${stats.canDispute ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {stats.canDispute && (
                <button type="button" disabled={actionPending} onClick={() => dispute.mutate()} className="min-h-10 rounded-xl border border-rose-300/20 bg-rose-300/10 text-xs font-black text-rose-200 disabled:opacity-50">
                  Contestar
                </button>
              )}
              <button type="button" disabled={actionPending} onClick={() => approve.mutate()} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-300 px-3 text-xs font-black text-emerald-950 disabled:opacity-50">
                {approve.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Aprovar
              </button>
            </div>
          )}

          {!stats.canApprove && canOpenEditor && (
            <button type="button" onClick={openEditor} className="mt-3 min-h-10 w-full rounded-xl border border-white/10 bg-white/[.04] text-xs font-black text-slate-300">
              Ajustar antes da aprovação
            </button>
          )}
        </div>
      )}

      {stats?.statsStatus === 'DISPUTED' && (
        <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-3">
          <div className="flex items-start gap-2">
            <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-white">Estatísticas contestadas.</p>
              <p className="mt-1 text-[11px] font-medium leading-5 text-slate-400">
                {isHost ? 'Você é o juiz final: pode aprovar os números atuais ou corrigi-los e publicar.' : 'Os dados foram preservados para o Host decidir sem perder o histórico da contestação.'}
              </p>
            </div>
          </div>
          {isHost && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={openEditor} className="min-h-10 rounded-xl border border-white/10 bg-white/[.05] text-xs font-black text-white">Corrigir</button>
              <button type="button" disabled={approve.isPending} onClick={() => approve.mutate()} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-300 text-xs font-black text-emerald-950 disabled:opacity-50">
                {approve.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Aprovar
              </button>
            </div>
          )}
        </div>
      )}

      {stats?.statsStatus === 'APPROVED' && (
        <ApprovedStatsReport stats={stats} homeName={match.homeTeam?.name ?? 'Mandante'} awayName={match.awayTeam?.name ?? 'Visitante'} />
      )}

      {stats?.statsStatus === 'APPROVED' && isHost && canOpenEditor && (
        <button type="button" onClick={openEditor} className="mt-2 min-h-9 w-full rounded-xl border border-white/[.08] bg-white/[.025] text-[11px] font-black text-slate-500 hover:text-slate-300">
          Editar como Host
        </button>
      )}

      {(submit.isError || approve.isError || dispute.isError) && (
        <p className="mt-2 text-center text-[11px] font-bold text-rose-300">
          {statsError(submit.error ?? approve.error ?? dispute.error)}
        </p>
      )}

      {modalOpen && (
        <StatsModal
          match={match}
          form={form}
          setForm={setForm}
          isHost={isHost}
          pending={submit.isPending}
          error={submit.isError ? statsError(submit.error) : null}
          onClose={() => setModalOpen(false)}
          onSave={() => submit.mutate()}
        />
      )}
    </div>
  );
}

function StatsModal({
  match,
  form,
  setForm,
  isHost,
  pending,
  error,
  onClose,
  onSave,
}: {
  match: CompetitionMatch;
  form: MatchStatsInput;
  setForm: (next: MatchStatsInput) => void;
  isHost: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const homeName = match.homeTeam?.name ?? 'Mandante';
  const awayName = match.awayTeam?.name ?? 'Visitante';
  const shotsInvalid = form.homeShotsOnGoal > form.homeShots || form.awayShotsOnGoal > form.awayShots;

  function setCounter(key: CounterKey, value: number, max: number) {
    setForm({ ...form, [key]: Math.min(max, Math.max(0, Math.trunc(value || 0))) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Estatísticas da partida">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-white/10 bg-gradient-to-b from-slate-900 to-black shadow-2xl shadow-black/70 sm:rounded-[2rem]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-950/90 px-5 py-4 backdrop-blur-xl">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">EA FC · Match Stats</p>
            <h3 className="mt-1 text-lg font-black text-white">📊 Estatísticas da Partida</h3>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[.05] text-slate-300" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <TeamMini team={match.homeTeam} />
            <Swords className="h-5 w-5 text-slate-600" />
            <TeamMini team={match.awayTeam} />
          </div>

          <section className="mt-6 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.06] p-4">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="max-w-[38%] truncate text-cyan-200">{homeName}</span>
              <span className="text-slate-400">Posse de Bola</span>
              <span className="max-w-[38%] truncate text-cyan-200">{awayName}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="w-10 text-right text-lg font-black text-white">{form.homePossession}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={form.homePossession}
                onChange={(event) => {
                  const homePossession = Number(event.target.value);
                  setForm({ ...form, homePossession, awayPossession: 100 - homePossession });
                }}
                className="min-w-0 flex-1 accent-cyan-300"
                aria-label="Posse de bola do time mandante"
              />
              <span className="w-10 text-lg font-black text-white">{form.awayPossession}%</span>
            </div>
          </section>

          <div className="mt-4 space-y-3">
            {statRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[72px_1fr_72px] items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.035] p-3">
                <StatInput value={form[row.home]} max={row.max} label={`${row.label} de ${homeName}`} onChange={(value) => setCounter(row.home, value, row.max)} />
                <span className="text-center text-xs font-black text-slate-400">{row.label}</span>
                <StatInput value={form[row.away]} max={row.max} label={`${row.label} de ${awayName}`} onChange={(value) => setCounter(row.away, value, row.max)} />
              </div>
            ))}
          </div>

          {shotsInvalid && <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs font-bold text-rose-200">Chutes a gol não podem ser maiores que o total de chutes.</p>}
          {error && <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs font-bold text-rose-200">{error}</p>}

          <div className="mt-5 rounded-2xl border border-white/[.08] bg-black/20 p-3 text-[11px] font-medium leading-5 text-slate-400">
            {isHost
              ? '👑 Como Host, ao salvar estas estatísticas elas serão aprovadas imediatamente.'
              : '🤝 Ao salvar, o adversário precisará aprovar. Se houver divergência, ele poderá contestar e o Host dará a decisão final.'}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 pb-[max(.5rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={onClose} className="min-h-12 rounded-2xl border border-white/10 bg-white/[.04] text-sm font-black text-slate-300">Cancelar</button>
            <button type="button" disabled={pending || shotsInvalid} onClick={onSave} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-500 text-sm font-black text-slate-950 shadow-xl shadow-blue-950/30 disabled:opacity-40">
              {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{pending ? 'Salvando…' : 'Salvar Stats'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovedStatsReport({ stats, homeName, awayName }: { stats: MatchStats; homeName: string; awayName: string }) {
  return (
    <details className="group mt-3 overflow-hidden rounded-2xl border border-emerald-300/15 bg-emerald-300/[.055]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-black text-emerald-200">
        <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Estatísticas aprovadas</span>
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/[.07] p-3">
        <ComparisonRow label="Posse" home={stats.homePossession} away={stats.awayPossession} suffix="%" />
        <ComparisonRow label="Chutes" home={stats.homeShots} away={stats.awayShots} />
        <ComparisonRow label="No gol" home={stats.homeShotsOnGoal} away={stats.awayShotsOnGoal} />
        <ComparisonRow label="Passes" home={stats.homePasses} away={stats.awayPasses} />
        <ComparisonRow label="Desarmes" home={stats.homeTackles} away={stats.awayTackles} />
        <ComparisonRow label="Faltas" home={stats.homeFouls} away={stats.awayFouls} />
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] gap-2 text-[10px] font-bold text-slate-500">
          <span className="truncate text-right">{homeName}</span><span>comparativo</span><span className="truncate">{awayName}</span>
        </div>
      </div>
    </details>
  );
}

function ComparisonRow({ label, home, away, suffix = '' }: { label: string; home: number; away: number; suffix?: string }) {
  const total = home + away;
  const homeWidth = total === 0 ? 50 : Math.round((home / total) * 100);
  const awayWidth = 100 - homeWidth;

  return (
    <div className="py-2">
      <div className="grid grid-cols-[42px_1fr_42px] items-center gap-2 text-[11px] font-black">
        <span className="text-right text-white">{home}{suffix}</span>
        <span className="text-center text-slate-400">{label}</span>
        <span className="text-white">{away}{suffix}</span>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/[.06]">
        <span className="h-full bg-cyan-300" style={{ width: `${homeWidth}%` }} />
        <span className="h-full bg-fuchsia-400" style={{ width: `${awayWidth}%` }} />
      </div>
    </div>
  );
}

function StatInput({ value, max, label, onChange }: { value: number; max: number; label: string; onChange: (value: number) => void }) {
  return <input type="number" inputMode="numeric" min={0} max={max} value={value} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} className="h-11 w-full rounded-xl border border-white/10 bg-black/35 text-center text-base font-black text-white outline-none focus:border-cyan-300/50" />;
}

function TeamMini({ team }: { team: CompetitionMatch['homeTeam'] }) {
  const name = team?.name ?? 'A definir';
  return (
    <div className="min-w-0">
      {team?.logoUrl ? <img loading="lazy" decoding="async" src={team.logoUrl} alt="" className="mx-auto h-12 w-12 rounded-2xl border border-white/10 bg-white/5 object-cover" referrerPolicy="no-referrer" /> : <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[.06] text-xs font-black text-cyan-200">{name.slice(0, 2).toUpperCase()}</span>}
      <p className="mt-2 truncate text-xs font-black text-white">{name}</p>
    </div>
  );
}

function StatsStatusBadge({ stats, loading }: { stats?: MatchStats; loading: boolean }) {
  if (loading) return <span className="text-[10px] font-bold text-slate-600">carregando…</span>;
  if (!stats) return <span className="rounded-full bg-white/[.05] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Opcional</span>;

  const styles = {
    PENDING_APPROVAL: 'bg-amber-300/10 text-amber-200 border-amber-300/15',
    APPROVED: 'bg-emerald-300/10 text-emerald-200 border-emerald-300/15',
    DISPUTED: 'bg-rose-300/10 text-rose-200 border-rose-300/15',
    NONE: 'bg-white/[.05] text-slate-500 border-white/[.08]',
  } as const;
  const labels = {
    PENDING_APPROVAL: 'Aguardando',
    APPROVED: 'Aprovadas',
    DISPUTED: 'Contestadas',
    NONE: 'Opcional',
  } as const;

  return <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${styles[stats.statsStatus]}`}>{labels[stats.statsStatus]}</span>;
}

function statsError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível atualizar as estatísticas.';
  switch (error.code) {
    case 'INVALID_INPUT':
      return 'Confira os números informados. A posse precisa somar 100%.';
    case 'STATS_AWAITING_REVIEW':
      return 'O adversário já enviou estatísticas. Você precisa aprovar ou contestar.';
    case 'STATS_HOST_REVIEW_REQUIRED':
      return 'As estatísticas foram contestadas e agora dependem do Host.';
    case 'STATS_ALREADY_APPROVED':
      return 'Estas estatísticas já foram aprovadas.';
    case 'STATS_SELF_APPROVAL_FORBIDDEN':
    case 'STATS_SELF_REVIEW_FORBIDDEN':
      return 'Quem enviou não pode aprovar ou contestar o próprio envio.';
    case 'FORBIDDEN':
      return 'Você não participa deste confronto.';
    case 'MATCH_TEAMS_NOT_READY':
      return 'Os dois times precisam estar definidos antes das estatísticas.';
    default:
      return 'Não foi possível atualizar as estatísticas agora.';
  }
}
