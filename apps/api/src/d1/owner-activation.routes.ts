import { Hono } from 'hono';
import { z } from 'zod';
import { hashPassword } from '../services/auth.service';
import { createSession, sendCookie, type D1DatabasePort } from './native-auth.routes';

type Env = { Bindings: { DB: D1DatabasePort; OWNER_EMAIL?: string } };
type Challenge = {
  challengeId: string;
  userId: string;
  createdAt: string;
  email: string | null;
  role: string;
  isActive: number | boolean;
  passwordHash: string | null;
};
const TTL = 60 * 60 * 1000;
const TOKEN = /^[a-f0-9]{64}$/;
const inputSchema = z.object({
  token: z.string().regex(TOKEN),
  password: z.string().min(12).max(128),
});

export const ownerActivationRoutes = new Hono<Env>();
ownerActivationRoutes.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  await next();
});

async function digest(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function lookup(db: D1DatabasePort, token: string, ownerEmail?: string) {
  if (!TOKEN.test(token) || !ownerEmail) return null;
  const record = await db.prepare(`
    SELECT a."id" AS "challengeId", a."userId" AS "userId",
      a."createdAt" AS "createdAt", u."email" AS "email",
      u."role" AS "role", u."isActive" AS "isActive",
      u."passwordHash" AS "passwordHash"
    FROM "AuthAccount" a
    JOIN "User" u ON a."userId" = u."id"
    WHERE a."provider" = 'owner-email-challenge'
      AND a."providerAccountId" = ?1 LIMIT 1
  `).bind(await digest(token)).first<Challenge>();
  if (!record || record.email?.trim().toLowerCase() !== ownerEmail.trim().toLowerCase() ||
      record.role !== 'USER' || record.isActive || record.passwordHash !== null) return null;
  const issued = Date.parse(record.createdAt);
  if (!Number.isFinite(issued) || issued > Date.now() + 60_000 ||
      Date.now() - issued > TTL) return null;
  return record;
}

function htmlPage(token: string, valid: boolean): string {
  const title = valid ? 'Ative seu acesso proprietário' : 'Link expirado ou inválido';
  const content = valid
    ? `<p>Confirme a titularidade do e-mail definindo uma senha exclusiva para o CHAVEA.</p>
       <form method="post" action="/api/auth/owner/activate">
         <input type="hidden" name="token" value="${token}">
         <label for="password">Nova senha (mínimo 12 caracteres)</label>
         <input id="password" type="password" name="password" autocomplete="new-password"
                minlength="12" maxlength="128" required placeholder="Digite sua nova senha">
         <button type="submit">Ativar minha conta</button>
       </form>
       <small>Esta ativação não pede sua senha do Gmail nem da Cloudflare.</small>`
    : '<p>Este link não está mais disponível. Solicite uma nova ativação pelo suporte do CHAVEA.</p>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} · CHAVEA</title>
    <style>
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f8fc;color:#121b31}
      main{width:100%;max-width:440px;background:#fff;padding:30px 24px;border:1px solid #e2e8f0;
      border-radius:24px;box-shadow:0 14px 50px #0f172a0c}h1{font-size:25px;line-height:1.15;margin:0 0 14px}
      p{color:#526079;line-height:1.6;font-size:15px}label{display:block;margin:24px 0 9px;font-weight:700}
      input{display:block;width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:15px;font-size:16px}
      button{margin-top:20px;background:#073b8c;border:0;color:#fff;border-radius:12px;padding:16px;
      font-size:16px;font-weight:700;width:100%}small{display:block;margin-top:20px;color:#64748b;line-height:1.5}
    </style></head><body><main><h1>${title}</h1>${content}</main></body></html>`;
}

ownerActivationRoutes.get('/activate', async c => {
  const token = c.req.query('token') ?? '';
  const valid = await lookup(c.env.DB, token, c.env.OWNER_EMAIL).catch(() => null);
  return c.html(htmlPage(TOKEN.test(token) ? token : '', Boolean(valid)), valid ? 200 : 410);
});

ownerActivationRoutes.post('/activate', async c => {
  const body = await c.req.parseBody().catch(() => null);
  const input = inputSchema.safeParse(body);
  if (!input.success) return c.json({ error: 'INVALID_INPUT' }, 400);
  // Do not issue a browser session for this URL: staging is on a separate
  // domain from the production PWA. The owner can sign in after cutover.
  const challenge = await lookup(c.env.DB, input.data.token, c.env.OWNER_EMAIL).catch(() => null);
  if (!challenge) return c.html(htmlPage('', false), 410);

  const hashedPassword = await hashPassword(input.data.password);
  const now = new Date().toISOString();
  const batch = await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE "User" SET "passwordHash" = ?1, "role" = 'ADMIN',
        "emailVerified" = ?2, "isActive" = 1, "updatedAt" = ?3
      WHERE "id" = ?4 AND "role" = 'USER' AND "passwordHash" IS NULL
        AND "isActive" = 0
    `).bind(hashedPassword, now, now, challenge.userId),
    c.env.DB.prepare(`
      DELETE FROM "AuthAccount" WHERE "id" = ?1 AND "provider" = 'owner-email-challenge'
    `).bind(challenge.challengeId),
  ]).catch(() => null);
  if (!batch) return c.json({ error: 'ACTIVATION_UNAVAILABLE' }, 503);
  return c.html(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Conta ativada · CHAVEA</title></head><body style="font:16px system-ui;max-width:460px;margin:80px auto;padding:20px">
    <h1>✅ Conta proprietária ativada</h1>
    <p>Seu e-mail foi verificado e a senha foi configurada no Cloudflare D1.</p>
    <p>O site principal será liberado quando a migração estiver concluída. Não é necessário repetir o cadastro.</p>
    </body></html>`, 200);
});
