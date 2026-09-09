import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { dbMiddleware } from './middleware/db';
import { requireAuth } from './middleware/auth.middleware';
import { auth } from './routes/auth.routes';
import { competitions } from './routes/competitions.routes';
import { matches } from './routes/matches.routes';
import { evidence } from './routes/evidence.routes';

const app = new Hono<Env>();

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://chavea.pages.dev',
]);

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const configuredOrigin = c.env.WEB_APP_URL?.replace(/\/$/, '');
      if (allowedOrigins.has(origin) || (configuredOrigin && origin === configuredOrigin)) {
        return origin;
      }
      return configuredOrigin ?? 'https://chavea.pages.dev';
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);

app.use('/api/*', dbMiddleware);
app.use('/api/competitions/*', requireAuth);
app.use('/api/matches/*', requireAuth);
app.use('/api/evidence/*', requireAuth);

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/api/auth', auth);
app.route('/api/competitions', competitions);
app.route('/api/matches', matches);
app.route('/api/evidence', evidence);

app.onError((err, c) => {
  console.error(err);
  if (err.message === 'VERSION_CONFLICT') {
    return c.json({ error: 'VERSION_CONFLICT' }, 409);
  }
  return c.json({ error: 'INTERNAL_SERVER_ERROR' }, 500);
});

export default app;
