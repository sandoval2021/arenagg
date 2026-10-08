import { useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';

const AUTH_BOOTSTRAP_TIMEOUT_MS = 5_000;

function requiresAuth(pathname: string): boolean {
  return /^(\/dashboard|\/competitions|\/matches|\/ranking|\/profile|\/play|\/owner)(\/|$)/.test(pathname);
}

/**
 * Initial-auth guard. A user snapshot can paint a friendly shell, but it must
 * NOT suppress the five-second verification deadline for a protected route.
 *
 * The timer starts when the PWA mounts (not after Supabase's own retries).
 * A completed/validated session disables this guard; later background network
 * errors do not log out an otherwise validated user.
 */
export function AuthBootstrapEscape() {
  const auth = useAuth();
  const recoveryStarted = useRef(false);
  const verifiedRef = useRef(auth.isSessionVerified);
  const recoverRef = useRef(auth.forceLoginRecovery);
  verifiedRef.current = auth.isSessionVerified;
  recoverRef.current = auth.forceLoginRecovery;

  // A hard deadline measured from the first mount: React Query retries or
  // auth-state events must never reset the five-second escape window.
  useEffect(() => {
    if (!requiresAuth(window.location.pathname) || verifiedRef.current) return;
    const timer = window.setTimeout(() => {
      if (verifiedRef.current || recoveryStarted.current) return;
      recoveryStarted.current = true;
      recoverRef.current();
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!requiresAuth(window.location.pathname) || auth.isSessionVerified) return;

    const recover = () => {
      if (recoveryStarted.current) return;
      recoveryStarted.current = true;
      auth.forceLoginRecovery();
    };

    // Distinguish a server rejection / exhausted retry from the pending
    // bootstrap. Neither outcome is allowed to leave the user trapped.
    if (auth.hasBootstrapError || (!auth.isBootstrapping && !auth.isSessionVerified)) {
      recover();
      return;
    }

    // The mount-scoped watchdog above owns the absolute timeout.
  }, [auth.isSessionVerified, auth.isBootstrapping, auth.hasBootstrapError, auth.forceLoginRecovery]);

  return null;
}
