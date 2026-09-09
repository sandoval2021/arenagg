export type CompetitionSummary = {
  id: string;
  name: string;
  format: 'LEAGUE' | 'KNOCKOUT' | 'GROUPS_KNOCKOUT';
  participantCount: number;
  currentRound?: number;
  status: 'REGISTRATION' | 'READY' | 'IN_PROGRESS' | 'FINISHED';
  logoUrl?: string;
};

export type Standing = {
  teamId: string;
  team: string;
  logoUrl?: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  if (import.meta.env.DEV) return 'http://localhost:8787';

  console.error('[api] VITE_API_URL is missing in production build');
  return 'http://localhost:8787';
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    console.error('[api] network request failed', {
      path,
      apiUrl: API_URL,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new ApiError(0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: 'REQUEST_FAILED' }))) as {
      error?: string;
    };
    throw new ApiError(response.status, body.error ?? 'REQUEST_FAILED');
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export async function getMyCompetitions(): Promise<CompetitionSummary[]> {
  return apiRequest('/api/competitions');
}

export async function getStandings(competitionId: string): Promise<Standing[]> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/standings`);
}
