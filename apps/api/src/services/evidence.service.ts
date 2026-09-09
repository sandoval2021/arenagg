import { R2StorageAdapter, type R2BucketPort } from '../infrastructure/storage/r2/r2-storage.adapter';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX = 8 * 1024 * 1024;

export async function storeEvidence(
  bucket: R2BucketPort,
  file: File,
  competitionId: string,
  matchId: string,
  actorId: string,
) {
  if (!ALLOWED.has(file.type)) throw new Error('INVALID_EVIDENCE_TYPE');
  if (file.size <= 0 || file.size > MAX) throw new Error('INVALID_EVIDENCE_SIZE');

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const key = `match-evidence/${competitionId}/${matchId}/${actorId}-${crypto.randomUUID()}.${ext}`;

  return new R2StorageAdapter(bucket).upload({
    key,
    body: file.stream(),
    contentType: file.type,
  });
}
