import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function assert(condition, message) { if (!condition) throw new Error(message); }

{
  const path = 'apps/web/src/lib/api.ts';
  let source = read(path);
  const start = source.indexOf('function isSessionIssuingPath');
  const end = source.indexOf('\n  if (!response.ok)', start);
  assert(start >= 0 && end > start, 'apiRequest auth block markers not found');
  const replacement = `function isPublicApiPath(path: string): boolean {
  return path === '/api/auth/login' ||
    path === '/api/auth/register' ||
    path === '/api/auth/reset-password-dev';
}

async function fetchApi(path: string, init: RequestInit, headers: Headers): Promise<Response> {
  try {
    return await fetch(resolveRequestUrl(path), {
      ...init,
      headers,
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[api] network request failed', {
      path,
      apiUrl: import.meta.env.PROD ? window.location.origin : API_URL,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new ApiError(0, 'NETWORK_ERROR');
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const requiresBearer = !isPublicApiPath(path);
  let accessToken: string | null = null;
  if (requiresBearer) {
    try {
      accessToken = await getSupabaseAccessToken();
    } catch (error) {
      console.warn('[api] unable to read persisted Supabase session', {
        path,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new ApiError(401, 'UNAUTHORIZED');
    }
    if (!accessToken) throw new ApiError(401, 'UNAUTHORIZED');
    headers.set('Authorization', \`Bearer \${accessToken}\`);
  }

  let response = await fetchApi(path, init, headers);

  // One bounded refresh/replay handles a PWA resuming with an expired access
  // token while its refresh token is still safely persisted in localStorage.
  if (response.status === 401 && accessToken && requiresBearer) {
    try {
      const refreshedToken = await refreshSupabaseAccessToken();
      if (refreshedToken) {
        const retryHeaders = new Headers(headers);
        retryHeaders.set('Authorization', \`Bearer \${refreshedToken}\`);
        response = await fetchApi(path, init, retryHeaders);
      }
    } catch (refreshError) {
      console.warn('[api] bearer refresh failed', {
        path,
        message: refreshError instanceof Error ? refreshError.message : String(refreshError),
      });
    }
  }
`;
  source = source.slice(0, start) + replacement + source.slice(end);
  write(path, source);
}

{
  const path = 'apps/api/src/routes/auth.routes.ts';
  let source = read(path);
  source = source.replace('  getSessionUser,\n', '');

  const migrationStart = source.indexOf("auth.post('/migrate-cookie'");
  const meStart = source.indexOf("auth.get('/me'", migrationStart);
  assert(migrationStart >= 0 && meStart > migrationStart, 'migrate-cookie block markers not found');
  source = source.slice(0, migrationStart) + source.slice(meStart);

  const proxyStart = source.indexOf("auth.all('/supabase-proxy'");
  const googleStart = source.indexOf("auth.get('/google'", proxyStart);
  assert(proxyStart >= 0 && googleStart > proxyStart, 'supabase-proxy block markers not found');
  source = source.slice(0, proxyStart) + source.slice(googleStart);

  assert(!source.includes("getCookie(c, 'chavea_session')"), 'legacy session cookie is still read');
  assert(!source.includes('/supabase-proxy'), 'auth proxy route is still present');
  write(path, source);
}

{
  const path = 'apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx';
  let source = read(path);
  const intervalCount = (source.match(/refetchInterval: 12_000/g) ?? []).length;
  assert(intervalCount >= 2, 'expected live 12s intervals not found');
  source = source.replaceAll('refetchInterval: 12_000', 'refetchInterval: 3_000');
  source = source.replaceAll('staleTime: 8_000', 'staleTime: 1_000');
  write(path, source);
}

{
  const path = 'apps/web/src/pages/auth/RegisterPage.tsx';
  let source = read(path);
  const marker = "    case 'NETWORK_ERROR':\n      return 'Não foi possível conectar ao servidor do Chavea.';";
  assert(source.includes(marker), 'register error marker not found');
  source = source.replace(marker, `    case 'EMAIL_CONFIRMATION_REQUIRED':
      return 'Conta criada. Confirme seu e-mail ou telefone para concluir o acesso.';
    case 'AUTH_PROVIDER_ERROR':
      return 'O serviço de autenticação não respondeu. Tente novamente.';
${marker}`);
  write(path, source);
}

{
  const path = 'apps/web/src/pages/auth/LoginPage.tsx';
  let source = read(path);
  const marker = "    case 'INVALID_CREDENTIALS':\n      return 'E-mail, telefone ou senha inválidos.';";
  assert(source.includes(marker), 'login error marker not found');
  source = source.replace(marker, `${marker}
    case 'AUTH_PROVIDER_ERROR':
      return 'O serviço de autenticação não respondeu. Tente novamente.';`);
  write(path, source);
}
