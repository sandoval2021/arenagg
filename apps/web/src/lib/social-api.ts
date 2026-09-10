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

const AVATAR_OPTIMIZE_THRESHOLD = 256 * 1024;
const AVATAR_MAX_DIMENSION = 512;
const AVATAR_WEBP_QUALITY = 0.8;

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

type DecodedAvatar = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodeAvatar(file: File): Promise<DecodedAvatar> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = 'async';
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('AVATAR_DECODE_FAILED'));
      element.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function optimizeAvatar(file: File): Promise<File> {
  if (file.size < AVATAR_OPTIMIZE_THRESHOLD) return file;

  let decoded: DecodedAvatar | null = null;
  try {
    decoded = await decodeAvatar(file);
    const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return file;

    context.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', AVATAR_WEBP_QUALITY));
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar';
    return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    // Decoding failure must never block a valid <=10 MiB photo. The server still
    // validates the original MIME type and size before writing to Storage.
    return file;
  } finally {
    decoded?.release();
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
