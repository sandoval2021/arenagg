export type CompetitionFormat = 'LEAGUE' | 'KNOCKOUT' | 'GROUPS_KNOCKOUT';
export type CompetitionStatus =
  | 'DRAFT'
  | 'REGISTRATION'
  | 'READY'
  | 'IN_PROGRESS'
  | 'FINISHED'
  | 'CANCELLED';
export type TeamSelection = 'FREE' | 'RANDOM';
export type MatchStatsStatus = 'NONE' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISPUTED';

export const PLATFORM_OWNER_EMAIL = 'sandovaloliveira284@gmail.com';

export type CompetitionSummary = {
  id: string;
  name: string;
  format: CompetitionFormat;
  participantCount: number;
  maxParticipants: number;
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
  maxParticipants: number;
  requireValidation: boolean;
  hostId: string;
  currentUserId: string;
  host: { id: string; name: string; displayName: string | null };
  isHost: boolean;
  hasJoined: boolean;
  participations: Array<{
    id: string;
    userId: string;
    teamName: string;
    teamLogoUrl: string | null;
    user: { id: string; name: string; displayName: string | null; avatarUrl: string | null };
    team: { id: string; name: string; logoUrl: string | null } | null;
  }>;
  matches: Array<{
    id: string;
    status: string;
    leg: number;
    version: number;
    round: { id: string; number: number; name: string | null } | null;
    homeTeam: { id: string; name: string; logoUrl: string | null } | null;
    awayTeam: { id: string; name: string; logoUrl: string | null } | null;
    homeScore: number | null;
    awayScore: number | null;
  }>;
};

export type Standing = {
  teamId: string;
  team: string;
  logoUrl?: string;
  playerName: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

export type MatchStatsInput = {
  homePossession: number;
  awayPossession: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnGoal: number;
  awayShotsOnGoal: number;
  homePasses: number;
  awayPasses: number;
  homeTackles: number;
  awayTackles: number;
  homeFouls: number;
  awayFouls: number;
};

export type MatchStats = MatchStatsInput & {
  matchId: string;
  statsStatus: MatchStatsStatus;
  submittedById: string;
  reviewedById: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  submittedByMe: boolean;
  canApprove: boolean;
  canDispute: boolean;
};

export type DefaultShield = {
  id: string;
  name: string;
  url: string;
  isActive?: boolean;
  sortOrder?: number;
  storagePath?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateCompetitionInput = {
  name: string;
  type: CompetitionFormat;
  isHomeAndAway?: boolean;
  teamSelection?: TeamSelection;
  maxParticipants?: number;
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
    public readonly details?: unknown,
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
      issues?: unknown;
      message?: string;
      prismaCode?: string;
    };
    throw new ApiError(response.status, body.error ?? 'REQUEST_FAILED', body);
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

export async function updateMyCompetitionTeam(
  competitionId: string,
  input: { teamName: string; teamLogoUrl?: string | null },
): Promise<{ teamName: string; teamLogoUrl: string | null }> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/my-team`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function uploadMyCompetitionTeamLogo(
  competitionId: string,
  file: File,
): Promise<{ teamLogoUrl: string }> {
  const body = new FormData();
  body.set('file', file);
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/my-team/logo`, {
    method: 'POST',
    body,
  });
}

export async function getDefaultShields(): Promise<DefaultShield[]> {
  return apiRequest('/api/default-shields');
}

export async function getOwnerDefaultShields(): Promise<DefaultShield[]> {
  return apiRequest('/api/owner/default-shields');
}

export async function uploadOwnerDefaultShield(name: string, file: File): Promise<DefaultShield> {
  const body = new FormData();
  body.set('name', name);
  body.set('file', file);
  return apiRequest('/api/owner/default-shields', {
    method: 'POST',
    body,
  });
}

export async function updateOwnerDefaultShield(
  id: string,
  input: { name?: string; isActive?: boolean; sortOrder?: number },
): Promise<DefaultShield> {
  return apiRequest(`/api/owner/default-shields/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteOwnerDefaultShield(id: string): Promise<void> {
  return apiRequest(`/api/owner/default-shields/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function startCompetition(competitionId: string): Promise<{ status: 'IN_PROGRESS'; matchCount: number }> {
  return apiRequest(`/api/competitions/${encodeURIComponent(competitionId)}/start`, {
    method: 'POST',
  });
}

export async function submitMatchScore(
  matchId: string,
  input: { homeScore: number; awayScore: number; version: number; evidence?: File },
) {
  const body = new FormData();
  body.set('homeScore', String(input.homeScore));
  body.set('awayScore', String(input.awayScore));
  body.set('version', String(input.version));
  if (input.evidence) body.set('evidence', input.evidence);

  return apiRequest(`/api/matches/${encodeURIComponent(matchId)}/score`, {
    method: 'POST',
    body,
  });
}

export async function getCompetitionMatchStats(competitionId: string): Promise<MatchStats[]> {
  return apiRequest(`/api/match-stats/competition/${encodeURIComponent(competitionId)}`);
}

export async function submitMatchStats(matchId: string, input: MatchStatsInput): Promise<MatchStats> {
  return apiRequest(`/api/matches/${encodeURIComponent(matchId)}/stats`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function approveMatchStats(matchId: string): Promise<MatchStats> {
  return apiRequest(`/api/matches/${encodeURIComponent(matchId)}/stats/approve`, {
    method: 'POST',
  });
}

export async function disputeMatchStats(matchId: string): Promise<MatchStats> {
  return apiRequest(`/api/matches/${encodeURIComponent(matchId)}/stats/dispute`, {
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
