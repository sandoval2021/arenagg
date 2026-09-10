import {
  createClient,
  UserRole,
  type Session,
  type SupabaseClient,
  type User as SupabaseAuthUser,
} from '@supabase/supabase-js';
import type { PrismaClient, User } from '@prisma/client';
import type { Env } from '../types/env';
import { normalizeEmail, normalizePhone, toPublicUser, type PublicUser } from './auth.service';

type SupabaseAuthConfig = Pick<
  Env['Bindings'],
  'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'OWNER_EMAIL'
>;

export type BrowserAuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  expiresIn: number;
  tokenType: string;
};

export class SupabaseAuthBridgeError extends Error {
  constructor(
    public readonly code:
      | 'SUPABASE_AUTH_NOT_CONFIGURED'
      | 'SUPABASE_AUTH_PROVISION_FAILED'
      | 'SUPABASE_AUTH_LOGIN_FAILED'
      | 'SUPABASE_AUTH_LOOKUP_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'SupabaseAuthBridgeError';
  }
}

function getAdminClient(config: SupabaseAuthConfig): SupabaseClient {
  const url = config.SUPABASE_URL?.trim();
  const serviceRoleKey = config.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new SupabaseAuthBridgeError(
      'SUPABASE_AUTH_NOT_CONFIGURED',
      'Supabase Auth credentials are not configured in the Worker.',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'chavea-worker-auth' },
    },
  });
}

function sameIdentifier(authUser: SupabaseAuthUser, user: User): boolean {
  const emailMatches = Boolean(
    user.email && authUser.email && normalizeEmail(authUser.email) === normalizeEmail(user.email),
  );
  const phoneMatches = Boolean(
    user.phone && authUser.phone && normalizePhone(authUser.phone) === normalizePhone(user.phone),
  );
  return emailMatches || phoneMatches;
}

async function findSupabaseUserByIdentifier(client: SupabaseClient, user: User): Promise<SupabaseAuthUser | null> {
  // Legacy bridge only. Keep bounded so Auth migration cannot stall the Worker.
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new SupabaseAuthBridgeError('SUPABASE_AUTH_LOOKUP_FAILED', error.message);
    const match = data.users.find((candidate) => sameIdentifier(candidate, user));
    if (match) return match;
    if (data.users.length < perPage) break;
  }
  return null;
}

function authMetadata(user: User) {
  return {
    chavea_user_id: user.id,
    source: 'chavea-prisma',
  };
}

async function ensureSupabaseUser(
  config: SupabaseAuthConfig,
  prisma: PrismaClient,
  user: User,
  password: string,
): Promise<SupabaseAuthUser> {
  const client = getAdminClient(config);

  if (user.supabaseAuthId) {
    const { data, error } = await client.auth.admin.getUserById(user.supabaseAuthId);
    if (!error && data.user) {
      const { data: updated, error: updateError } = await client.auth.admin.updateUserById(data.user.id, {
        password,
        app_metadata: { ...data.user.app_metadata, ...authMetadata(user) },
      });
      if (updateError || !updated.user) {
        throw new SupabaseAuthBridgeError(
          'SUPABASE_AUTH_PROVISION_FAILED',
          updateError?.message ?? 'Could not synchronize the Supabase Auth user.',
        );
      }
      return updated.user;
    }
  }

  let authUser: SupabaseAuthUser | null = null;
  const { data: created, error: createError } = await client.auth.admin.createUser({
    ...(user.email ? { email: normalizeEmail(user.email), email_confirm: true } : {}),
    ...(user.phone ? { phone: normalizePhone(user.phone), phone_confirm: true } : {}),
    password,
    app_metadata: authMetadata(user),
  });

  if (!createError && created.user) {
    authUser = created.user;
  } else {
    authUser = await findSupabaseUserByIdentifier(client, user);
    if (!authUser) {
      throw new SupabaseAuthBridgeError(
        'SUPABASE_AUTH_PROVISION_FAILED',
        createError?.message ?? 'Could not create the Supabase Auth user.',
      );
    }

    const { data: updated, error: updateError } = await client.auth.admin.updateUserById(authUser.id, {
      password,
      app_metadata: { ...authUser.app_metadata, ...authMetadata(user) },
      ...(user.email ? { email_confirm: true } : {}),
      ...(user.phone ? { phone_confirm: true } : {}),
    });
    if (updateError || !updated.user) {
      throw new SupabaseAuthBridgeError(
        'SUPABASE_AUTH_PROVISION_FAILED',
        updateError?.message ?? 'Could not synchronize the Supabase Auth user.',
      );
    }
    authUser = updated.user;
  }

  if (!sameIdentifier(authUser, user)) {
    throw new SupabaseAuthBridgeError(
      'SUPABASE_AUTH_PROVISION_FAILED',
      'Supabase Auth returned an identity that does not match this Chavea account.',
    );
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { supabaseAuthId: authUser.id },
    });
  } catch (error) {
    console.error('[supabase-auth] failed to persist identity mapping', {
      userId: user.id,
      supabaseAuthId: authUser.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new SupabaseAuthBridgeError(
      'SUPABASE_AUTH_PROVISION_FAILED',
      'Could not persist the Supabase Auth identity mapping.',
    );
  }

  return authUser;
}

function toBrowserSession(session: Session): BrowserAuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    expiresIn: session.expires_in,
    tokenType: session.token_type,
  };
}

export async function provisionAndIssueSupabaseSession(
  config: SupabaseAuthConfig,
  prisma: PrismaClient,
  user: User,
  password: string,
): Promise<BrowserAuthSession> {
  const authUser = await ensureSupabaseUser(config, prisma, user, password);
  const client = getAdminClient(config);
  const credentials = user.email
    ? { email: normalizeEmail(user.email), password }
    : { phone: normalizePhone(user.phone ?? ''), password };
  const { data, error } = await client.auth.signInWithPassword(credentials);

  if (error || !data.session || data.user?.id !== authUser.id) {
    throw new SupabaseAuthBridgeError(
      'SUPABASE_AUTH_LOGIN_FAILED',
      error?.message ?? 'Supabase Auth did not issue a user session.',
    );
  }

  return toBrowserSession(data.session);
}

function safeDisplayName(authUser: SupabaseAuthUser): string {
  const metadataName = authUser.user_metadata?.name;
  if (typeof metadataName === 'string') {
    const trimmed = metadataName.trim().slice(0, 80);
    if (trimmed.length >= 2) return trimmed;
  }
  if (authUser.email) return authUser.email.split('@')[0]?.slice(0, 80) || 'Jogador Chavea';
  if (authUser.phone) return `Jogador ${authUser.phone.slice(-4)}`;
  return 'Jogador Chavea';
}

function prismaRoleForAuthUser(config: SupabaseAuthConfig, authUser: SupabaseAuthUser): UserRole {
  const ownerEmail = config.OWNER_EMAIL?.trim().toLowerCase();
  const email = authUser.email?.trim().toLowerCase();
  return ownerEmail && email === ownerEmail ? UserRole.ADMIN : UserRole.USER;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

async function findExistingPrismaUser(prisma: PrismaClient, authUser: SupabaseAuthUser): Promise<User | null> {
  const mappedId = authUser.app_metadata?.chavea_user_id;
  if (typeof mappedId === 'string') {
    const mapped = await prisma.user.findUnique({ where: { id: mappedId } }).catch(() => null);
    if (mapped) return mapped;
  }

  const direct = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
  if (direct) return direct;

  if (authUser.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: normalizeEmail(authUser.email) } });
    if (byEmail) return byEmail;
  }
  if (authUser.phone) {
    const byPhone = await prisma.user.findUnique({ where: { phone: normalizePhone(authUser.phone) } });
    if (byPhone) return byPhone;
  }
  return null;
}

async function createPrismaUserFromSupabase(
  config: SupabaseAuthConfig,
  prisma: PrismaClient,
  authUser: SupabaseAuthUser,
): Promise<User | null> {
  const email = authUser.email ? normalizeEmail(authUser.email) : null;
  const phone = authUser.phone ? normalizePhone(authUser.phone) : null;
  if (!email && !phone) return null;

  try {
    return await prisma.user.create({
      data: {
        name: safeDisplayName(authUser),
        email,
        phone,
        emailVerified: authUser.email_confirmed_at ? new Date(authUser.email_confirmed_at) : null,
        phoneVerified: authUser.phone_confirmed_at ? new Date(authUser.phone_confirmed_at) : null,
        supabaseAuthId: authUser.id,
        role: prismaRoleForAuthUser(config, authUser),
        profile: { create: {} },
      },
    });
  } catch (error) {
    if (!isPrismaUniqueConstraintError(error)) throw error;
    return findExistingPrismaUser(prisma, authUser);
  }
}

export async function resolveBearerUser(
  config: SupabaseAuthConfig,
  prisma: PrismaClient,
  accessToken: string,
): Promise<PublicUser | null> {
  const client = getAdminClient(config);
  const { data, error } = await client.auth.getUser(accessToken);
  const authUser = data.user;
  if (error || !authUser) return null;

  let user = await findExistingPrismaUser(prisma, authUser);
  if (!user) user = await createPrismaUserFromSupabase(config, prisma, authUser);
  if (!user || !user.isActive) return null;

  if (!user.supabaseAuthId) {
    try {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { supabaseAuthId: authUser.id },
      });
    } catch {
      const alreadyMapped = await prisma.user.findUnique({ where: { supabaseAuthId: authUser.id } });
      if (!alreadyMapped || alreadyMapped.id !== user.id || !alreadyMapped.isActive) return null;
      user = alreadyMapped;
    }
  }

  // Owner/admin authorization is persisted in Prisma. Never trust user_metadata
  // for roles because Supabase users can edit that metadata themselves.
  if (
    user.role === UserRole.USER &&
    user.email &&
    config.OWNER_EMAIL &&
    normalizeEmail(user.email) === normalizeEmail(config.OWNER_EMAIL)
  ) {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: UserRole.ADMIN } });
  }

  return toPublicUser(user);
}

export async function revokeSupabaseSession(config: SupabaseAuthConfig, accessToken: string): Promise<void> {
  const client = getAdminClient(config);
  const { error } = await client.auth.admin.signOut(accessToken, 'local');
  if (error) console.warn('[supabase-auth] local sign-out failed', { message: error.message });
}

export function createTemporaryMigrationPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `Migrate-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}!`;
}
