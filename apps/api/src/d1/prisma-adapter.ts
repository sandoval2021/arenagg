import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient } from '../generated/d1-client';
import type { D1DatabasePort } from './native-auth.routes';

/**
 * Staged Prisma bridge for existing CHAVEA tournament routes.
 *
 * Prisma 6.19.3 + D1 adapter: no PostgreSQL socket, connection string,
 * Supabase, or Data Proxy. D1 binding is request-scoped.
 *
 * The legacy route layer cannot yet be switched over: audit PostgreSQL-only
 * raw SQL, interactive transactions, and Json fields before cutting over.
 */
export function createD1Prisma(db: D1DatabasePort): PrismaClient {
  const adapter = new PrismaD1(db as unknown as ConstructorParameters<typeof PrismaD1>[0]);
  return new PrismaClient({ adapter });
}
