export type CompetitionFormat = 'LEAGUE' | 'KNOCKOUT' | 'GROUPS_KNOCKOUT';
export type CompetitionStatus =
  | 'DRAFT'
  | 'REGISTRATION'
  | 'READY'
  | 'IN_PROGRESS'
  | 'FINISHED'
  | 'CANCELLED';
export type TeamSelection = 'FREE' | 'RANDOM';

export type CompetitionSummary = {
  id: string;
  name: string;
  format: CompetitionFormat;
  participantCount: number;
  currentRound?: number;
  status: CompetitionStatus;
  logoUrl?: string;
  isHost?: boolean;
};

export type CompetitionDetail = {
  id: string;
  name: string;
  slug: string;
  type: CompetitionFormat;
  status: CompetitionStatus;
  legFormat: 'SINGLE' | 'HOME_AWAY';
  teamSelection: TeamSelection;
  requireValidation: boolean;
  hostId: string;
  host: { id: string; name: string; displayName: string | null };
  isHost: boolean;
  hasJoined: boolean;
  participations: Array<{
    id: string;
    userId: string;
    user: { id: string; name: string; displayName: string | null; avatarUrl: string | null };
    team: { id: string; name: string; logoUrl: string | null } | null;
  }>;
  matches: Array<{
    id: string;
    status: string;
    leg: number;
    homeTeam: { id: string; name: string } | null;
    awayTeam: { id: string; name: string } | null;
    homeScore: number | null;
    awayScore: number | null;
  }>;
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

export type CreateCompetitionInput = {
  name: string;
  type: CompetitionFormat;
  isHomeAndAway?: boolean;
  teamSelection?: TeamSelection;
  matchPace?: 'QUICK' | 'SCHEDULED';
  requireValidation?: boolean;
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

export async function createCompetition(input: CreateCompetitionInput) {
  return apiRequest<{ id: string; name: string }>('/api/competitions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getCompetition(competitionId: string): Promise<CompetitionDetail> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}`);
}

export async function joinCompetition(competitionId: string): Promise<{ joined: true }> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/join`, {
    method: 'POST',
  });
}

export async function startCompetition(competitionId: string): Promise<{ status: 'IN_PROGRESS'; matchCount: number }> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/start`, {
    method: 'POST',
  });
}

export async function resetPasswordDev(email: string, newPassword: string, devToken: string) {
  return apiRequest<{ ok: true }>('/api/auth/reset-password-dev', {
    method: 'POST',
    headers: { 'X-Dev-Reset-Token': devToken },
    body: JSON.stringify({ email, newPassword }),
  });
}

export async function getStandings(competitionId: string): Promise<Standing[]> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/standings`);
}
