import { useState } from 'react';
import { ChevronDown, Plus, Target, Trash2 } from 'lucide-react';
import type { MatchScorerInput } from '../../lib/api';

export type ScorerDraft = MatchScorerInput;

function sideTotal(value: ScorerDraft[], side: ScorerDraft['side']): number {
  return value
    .filter((row) => row.side === side)
    .reduce((sum, row) => sum + (Number.isFinite(row.goals) ? row.goals : 0), 0);
}

export function validateScorerDrafts(
  value: ScorerDraft[],
  homeScore: number,
  awayScore: number,
): string | null {
  for (const row of value) {
    if (row.playerName.trim().length < 2) return 'Informe o nome do goleador ou remova a linha vazia.';
    if (!Number.isInteger(row.goals) || row.goals < 1 || row.goals > 99) {
      return 'A quantidade de gols de cada jogador deve ser entre 1 e 99.';
    }
  }

  const homeTotal = sideTotal(value, 'HOME');
  const awayTotal = sideTotal(value, 'AWAY');
  if (homeTotal > homeScore) return `Os goleadores do mandante somam ${homeTotal}, mas o placar é ${homeScore}.`;
  if (awayTotal > awayScore) return `Os goleadores do visitante somam ${awayTotal}, mas o placar é ${awayScore}.`;
  return null;
}

export function compactScorerDrafts(value: ScorerDraft[]): MatchScorerInput[] {
  return value.map((row) => ({
    side: row.side,
    playerName: row.playerName.trim(),
    goals: row.goals,
  }));
}

export function MatchScorersEditor({
  value,
  onChange,
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
}: {
  value: ScorerDraft[];
  onChange: (value: ScorerDraft[]) => void;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
}) {
  const [open, setOpen] = useState(false);
  const homeTotal = sideTotal(value, 'HOME');
  const awayTotal = sideTotal(value, 'AWAY');
  const validation = validateScorerDrafts(value, homeScore, awayScore);

  function add(side: ScorerDraft['side']) {
    onChange([...value, { side, playerName: '', goals: 1 }]);
    setOpen(true);
  }

  function update(index: number, patch: Partial<ScorerDraft>) {
    onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    onChange(value.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-yellow-50/70 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-12 w-full items-center gap-3 px-3.5 text-left"
        aria-expanded={open}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><Target className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-black text-slate-900">Goleadores <span className="font-bold text-slate-400">(Opcional)</span></span>
          <span className="block text-[10px] font-semibold text-slate-500">Informe quem marcou. Pode deixar incompleto.</span>
        </span>
        {value.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">{homeTotal + awayTotal} gols</span>}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-amber-100 p-3">
          <ScorerSide
            side="HOME"
            teamName={homeTeamName}
            score={homeScore}
            total={homeTotal}
            value={value}
            onAdd={() => add('HOME')}
            onUpdate={update}
            onRemove={remove}
          />
          <div className="my-3 h-px bg-amber-100" />
          <ScorerSide
            side="AWAY"
            teamName={awayTeamName}
            score={awayScore}
            total={awayTotal}
            value={value}
            onAdd={() => add('AWAY')}
            onUpdate={update}
            onRemove={remove}
          />

          {validation && value.length > 0 && (
            <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{validation}</p>
          )}
          <p className="mt-3 text-[10px] font-semibold leading-4 text-slate-400">
            A soma pode ser menor que o placar porque a artilharia é opcional, mas nunca pode ultrapassá-lo.
          </p>
        </div>
      )}
    </section>
  );
}

function ScorerSide({
  side,
  teamName,
  score,
  total,
  value,
  onAdd,
  onUpdate,
  onRemove,
}: {
  side: ScorerDraft['side'];
  teamName: string;
  score: number;
  total: number;
  value: ScorerDraft[];
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<ScorerDraft>) => void;
  onRemove: (index: number) => void;
}) {
  const rows = value.map((row, index) => ({ row, index })).filter(({ row }) => row.side === side);
  const atLimit = total >= score;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-black text-slate-700">{teamName}</p>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${total > score ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{total}/{score}</span>
      </div>

      <div className="mt-2 space-y-2">
        {rows.map(({ row, index }) => (
          <div key={`${side}:${index}`} className="grid grid-cols-[minmax(0,1fr)_64px_36px] gap-2">
            <input
              value={row.playerName}
              onChange={(event) => onUpdate(index, { playerName: event.target.value })}
              maxLength={60}
              placeholder="Ex.: Vini Jr"
              className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 outline-none placeholder:text-slate-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              aria-label={`Gols de ${row.playerName || 'jogador'}`}
              value={row.goals}
              onChange={(event) => onUpdate(index, { goals: Math.min(99, Math.max(1, Number(event.target.value) || 1)) })}
              className="h-10 rounded-xl border border-slate-200 bg-white text-center text-sm font-black text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            <button type="button" onClick={() => onRemove(index)} aria-label="Remover goleador" className="grid h-10 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={score <= 0 || atLimit}
        className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 text-[10px] font-black text-amber-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar goleador
      </button>
    </div>
  );
}
