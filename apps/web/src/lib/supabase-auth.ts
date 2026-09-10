const STORAGE_KEY = 'chavea.auth.session.v2';
const LEGACY_HINT_KEY = 'chaveaHasSession';

export type BrowserSessionEnvelope = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number | null;
  expiresIn: number;
  tokenType: string;
};

type StoredSession = {
  accessToken: string;
  expiresAt: number | null;
  tokenType: string;
};

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.accessToken !== 'string' || !parsed.accessToken.trim()) return null;
    const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : null;
    if (expiresAt && expiresAt <= Math.floor(Date.now() / 1000)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      expiresAt,
      tokenType: typeof parsed.tokenType === 'string' && parsed.tokenType ? parsed.tokenType : 'bearer',
    };
  } catch {
    return null;
  }
}

function clearLegacySupabaseArtifacts() {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (/^sb-.*-auth-token$/i.test(key) || key === LEGACY_HINT_KEY) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage may be unavailable in private/managed browsing modes.
  }
}

export async function persistSupabaseSession(session: BrowserSessionEnvelope): Promise<BrowserSessionEnvelope> {
  const normalized: StoredSession = {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    tokenType: session.tokenType || 'bearer',
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  clearLegacySupabaseArtifacts();
  return session;
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  return readStoredSession()?.accessToken ?? null;
}

export async function clearSupabaseSession(): Promise<void> {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    clearLegacySupabaseArtifacts();
  } catch {
    // The AuthProvider still resets React state and redirects to /login.
  }
}

export function readOAuthSessionFromLocation(): BrowserSessionEnvelope | null {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  if (params.get('type') !== 'oauth') return null;
  const accessToken = params.get('access_token');
  if (!accessToken) return null;

  const expiresAtRaw = Number(params.get('expires_at'));
  const expiresInRaw = Number(params.get('expires_in'));
  return {
    accessToken,
    refreshToken: '',
    expiresAt: Number.isFinite(expiresAtRaw) && expiresAtRaw > 0 ? expiresAtRaw : null,
    expiresIn: Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 30 * 24 * 60 * 60,
    tokenType: params.get('token_type') || 'bearer',
  };
}

export function clearOAuthFragment() {
  if (!window.location.hash) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}
