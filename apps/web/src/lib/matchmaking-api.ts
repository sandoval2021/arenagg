import { apiRequest } from './api';

export type MatchmakingPlatform = 'PS4' | 'XBOX_ONE' | 'PS5' | 'XBOX_SERIES' | 'PC';
export type MatchmakingPool = 'ALL' | 'LEGACY' | 'CURRENT';
export type CasualMatchMode = 'CASUAL' | 'RANKED';
export type CasualMatchRoomStatus = 'OPEN' | 'AWAITING_CONFIRMATION' | 'FINISHED' | 'CANCELED';

export type MatchmakingQueue = {
  id: string;
  platform: MatchmakingPlatform;
  status: 'ACTIVE' | 'IN_GAME';
  expiresAt: string;
};

export type AvailablePlayer = {
  queueId: string;
  userId: string;
  platform: MatchmakingPlatform;
  expiresAt: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  mmr: number;
};

export type IncomingChallenge = {
  id: string;
  mode: CasualMatchMode;
  challengerPlatform: MatchmakingPlatform;
  challengedPlatform: MatchmakingPlatform;
  expiresAt: string;
  challenger: {
    id: string;
    name: string;
    avatarUrl: string | null;
    mmr: number;
  };
};

export type OutgoingChallenge = {
  id: string;
  mode: CasualMatchMode;
  challengerPlatform: MatchmakingPlatform;
  challengedPlatform: MatchmakingPlatform;
  expiresAt: string;
  challenged: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
};

export type MatchmakingChallenges = {
  incoming: IncomingChallenge[];
  outgoing: OutgoingChallenge | null;
};

export type CasualRoomPlayer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  mmr: number;
  platform: MatchmakingPlatform;
  handle: string | null;
  score: number | null;
  mmrDelta: number | null;
};

export type CasualMatchRoom = {
  id: string;
  challengeId: string;
  mode: CasualMatchMode;
  status: CasualMatchRoomStatus;
  currentUserId: string;
  isChallenger: boolean;
  scoreSubmittedById: string | null;
  canConfirmScore: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  challenger: CasualRoomPlayer;
  challenged: CasualRoomPlayer;
};

export const platformLabels: Record<MatchmakingPlatform, string> = {
  PS4: 'PS4',
  XBOX_ONE: 'Xbox One',
  PS5: 'PS5',
  XBOX_SERIES: 'Xbox Series',
  PC: 'PC',
};

export function getMyAvailability() {
  return apiRequest<{ queue: MatchmakingQueue | null }>('/api/matchmaking/availability');
}

export function setMyAvailability(platform: MatchmakingPlatform) {
  return apiRequest<{ queue: MatchmakingQueue }>('/api/matchmaking/availability', {
    method: 'POST',
    body: JSON.stringify({ platform }),
  });
}

export function leaveMatchmakingQueue() {
  return apiRequest<{ ok: true }>('/api/matchmaking/availability', { method: 'DELETE' });
}

export function getAvailablePlayers(pool: MatchmakingPool) {
  return apiRequest<{ players: AvailablePlayer[] }>(`/api/matchmaking/players?pool=${pool}`);
}

export function getMatchmakingChallenges() {
  return apiRequest<MatchmakingChallenges>('/api/matchmaking/challenges');
}

export function challengePlayer(challengedUserId: string, mode: CasualMatchMode) {
  return apiRequest<{ challenge: { id: string; mode: CasualMatchMode; expiresAt: string } }>('/api/matchmaking/challenges', {
    method: 'POST',
    body: JSON.stringify({ challengedUserId, mode }),
  });
}

export function respondToChallenge(challengeId: string, action: 'ACCEPT' | 'DECLINE') {
  return apiRequest<{ ok: true; status: 'ACCEPTED' | 'DECLINED'; roomId?: string }>(
    `/api/matchmaking/challenges/${encodeURIComponent(challengeId)}/respond`,
    { method: 'POST', body: JSON.stringify({ action }) },
  );
}

export function getActiveCasualRoom() {
  return apiRequest<{ room: CasualMatchRoom | null }>('/api/matchmaking/rooms/active');
}

export function getCasualRoom(roomId: string) {
  return apiRequest<{ room: CasualMatchRoom }>(`/api/matchmaking/rooms/${encodeURIComponent(roomId)}`);
}

export function saveCasualRoomHandle(roomId: string, handle: string) {
  return apiRequest<{ room: CasualMatchRoom }>(`/api/matchmaking/rooms/${encodeURIComponent(roomId)}/handle`, {
    method: 'PATCH',
    body: JSON.stringify({ handle }),
  });
}

export function submitCasualScore(roomId: string, myScore: number, opponentScore: number) {
  return apiRequest<{ ok: true }>(`/api/matchmaking/rooms/${encodeURIComponent(roomId)}/score`, {
    method: 'POST',
    body: JSON.stringify({ myScore, opponentScore }),
  });
}

export function confirmCasualScore(roomId: string) {
  return apiRequest<{ ok: true; mmr: { challengerDelta: number | null; challengedDelta: number | null } }>(
    `/api/matchmaking/rooms/${encodeURIComponent(roomId)}/score/confirm`,
    { method: 'POST' },
  );
}

export function rejectCasualScore(roomId: string) {
  return apiRequest<{ ok: true }>(`/api/matchmaking/rooms/${encodeURIComponent(roomId)}/score/reject`, {
    method: 'POST',
  });
}

export function cancelCasualRoom(roomId: string) {
  return apiRequest<{ ok: true }>(`/api/matchmaking/rooms/${encodeURIComponent(roomId)}/cancel`, {
    method: 'POST',
  });
}
