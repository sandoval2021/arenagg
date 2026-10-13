import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaD1 } from '@prisma/adapter-d1';
import { PrismaClient as SQLitePrismaClient } from '../generated/d1-client';
import type { D1DatabasePort } from '../d1/native-auth.routes';

export type DbEnv = {
  DATABASE_URL?: string;
  DB?: D1DatabasePort;
};

/**
 * Transitional adapter: staging uses native Cloudflare D1 while the
 * production PostgreSQL path stays untouched until cutover.
 * Both schemas share Prisma models; JSON/native SQL differences must be
 * audited before publishing D1 to production.
 */
export function createPrisma(env: DbEnv): PrismaClient {
  if (env.DB) {
    const adapter = new PrismaD1(env.DB as unknown as ConstructorParameters<typeof PrismaD1>[0]);
    // Existing handlers are typed against the matching PostgreSQL Prisma
    // schema. Runtime D1 queries use the independently generated SQLite client.
    return new SQLitePrismaClient({ adapter }) as unknown as PrismaClient;
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL_NOT_CONFIGURED');
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}
