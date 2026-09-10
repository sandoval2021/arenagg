import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export const COMPETITION_LIVE_POLL_MS = 3_000;

export function useCompetitionLivePolling(competitionId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!competitionId) return;

    const refetchLiveState = () => {
      void Promise.all([
        queryClient.refetchQueries({ queryKey: ['competition', competitionId], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['standings', competitionId], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['match-stats', competitionId], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['group-stage', competitionId], type: 'active' }),
      ]);
    };

    const timer = window.setInterval(refetchLiveState, COMPETITION_LIVE_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetchLiveState();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [competitionId, queryClient]);
}
