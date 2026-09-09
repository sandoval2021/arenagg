import { Trophy } from 'lucide-react';

type LogoSize = 'sm' | 'md' | 'lg';

type LogoProps = {
  size?: LogoSize;
  className?: string;
};

const sizeClasses: Record<LogoSize, { shell: string; trophy: string; name: string; bracket: string }> = {
  sm: {
    shell: 'h-6 w-6',
    trophy: 'h-4 w-4',
    name: 'text-lg',
    bracket: 'h-3.5 w-[4.75rem]',
  },
  md: {
    shell: 'h-9 w-9',
    trophy: 'h-6 w-6',
    name: 'text-3xl',
    bracket: 'h-5 w-[7.5rem]',
  },
  lg: {
    shell: 'h-12 w-12',
    trophy: 'h-8 w-8',
    name: 'text-5xl',
    bracket: 'h-6 w-[10.5rem]',
  },
};

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const sizing = sizeClasses[size];

  return (
    <span
      role="img"
      aria-label="Chavea"
      className={`inline-flex select-none flex-col items-center justify-center ${className}`}
    >
      <span className={`relative grid place-items-center ${sizing.shell}`} aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-yellow-300/35 blur-lg" />
        <Trophy className={`relative ${sizing.trophy} text-yellow-400 drop-shadow-lg`} strokeWidth={2.35} />
      </span>

      <span
        className={`bg-gradient-to-b from-yellow-200 via-yellow-500 to-yellow-700 bg-clip-text font-black leading-none tracking-tighter text-transparent drop-shadow-xl ${sizing.name}`}
        style={{
          WebkitTextStroke: '0.55px rgba(120, 53, 15, 0.72)',
          textShadow: '0 1px 0 rgba(255,255,255,.55), 0 3px 7px rgba(146,64,14,.26)',
        }}
      >
        CHAVEA
      </span>

      <span className={`relative mt-1 drop-shadow-lg ${sizing.bracket}`} aria-hidden="true">
        <span className="absolute left-0 top-0 h-[62%] w-[44%] rounded-tr-md border-r-2 border-t-2 border-amber-500/90" />
        <span className="absolute right-0 top-0 h-[62%] w-[44%] rounded-tl-md border-l-2 border-t-2 border-amber-500/90" />
        <span className="absolute left-[44%] right-[44%] top-[58%] border-t-2 border-amber-500/90" />
        <span className="absolute left-1/2 top-[58%] h-[42%] -translate-x-1/2 border-l-2 border-amber-600/95" />
        <span className="absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,.8)]" />
      </span>
    </span>
  );
}
