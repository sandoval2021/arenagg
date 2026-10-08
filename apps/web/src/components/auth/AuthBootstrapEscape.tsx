import { useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';

const AUTH_BOOTSTRAP_TIMEOUT_MS = 5_000;

/**
 * Fail closed only during the initial protected-route bootstrap.
 *
 * Once /auth/me has produced data, background polling/refetch failures never
 * trigger this guard. That distinction prevents a temporary 5G/Wi-Fi wobble
 * from ejecting an already active user from a competition.
 */
export function AuthBootstrapEscape() {
  const auth = useAuth();
  const recoveryStarted = useRef(false);

  useEffect(() => {
    // A cached, already-authenticated user must never lose their refresh token
    // because /auth/me took longer than five seconds on mobile data.
    // Protected Worker calls still require a valid Bearer JWT.
    if (auth.isAuthenticated) return;
    if (!auth.isBootstrapping && !auth.hasBootstrapError) return;

    const recover = () => {
      if (recoveryStarted.current) return;
      recoveryStarted.current = true;
      auth.forceLoginRecovery();
    };

    if (auth.hasBootstrapError) {
      recover();
      return;
    }

    const timer = window.setTimeout(recover, AUTH_BOOTSTRAP_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [auth.isAuthenticated, auth.isBootstrapping, auth.hasBootstrapError, auth.forceLoginRecovery]);

  return null;
}
