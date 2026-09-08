import { Home, Trophy, Gamepad2, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Início', icon: Home },
  { to: '/competitions', label: 'Copas', icon: Trophy },
  { to: '/matches', label: 'Jogos', icon: Gamepad2 },
  { to: '/profile', label: 'Perfil', icon: UserRound },
];

export function BottomNavigation() {
  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto grid h-16 max-w-lg grid-cols-4 px-2">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition ${isActive ? 'text-[#073B8C]' : 'text-slate-500 hover:text-slate-900'}`}>
            <Icon className="h-5 w-5" strokeWidth={2.2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
