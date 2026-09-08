import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export type DbEnv={HYPERDRIVE:{connectionString:string}};
export function createPrisma(env:DbEnv){const adapter=new PrismaPg({connectionString:env.HYPERDRIVE.connectionString});return new PrismaClient({adapter});}
