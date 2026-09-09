import { useEffect, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { GlobalLoader } from './GlobalLoader';

/**
 * Query navigation never blocks the whole screen. Pages render cached data
 * immediately and refresh silently in the background. The app-wide Chavea
 * overlay is reserved for explicit mutations; the initial auth bootstrap has
 * its own branded screen loader in AuthProvider/ProtectedRoute.
 */
export function GlobalActivityLoader() {
  const activeMutations = useIsMutating();
  const active = activeMutations > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 140);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!visible || !active) return null;

  return <GlobalLoader mode="overlay" label="Salvando…" />;
}
