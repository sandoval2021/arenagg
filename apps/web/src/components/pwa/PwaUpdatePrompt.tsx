import { RefreshCw, Rocket, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] mx-auto max-w-lg rounded-3xl border border-white/10 bg-slate-950/95 p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-xl"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/20">
          <Rocket className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">🚀 Nova versão do Chavea disponível!</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-300">
            Atualize quando estiver pronto. Sua navegação não será interrompida automaticamente.
          </p>
        </div>
        <button
          type="button"
          aria-label="Lembrar depois"
          onClick={() => setNeedRefresh(false)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 shadow-md transition active:scale-[.99]"
      >
        <RefreshCw className="h-4 w-4" />
        Atualizar Agora
      </button>
    </aside>
  );
}
