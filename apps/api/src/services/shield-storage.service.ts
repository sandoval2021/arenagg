import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../types/env';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

type AllowedMime = keyof typeof MIME_TO_EXTENSION;

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
  ) {
    super(message);
    this.name = 'ShieldUploadError';
  }
}

function getStorageClient(config: StorageConfig): SupabaseClient {
  const serviceRoleKey = config.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config.SUPABASE_URL?.trim() || !serviceRoleKey) {
    throw new ShieldUploadError(
      'STORAGE_NOT_CONFIGURED',
      'Supabase Storage credentials are not configured in the Worker.',
    );
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

function validateImage(file: File): AllowedMime {
  const mime = file.type as AllowedMime;
  if (!(mime in MIME_TO_EXTENSION)) {
    throw new ShieldUploadError(
      'INVALID_IMAGE',
      'Only JPEG, PNG and WEBP images are accepted.',
    );
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new ShieldUploadError(
      'IMAGE_TOO_LARGE',
      'Shield images must be between 1 byte and 5 MiB.',
    );
  }
  return mime;
}

export async function uploadShield(
  config: StorageConfig,
  file: File,
  scope: 'teams' | 'defaults',
  ownerSegment: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const mime = validateImage(file);
  const extension = MIME_TO_EXTENSION[mime];
  const storagePath = `${scope}/${ownerSegment}/${crypto.randomUUID()}.${extension}`;
  const client = getStorageClient(config);
  const bucket = config.SUPABASE_SHIELDS_BUCKET || 'escudos';
  const payload = new Uint8Array(await file.arrayBuffer());

  const { error } = await client.storage.from(bucket).upload(storagePath, payload, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    console.error('[shield-storage] upload failed', {
      scope,
      bucket,
      storagePath,
      fileSize: file.size,
      fileType: file.type,
      storageError: error.message,
    });
    throw new ShieldUploadError('STORAGE_UPLOAD_FAILED', 'Supabase Storage upload failed.');
  }

  const { data } = client.storage.from(bucket).getPublicUrl(storagePath);
  if (!data.publicUrl) {
    throw new ShieldUploadError('STORAGE_UPLOAD_FAILED', 'Public shield URL was not generated.');
  }

  return { publicUrl: data.publicUrl, storagePath };
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
    console.error('[shield-storage] delete failed', {
      bucket,
      storagePath,
      storageError: error.message,
    });
    throw new ShieldUploadError('STORAGE_UPLOAD_FAILED', 'Supabase Storage delete failed.');
  }
}
