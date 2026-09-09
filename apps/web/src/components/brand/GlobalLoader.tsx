import { Logo } from './Logo';

type GlobalLoaderProps = {
  label?: string;
  mode?: 'overlay' | 'screen' | 'section' | 'inline';
  className?: string;
};

/**
 * The branded Chavea logo is reserved for the single app-level overlay.
 * Local loading states intentionally render lightweight text/placeholders so
 * multiple concurrent queries cannot stack several logos on the same screen.
 */
export function GlobalLoader({
  label = 'Carregando…',
  mode = 'overlay',
  className = '',
}: GlobalLoaderProps) {
  if (mode === 'overlay') {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-white/80 px-5 backdrop-blur-sm ${className}`}
        role="status"
        aria-live="polite"
        aria-label={label || 'Chavea carregando'}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="animate-pulse opacity-90 [animation-duration:1.15s]">
            <Logo size="md" />
          </span>
          {label ? <span className="text-sm font-black text-slate-600">{label}</span> : null}
        </div>
      </div>
    );
  }

  if (mode === 'screen') {
    return (
      <main
        className={`grid min-h-dvh place-items-center bg-white px-5 text-slate-900 ${className}`}
        role="status"
        aria-live="polite"
      >
        <span className="text-sm font-black text-slate-500">{label}</span>
      </main>
    );
  }

  if (mode === 'section') {
    return (
      <div
        className={`grid min-h-24 place-items-center rounded-2xl bg-slate-50/80 px-4 py-5 ${className}`}
        role="status"
        aria-live="polite"
      >
        <span className="text-xs font-black text-slate-500">{label}</span>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center justify-center text-[11px] font-black ${className}`} role="status" aria-live="polite">
      {label}
    </span>
  );
}
