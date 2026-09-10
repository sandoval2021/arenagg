import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  // Zero-latency bootstrap: a persisted Supabase session is enough to render
  // the protected shell while /auth/me validates in the background. Backend
  // authorization still requires the Bearer JWT on every protected request.
  if (!auth.isAuthenticated && !auth.hasPersistedSession) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
