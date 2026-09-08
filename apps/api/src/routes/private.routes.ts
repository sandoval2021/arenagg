import { Hono } from 'hono';
import type { Env } from '../types/env';
import { requireAuth } from '../middleware/auth.middleware';

export const privateRoutes = new Hono<Env>();
privateRoutes.use('*', requireAuth);
privateRoutes.get('/session', (c) => c.json({ user: c.get('user') }));
