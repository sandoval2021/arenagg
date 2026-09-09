import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronRight,
  Crown,
  Flame,
  Gem,
  Goal,
  LockKeyhole,
  Medal,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  ACHIEVEMENT_CATALOG,
  type AchievementCategory,
  type AchievementRarity,
} from '../../lib/achievement-catalog';
import type { GamerProfile } from '../../lib/social-api';

const FEATURED_LIMIT = 12;

type Achievement = (typeof ACHIEVEMENT_CATALOG)[number];

const categoryLabel: Record<AchievementCategory, string> = {
  EASY: 'Fácil',
  MEDIUM: 'Média',
  HARD: 'Difícil',
  LOYALTY: 'Lealdade',
};

const rarityLabel: Record<AchievementRarity, string> = {
  COMMON: 'Comum',
  RARE: 'Rara',
  EPIC: 'Épica',
  LEGENDARY: 'Lendária',
};

const rarityPill: Record<AchievementRarity, string> = {
  COMMON: 'border-slate-200 bg-slate-50 text-slate-600',
  RARE: 'border-blue-200 bg-blue-50 text-blue-700',
  EPIC: 'border-violet-200 bg-violet-50 text-violet-700',
  LEGENDARY: 'border-amber-200 bg-amber-50 text-amber-700',
};

const unlockedTile: Record<AchievementRarity, string> = {
  COMMON: 'border-yellow-300 bg-gradient-to-br from-yellow-200 via-amber-300 to-orange-400 text-amber-950 shadow-amber-300/70 ring-1 ring-yellow-200',
  RARE: 'border-amber-300 bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 text-amber-950 shadow-amber-400/70 ring-1 ring-yellow-300',
  EPIC: 'border-orange-300 bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-600 text-white shadow-orange-400/70 ring-1 ring-amber-300',
  LEGENDARY: 'border-yellow-300 bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-600 text-white shadow-amber-500/80 ring-2 ring-yellow-300',
};

function AchievementIcon({ achievement, className = 'h-6 w-6' }: { achievement: Achievement; className?: string }) {
  if (achievement.code.includes('GOAL') || achievement.code.includes('SCORER') || achievement.code === 'HAT_TRICK') {
    return <Goal className={className} />;
  }
  if (achievement.code.includes('WIN_STREAK') || achievement.code === 'EPIC_COMEBACK') {
    return <Flame className={className} />;
  }
  if (achievement.code.includes('MMR') || achievement.code === 'WINS_100') {
    return <Gem className={className} />;
  }
  if (achievement.code.includes('CHAMPION') || achievement.code.includes('HOST')) {
    return <Crown className={className} />;
  }
  if (achievement.code.includes('FRIEND') || achievement.code.includes('SOCIAL') || achievement.category === 'LOYALTY') {
    return <Users className={className} />;
  }
  if (achievement.code.includes('WALL') || achievement.code.includes('CLEAN') || achievement.code.includes('SHUTOUT')) {
    return <ShieldCheck className={className} />;
  }
  if (achievement.code.includes('CLIP') || achievement.code.includes('CHECKIN')) {
    return <Zap className={className} />;
  }
  if (achievement.category === 'HARD') return <Star className={className} />;
  if (achievement.category === 'MEDIUM') return <Target className={className} />;
  return <Medal className={className} />;
}

function formatEarnedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Conquistado';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function TrophyRoom({ badges }: { badges: GamerProfile['badges'] }) {
  const [selected, setSelected] = useState<Achievement | null>(null);
  const [showAll, setShowAll] = useState(false);

  const earnedAt = useMemo(
    () => new Map<string, string>(badges.map((badge) => [badge.badgeCode, badge.awardedAt])),
    [badges],
  );

  const featured = useMemo(() => {
    const recentEarned = [...badges]
      .sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime())
      .map((badge) => ACHIEVEMENT_CATALOG.find((achievement) => achievement.code === badge.badgeCode))
      .filter((achievement): achievement is Achievement => Boolean(achievement));

    const nextEasy = ACHIEVEMENT_CATALOG.filter(
      (achievement) => !earnedAt.has(achievement.code) && achievement.category === 'EASY',
    );
    const nextMedium = ACHIEVEMENT_CATALOG.filter(
      (achievement) => !earnedAt.has(achievement.code) && achievement.category === 'MEDIUM',
    );

    const unique = new Map<string, Achievement>();
    for (const achievement of [...recentEarned, ...nextEasy, ...nextMedium, ...ACHIEVEMENT_CATALOG]) {
      if (!unique.has(achievement.code)) unique.set(achievement.code, achievement);
      if (unique.size === FEATURED_LIMIT) break;
    }
    return [...unique.values()];
  }, [badges, earnedAt]);

  useEffect(() => {
    if (!showAll && !selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [showAll, selected]);

  const earnedCount = earnedAt.size;

  return (
    <>
      <section className="mt-5 overflow-hidden rounded-[2rem] border border-amber-200 bg-white shadow-sm">
        <header className="relative overflow-hidden border-b border-amber-200 bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-100 px-4 py-4 sm:px-5">
          <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/60 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-amber-300 shadow-md">
              <Trophy className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-800">Conquistas</p>
              <h3 className="text-lg font-black text-slate-950">Sala de Troféus</h3>
            </div>
            <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-black text-amber-900 shadow-sm">
              {earnedCount}/50
            </span>
          </div>
        </header>

        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-slate-900">Destaques e próximos desafios</p>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-400">Toque em um ícone para ver os detalhes.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="flex shrink-0 items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-800 transition active:scale-95"
            >
              Ver todas <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="grid w-max grid-flow-col grid-rows-2 gap-2.5 pr-4 [grid-auto-columns:3.75rem] sm:grid-rows-1 sm:[grid-auto-columns:4rem]">
              {featured.map((achievement) => (
                <AchievementTile
                  key={achievement.code}
                  achievement={achievement}
                  unlocked={earnedAt.has(achievement.code)}
                  onClick={() => setSelected(achievement)}
                />
              ))}
            </div>
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] font-bold text-slate-500">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          {50 - earnedCount > 0 ? `${50 - earnedCount} conquistas ainda podem ser desbloqueadas.` : 'Você desbloqueou todas as conquistas do Chavea.'}
        </footer>
      </section>

      {showAll && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Todas as conquistas">
          <header className="shrink-0 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 shadow-md">
                <Trophy className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-700">Coleção completa</p>
                <h3 className="text-lg font-black text-slate-950">50 Conquistas</h3>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">{earnedCount}/50</span>
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700"
                aria-label="Fechar conquistas"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto grid max-w-lg grid-cols-5 gap-2.5 sm:grid-cols-6 sm:gap-3">
              {ACHIEVEMENT_CATALOG.map((achievement) => (
                <AchievementTile
                  key={achievement.code}
                  achievement={achievement}
                  unlocked={earnedAt.has(achievement.code)}
                  onClick={() => setSelected(achievement)}
                  compact
                />
              ))}
            </div>
            <p className="mx-auto mt-5 max-w-lg text-center text-[10px] font-semibold leading-4 text-slate-400">
              Dourado = conquistado. Cinza = ainda bloqueado. Toque em qualquer ícone para saber como liberar.
            </p>
          </div>
        </div>
      )}

      {selected && (
        <AchievementSheet
          achievement={selected}
          earnedAt={earnedAt.get(selected.code)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function AchievementTile({
  achievement,
  unlocked,
  onClick,
  compact = false,
}: {
  achievement: Achievement;
  unlocked: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${achievement.title} — ${unlocked ? 'conquistado' : 'bloqueado'}`}
      className={`relative grid aspect-square w-full place-items-center overflow-visible rounded-2xl border transition active:scale-90 ${
        unlocked
          ? `${unlockedTile[achievement.rarity]} shadow-lg`
          : 'border-slate-200 bg-slate-100 text-slate-400 opacity-65 shadow-inner'
      } ${compact ? 'min-h-0' : 'h-[3.75rem] w-[3.75rem] sm:h-16 sm:w-16'}`}
    >
      {unlocked && (
        <>
          <span className="pointer-events-none absolute inset-1 rounded-xl bg-gradient-to-br from-white/45 via-transparent to-orange-500/15" />
          <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-20 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-emerald-500 text-white shadow-md shadow-emerald-300/70 sm:h-5.5 sm:w-5.5">
            <CheckCircle2 className="h-3.5 w-3.5 fill-emerald-500 text-white" strokeWidth={3} />
          </span>
          {achievement.rarity === 'LEGENDARY' && <Sparkles className="pointer-events-none absolute bottom-1 right-1 h-3 w-3 text-yellow-50 drop-shadow" />}
        </>
      )}
      <AchievementIcon achievement={achievement} className={compact ? 'relative z-10 h-5 w-5 sm:h-6 sm:w-6' : 'relative z-10 h-6 w-6'} />
      {!unlocked && (
        <span className="absolute bottom-1 right-1 grid h-4 w-4 place-items-center rounded-full border border-white bg-slate-500 text-white shadow-sm">
          <LockKeyhole className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );
}

function AchievementSheet({
  achievement,
  earnedAt,
  onClose,
}: {
  achievement: Achievement;
  earnedAt?: string;
  onClose: () => void;
}) {
  const unlocked = Boolean(earnedAt);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 px-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={achievement.title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full rounded-t-[2rem] border border-white/60 bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl sm:max-w-md sm:rounded-[2rem] sm:p-6">
        <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
        <div className="mt-4 flex items-start gap-4 sm:mt-0">
          <div className={`relative grid h-20 w-20 shrink-0 place-items-center rounded-[1.5rem] border ${unlocked ? `${unlockedTile[achievement.rarity]} shadow-xl` : 'border-slate-200 bg-slate-100 text-slate-400'}`}>
            {unlocked && <span className="pointer-events-none absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-emerald-500 text-white shadow-md"><CheckCircle2 className="h-5 w-5 fill-emerald-500 text-white" strokeWidth={3} /></span>}
            <AchievementIcon achievement={achievement} className="h-9 w-9" />
            {!unlocked && <span className="absolute bottom-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-slate-500 text-white"><LockKeyhole className="h-3 w-3" /></span>}
            {unlocked && achievement.rarity === 'LEGENDARY' && <Sparkles className="absolute bottom-2 right-2 h-4 w-4 text-yellow-50 drop-shadow" />}
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Conquista Chavea</p>
                <h3 className="mt-1 text-xl font-black leading-tight text-slate-950">{achievement.title}</h3>
              </div>
              <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600" aria-label="Fechar detalhes">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm font-semibold leading-5 text-slate-500">{achievement.description}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <InfoBox icon={<Target className="h-4 w-4" />} label="Dificuldade" value={categoryLabel[achievement.category]} />
          <InfoBox icon={<Award className="h-4 w-4" />} label="Raridade" value={rarityLabel[achievement.rarity]} className={rarityPill[achievement.rarity]} />
        </div>

        <div className={`mt-3 flex items-center gap-3 rounded-2xl border p-4 ${unlocked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${unlocked ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
            {unlocked ? <CheckCircle2 className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-[10px] font-black uppercase tracking-[.15em] ${unlocked ? 'text-emerald-700' : 'text-slate-400'}`}>Status</p>
            <p className={`mt-0.5 text-sm font-black ${unlocked ? 'text-emerald-900' : 'text-slate-700'}`}>
              {unlocked && earnedAt ? `Conquistado em ${formatEarnedDate(earnedAt)}` : 'Bloqueado — complete o desafio para liberar'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoBox({
  icon,
  label,
  value,
  className = 'border-slate-200 bg-slate-50 text-slate-700',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${className}`}>
      <div className="flex items-center gap-1.5 opacity-70">{icon}<span className="text-[9px] font-black uppercase tracking-wider">{label}</span></div>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}
