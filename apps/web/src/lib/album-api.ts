import { apiRequest } from './api';

export type CardRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type StickerPackType = 'COMMON' | 'PREMIUM';

export type AlbumCard = {
  id: string;
  cardNumber: number;
  name: string;
  rarity: CardRarity;
  imageUrl: string | null;
  boostType: string;
  boostValue: number;
  albumPage: string;
  copyCount: number;
};

export type AlbumPageSummary = {
  albumPage: string;
  total: number;
  firstNumber: number;
};

export type AlbumResponse = {
  pages: AlbumPageSummary[];
  selectedPage: string | null;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  packs: Array<{ packType: string; quantity: number }>;
  cards: AlbumCard[];
};

export type OpenPackResponse = {
  packType: StickerPackType;
  cards: Array<{
    id: string;
    cardNumber: number;
    name: string;
    rarity: CardRarity;
    imageUrl: string | null;
    albumPage: string;
  }>;
  remaining: number;
  odds: Record<CardRarity, number>;
};

export function getAlbum(page?: string): Promise<AlbumResponse> {
  const query = page ? `?page=${encodeURIComponent(page)}` : '';
  return apiRequest(`/api/album${query}`);
}

export function openStickerPack(packType: StickerPackType = 'COMMON'): Promise<OpenPackResponse> {
  return apiRequest('/api/album/open-pack', {
    method: 'POST',
    body: JSON.stringify({ packType }),
  });
}
