import { Gamepad2, LockKeyhole, ShieldCheck, Sparkles, Target, Trophy } from 'lucide-react';
import type { BadgeCode, GamerProfile } from '../../lib/social-api';

const ACHIEVEMENTS: Array<{
  code: BadgeCode;
  title: string;
  description: string;
  icon: typeof Gamepad2;
}> = [
  {
    code: 'FIRST_MATCH',
    title: 'O Início',
    description: 'Finalizou a primeira partida no Chavea.',
    icon: Gamepad2,
  },
  {
    code: 'RELENTLESS_SCORER',
    title: 'Goleador Implacável',
    description: 'Marcou 5 ou mais gols em uma única partida.',
    icon: Target,
  },
  {
    code: 'WALL',
    title: 'Muralha',
    description: 'Venceu uma partida sem sofrer gols.',
    icon: ShieldCheck,
  },
];

export function TrophyRoom({ badges }: { badges: GamerProfile['badges'] }) {
  const earned = new Set(badges.map((badge) => badge.badgeCode));

  return (
    <section className="mt-5 overflow-hidden rounded-[2rem] border border-amber-200 bg-white shadow-sm">
      <header className="relative overflow-hidden border-b border-amber-200 bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-100 px-4 py-5 sm:px-5">
        <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/60 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-amber-300 shadow-md"><Trophy className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-800">Conquistas</p>
            <h3 className="text-lg font-black text-slate-950">Sala de Troféus</h3>
          </div>
          <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-black text-amber-900">{earned.size}/{ACHIEVEMENTS.length}</span>
        </div>
      </header>

      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        {ACHIEVEMENTS.map((achievement) => {
          const unlocked = earned.has(achievement.code);
          const Icon = achievement.icon;
          return (
            <article
              key={achievement.code}
              className={unlocked
                ? 'relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-50 p-4 shadow-md shadow-amber-100'
                : 'rounded-3xl border border-slate-200 bg-slate-50 p-4 opacity-70'}
            >
              {unlocked && <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-amber-300/30 blur-2xl" />}
              <div className="relative flex items-start gap-3 sm:block">
                <span className={unlocked
                  ? 'grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 shadow-lg shadow-amber-200'
                  : 'grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-200 text-slate-400'}
                >
                  {unlocked ? <Icon className="h-6 w-6" /> : <LockKeyhole className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1 sm:mt-3">
                  <div className="flex items-center gap-1.5">
                    <h4 className={unlocked ? 'text-sm font-black text-slate-950' : 'text-sm font-black text-slate-500'}>{achievement.title}</h4>
                    {unlocked && <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{achievement.description}</p>
                  <p className={unlocked ? 'mt-2 text-[9px] font-black uppercase tracking-wider text-amber-700' : 'mt-2 text-[9px] font-black uppercase tracking-wider text-slate-400'}>
                    {unlocked ? 'Conquistado' : 'Bloqueado'}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
