import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react';

export type MatchUiStatus = 'PENDING' | 'AWAITING_APPROVAL' | 'DISPUTED' | 'FINISHED' | 'CANCELED';

export interface MatchCardProps {
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  status: MatchUiStatus;
  canReview?: boolean;
  onOpen?: () => void;
  onApprove?: () => void;
  onDispute?: () => void;
}

const statusCopy = {
  PENDING: { label: 'Aguardando placar', className: 'bg-zinc-100 text-zinc-700', icon: Clock3 },
  AWAITING_APPROVAL: { label: 'Aguardando adversário', className: 'bg-amber-50 text-amber-700', icon: ShieldAlert },
  DISPUTED: { label: 'Placar contestado', className: 'bg-red-50 text-[#E31B23]', icon: AlertTriangle },
  FINISHED: { label: 'Finalizado', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  CANCELED: { label: 'Cancelado', className: 'bg-zinc-100 text-zinc-500', icon: AlertTriangle },
};

export function MatchCard({ homeTeam, awayTeam, homeScore, awayScore, status, canReview, onOpen, onApprove, onDispute }: MatchCardProps) {
  const meta = statusCopy[status];
  const StatusIcon = meta.icon;
  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${status === 'DISPUTED' ? 'border-red-200' : 'border-black/5'}`}>
      <div className="flex items-center justify-between gap-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${meta.className}`}><StatusIcon className="h-3.5 w-3.5" />{meta.label}</span>{status === 'DISPUTED' && <span className="text-[11px] font-black text-[#E31B23]">Aguardando Host</span>}</div>
      <button type="button" onClick={onOpen} className="mt-4 grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 text-left">
        <strong className="truncate text-sm font-black">{homeTeam}</strong><span className="rounded-xl bg-zinc-50 px-3 py-2 text-lg font-black tabular-nums">{homeScore ?? '–'} <span className="text-zinc-300">×</span> {awayScore ?? '–'}</span><strong className="truncate text-right text-sm font-black">{awayTeam}</strong>
      </button>
      {status === 'AWAITING_APPROVAL' && canReview && <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={onDispute} className="min-h-11 rounded-xl border border-red-200 bg-red-50 text-sm font-black text-[#E31B23]">Contestar</button><button type="button" onClick={onApprove} className="min-h-11 rounded-xl bg-[#073B8C] text-sm font-black text-white shadow-sm">Aprovar</button></div>}
    </article>
  );
}
