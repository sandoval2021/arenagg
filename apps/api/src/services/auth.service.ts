import type { PrismaClient, User } from '@prisma/client';
import { pbkdf2 as nodePbkdf2, scrypt as nodeScrypt } from 'node:crypto';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

// Cloudflare Workers caps WebCrypto PBKDF2 at 100k iterations. Passwords are
// therefore derived with the Worker-supported native scrypt implementation.
// These parameters use ~32 MiB per derivation, staying well below the 128 MiB
// Worker memory ceiling while remaining memory-hard.
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const encoder = new TextEncoder();

export type PublicUser = Pick<
  User,
  'id' | 'name' | 'displayName' | 'avatarUrl' | 'email' | 'phone'
>;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error('INVALID_HEX');

  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(encoder.encode(value)));
  return bytesToHex(new Uint8Array(digest));
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function deriveScrypt(
  password: string,
  salt: Uint8Array,
  n: number,
  r: number,
  p: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: n, r, p, maxmem: SCRYPT_MAXMEM },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(new Uint8Array(derivedKey));
      },
    );
  });
}

function deriveLegacyPbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    nodePbkdf2(password, salt, iterations, 32, 'sha256', (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(new Uint8Array(derivedKey));
    });
  });
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    email: user.email,
    phone: user.phone,
  };
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveScrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    const algorithm = parts[0];

    if (algorithm === 'scrypt') {
      if (parts.length !== 6) return false;
      const [, rawN, rawR, rawP, saltHex, hashHex] = parts;
      const n = Number(rawN);
      const r = Number(rawR);
      const p = Number(rawP);

      if (
        !Number.isInteger(n) ||
        n < 16_384 ||
        n > 65_536 ||
        (n & (n - 1)) !== 0 ||
        !Number.isInteger(r) ||
        r < 1 ||
        r > 16 ||
        !Number.isInteger(p) ||
        p < 1 ||
        p > 8
      ) {
        return false;
      }

      const expected = hexToBytes(hashHex);
      if (expected.length !== SCRYPT_KEY_LENGTH) return false;
      const actual = await deriveScrypt(password, hexToBytes(saltHex), n, r, p);
      return timingSafeEqual(expected, actual);
    }

    // Backward-compatible verification for any PBKDF2 hashes created before
    // the Worker-specific scrypt migration. Node crypto avoids the WebCrypto
    // runtime's 100k-iteration PBKDF2 ceiling.
    if (algorithm === 'pbkdf2-sha256') {
      if (parts.length !== 4) return false;
      const [, rawIterations, saltHex, hashHex] = parts;
      const iterations = Number(rawIterations);
      if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) {
        return false;
      }

      const expected = hexToBytes(hashHex);
      if (expected.length !== 32) return false;
      const actual = await deriveLegacyPbkdf2(password, hexToBytes(saltHex), iterations);
      return timingSafeEqual(expected, actual);
    }

    return false;
  } catch {
    return false;
  }
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { userId, tokenHash, expiresAt },
  });

  return { token, expiresAt };
}

export async function getSessionUser(
  prisma: PrismaClient,
  token: string,
): Promise<PublicUser | null> {
  const tokenHash = await sha256(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  if (Date.now() - session.lastUsedAt.getTime() > 5 * 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
  }

  return toPublicUser(session.user);
}

export async function revokeSession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { tokenHash: await sha256(token) },
  });
}
