import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { routes as authRoutes, type D1DatabasePort } from './native-auth.routes';
import { googleOAuthRoutes } from './google-oauth.routes';
import { ownerAdminRoutes } from './owner-admin.routes';
import { createD1Prisma } from './prisma-adapter';
import { readPublicImageFromR2 } from './r2-images';
import type { R2BucketPort } from '../infrastructure/storage/r2/r2-storage.adapter';

type Env = {
  Bindings: {
    DB: D1DatabasePort;
    EVIDENCE_BUCKET?: R2BucketPort;
    WEB_APP_URL?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_REDIRECT_URI?: string;
    OWNER_EMAIL?: string;
    STAGING_ACCESS_KEY?: string;
  };
};

const app = new Hono<Env>();
// Guard isolated staging endpoints. Production has no STAGING_ACCESS_KEY.
app.use('*', async (c, next) => {
  const required = c.env.STAGING_ACCESS_KEY;
  const supplied = c.req.header('X-Chavea-Staging-Key');
  if (required && supplied !== required) {
    // Staging-only diagnostics: lengths reveal no credential bytes.
    return c.json({
      error: 'STAGING_ACCESS_DENIED',
      headerPresent: Boolean(supplied),
      expectedLength: required.length,
      suppliedLength: supplied?.length ?? 0,
    }, 403);
  }
  await next();
});
const DEPLOYMENT_ORIGIN = /^https:\/\/[a-f0-9]{8}\.chavea\.pages\.dev$/i;
function allowOrigin(origin: string, configured?: string): boolean {
  return origin === 'https://chavea.pages.dev' ||
    origin === 'http://localhost:5173' ||
    (configured !== undefined && origin === configured) ||
    DEPLOYMENT_ORIGIN.test(origin);
}
app.use('*', cors({
  origin: (origin, c) => allowOrigin(origin, c.env.WEB_APP_URL) ? origin : '',
  credentials: true,
  allowMethods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('/api/*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  if (!c.req.path.startsWith('/api/media/')) {
    c.header('Cache-Control', 'no-store');
  }
});
app.get('/health', c => c.json({ status: 'ok', backend: 'cloudflare-d1' }));
app.get('/api/health/db', async c => {
  try {
    const row = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    if (!row || row.ok !== 1) return c.json({ status: 'error', database: 'unavailable' }, 503);
    return c.json({ status: 'ok', database: 'd1' });
  } catch {
    return c.json({ status: 'error', database: 'unavailable' }, 503);
  }
});
// Contract check for the Prisma adapter before porting tournament queries.
app.get('/api/health/orm', async c => {
  const prisma = createD1Prisma(c.env.DB);
  try {
    const [accounts, competitions] = await Promise.all([
      prisma.user.count(),
      prisma.competition.count(),
    ]);
    return c.json({ status: 'ok', adapter: 'prisma-d1', accounts, competitions });
  } catch {
    return c.json({ error: 'D1_ORM_UNAVAILABLE' }, 503);
  } finally {
    await prisma.$disconnect();
  }
});
app.route('/api/auth', authRoutes);
app.route('/api/auth', googleOAuthRoutes);
app.route('/api/admin', ownerAdminRoutes);
app.get('/api/media/:scope/:owner/:file', async c => {
  if (!c.env.EVIDENCE_BUCKET) return c.json({ error: 'STORAGE_UNAVAILABLE' }, 503);
  return readPublicImageFromR2(c.env as { EVIDENCE_BUCKET: R2BucketPort },
    `images/${c.req.param('scope')}/${c.req.param('owner')}/${c.req.param('file')}`);
});
app.notFound(c => c.json({ error: 'ROUTE_NOT_YET_MIGRATED' }, 404));
app.onError((_error, c) => c.json({ error: 'INTERNAL_SERVER_ERROR' }, 500));
export default app;
