import { apiRequest } from './api';
import type { AchievementCode } from './achievement-catalog';

export const CONSOLE_OPTIONS = ['PS5', 'PS4', 'PC', 'Xbox', 'Nintendo', 'PS3', 'Outros'] as const;
export const FORMATION_OPTIONS = ['4-3-3', '4-2-4', '4-4-2', '4-4-1-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1'] as const;
export const PLAYSTYLE_OPTIONS = [
  'Troca de Passes (Tiki-Taka)',
  'Contra-ataque',
  'Jogo Equilibrado',
  'Retranca',
  'Lançamento Longo',
  'Pressão Alta',
] as const;
export type ConsoleTag = (typeof CONSOLE_OPTIONS)[number];
export type FormationOption = (typeof FORMATION_OPTIONS)[number];
export type PlaystyleOption = (typeof PLAYSTYLE_OPTIONS)[number];
export type BadgeCode = AchievementCode;

const AVATAR_OPTIMIZE_THRESHOLD = 2 * 1024 * 1024;
const AVATAR_MAX_DIMENSION = 1600;

export type GamerProfile = {
  id: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
  email?: string | null;
  phone?: string | null;
  consoles: ConsoleTag[];
  favoriteFormation: FormationOption | null;
  playstyle: PlaystyleOption | null;
  mmr: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  totalGoalsScored: number;
  totalGoalsConceded: number;
  championshipsWon: number;
  badges: Array<{
    badgeCode: BadgeCode;
    awardedAt: string;
  }>;
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
  favoriteFormation?: FormationOption | null;
  playstyle?: PlaystyleOption | null;
  avatarUrl?: string | null;
}): Promise<GamerProfile> {
  return apiRequest('/api/profile/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

async function optimizeAvatar(file: File): Promise<File> {
  if (file.size < AVATAR_OPTIMIZE_THRESHOLD || typeof createImageBitmap !== 'function') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: file.type !== 'image/jpeg' });
    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const outputType = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, 0.86));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name, { type: outputType, lastModified: Date.now() });
  } catch {
    // Some older PWA/WebKit builds cannot decode through createImageBitmap.
    // The original <=10 MiB file can still be validated and uploaded safely.
    return file;
  }
}

export async function uploadMyAvatar(file: File): Promise<{ avatarUrl: string; requestId?: string }> {
  const optimized = await optimizeAvatar(file);
  const body = new FormData();
  body.set('file', optimized);
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
