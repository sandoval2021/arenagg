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
import { competitionChat } from './routes/competition-chat.routes';
import { lobbyModeration } from './routes/lobby-moderation.routes';
import { teamSettings } from './routes/team-settings.routes';
import { scorers } from './routes/scorers.routes';
import { matchScore } from './routes/match-score.routes';
import { matchApproval } from './routes/match-approval.routes';
import { matchIntegrity } from './routes/match-integrity.routes';
import { defaultShields, ownerShields } from './routes/default-shields.routes';
import { matches } from './routes/matches.routes';
import { matchStats } from './routes/match-stats.routes';
import { evidence } from './routes/evidence.routes';
import { profile } from './routes/profile.routes';
import { friends } from './routes/friends.routes';
import { competitionFeed, globalFeed, headToHead } from './routes/phase-one-social.routes';
import { ranking } from './routes/ranking.routes';
import { gamification } from './routes/gamification.routes';
import { reputation } from './routes/reputation.routes';
import { matchmaking } from './routes/matchmaking.routes';
import { phaseThreeCompetitions } from './routes/phase-three-competition.routes';
import { phaseThreeMatches } from './routes/phase-three-match.routes';
import { phaseFourCompetitions } from './routes/phase-four-competition.routes';
import { phaseSixCompetitions } from './routes/phase-six-competition.routes';
import { matchMedia } from './routes/match-media.routes';
import { push } from './routes/push.routes';

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
app.use('/api/competitions', requireAuth);
app.use('/api/competitions/*', requireAuth);
app.use('/api/matches/*', requireAuth);
app.use('/api/match-stats/*', requireAuth);
app.use('/api/evidence/*', requireAuth);
app.use('/api/default-shields/*', requireAuth);
app.use('/api/profile/*', requireAuth);
app.use('/api/friends/*', requireAuth);
app.use('/api/ranking', requireAuth);
app.use('/api/ranking/*', requireAuth);
app.use('/api/gamification', requireAuth);
app.use('/api/gamification/*', requireAuth);
app.use('/api/reputation', requireAuth);
app.use('/api/reputation/*', requireAuth);
app.use('/api/matchmaking', requireAuth);
app.use('/api/matchmaking/*', requireAuth);
app.use('/api/feed', requireAuth);
app.use('/api/feed/*', requireAuth);
app.use('/api/push', requireAuth);
app.use('/api/push/*', requireAuth);
app.use('/api/owner/*', requireAuth);
app.use('/api/owner/*', requireOwner);

app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/api/health/db', async (c) => {
  await c.get('prisma').$queryRaw`SELECT 1`;
  return c.json({ status: 'ok', database: 'ok' });
});

app.route('/api/auth', auth);
app.route('/api/auth', devAuth);
app.route('/api/push', push);
app.route('/api/gamification', gamification);
app.route('/api/reputation', reputation);
app.route('/api/matchmaking', matchmaking);
app.route('/api/feed', globalFeed);
// phaseFour wraps /start with push; phaseSix intercepts only GROUP_STAGE;
// other formats keep flowing into the existing canonical routers.
app.route('/api/competitions', phaseFourCompetitions);
app.route('/api/competitions', phaseSixCompetitions);
app.route('/api/competitions', phaseThreeCompetitions);
app.route('/api/competitions', competitionChat);
app.route('/api/competitions', lobbyModeration);
app.route('/api/competitions', competitionJoin);
app.route('/api/competitions', teamSettings);
app.route('/api/competitions', scorers);
app.route('/api/competitions', competitionFeed);
app.route('/api/competitions', competitions);
app.route('/api/default-shields', defaultShields);
app.route('/api/owner/default-shields', ownerShields);
app.route('/api/matches', phaseThreeMatches);
app.route('/api/matches', matchMedia);
app.route('/api/matches', matchIntegrity);
app.route('/api/matches', matchApproval);
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
