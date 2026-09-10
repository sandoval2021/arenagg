import { Gamepad2, Home, Medal, Trophy, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/dashboard', label: 'Início', icon: Home },
  { to: '/play', label: 'Jogar Agora', icon: Gamepad2 },
  { to: '/competitions', label: 'Copas', icon: Trophy },
  { to: '/ranking', label: 'Ranking', icon: Medal },
  { to: '/profile', label: 'Perfil', icon: UserRound },
] as const;

export function BottomNavigation() {
  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-50 border-t border-black/5 bg-white/90 px-1 pb-[max(.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:px-4">
      <div className="mx-auto flex max-w-lg items-center justify-around gap-0.5 sm:gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-[8px] font-bold transition active:scale-95 min-[380px]:text-[9px] sm:text-[11px] ${isActive ? 'bg-blue-50 text-[#073B8C]' : 'text-zinc-500'}`}
          >
            <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
