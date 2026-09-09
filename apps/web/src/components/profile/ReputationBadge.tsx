import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, Star } from 'lucide-react';
import { getReputationSummary } from '../../lib/phase-six-api';

export function ReputationBadge({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const reputation = useQuery({
    queryKey: ['reputation-summary', userId],
    queryFn: () => getReputationSummary(userId),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  if (!userId || reputation.isError) return null;
  if (reputation.isLoading) {
    return <span className="inline-flex h-7 w-24 animate-pulse rounded-full bg-slate-100" aria-label="Carregando reputação" />;
  }

  const data = reputation.data;
  if (!data) return null;
  const hasRiskSignal = data.tags.RAGE_QUITTER >= 2 || data.tags.TOXIC >= 2;
  const strongFairPlay = data.tags.FAIR_PLAY >= 2;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? '' : 'mt-2'}`}>
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-black shadow-sm ${data.count > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-500'} ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        <Star className={`h-3.5 w-3.5 ${data.count > 0 ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`} />
        {data.count > 0 ? `${data.average.toFixed(1)} · ${data.count} avaliações` : 'Novo no Fair Play'}
      </span>
      {strongFairPlay && (
        <span className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-black text-emerald-700 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
          <ShieldCheck className="h-3 w-3" /> Fair Play
        </span>
      )}
      {hasRiskSignal && (
        <span className={`inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 font-black text-rose-700 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
          <AlertTriangle className="h-3 w-3" /> Atenção ao Fair Play
        </span>
      )}
    </div>
  );
}
