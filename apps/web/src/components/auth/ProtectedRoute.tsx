import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

function InstantAppShell() {
  return (
    <main className="min-h-dvh bg-white text-slate-900">
      <header className="border-b border-slate-100 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <span className="text-lg font-black tracking-tight text-[#073B8C]">Chavea</span>
          <span className="h-9 w-9 rounded-full bg-slate-100" aria-hidden="true" />
        </div>
      </header>
      <section className="mx-auto max-w-lg space-y-3 px-4 py-4" aria-label="Abrindo Chavea">
        <div className="h-20 rounded-2xl bg-slate-50" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 rounded-2xl bg-slate-50" />
          <div className="h-24 rounded-2xl bg-slate-50" />
        </div>
      </section>
      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-100 bg-white px-4 pb-[max(.65rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-2">
          {Array.from({ length: 5 }, (_, index) => <span key={index} className="mx-auto h-8 w-8 rounded-xl bg-slate-50" />)}
        </div>
      </nav>
    </main>
  );
}

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isAuthenticated) return <Outlet />;

  // Existing installations may have the old boolean session hint but no user
  // snapshot yet. Show the shell immediately while the single background /me
  // request upgrades the local snapshot; never show a blocking spinner/timer.
  if (auth.hasKnownSession && (auth.isBootstrapping || auth.hasBootstrapError)) {
    return <InstantAppShell />;
  }

  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
