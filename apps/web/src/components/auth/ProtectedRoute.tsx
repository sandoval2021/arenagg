import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { GlobalLoader } from '../brand/GlobalLoader';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return <GlobalLoader mode="screen" label="Restaurando sua sessão…" />;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
