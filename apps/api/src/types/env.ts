import type { PrismaClient } from '@prisma/client';
import type { PublicUser } from '../services/auth.service';

export type Env = {
  Bindings: {
    HYPERDRIVE: { connectionString: string };
    EVIDENCE_BUCKET: R2Bucket;
    EVIDENCE_PUBLIC_BASE_URL?: string;
    SESSION_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REDIRECT_URI: string;
    WEB_APP_URL: string;
  };
  Variables: { prisma: PrismaClient; user: PublicUser };
};
