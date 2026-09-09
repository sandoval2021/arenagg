import { apiRequest } from './api';

export const CONSOLE_OPTIONS = ['PS5', 'PS4', 'PC', 'Xbox', 'Nintendo', 'PS3', 'Outros'] as const;
export type ConsoleTag = (typeof CONSOLE_OPTIONS)[number];

export type GamerProfile = {
  id: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  email?: string | null;
  phone?: string | null;
  consoles: ConsoleTag[];
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  totalGoalsScored: number;
  totalGoalsConceded: number;
  championshipsWon: number;
  friendship?: {
    id: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    direction: 'OUTGOING' | 'INCOMING';
  } | null;
};

export type FriendListItem = {
  friendshipId: string;
  id: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  consoles: ConsoleTag[];
};

export type FriendRequest = {
  friendshipId: string;
  user: {
    id: string;
    name: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

export function getMyGamerProfile(): Promise<GamerProfile> {
  return apiRequest('/api/profile/me');
}

export function updateMyGamerProfile(input: {
  displayName?: string;
  consoles?: ConsoleTag[];
  avatarUrl?: string | null;
}): Promise<GamerProfile> {
  return apiRequest('/api/profile/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function uploadMyAvatar(file: File): Promise<{ avatarUrl: string; requestId?: string }> {
  const body = new FormData();
  body.set('file', file);
  return apiRequest('/api/profile/me/avatar', { method: 'POST', body });
}

export function getPublicGamerProfile(userId: string): Promise<GamerProfile> {
  return apiRequest(`/api/profile/${encodeURIComponent(userId)}`);
}

export function requestFriend(friendId: string): Promise<{ id: string; status: 'PENDING' | 'ACCEPTED' }> {
  return apiRequest('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ friendId }),
  });
}

export function getFriends(): Promise<FriendListItem[]> {
  return apiRequest('/api/friends');
}

export function getFriendRequests(): Promise<FriendRequest[]> {
  return apiRequest('/api/friends/requests');
}

export function acceptFriendRequest(friendshipId: string): Promise<{ id: string; status: 'ACCEPTED' }> {
  return apiRequest(`/api/friends/${encodeURIComponent(friendshipId)}/accept`, { method: 'POST' });
}

export function rejectFriendRequest(friendshipId: string): Promise<{ id: string; status: 'REJECTED' }> {
  return apiRequest(`/api/friends/${encodeURIComponent(friendshipId)}/reject`, { method: 'POST' });
}
