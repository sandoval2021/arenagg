import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { GlobalLoader } from './GlobalLoader';

export function GlobalActivityLoader() {
  // Only block the screen for initial requests that do not have usable data yet.
  // Background refetches must never leave the Chavea logo floating over a page
  // that has already rendered successfully.
  const initialFetches = useIsFetching({
    predicate: (query) => query.state.fetchStatus === 'fetching' && query.state.data === undefined,
  });
  const activeMutations = useIsMutating();
  const active = initialFetches + activeMutations > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 180);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!visible || !active) return null;

  return (
    <GlobalLoader
      mode="overlay"
      label={activeMutations > 0 ? 'Salvando…' : 'Carregando…'}
    />
  );
}
