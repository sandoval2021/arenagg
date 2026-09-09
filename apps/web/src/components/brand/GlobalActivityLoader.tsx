import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { Logo } from './Logo';

export function GlobalActivityLoader() {
  const active = useIsFetching() + useIsMutating() > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 180);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-[max(.65rem,env(safe-area-inset-top))] z-[120] -translate-x-1/2 rounded-2xl border border-amber-200/80 bg-white/95 px-3 py-2 shadow-xl shadow-slate-900/10 backdrop-blur"
      role="status"
      aria-label="Chavea carregando"
    >
      <span className="block animate-pulse opacity-90 [animation-duration:1.15s]">
        <Logo size="sm" />
      </span>
    </div>
  );
}
