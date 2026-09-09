import type { PrismaClient } from '@prisma/client';
import type { R2BucketPort } from '../infrastructure/storage/r2/r2-storage.adapter';
import type { PublicUser } from '../services/auth.service';

export type Env = {
  Bindings: {
    DATABASE_URL: string;
    EVIDENCE_BUCKET: R2BucketPort;
    EVIDENCE_PUBLIC_BASE_URL?: string;
    SESSION_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_REDIRECT_URI?: string;
    WEB_APP_URL: string;
    DEV_PASSWORD_RESET_TOKEN?: string;
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    SUPABASE_SHIELDS_BUCKET: string;
    OWNER_EMAIL: string;
    VAPID_SERVER_PUBLIC_KEY?: string;
    VAPID_SERVER_PRIVATE_KEY?: string;
  };
  Variables: {
    prisma: PrismaClient;
    user: PublicUser;
  };
};
