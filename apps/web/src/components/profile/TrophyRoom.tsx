import { Crown, Flame, LockKeyhole, Medal, ShieldCheck, Sparkles, Target, Trophy, Users } from 'lucide-react';
import { ACHIEVEMENT_CATALOG, type AchievementCategory, type AchievementRarity } from '../../lib/achievement-catalog';
import type { GamerProfile } from '../../lib/social-api';

const categoryLabel: Record<AchievementCategory, string> = {
  EASY: 'Fácil',
  MEDIUM: 'Média',
  HARD: 'Difícil',
  LOYALTY: 'Lealdade',
};

const rarityStyle: Record<AchievementRarity, string> = {
  COMMON: 'border-slate-200 bg-slate-50 text-slate-600',
  RARE: 'border-blue-200 bg-blue-50 text-blue-700',
  EPIC: 'border-violet-200 bg-violet-50 text-violet-700',
  LEGENDARY: 'border-amber-200 bg-amber-50 text-amber-700',
};

function CategoryIcon({ category }: { category: AchievementCategory }) {
  if (category === 'LOYALTY') return <Users className="h-5 w-5" />;
  if (category === 'HARD') return <Crown className="h-5 w-5" />;
  if (category === 'MEDIUM') return <Target className="h-5 w-5" />;
  return <Medal className="h-5 w-5" />;
}

export function TrophyRoom({ badges }: { badges: GamerProfile['badges'] }) {
  const earned = new Set(badges.map((badge) => badge.badgeCode));

  return (
    <section className="mt-5 overflow-hidden rounded-[2rem] border border-amber-200 bg-white shadow-sm">
      <header className="relative overflow-hidden border-b border-amber-200 bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-100 px-4 py-5 sm:px-5">
        <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/60 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-amber-300 shadow-md"><Trophy className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-800">50 desafios Chavea</p>
            <h3 className="text-lg font-black text-slate-950">Sala de Troféus</h3>
          </div>
          <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-black text-amber-900">{earned.size}/50</span>
        </div>
      </header>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
        {ACHIEVEMENT_CATALOG.map((achievement) => {
          const unlocked = earned.has(achievement.code);
          return (
            <article
              key={achievement.code}
              className={unlocked
                ? 'relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-50 p-4 shadow-md shadow-amber-100'
                : 'rounded-3xl border border-slate-200 bg-slate-50 p-4 opacity-70'}
            >
              {unlocked && <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-amber-300/30 blur-2xl" />}
              <div className="relative flex items-start gap-3">
                <span className={unlocked
                  ? 'grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 shadow-lg shadow-amber-200'
                  : 'grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-200 text-slate-400'}
                >
                  {unlocked ? <CategoryIcon category={achievement.category} /> : <LockKeyhole className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1.5"><h4 className={unlocked ? 'text-sm font-black text-slate-950' : 'text-sm font-black text-slate-500'}>{achievement.title}</h4>{unlocked && <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />}</div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{achievement.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-slate-500">{categoryLabel[achievement.category]}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${rarityStyle[achievement.rarity]}`}>{achievement.rarity}</span>
                    <span className={unlocked ? 'ml-auto text-[8px] font-black uppercase tracking-wider text-amber-700' : 'ml-auto text-[8px] font-black uppercase tracking-wider text-slate-400'}>{unlocked ? 'Conquistado' : 'Bloqueado'}</span>
                  </div>
                </div>
              </div>
              {unlocked && achievement.rarity === 'LEGENDARY' && <Flame className="absolute bottom-2 right-2 h-4 w-4 text-orange-400/40" />}
            </article>
          );
        })}
      </div>

      <footer className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-bold text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />As conquistas são liberadas automaticamente pelos eventos validados da plataforma.</footer>
    </section>
  );
}
