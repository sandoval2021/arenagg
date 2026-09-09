import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export type DbEnv = {
  DATABASE_URL: string;
};

export function createPrisma(env: DbEnv) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL_NOT_CONFIGURED');
  }

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}
