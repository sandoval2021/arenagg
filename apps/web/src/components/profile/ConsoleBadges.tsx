import type { ConsoleTag } from '../../lib/social-api';

const tone: Record<ConsoleTag, string> = {
  PS5: 'border-blue-200 bg-blue-50 text-[#073B8C]',
  PS4: 'border-blue-200 bg-blue-50 text-blue-700',
  PS3: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  Xbox: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PC: 'border-slate-200 bg-slate-100 text-slate-700',
  Nintendo: 'border-red-200 bg-red-50 text-red-700',
  Outros: 'border-violet-200 bg-violet-50 text-violet-700',
};

export function ConsoleBadges({ consoles, compact = false }: { consoles: ConsoleTag[]; compact?: boolean }) {
  if (consoles.length === 0) return null;
  return (
    <div className={`flex flex-wrap ${compact ? 'gap-1' : 'gap-1.5'}`}>
      {consoles.map((consoleName) => (
        <span
          key={consoleName}
          className={`inline-flex items-center rounded-full border font-black ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'} ${tone[consoleName]}`}
        >
          {consoleName}
        </span>
      ))}
    </div>
  );
}
