import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  // AuthProvider exposes the persisted Supabase session synchronously. Do not
  // insert a second loading gate here; a real 401 flips isAuthenticated false.
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
