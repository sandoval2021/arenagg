import { Home, Trophy, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Início', icon: Home },
  { to: '/competitions', label: 'Copas', icon: Trophy },
  { to: '/profile', label: 'Meu Perfil', icon: UserRound },
];

export function BottomNavigation() {
  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-50 border-t border-black/5 bg-white/90 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex min-h-12 min-w-24 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition active:scale-95 ${isActive ? 'bg-blue-50 text-[#073B8C]' : 'text-zinc-500'}`}>
            <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
