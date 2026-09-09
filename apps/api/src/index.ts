import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { dbMiddleware } from './middleware/db';
import { requireAuth } from './middleware/auth.middleware';
import { requireOwner } from './middleware/owner.middleware';
import { auth } from './routes/auth.routes';
import { devAuth } from './routes/dev-auth.routes';
import { competitions } from './routes/competitions.routes';
import { teamSettings } from './routes/team-settings.routes';
import { defaultShields, ownerShields } from './routes/default-shields.routes';
import { matches } from './routes/matches.routes';
import { matchStats } from './routes/match-stats.routes';
import { evidence } from './routes/evidence.routes';

const app = new Hono<Env>();

const LOCAL_WEB_ORIGIN = 'http://localhost:5173';
const CHAVEA_WEB_ORIGIN = 'https://chavea.pages.dev';
const CHAVEA_PAGES_DEPLOYMENT_ORIGIN = /^https:\/\/[a-f0-9]{8}\.chavea\.pages\.dev$/i;

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, '');
}

function isAllowedWebOrigin(origin: string, configuredOrigin?: string): boolean {
  if (origin === LOCAL_WEB_ORIGIN || origin === CHAVEA_WEB_ORIGIN) return true;
  if (configuredOrigin && origin === configuredOrigin) return true;
  return CHAVEA_PAGES_DEPLOYMENT_ORIGIN.test(origin);
}

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const requestOrigin = normalizeOrigin(origin);
      const configuredOrigin = c.env.WEB_APP_URL ? normalizeOrigin(c.env.WEB_APP_URL) : undefined;

      // Cloudflare Pages emits immutable deployment aliases such as
      // https://0a4acdfc.chavea.pages.dev. Those aliases are controlled by the
      // same Pages project and must be able to call the API during smoke tests
      // and direct-preview access. Any unrelated origin is denied fail-closed.
      return isAllowedWebOrigin(requestOrigin, configuredOrigin) ? requestOrigin : '';
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Dev-Reset-Token'],
    maxAge: 86_400,
  }),
);

// API responses are dynamic Supabase state. Explicitly prevent browser,
// intermediary and legacy PWA caches from reusing JSON across deployments.
app.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
});

app.use('/api/*', dbMiddleware);
app.use('/api/competitions/*', requireAuth);
app.use('/api/matches/*', requireAuth);
app.use('/api/match-stats/*', requireAuth);
app.use('/api/evidence/*', requireAuth);
app.use('/api/default-shields/*', requireAuth);
app.use('/api/owner/*', requireAuth);
app.use('/api/owner/*', requireOwner);

app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/api/health/db', async (c) => {
  await c.get('prisma').$queryRaw`SELECT 1`;
  return c.json({ status: 'ok', database: 'ok' });
});

app.route('/api/auth', auth);
app.route('/api/auth', devAuth);
// Register the hardened team settings router first so PATCH /:id/my-team is
// handled here instead of the legacy implementation kept for compatibility.
app.route('/api/competitions', teamSettings);
app.route('/api/competitions', competitions);
app.route('/api/default-shields', defaultShields);
app.route('/api/owner/default-shields', ownerShields);
app.route('/api/matches', matches);
app.route('/api/match-stats', matchStats);
app.route('/api/evidence', evidence);

app.onError((err, c) => {
  console.error('[api] unhandled error', err);
  if (err.message === 'VERSION_CONFLICT') {
    return c.json({ error: 'VERSION_CONFLICT' }, 409);
  }
  return c.json({ error: 'INTERNAL_SERVER_ERROR' }, 500);
});

export default app;
