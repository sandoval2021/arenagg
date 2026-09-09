import { Logo } from './Logo';

type GlobalLoaderProps = {
  label?: string;
  mode?: 'screen' | 'section' | 'inline';
  className?: string;
};

export function GlobalLoader({
  label = 'Carregando…',
  mode = 'section',
  className = '',
}: GlobalLoaderProps) {
  const content = (
    <div
      className={`flex items-center justify-center ${mode === 'inline' ? 'gap-2' : 'flex-col gap-3'} ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="animate-pulse opacity-90 [animation-duration:1.15s]">
        <Logo size={mode === 'inline' ? 'sm' : 'md'} />
      </span>
      {label ? (
        <span className={`${mode === 'inline' ? 'text-[11px]' : 'text-sm'} font-black text-slate-500`}>
          {label}
        </span>
      ) : null}
    </div>
  );

  if (mode === 'screen') {
    return (
      <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900">
        {content}
      </main>
    );
  }

  if (mode === 'section') {
    return (
      <div className="grid min-h-32 place-items-center rounded-2xl bg-white/70 px-4 py-5">
        {content}
      </div>
    );
  }

  return content;
}
