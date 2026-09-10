import { useQueryClient } from '@tanstack/react-query';
import { Gamepad2, Home, Medal, Trophy, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { getMyCompetitions } from '../../lib/api';
import { getAvailablePlayers, getMatchmakingChallenges, getMyAvailability } from '../../lib/matchmaking-api';
import { PRIMARY_NAV_STALE_TIME } from '../../lib/query-cache';
import { getGlobalRanking } from '../../lib/ranking-api';
import { getFriendRequests, getFriends, getMyGamerProfile } from '../../lib/social-api';

const items = [
  { to: '/dashboard', label: 'Início', icon: Home },
  { to: '/play', label: 'Jogar Agora', icon: Gamepad2 },
  { to: '/competitions', label: 'Copas', icon: Trophy },
  { to: '/ranking', label: 'Ranking', icon: Medal },
  { to: '/profile', label: 'Perfil', icon: UserRound },
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

    if (to === '/play') {
      void Promise.all([
        queryClient.prefetchQuery({
          queryKey: ['matchmaking', 'players', 'ALL'],
          queryFn: () => getAvailablePlayers('ALL'),
          staleTime: 5_000,
        }),
        queryClient.prefetchQuery({
          queryKey: ['matchmaking', 'availability'],
          queryFn: getMyAvailability,
          staleTime: 5_000,
        }),
        queryClient.prefetchQuery({
          queryKey: ['matchmaking', 'challenges'],
          queryFn: getMatchmakingChallenges,
          staleTime: 3_000,
        }),
      ]);
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

  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-50 border-t border-black/5 bg-white/90 px-1 pb-[max(.65rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:px-4">
      <div className="mx-auto flex max-w-lg items-center justify-around gap-0.5 sm:gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onPointerEnter={() => prefetch(to)}
            onTouchStart={() => prefetch(to)}
            onFocus={() => prefetch(to)}
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
