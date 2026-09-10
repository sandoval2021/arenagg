import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Crown, Medal, Pencil, Save, Trophy, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import {
  getPhaseThreeCompetition,
  parsePrizeDistribution,
  updateCompetitionPrize,
} from '../../lib/phase-three-api';

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function parseCurrencyToCents(value: string): number | null {
  const cleaned = value.trim().replace(/[^\d,.-]/g, '');
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function allocatePrize(totalCents: number, percentages: number[]): number[] {
  const raw = percentages.map((percentage) => totalCents * percentage);
  const allocated = raw.map((value) => Math.floor(value / 100));
  let remainder = totalCents - allocated.reduce((sum, value) => sum + value, 0);

  const order = raw
    .map((value, index) => ({ index, remainder: value % 100 }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let index = 0; remainder > 0; index = (index + 1) % order.length) {
    allocated[order[index].index] += 1;
    remainder -= 1;
  }
  return allocated;
}

function prizeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível salvar a premiação.';
  if (error.code === 'HOST_ONLY') return 'Somente o Host pode alterar a premiação.';
  if (error.code === 'PRIZE_SETTINGS_LOCKED') return 'A premiação foi bloqueada porque a Copa já terminou.';
  if (error.code === 'INVALID_PRIZE_INPUT') return 'Confira o valor e deixe a divisão somando exatamente 100%.';
  return 'Não foi possível salvar a premiação.';
}

export function CompetitionPrizePanel() {
  const { competitionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [entryFeeInput, setEntryFeeInput] = useState('0,00');
  const [first, setFirst] = useState(60);
  const [second, setSecond] = useState(30);
  const [third, setThird] = useState(10);

  const competition = useQuery({
    queryKey: ['competition-operations', competitionId],
    queryFn: () => getPhaseThreeCompetition(competitionId),
    enabled: Boolean(competitionId),
  });
  const data = competition.data;

  useEffect(() => {
    if (!data || editing) return;
    const distribution = parsePrizeDistribution(data.prizeDistribution);
    setEntryFeeInput(centsToInput(data.entryFee ?? 0));
    setFirst(distribution.first);
    setSecond(distribution.second);
    setThird(distribution.third);
  }, [data, editing]);

  const save = useMutation({
    mutationFn: () => {
      const entryFee = parseCurrencyToCents(entryFeeInput);
      if (entryFee == null || first + second + third !== 100) {
        throw new ApiError(400, 'INVALID_PRIZE_INPUT');
      }
      return updateCompetitionPrize(competitionId, {
        entryFee,
        prizeDistribution: `${first},${second},${third}`,
      });
    },
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['competition-operations', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competitions', 'mine'] }),
      ]);
    },
  });

  const summary = useMemo(() => {
    if (!data) return null;
    const distribution = parsePrizeDistribution(data.prizeDistribution);
    const total = (data.entryFee ?? 0) * data.participations.length;
    const [champion, runnerUp, thirdPlace] = allocatePrize(total, [
      distribution.first,
      distribution.second,
      distribution.third,
    ]);
    return { distribution, total, champion, runnerUp, thirdPlace };
  }, [data]);

  if (!data || !summary) return null;
  const locked = data.status === 'FINISHED' || data.status === 'CANCELLED';

  return (
    <section className="mx-auto mt-5 max-w-5xl px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-50 p-5 shadow-lg shadow-amber-100/50">
        <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-200"><Coins className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-700">A caixinha da Copa</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Premiação</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{formatBRL(data.entryFee ?? 0)} por jogador · {data.participations.length} participantes</p>
          </div>
          {data.isHost && !locked && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200 bg-white text-amber-700 shadow-sm" aria-label="Editar premiação"><Pencil className="h-4 w-4" /></button>
          )}
        </div>

        {!editing ? (
          <div className="relative mt-5">
            <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-md">
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Prêmio Total</p>
              <p className="mt-1 text-3xl font-black">{formatBRL(summary.total)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">Arrecadação visual: inscrição × participantes ativos.</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <PrizeShare icon={Crown} label="Campeão" percent={summary.distribution.first} cents={summary.champion} />
              <PrizeShare icon={Trophy} label="Vice" percent={summary.distribution.second} cents={summary.runnerUp} />
              <PrizeShare icon={Medal} label="3º lugar" percent={summary.distribution.third} cents={summary.thirdPlace} />
            </div>
            {locked && data.isHost && <p className="mt-3 text-xs font-bold text-slate-400">Premiação congelada após o encerramento da Copa.</p>}
          </div>
        ) : (
          <div className="relative mt-5 rounded-3xl border border-amber-200 bg-white p-4">
            <label className="text-xs font-black uppercase tracking-wider text-slate-500">Valor da inscrição
              <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:border-amber-400">
                <span className="text-sm font-black text-slate-400">R$</span>
                <input value={entryFeeInput} onChange={(event) => setEntryFeeInput(event.target.value)} inputMode="decimal" className="min-h-12 min-w-0 flex-1 bg-transparent px-2 text-lg font-black outline-none" aria-label="Valor da inscrição" />
              </div>
            </label>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <PercentInput label="1º" value={first} onChange={setFirst} />
              <PercentInput label="2º" value={second} onChange={setSecond} />
              <PercentInput label="3º" value={third} onChange={setThird} />
            </div>
            <p className={`mt-2 text-xs font-black ${first + second + third === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>Divisão: {first + second + third}% de 100%</p>
            {save.isError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{prizeError(save.error)}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setEditing(false); save.reset(); }} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-black text-slate-600"><X className="h-4 w-4" />Cancelar</button>
              <button type="button" disabled={save.isPending || first + second + third !== 100} onClick={() => save.mutate()} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-amber-500 text-sm font-black text-white shadow-md disabled:opacity-40"><Save className="h-4 w-4" />{save.isPending ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PrizeShare({ icon: Icon, label, percent, cents }: { icon: typeof Crown; label: string; percent: number; cents: number }) {
  return <div className="rounded-2xl border border-amber-100 bg-white p-3 shadow-sm"><div className="flex items-center gap-2 text-amber-600"><Icon className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-wider">{label} · {percent}%</span></div><p className="mt-2 text-lg font-black text-slate-950">{formatBRL(cents)}</p></div>;
}

function PercentInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-center text-[10px] font-black uppercase tracking-wider text-slate-400">{label}<div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-2"><input type="number" inputMode="numeric" min={0} max={100} value={value} onChange={(event) => onChange(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} className="h-11 min-w-0 w-full bg-transparent text-center text-sm font-black outline-none" /><span className="text-xs font-black text-slate-400">%</span></div></label>;
}
