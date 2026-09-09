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
      className="pointer-events-none fixed left-1/2 top-1/2 z-[120] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-amber-200/80 bg-white/95 px-5 py-4 shadow-2xl shadow-slate-900/15 backdrop-blur"
      role="status"
      aria-label="Chavea carregando"
    >
      <span className="block animate-pulse opacity-90 [animation-duration:1.15s]">
        <Logo size="md" />
      </span>
    </div>
  );
}
