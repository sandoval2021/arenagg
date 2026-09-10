import { createClient, type User as SupabaseUser } from '@supabase/supabase-js';
import type { PrismaClient, User } from '@prisma/client';
import type { Env } from '../types/env';
import { normalizeEmail, normalizePhone, toPublicUser, type PublicUser } from './auth.service';

export type SupabaseSessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type: string;
};

function requireSupabaseConfig(env: Env['Bindings']): { url: string; serviceRoleKey: string } {
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_AUTH_NOT_CONFIGURED');
  return { url: url.replace(/\/+$/, ''), serviceRoleKey };
}

function createServerClient(env: Env['Bindings']) {
  const { url, serviceRoleKey } = requireSupabaseConfig(env);
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function signInCredentials(user: Pick<User, 'email' | 'phone'>, password: string) {
  if (user.email) return { email: user.email, password };
  if (user.phone) return { phone: user.phone, password };
  throw new Error('USER_HAS_NO_AUTH_IDENTIFIER');
}

function matchesPrismaIdentifier(authUser: SupabaseUser, user: Pick<User, 'email' | 'phone'>): boolean {
  if (user.email && authUser.email && normalizeEmail(authUser.email) === normalizeEmail(user.email)) return true;
  if (user.phone && authUser.phone && normalizePhone(authUser.phone) === normalizePhone(user.phone)) return true;
  return false;
}

async function findAuthUser(env: Env['Bindings'], user: Pick<User, 'email' | 'phone'>): Promise<SupabaseUser | null> {
  const client = createServerClient(env);
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`SUPABASE_USER_LOOKUP_FAILED:${error.message}`);
    const match = data.users.find((candidate) => matchesPrismaIdentifier(candidate, user));
    if (match) return match;
    if (data.users.length < perPage) return null;
  }

  throw new Error('SUPABASE_USER_LOOKUP_LIMIT');
}

async function provisionAuthUser(env: Env['Bindings'], user: User, password: string): Promise<SupabaseUser> {
  const client = createServerClient(env);
  const existing = await findAuthUser(env, user);
  const appMetadata = {
    ...(existing?.app_metadata ?? {}),
    chavea_user_id: user.id,
  };
  const userMetadata = {
    ...(existing?.user_metadata ?? {}),
    name: user.name,
  };

  if (existing) {
    const { data, error } = await client.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });
    if (error || !data.user) throw new Error(`SUPABASE_USER_UPDATE_FAILED:${error?.message ?? 'UNKNOWN'}`);
    return data.user;
  }

  const attributes = user.email
    ? {
        email: user.email,
        password,
        email_confirm: true,
        app_metadata: appMetadata,
        user_metadata: userMetadata,
      }
    : {
        phone: user.phone!,
        password,
        phone_confirm: true,
        app_metadata: appMetadata,
        user_metadata: userMetadata,
      };

  const { data, error } = await client.auth.admin.createUser(attributes);
  if (error || !data.user) throw new Error(`SUPABASE_USER_CREATE_FAILED:${error?.message ?? 'UNKNOWN'}`);
  return data.user;
}

function toSessionPayload(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in: number;
  token_type: string;
}): SupabaseSessionPayload {
  if (!session.access_token || !session.refresh_token) throw new Error('SUPABASE_SESSION_INCOMPLETE');
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
  };
}

export async function issueSupabaseSession(
  env: Env['Bindings'],
  user: User,
  password: string,
): Promise<SupabaseSessionPayload> {
  let client = createServerClient(env);
  const credentials = signInCredentials(user, password);
  let signedIn = await client.auth.signInWithPassword(credentials);

  // Existing Chavea users were originally stored only in Prisma. A successful
  // legacy password verification authorizes this one-time/JIT migration into
  // Supabase Auth, including password synchronization when an auth row exists.
  if (signedIn.error || !signedIn.data.session) {
    await provisionAuthUser(env, user, password);
    client = createServerClient(env);
    signedIn = await client.auth.signInWithPassword(credentials);
  }

  if (signedIn.error || !signedIn.data.session) {
    throw new Error(`SUPABASE_SIGN_IN_FAILED:${signedIn.error?.message ?? 'NO_SESSION'}`);
  }

  return toSessionPayload(signedIn.data.session);
}

export async function removeProvisionedSupabaseUser(env: Env['Bindings'], user: User): Promise<void> {
  const authUser = await findAuthUser(env, user).catch(() => null);
  if (!authUser || authUser.app_metadata?.chavea_user_id !== user.id) return;
  const client = createServerClient(env);
  await client.auth.admin.deleteUser(authUser.id).catch(() => undefined);
}

export function extractBearerToken(authorization: string | undefined | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

export async function getBearerUser(
  prisma: PrismaClient,
  env: Env['Bindings'],
  accessToken: string,
): Promise<PublicUser | null> {
  const client = createServerClient(env);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) return null;

  const authUser = data.user;
  const mappedId = typeof authUser.app_metadata?.chavea_user_id === 'string'
    ? authUser.app_metadata.chavea_user_id
    : null;

  let user = mappedId ? await prisma.user.findUnique({ where: { id: mappedId } }) : null;
  if (!user && authUser.email) {
    user = await prisma.user.findUnique({ where: { email: normalizeEmail(authUser.email) } });
  }
  if (!user && authUser.phone) {
    user = await prisma.user.findUnique({ where: { phone: normalizePhone(authUser.phone) } });
  }

  if (!user?.isActive) return null;
  return toPublicUser(user);
}

export function getSupabaseAuthProxyConfig(env: Env['Bindings']) {
  return requireSupabaseConfig(env);
}
