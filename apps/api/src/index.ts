import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { dbMiddleware } from './middleware/db';
import { requireAuth } from './middleware/auth.middleware';
import { requireOwner } from './middleware/owner.middleware';
import { auth } from './routes/auth.routes';
import { devAuth } from './routes/dev-auth.routes';
import { competitions } from './routes/competitions.routes';
import { competitionJoin } from './routes/competition-join.routes';
import { lobbyModeration } from './routes/lobby-moderation.routes';
import { teamSettings } from './routes/team-settings.routes';
import { scorers } from './routes/scorers.routes';
import { matchScore } from './routes/match-score.routes';
import { defaultShields, ownerShields } from './routes/default-shields.routes';
import { matches } from './routes/matches.routes';
import { matchStats } from './routes/match-stats.routes';
import { evidence } from './routes/evidence.routes';
import { profile } from './routes/profile.routes';
import { friends } from './routes/friends.routes';
import { competitionFeed, headToHead } from './routes/phase-one-social.routes';
import { ranking } from './routes/ranking.routes';

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

      return isAllowedWebOrigin(requestOrigin, configuredOrigin) ? requestOrigin : '';
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Dev-Reset-Token'],
    maxAge: 86_400,
  }),
);

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
app.use('/api/profile/*', requireAuth);
app.use('/api/friends/*', requireAuth);
app.use('/api/ranking', requireAuth);
app.use('/api/ranking/*', requireAuth);
app.use('/api/owner/*', requireAuth);
app.use('/api/owner/*', requireOwner);

app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/api/health/db', async (c) => {
  await c.get('prisma').$queryRaw`SELECT 1`;
  return c.json({ status: 'ok', database: 'ok' });
});

app.route('/api/auth', auth);
app.route('/api/auth', devAuth);
// Exact hardened/specialized competition routes are mounted before the legacy router.
app.route('/api/competitions', lobbyModeration);
app.route('/api/competitions', competitionJoin);
app.route('/api/competitions', teamSettings);
app.route('/api/competitions', scorers);
app.route('/api/competitions', competitionFeed);
app.route('/api/competitions', competitions);
app.route('/api/default-shields', defaultShields);
app.route('/api/owner/default-shields', ownerShields);
app.route('/api/matches', matchScore);
app.route('/api/matches', matches);
app.route('/api/match-stats', matchStats);
app.route('/api/evidence', evidence);
app.route('/api/profile', headToHead);
app.route('/api/profile', profile);
app.route('/api/friends', friends);
app.route('/api/ranking', ranking);

app.onError((err, c) => {
  console.error('[api] unhandled error', err);
  if (err.message === 'VERSION_CONFLICT') {
    return c.json({ error: 'VERSION_CONFLICT' }, 409);
  }
  return c.json({ error: 'INTERNAL_SERVER_ERROR' }, 500);
});

export default app;
