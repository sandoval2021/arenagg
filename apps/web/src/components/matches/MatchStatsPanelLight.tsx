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
type CounterKey = Exclude<keyof MatchStatsInput, 'homePossession' | 'awayPossession'>;

const rows: Array<{ label: string; home: CounterKey; away: CounterKey; max: number }> = [
  { label: 'Chutes', home: 'homeShots', away: 'awayShots', max: 999 },
  { label: 'Chutes a gol', home: 'homeShotsOnGoal', away: 'awayShotsOnGoal', max: 999 },
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

function toInput(stats?: MatchStats): MatchStatsInput {
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

export function MatchStatsPanelLight({
  competitionId,
  match,
  stats,
  statsLoading,
  canEdit,
  isHost,
}: {
  competitionId: string;
  match: CompetitionMatch;
  stats?: MatchStats;
  statsLoading: boolean;
  canEdit: boolean;
  isHost: boolean;
}) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MatchStatsInput>(() => toInput(stats));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['match-stats', competitionId] });

  const submit = useMutation({
    mutationFn: () => submitMatchStats(match.id, form),
    onSuccess: async () => {
      setModalOpen(false);
      await refresh();
    },
  });
  const approve = useMutation({ mutationFn: () => approveMatchStats(match.id), onSuccess: refresh });
  const dispute = useMutation({ mutationFn: () => disputeMatchStats(match.id), onSuccess: refresh });

  const teamsReady = Boolean(match.homeTeam && match.awayTeam);
  const canOpenEditor = canEdit && teamsReady && !statsLoading && (!stats || isHost || (stats.statsStatus === 'PENDING_APPROVAL' && stats.submittedByMe));

  function openEditor() {
    setForm(toInput(stats));
    setModalOpen(true);
  }

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#073B8C]" /><span className="text-[11px] font-black uppercase tracking-[.14em] text-slate-500">Estatísticas</span></div>
        <StatusBadge stats={stats} loading={statsLoading} />
      </div>

      {!statsLoading && !stats && canOpenEditor && (
        <button type="button" onClick={openEditor} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-xs font-black text-[#073B8C]">
          <BarChart3 className="h-4 w-4" />📊 Adicionar Estatísticas
        </button>
      )}

      {stats?.statsStatus === 'PENDING_APPROVAL' && (
        <div className={`mt-3 rounded-2xl border p-3 ${stats.canApprove ? 'border-amber-200 bg-amber-50' : 'border-blue-100 bg-blue-50/70'}`}>
          <div className="flex items-start gap-2">
            <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${stats.canApprove ? 'text-amber-600' : 'text-blue-600'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-900">{stats.canApprove ? (isHost ? 'Estatísticas aguardando decisão do Host.' : 'Estatísticas enviadas pelo adversário. Validar?') : 'Estatísticas enviadas. Aguardando o adversário.'}</p>
              <p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">{stats.canApprove ? 'Confira os números antes de aprovar.' : 'Você pode ajustar os dados enquanto ainda não houve resposta.'}</p>
            </div>
          </div>
          {stats.canApprove && (
            <div className={`mt-3 grid gap-2 ${stats.canDispute ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {stats.canDispute && <button type="button" disabled={dispute.isPending} onClick={() => dispute.mutate()} className="min-h-10 rounded-xl border border-red-200 bg-red-50 text-xs font-black text-red-700">Contestar</button>}
              <button type="button" disabled={approve.isPending} onClick={() => approve.mutate()} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-50">{approve.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Aprovar</button>
            </div>
          )}
          {!stats.canApprove && canOpenEditor && <button type="button" onClick={openEditor} className="mt-3 min-h-10 w-full rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600">Ajustar antes da aprovação</button>}
        </div>
      )}

      {stats?.statsStatus === 'DISPUTED' && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3">
          <div className="flex items-start gap-2"><Gavel className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /><div><p className="text-xs font-black text-slate-900">Estatísticas contestadas.</p><p className="mt-1 text-[11px] font-medium leading-5 text-slate-500">{isHost ? 'Você é o juiz final: corrija ou aprove os números atuais.' : 'Os dados ficam preservados para o Host decidir.'}</p></div></div>
          {isHost && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={openEditor} className="min-h-10 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700">Corrigir</button><button type="button" onClick={() => approve.mutate()} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-black text-white"><ShieldCheck className="h-4 w-4" />Aprovar</button></div>}
        </div>
      )}

      {stats?.statsStatus === 'APPROVED' && <ApprovedReport stats={stats} homeName={match.homeTeam?.name ?? 'Mandante'} awayName={match.awayTeam?.name ?? 'Visitante'} />}
      {stats?.statsStatus === 'APPROVED' && isHost && canOpenEditor && <button type="button" onClick={openEditor} className="mt-2 min-h-9 w-full rounded-xl border border-slate-200 bg-white text-[11px] font-black text-slate-500">Editar como Host</button>}

      {(submit.isError || approve.isError || dispute.isError) && <p className="mt-2 text-center text-[11px] font-bold text-red-600">{statsError(submit.error ?? approve.error ?? dispute.error)}</p>}

      {modalOpen && <StatsModal match={match} form={form} setForm={setForm} isHost={isHost} pending={submit.isPending} error={submit.isError ? statsError(submit.error) : null} onClose={() => setModalOpen(false)} onSave={() => submit.mutate()} />}
    </div>
  );
}

function StatsModal({ match, form, setForm, isHost, pending, error, onClose, onSave }: { match: CompetitionMatch; form: MatchStatsInput; setForm: (next: MatchStatsInput) => void; isHost: boolean; pending: boolean; error: string | null; onClose: () => void; onSave: () => void }) {
  const homeName = match.homeTeam?.name ?? 'Mandante';
  const awayName = match.awayTeam?.name ?? 'Visitante';
  const shotsInvalid = form.homeShotsOnGoal > form.homeShots || form.awayShotsOnGoal > form.awayShots;

  function setCounter(key: CounterKey, value: number, max: number) {
    setForm({ ...form, [key]: Math.min(max, Math.max(0, Math.trunc(value || 0))) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Estatísticas da partida">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:rounded-[2rem]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur-xl">
          <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">EA FC · Match Stats</p><h3 className="mt-1 text-lg font-black text-slate-900">📊 Estatísticas da Partida</h3></div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><TeamMini team={match.homeTeam} /><Swords className="h-5 w-5 text-slate-300" /><TeamMini team={match.awayTeam} /></div>
          <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center justify-between text-xs font-black"><span className="max-w-[38%] truncate text-[#073B8C]">{homeName}</span><span className="text-slate-500">Posse de Bola</span><span className="max-w-[38%] truncate text-[#073B8C]">{awayName}</span></div>
            <div className="mt-3 flex items-center gap-3"><span className="w-10 text-right text-lg font-black text-slate-900">{form.homePossession}%</span><input type="range" min={0} max={100} value={form.homePossession} onChange={(event) => { const homePossession = Number(event.target.value); setForm({ ...form, homePossession, awayPossession: 100 - homePossession }); }} className="min-w-0 flex-1 accent-blue-600" aria-label="Posse de bola do time mandante" /><span className="w-10 text-lg font-black text-slate-900">{form.awayPossession}%</span></div>
          </section>
          <div className="mt-4 space-y-3">{rows.map((row) => <div key={row.label} className="grid grid-cols-[72px_1fr_72px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"><StatInput value={form[row.home]} max={row.max} label={`${row.label} de ${homeName}`} onChange={(value) => setCounter(row.home, value, row.max)} /><span className="text-center text-xs font-black text-slate-500">{row.label}</span><StatInput value={form[row.away]} max={row.max} label={`${row.label} de ${awayName}`} onChange={(value) => setCounter(row.away, value, row.max)} /></div>)}</div>
          {shotsInvalid && <p className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">Chutes a gol não podem ser maiores que o total de chutes.</p>}
          {error && <p className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-medium leading-5 text-slate-500">{isHost ? '👑 Como Host, ao salvar estas estatísticas elas serão aprovadas imediatamente.' : '🤝 Ao salvar, o adversário precisará aprovar. Em caso de contestação, o Host decide.'}</div>
          <div className="mt-5 grid grid-cols-2 gap-2 pb-[max(.5rem,env(safe-area-inset-bottom))]"><button type="button" onClick={onClose} className="min-h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600">Cancelar</button><button type="button" disabled={pending || shotsInvalid} onClick={onSave} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#073B8C] text-sm font-black text-white shadow-md disabled:opacity-40">{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{pending ? 'Salvando…' : 'Salvar Stats'}</button></div>
        </div>
      </div>
    </div>
  );
}

function ApprovedReport({ stats, homeName, awayName }: { stats: MatchStats; homeName: string; awayName: string }) {
  return <details className="group mt-3 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-black text-emerald-800"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Estatísticas aprovadas</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary><div className="border-t border-emerald-100 bg-white p-3"><ComparisonRow label="Posse" home={stats.homePossession} away={stats.awayPossession} suffix="%" /><ComparisonRow label="Chutes" home={stats.homeShots} away={stats.awayShots} /><ComparisonRow label="No gol" home={stats.homeShotsOnGoal} away={stats.awayShotsOnGoal} /><ComparisonRow label="Passes" home={stats.homePasses} away={stats.awayPasses} /><ComparisonRow label="Desarmes" home={stats.homeTackles} away={stats.awayTackles} /><ComparisonRow label="Faltas" home={stats.homeFouls} away={stats.awayFouls} /><div className="mt-3 grid grid-cols-[1fr_auto_1fr] gap-2 text-[10px] font-bold text-slate-400"><span className="truncate text-right">{homeName}</span><span>comparativo</span><span className="truncate">{awayName}</span></div></div></details>;
}

function ComparisonRow({ label, home, away, suffix = '' }: { label: string; home: number; away: number; suffix?: string }) {
  const total = home + away;
  const homeWidth = total === 0 ? 50 : Math.round((home / total) * 100);
  return <div className="py-2"><div className="grid grid-cols-[42px_1fr_42px] items-center gap-2 text-[11px] font-black"><span className="text-right text-slate-900">{home}{suffix}</span><span className="text-center text-slate-500">{label}</span><span className="text-slate-900">{away}{suffix}</span></div><div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="h-full bg-blue-600" style={{ width: `${homeWidth}%` }} /><span className="h-full bg-fuchsia-500" style={{ width: `${100 - homeWidth}%` }} /></div></div>;
}

function StatInput({ value, max, label, onChange }: { value: number; max: number; label: string; onChange: (value: number) => void }) {
  return <input type="number" inputMode="numeric" min={0} max={max} value={value} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-white text-center text-base font-black text-slate-900 outline-none focus:border-blue-400" />;
}

function TeamMini({ team }: { team: CompetitionMatch['homeTeam'] }) {
  const name = team?.name ?? 'A definir';
  return <div className="min-w-0">{team?.logoUrl ? <img src={team.logoUrl} alt="" className="mx-auto h-12 w-12 rounded-2xl border border-slate-200 bg-white object-cover shadow-sm" referrerPolicy="no-referrer" /> : <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50 text-xs font-black text-[#073B8C]">{name.slice(0, 2).toUpperCase()}</span>}<p className="mt-2 truncate text-xs font-black text-slate-900">{name}</p></div>;
}

function StatusBadge({ stats, loading }: { stats?: MatchStats; loading: boolean }) {
  if (loading) return <span className="text-[10px] font-bold text-slate-400">carregando…</span>;
  if (!stats) return <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Opcional</span>;
  const styles = { PENDING_APPROVAL: 'bg-amber-50 text-amber-700 border-amber-200', APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200', DISPUTED: 'bg-red-50 text-red-700 border-red-200', NONE: 'bg-slate-100 text-slate-500 border-slate-200' } as const;
  const labels = { PENDING_APPROVAL: 'Aguardando', APPROVED: 'Aprovadas', DISPUTED: 'Contestadas', NONE: 'Opcional' } as const;
  return <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${styles[stats.statsStatus]}`}>{labels[stats.statsStatus]}</span>;
}

function statsError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível atualizar as estatísticas.';
  if (error.code === 'INVALID_INPUT') return 'Confira os números informados. A posse precisa somar 100%.';
  if (error.code === 'STATS_AWAITING_REVIEW') return 'O adversário já enviou estatísticas. Aprove ou conteste.';
  if (error.code === 'STATS_HOST_REVIEW_REQUIRED') return 'A contestação agora depende do Host.';
  if (error.code === 'FORBIDDEN') return 'Você não pode alterar as estatísticas deste jogo.';
  return 'Não foi possível atualizar as estatísticas.';
}
