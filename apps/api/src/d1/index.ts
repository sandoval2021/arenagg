import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { routes as authRoutes, type D1DatabasePort } from './native-auth.routes';
import { googleOAuthRoutes } from './google-oauth.routes';
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
  };
};

const app = new Hono<Env>();
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
app.route('/api/auth', authRoutes);
app.route('/api/auth', googleOAuthRoutes);
app.get('/api/media/:scope/:owner/:file', async c => {
  if (!c.env.EVIDENCE_BUCKET) return c.json({ error: 'STORAGE_UNAVAILABLE' }, 503);
  return readPublicImageFromR2(c.env as { EVIDENCE_BUCKET: R2BucketPort },
    `images/${c.req.param('scope')}/${c.req.param('owner')}/${c.req.param('file')}`);
});
app.notFound(c => c.json({ error: 'ROUTE_NOT_YET_MIGRATED' }, 404));
app.onError((_error, c) => c.json({ error: 'INTERNAL_SERVER_ERROR' }, 500));
export default app;
