import type { R2BucketPort } from '../infrastructure/storage/r2/r2-storage.adapter';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SCOPES = ['teams', 'defaults', 'profiles'] as const;
export type ImageScope = typeof SCOPES[number];
type AcceptedMime = 'image/jpeg' | 'image/png' | 'image/webp';

export type D1ImageBindings = {
  EVIDENCE_BUCKET: R2BucketPort;
  WEB_APP_URL: string;
};

export type UploadableImage = {
  size: number;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
  arrayBuffer(): Promise<ArrayBuffer>;
};

export class D1ImageError extends Error {
  constructor(public readonly code: 'INVALID_IMAGE' | 'IMAGE_TOO_LARGE' | 'STORAGE_UNAVAILABLE') {
    super(code);
    this.name = 'D1ImageError';
  }
}

const OWNER_ID = /^[a-f0-9-]{36}$/i;
const IMAGE_KEY = /^images\/(teams|defaults|profiles)\/([a-f0-9-]{36})\/([a-f0-9-]{36})\.(jpg|png|webp)$/i;
const EXTENSIONS: Record<AcceptedMime, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

function detectMime(bytes: Uint8Array): AcceptedMime {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, i) => bytes[i] === value)) return 'image/png';
  if (bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  throw new D1ImageError('INVALID_IMAGE');
}

export async function uploadImageToR2(
  bindings: D1ImageBindings,
  image: UploadableImage,
  scope: ImageScope,
  ownerId: string,
): Promise<{ storagePath: string; publicUrl: string }> {
  if (!SCOPES.includes(scope) || !OWNER_ID.test(ownerId)) throw new D1ImageError('INVALID_IMAGE');
  if (!Number.isInteger(image.size) || image.size <= 0) throw new D1ImageError('INVALID_IMAGE');
  if (image.size > MAX_IMAGE_BYTES) throw new D1ImageError('IMAGE_TOO_LARGE');

  const mime = detectMime(new Uint8Array(await image.slice(0, 16).arrayBuffer()));
  const path = `images/${scope}/${ownerId}/${crypto.randomUUID()}.${EXTENSIONS[mime]}`;
  const bytes = await image.arrayBuffer();
  // Server does not trust request Content-Type; metadata follows inspected bytes.
  const result = await bindings.EVIDENCE_BUCKET.put(path, bytes, {
    httpMetadata: { contentType: mime },
  });
  if (!result?.key) throw new D1ImageError('STORAGE_UNAVAILABLE');

  const origin = new URL(bindings.WEB_APP_URL);
  if (origin.protocol !== 'https:') throw new D1ImageError('STORAGE_UNAVAILABLE');
  return {
    storagePath: path,
    publicUrl: new URL('/api/media/' + path, origin).toString(),
  };
}

export async function readPublicImageFromR2(
  bindings: Pick<D1ImageBindings, 'EVIDENCE_BUCKET'>,
  storagePath: string,
): Promise<Response> {
  if (!IMAGE_KEY.test(storagePath)) return new Response(null, { status: 404 });
  const stored = await bindings.EVIDENCE_BUCKET.get(storagePath);
  if (!stored) return new Response(null, { status: 404 });
  const metadataMime = stored.httpMetadata?.contentType;
  const contentType = metadataMime === 'image/jpeg' || metadataMime === 'image/png' || metadataMime === 'image/webp'
    ? metadataMime : 'application/octet-stream';
  return new Response(stored.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-site',
    },
  });
}

export async function removeImageFromR2(
  bindings: Pick<D1ImageBindings, 'EVIDENCE_BUCKET'>,
  storagePath: string,
): Promise<void> {
  if (!IMAGE_KEY.test(storagePath)) throw new D1ImageError('INVALID_IMAGE');
  await bindings.EVIDENCE_BUCKET.delete(storagePath);
}
