import type { PrismaClient, User } from '@prisma/client';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 310_000;
const encoder = new TextEncoder();

export type PublicUser = Pick<User, 'id' | 'name' | 'displayName' | 'avatarUrl' | 'email' | 'phone'>;

function bytesToHex(bytes: Uint8Array): string { return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex: string): Uint8Array { if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error('INVALID_HEX'); const out = new Uint8Array(hex.length / 2); for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16); return out; }
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; }
async function sha256(value: string): Promise<string> { return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
function randomToken(): string { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> { const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256); return new Uint8Array(bits); }

export function toPublicUser(user: User): PublicUser { return { id: user.id, name: user.name, displayName: user.displayName, avatarUrl: user.avatarUrl, email: user.email, phone: user.phone }; }
export function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
export function normalizePhone(value: string): string { const digits = value.replace(/\D/g, ''); return digits.startsWith('55') ? `+${digits}` : `+55${digits}`; }
export async function hashPassword(password: string): Promise<string> { const salt = crypto.getRandomValues(new Uint8Array(16)); const derived = await derivePassword(password, salt, PBKDF2_ITERATIONS); return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`; }
export async function verifyPassword(stored: string, password: string): Promise<boolean> { try { const [algorithm, rawIterations, saltHex, hashHex] = stored.split('$'); if (algorithm !== 'pbkdf2-sha256') return false; const iterations = Number(rawIterations); if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false; const expected = hexToBytes(hashHex); const actual = await derivePassword(password, hexToBytes(saltHex), iterations); return timingSafeEqual(expected, actual); } catch { return false; } }

export async function createSession(prisma: PrismaClient, userId: string): Promise<{ token: string; expiresAt: Date }> { const token = randomToken(); const tokenHash = await sha256(token); const expiresAt = new Date(Date.now() + SESSION_TTL_MS); await prisma.session.create({ data: { userId, tokenHash, expiresAt } }); return { token, expiresAt }; }
export async function getSessionUser(prisma: PrismaClient, token: string): Promise<PublicUser | null> { const tokenHash = await sha256(token); const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } }); if (!session || session.expiresAt <= new Date() || !session.user.isActive) { if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined); return null; } if (Date.now() - session.lastUsedAt.getTime() > 5 * 60_000) await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }); return toPublicUser(session.user); }
export async function revokeSession(prisma: PrismaClient, token: string): Promise<void> { await prisma.session.deleteMany({ where: { tokenHash: await sha256(token) } }); }
