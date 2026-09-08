import type { PrismaClient, User } from '@prisma/client';
import { hash, verify } from '@node-rs/argon2';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

export type PublicUser = Pick<User, 'id' | 'name' | 'displayName' | 'avatarUrl' | 'email' | 'phone'>;

function bytesToHex(bytes: Uint8Array): string { return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function sha256(value: string): Promise<string> { return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
function randomToken(): string { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
export function toPublicUser(user: User): PublicUser { return { id: user.id, name: user.name, displayName: user.displayName, avatarUrl: user.avatarUrl, email: user.email, phone: user.phone }; }
export function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
export function normalizePhone(value: string): string { return value.replace(/[^\d+]/g, ''); }

export async function hashPassword(password: string): Promise<string> { return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 }); }
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> { try { return await verify(passwordHash, password); } catch { return false; } }

export async function createSession(prisma: PrismaClient, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(); const tokenHash = await sha256(token); const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, tokenHash, expiresAt } });
  return { token, expiresAt };
}
export async function getSessionUser(prisma: PrismaClient, token: string): Promise<PublicUser | null> {
  const tokenHash = await sha256(token); const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) { if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined); return null; }
  await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  return toPublicUser(session.user);
}
export async function revokeSession(prisma: PrismaClient, token: string): Promise<void> { await prisma.session.deleteMany({ where: { tokenHash: await sha256(token) } }); }
