import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export const COMPETITION_LIVE_POLL_MS = 3_000;

export function useCompetitionLivePolling(competitionId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!competitionId) return;

    let inFlight = false;

    const refetchLiveState = async () => {
      if (inFlight || !navigator.onLine || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        await Promise.allSettled([
          queryClient.refetchQueries(
            { queryKey: ['competition', competitionId], type: 'active' },
            { cancelRefetch: false },
          ),
          queryClient.refetchQueries(
            { queryKey: ['standings', competitionId], type: 'active' },
            { cancelRefetch: false },
          ),
          queryClient.refetchQueries(
            { queryKey: ['match-stats', competitionId], type: 'active' },
            { cancelRefetch: false },
          ),
          queryClient.refetchQueries(
            { queryKey: ['group-stage', competitionId], type: 'active' },
            { cancelRefetch: false },
          ),
        ]);
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(() => void refetchLiveState(), COMPETITION_LIVE_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refetchLiveState();
    };
    const onOnline = () => void refetchLiveState();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline, { passive: true });

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [competitionId, queryClient]);
}
