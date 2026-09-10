from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'Expected patch target not found in {path}')
    p.write_text(text.replace(old, new, 1))


# Prisma: stable mapping between Supabase auth.users.id and the existing Chavea User.
replace_once(
    'prisma/schema.prisma',
    '  role                         UserRole                 @default(USER)\n  createdAt                    DateTime                 @default(now())',
    '  role                         UserRole                 @default(USER)\n  supabaseAuthId               String?                  @unique @db.Uuid\n  createdAt                    DateTime                 @default(now())',
)

# Worker CORS must accept Authorization for direct Worker access as well as the Pages proxy.
replace_once(
    'apps/api/src/index.ts',
    "    allowHeaders: ['Content-Type', 'X-Dev-Reset-Token'],",
    "    allowHeaders: ['Content-Type', 'Authorization', 'X-Dev-Reset-Token'],",
)

# Every frontend API call obtains the current Supabase session (refreshing when needed)
# and sends its user JWT as Bearer. Cookies are no longer the authentication transport.
p = Path('apps/web/src/lib/api.ts')
api = p.read_text()
if "import { getSupabaseAccessToken } from './supabase-auth';" not in api:
    api = "import { getSupabaseAccessToken } from './supabase-auth';\n\n" + api
pattern = re.compile(
    r"export async function apiRequest<T>\(path: string, init: RequestInit = \{\}\): Promise<T> \{.*?\n\}\n\nexport async function getMyCompetitions",
    re.S,
)
replacement = '''export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const accessToken = await getSupabaseAccessToken();
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(resolveRequestUrl(path), {
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

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: 'REQUEST_FAILED' }))) as {
      error?: string;
      issues?: unknown;
      message?: string;
      prismaCode?: string;
    };
    throw new ApiError(response.status, body.error ?? 'REQUEST_FAILED', body);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export async function getMyCompetitions'''
if not pattern.search(api):
    if 'const accessToken = await getSupabaseAccessToken();' not in api:
        raise SystemExit('apiRequest patch target not found')
else:
    api = pattern.sub(replacement, api, count=1)
p.write_text(api)

# Competition detail drives the Rodadas tab. Poll it every 3s so scores entered by
# another player/host appear without a manual refresh. Standings and stats poll too.
p = Path('apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx')
text = p.read_text()
replace_pairs = [
    (
        "  const competition = useQuery({\n    queryKey: ['competition', competitionId],\n    queryFn: () => getCompetition(competitionId),\n    enabled: Boolean(competitionId),\n  });",
        "  const competition = useQuery({\n    queryKey: ['competition', competitionId],\n    queryFn: () => getCompetition(competitionId),\n    enabled: Boolean(competitionId),\n    refetchInterval: 3_000,\n    refetchIntervalInBackground: true,\n  });",
    ),
    (
        "  const standings = useQuery({\n    queryKey: ['standings', competitionId],\n    queryFn: () => getStandings(competitionId),\n    enabled: Boolean(competitionId) && Boolean(isStarted) && activeTab === 'standings',\n  });",
        "  const standings = useQuery({\n    queryKey: ['standings', competitionId],\n    queryFn: () => getStandings(competitionId),\n    enabled: Boolean(competitionId) && Boolean(isStarted) && activeTab === 'standings',\n    staleTime: 1_000,\n    refetchInterval: 3_000,\n    refetchIntervalInBackground: true,\n  });",
    ),
    (
        "  const matchStats = useQuery({\n    queryKey: ['match-stats', competitionId],\n    queryFn: () => getCompetitionMatchStats(competitionId),\n    enabled: Boolean(competitionId) && Boolean(isStarted),\n  });",
        "  const matchStats = useQuery({\n    queryKey: ['match-stats', competitionId],\n    queryFn: () => getCompetitionMatchStats(competitionId),\n    enabled: Boolean(competitionId) && Boolean(isStarted),\n    refetchInterval: 3_000,\n    refetchIntervalInBackground: true,\n  });",
    ),
]
for old, new in replace_pairs:
    if new not in text:
        if old not in text:
            raise SystemExit('CompetitionDetailPageLight query patch target not found')
        text = text.replace(old, new, 1)
p.write_text(text)

# Production smoke now validates the actual Bearer contract instead of the retired cookie.
p = Path('.github/workflows/deploy.yml')
text = p.read_text()
text = text.replace(
    "-H 'Access-Control-Request-Headers: content-type'",
    "-H 'Access-Control-Request-Headers: content-type,authorization'",
)
old = """          grep -qi '^access-control-allow-origin: https://chavea.pages.dev' /tmp/register.headers
          grep -qi '^access-control-allow-credentials: true' /tmp/register.headers
          grep -qi '^set-cookie: chavea_session=' /tmp/register.headers

          cd ../..
"""
new = """          grep -qi '^access-control-allow-origin: https://chavea.pages.dev' /tmp/register.headers
          grep -qi '^access-control-allow-credentials: true' /tmp/register.headers

          ACCESS_TOKEN=\"$(node -e \"const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/register.body','utf8'));process.stdout.write(b.session?.accessToken||'')\")\"
          if [ -z \"$ACCESS_TOKEN\" ]; then
            echo 'Registration did not return a Supabase access token.' >&2
            exit 1
          fi

          ME_STATUS=\"$(curl --silent --show-error \\
            -o /tmp/me.body \\
            -w '%{http_code}' \\
            \"$API_URL/api/auth/me\" \\
            -H 'Origin: https://chavea.pages.dev' \\
            -H \"Authorization: Bearer $ACCESS_TOKEN\")\"
          if [ \"$ME_STATUS\" != '200' ] || ! grep -Fq \"$TEST_EMAIL\" /tmp/me.body; then
            echo \"Bearer session smoke failed with HTTP $ME_STATUS\" >&2
            cat /tmp/me.body || true
            exit 1
          fi

          curl --silent --show-error -o /dev/null -X POST \"$API_URL/api/auth/logout\" \\
            -H 'Origin: https://chavea.pages.dev' \\
            -H \"Authorization: Bearer $ACCESS_TOKEN\" || true

          cd ../..
"""
if new not in text:
    if old not in text:
        raise SystemExit('deploy bearer smoke patch target not found')
    text = text.replace(old, new, 1)
# Assert that preflight explicitly allows Authorization in the deployed Worker.
needle = "          grep -qi '^access-control-allow-credentials: true' /tmp/preflight.headers\n"
extra = needle + "          grep -qi '^access-control-allow-headers:.*authorization' /tmp/preflight.headers\n"
if extra not in text:
    if needle not in text:
        raise SystemExit('deploy CORS assertion target not found')
    text = text.replace(needle, extra, 1)
p.write_text(text)

print('Supabase Bearer + realtime mobile patches applied.')
