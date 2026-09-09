import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Home, Medal, Trophy, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { getMyCompetitions } from '../../lib/api';
import { PRIMARY_NAV_STALE_TIME } from '../../lib/query-cache';
import { getGlobalRanking } from '../../lib/ranking-api';
import { getFriendRequests, getFriends, getMyGamerProfile } from '../../lib/social-api';

const items = [
  { to: '/dashboard', label: 'Início', icon: Home },
  { to: '/competitions', label: 'Copas', icon: Trophy },
  { to: '/ranking', label: 'Ranking', icon: Medal },
  { to: '/profile', label: 'Meu Perfil', icon: UserRound },
] as const;

type PrimaryRoute = (typeof items)[number]['to'];

export function BottomNavigation() {
  const queryClient = useQueryClient();

  function prefetch(to: PrimaryRoute) {
    if (to === '/dashboard' || to === '/competitions') {
      void queryClient.prefetchQuery({
        queryKey: ['competitions', 'mine'],
        queryFn: getMyCompetitions,
        staleTime: PRIMARY_NAV_STALE_TIME,
      });
      return;
    }

    if (to === '/ranking') {
      void queryClient.prefetchQuery({
        queryKey: ['global-ranking'],
        queryFn: getGlobalRanking,
        staleTime: 30_000,
      });
      return;
    }

    void Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['gamer-profile', 'me'],
        queryFn: getMyGamerProfile,
        staleTime: PRIMARY_NAV_STALE_TIME,
      }),
      queryClient.prefetchQuery({
        queryKey: ['friends'],
        queryFn: getFriends,
        staleTime: PRIMARY_NAV_STALE_TIME,
      }),
      queryClient.prefetchQuery({
        queryKey: ['friend-requests'],
        queryFn: getFriendRequests,
        staleTime: PRIMARY_NAV_STALE_TIME,
      }),
    ]);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      prefetch('/dashboard');
      prefetch('/ranking');
      prefetch('/profile');
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryClient]);

  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-50 border-t border-black/5 bg-white/90 px-2 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:px-4">
      <div className="mx-auto flex max-w-lg items-center justify-around gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onPointerEnter={() => prefetch(to)}
            onTouchStart={() => prefetch(to)}
            onFocus={() => prefetch(to)}
            className={({ isActive }) => `flex min-h-12 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold transition active:scale-95 sm:text-[11px] ${isActive ? 'bg-blue-50 text-[#073B8C]' : 'text-zinc-500'}`}
          >
            <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
