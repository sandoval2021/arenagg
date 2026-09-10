import { apiRequest } from './api';

export type CardBulkImportResult = {
  ok: true;
  processed: number;
  imported: number;
  skippedDuplicates: number;
  defaultAlbumPage: string;
};

export async function bulkImportCards(file: File): Promise<CardBulkImportResult> {
  const body = new FormData();
  body.set('file', file);

  return apiRequest<CardBulkImportResult>('/api/admin/cards/bulk-upload', {
    method: 'POST',
    body,
  });
}
