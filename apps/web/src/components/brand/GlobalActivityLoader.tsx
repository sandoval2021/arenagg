import { useEffect, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';

/**
 * Background queries never mount an app-wide loader. Even explicit mutations
 * only get this tiny, pointer-events-none status pill so the current screen
 * remains fully interactive while data is being saved/refreshed.
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

    const timer = window.setTimeout(() => setVisible(true), 180);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!visible || !active) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(.75rem,env(safe-area-inset-top))] z-[140] flex justify-center px-3" aria-live="polite">
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-extrabold text-slate-600 shadow-lg backdrop-blur">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#073B8C]" />
        Salvando em segundo plano…
      </div>
    </div>
  );
}
