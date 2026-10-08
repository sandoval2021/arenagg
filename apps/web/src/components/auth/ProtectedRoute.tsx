import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.isAuthenticated && auth.isBootstrapping) {
    return <main className="min-h-dvh bg-white" aria-label="Verificando sua sessão" />;
  }
  if (!auth.isAuthenticated && !auth.hasPersistedSession) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
