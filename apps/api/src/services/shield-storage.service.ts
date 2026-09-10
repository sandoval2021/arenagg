import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../types/env';

const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PROFILE_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

type AllowedMime = keyof typeof MIME_TO_EXTENSION;
export type UploadScope = 'teams' | 'defaults' | 'profiles';

export type UploadFile = {
  size: number;
  type?: string;
  name?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
};

type StorageConfig = Pick<
  Env['Bindings'],
  'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'SUPABASE_SHIELDS_BUCKET'
>;

export class ShieldUploadError extends Error {
  constructor(
    public readonly code:
      | 'STORAGE_NOT_CONFIGURED'
      | 'INVALID_IMAGE'
      | 'IMAGE_TOO_LARGE'
      | 'STORAGE_UPLOAD_FAILED',
    message: string,
    public readonly requestId = crypto.randomUUID(),
  ) {
    super(message);
    this.name = 'ShieldUploadError';
  }
}

export function isUploadFile(value: unknown): value is UploadFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<UploadFile>;
  return (
    typeof candidate.size === 'number' &&
    typeof candidate.arrayBuffer === 'function' &&
    typeof candidate.slice === 'function'
  );
}

function getStorageClient(config: StorageConfig): SupabaseClient {
  const serviceRoleKey = config.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config.SUPABASE_URL?.trim() || !serviceRoleKey) {
    const error = new ShieldUploadError(
      'STORAGE_NOT_CONFIGURED',
      'Supabase Storage credentials are not configured in the Worker.',
    );
    console.error('[image-storage] configuration missing', {
      requestId: error.requestId,
      hasSupabaseUrl: Boolean(config.SUPABASE_URL?.trim()),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      bucket: config.SUPABASE_SHIELDS_BUCKET || 'escudos',
    });
    throw error;
  }

  return createClient(config.SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'arenagg-worker' },
    },
  });
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
}

async function detectImageMime(file: UploadFile, maxBytes: number): Promise<AllowedMime> {
  if (file.size <= 0) {
    throw new ShieldUploadError('INVALID_IMAGE', 'The image file is empty.');
  }
  if (file.size > maxBytes) {
    const maxMiB = Math.round(maxBytes / (1024 * 1024));
    throw new ShieldUploadError('IMAGE_TOO_LARGE', `Images must be at most ${maxMiB} MiB.`);
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (isJpeg(head)) return 'image/jpeg';
  if (isPng(head)) return 'image/png';
  if (isWebp(head)) return 'image/webp';

  const error = new ShieldUploadError(
    'INVALID_IMAGE',
    'The file content is not a supported JPEG, PNG or WEBP image.',
  );
  console.warn('[image-storage] unsupported image signature', {
    requestId: error.requestId,
    declaredType: file.type || 'unknown',
    fileName: file.name || 'unnamed',
    fileSize: file.size,
    signature: [...head.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
  });
  throw error;
}

function safeFileName(fileName?: string): string {
  if (!fileName) return 'unnamed';
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

export async function uploadShield(
  config: StorageConfig,
  file: UploadFile,
  scope: UploadScope,
  ownerSegment: string,
): Promise<{ publicUrl: string; storagePath: string; requestId: string }> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const maxBytes = scope === 'profiles' ? PROFILE_MAX_IMAGE_BYTES : DEFAULT_MAX_IMAGE_BYTES;
  const mime = await detectImageMime(file, maxBytes);
  const extension = MIME_TO_EXTENSION[mime];
  const storagePath = `${scope}/${ownerSegment}/${crypto.randomUUID()}.${extension}`;
  const bucket = config.SUPABASE_SHIELDS_BUCKET || 'escudos';

  console.info('[image-storage] upload started', {
    requestId,
    scope,
    bucket,
    storagePath,
    fileName: safeFileName(file.name),
    fileSize: file.size,
    maxBytes,
    declaredType: file.type || 'unknown',
    detectedType: mime,
  });

  const client = getStorageClient(config);
  const payload = new Uint8Array(await file.arrayBuffer());
  const { error } = await client.storage.from(bucket).upload(storagePath, payload, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    console.error('[image-storage] upload failed', {
      requestId,
      scope,
      bucket,
      storagePath,
      fileName: safeFileName(file.name),
      fileSize: file.size,
      declaredType: file.type || 'unknown',
      detectedType: mime,
      storageErrorName: error.name,
      storageErrorMessage: error.message,
      storageStatusCode: 'statusCode' in error ? String(error.statusCode) : undefined,
      durationMs: Date.now() - startedAt,
    });
    throw new ShieldUploadError('STORAGE_UPLOAD_FAILED', 'Supabase Storage upload failed.', requestId);
  }

  const { data } = client.storage.from(bucket).getPublicUrl(storagePath);
  if (!data.publicUrl) {
    console.error('[image-storage] public URL missing', { requestId, bucket, storagePath });
    throw new ShieldUploadError('STORAGE_UPLOAD_FAILED', 'Public image URL was not generated.', requestId);
  }

  console.info('[image-storage] upload completed', {
    requestId,
    scope,
    bucket,
    storagePath,
    durationMs: Date.now() - startedAt,
  });

  return { publicUrl: data.publicUrl, storagePath, requestId };
}

export async function removeShield(
  config: StorageConfig,
  storagePath: string,
): Promise<void> {
  if (!storagePath) return;
  const client = getStorageClient(config);
  const bucket = config.SUPABASE_SHIELDS_BUCKET || 'escudos';
  const { error } = await client.storage.from(bucket).remove([storagePath]);
  if (error) {
    console.error('[image-storage] delete failed', {
      bucket,
      storagePath,
      storageErrorName: error.name,
      storageErrorMessage: error.message,
    });
    throw new ShieldUploadError('STORAGE_UPLOAD_FAILED', 'Supabase Storage delete failed.');
  }
}
