export interface EvidenceUpload {
  key: string;
  body: ReadableStream | ArrayBuffer;
  contentType: string;
}

export interface StoredEvidence {
  key: string;
}

export interface EvidenceStorage {
  upload(input: EvidenceUpload): Promise<StoredEvidence>;
  delete(key: string): Promise<void>;
}

interface R2StoredObject {
  key: string;
}

export interface R2ReadableObject {
  key: string;
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketPort {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<R2StoredObject | null>;
  get(key: string): Promise<R2ReadableObject | null>;
  delete(key: string): Promise<void>;
}

export class R2StorageAdapter implements EvidenceStorage {
  constructor(private readonly bucket: R2BucketPort) {}

  async upload(input: EvidenceUpload): Promise<StoredEvidence> {
    const stored = await this.bucket.put(input.key, input.body, {
      httpMetadata: { contentType: input.contentType },
    });

    if (!stored) throw new Error('Failed to persist match evidence in R2');
    return { key: stored.key };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
