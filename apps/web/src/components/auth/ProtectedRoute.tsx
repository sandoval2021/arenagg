import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '../brand/Logo';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-white">
        <div className="animate-pulse"><Logo size="sm" /></div>
      </main>
    );
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
