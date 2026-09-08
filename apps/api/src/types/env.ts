import type { PrismaClient } from '@prisma/client';
import type { PublicUser } from '../services/auth.service';

export type Env = {
  Bindings: {
    HYPERDRIVE: { connectionString: string };
    SESSION_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REDIRECT_URI: string;
    WEB_APP_URL: string;
  };
  Variables: {
    prisma: PrismaClient;
    user: PublicUser;
  };
};
