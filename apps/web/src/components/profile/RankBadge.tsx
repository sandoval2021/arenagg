import { Crown, Gem, Medal, Shield, Sparkles, Star } from 'lucide-react';
import { resolveRankLocally, type PlayerRank, type RankCode } from '../../lib/gamification-api';

const styles: Record<RankCode, string> = {
  BRONZE: 'from-orange-300 via-amber-600 to-orange-900 text-white ring-orange-200 shadow-orange-300/50',
  SILVER: 'from-white via-slate-300 to-slate-500 text-slate-900 ring-slate-200 shadow-slate-300/60',
  GOLD: 'from-yellow-200 via-amber-400 to-yellow-700 text-amber-950 ring-yellow-200 shadow-amber-300/70',
  PLATINUM: 'from-cyan-100 via-slate-200 to-cyan-500 text-slate-950 ring-cyan-200 shadow-cyan-300/70',
  DIAMOND: 'from-cyan-200 via-blue-400 to-violet-600 text-white ring-cyan-200 shadow-blue-400/70',
  LEGEND: 'from-fuchsia-400 via-violet-700 to-slate-950 text-white ring-fuchsia-300 shadow-violet-500/80',
  CHAVEA_PRO: 'from-amber-200 via-yellow-400 to-blue-700 text-white ring-amber-200 shadow-amber-400/90',
};

function RankIcon({ code, className = 'h-4 w-4' }: { code: RankCode; className?: string }) {
  if (code === 'CHAVEA_PRO') return <Crown className={className} />;
  if (code === 'LEGEND') return <Star className={className} />;
  if (code === 'DIAMOND') return <Gem className={className} />;
  if (code === 'GOLD' || code === 'PLATINUM') return <Medal className={className} />;
  return <Shield className={className} />;
}

export function RankBadge({ mmr, compact = false }: { mmr: number; compact?: boolean }) {
  const rank = resolveRankLocally(mmr);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-br font-black ring-2 ${styles[rank.code]} ${compact ? 'px-2 py-1 text-[9px]' : 'px-3 py-1.5 text-[10px]'} shadow-lg`}>
      <RankIcon code={rank.code} className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {rank.label}
      {rank.code === 'CHAVEA_PRO' && <Sparkles className="h-3 w-3" />}
    </span>
  );
}

export function RankEmblem({ rank, compact = false }: { rank: PlayerRank['rank']; compact?: boolean }) {
  return (
    <span title={`${rank.label} · ${rank.subtitle}`} className={`grid place-items-center rounded-full bg-gradient-to-br ring-2 ring-white ${styles[rank.code]} shadow-xl ${compact ? 'h-7 w-7' : 'h-9 w-9'}`}>
      <RankIcon code={rank.code} className={compact ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5'} />
    </span>
  );
}
