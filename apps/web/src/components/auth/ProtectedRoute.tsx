import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  // Fast-start policy: AuthProvider exposes the synchronous local session hint
  // immediately. A background /auth/me validation can revoke it and this route
  // will then redirect without ever blocking the first paint on a spinner.
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
