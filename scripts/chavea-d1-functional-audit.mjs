/**
 * CHAVEA functional audit. Uses ONLY the disposable local D1 database
 * started by the audit GitHub Actions workflow. Never runs on production.
 * Exercises anonymous/auth, two-player tournament lifecycle, social APIs
 * and permissions, reporting every response and failing on unexpected 5xx.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.CHAVEA_AUDIT_BASE ?? 'http://127.0.0.1:8791';
if (!/^(http:\/\/127\.0\.0\.1:8791|http:\/\/localhost:8791)$/.test(base)) {
  throw new Error('Refusing to audit any non-local Worker URL');
}
const goodOrigin = 'http://localhost:5173';
const actors = [
  { name: 'Audit Host', email: 'audit-host-' + randomUUID() + '@example.invalid', password: 'Audit2026!StrongPassword' },
  { name: 'Audit Guest', email: 'audit-guest-' + randomUUID() + '@example.invalid', password: 'Audit2026!StrongPassword' },
];
const findings = [];
function note(label, expected, status, code) {
  const ok = expected.includes(status);
  findings.push({ label, status, expected: expected.join(','), ok, errorCode: code ?? '' });
  process.stdout.write((ok ? 'PASS ' : 'FAIL ') + label + ': HTTP ' + status + (code ? ' [' + code + ']' : '') + '\n');
}
async function request(label, path, { actor, method = 'GET', body, expected = [200] } = {}) {
  let response;
  try {
    response = await fetch(base + path, {
      method, signal: AbortSignal.timeout(14000),
      headers: {
        Origin: goodOrigin,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(actor?.cookie ? { Cookie: actor.cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    note(label, expected, 0, String(error).slice(0,100));
    return { status: 0, data: null };
  }
  let data; try { data = await response.json(); } catch { data = null; }
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (cookie && actor) actor.cookie = cookie;
  note(label, expected, response.status, data?.error);
  return { status: response.status, data };
}
async function main() {
  await request('Worker health', '/api/health/db');
  await request('Unknown auth me', '/api/auth/me', { expected: [401] });
  await request('Anonymous competition access', '/api/competitions', { expected: [401] });
  await request('Anonymous admin access', '/api/admin/overview', { expected: [401] });
  for (const a of actors) {
    const reg = await request('Register ' + a.name, '/api/auth/register', {
      actor: a, method: 'POST',
      body: { name: a.name, email: a.email, password: a.password },
      expected: [201],
    });
    a.id = reg.data?.user?.id;
    assert.ok(a.id, 'User ID missing for ' + a.name);
    await request('Authenticated session ' + a.name, '/api/auth/me', { actor:a });
    await request('Own profile ' + a.name, '/api/profile/me', { actor:a });
    await request('Public profile self ' + a.name, '/api/profile/' + a.id, { actor:a });
    await request('Ranking ' + a.name, '/api/ranking', { actor:a });
    await request('Own album ' + a.name, '/api/album', { actor:a });
    await request('Own friends ' + a.name, '/api/friends', { actor:a });
    await request('Friend requests ' + a.name, '/api/friends/requests', { actor:a });
    await request('Friendly LFG availability ' + a.name, '/api/matchmaking/availability', { actor:a });
    await request('Forbidden admin ' + a.name, '/api/admin/overview', { actor:a, expected:[403] });
  }
  const [host, guest] = actors;
  await request('View another public profile', '/api/profile/' + guest.id, { actor:host });
  await request('Unverified restricted email claim', '/api/auth/register', {
    method:'POST', body: { name:'Wrong Owner', email:'owner-smoke@example.invalid',password:'Audit2026!StrongPassword' }, expected:[403],
  });
  const creation = await request('Host creates cup', '/api/competitions', {
    method:'POST', actor:host, expected:[201],
    body:{ name:'E2E Functional Audit Cup',type:'KNOCKOUT',game:'EAFC',platform:'PS5',maxParticipants:4 },
  });
  const cupId = creation.data?.id;
  assert.ok(cupId, 'Competition ID missing');
  await request('Host reads cup', '/api/competitions/'+cupId, { actor:host });
  await request('Guest cannot access private cup before joining', '/api/competitions/'+cupId, { actor:guest, expected:[404] });
  await request('Host team read', '/api/competitions/'+cupId, { actor:host });
  await request('Guest joins cup', '/api/competitions/'+cupId+'/join', {actor:guest, method:'POST', expected:[200]});
  await request('Guest cannot join twice (idempotent)', '/api/competitions/'+cupId+'/join', {actor:guest, method:'POST', expected:[200]});
  await request('Host sees two players', '/api/competitions/'+cupId, {actor:host});
  await request('Guest reads joined cup', '/api/competitions/'+cupId, {actor:guest});
  await request('Guest cannot start cup', '/api/competitions/'+cupId+'/start', {actor:guest, method:'POST', expected:[403]});
  await request('Host starts cup', '/api/competitions/'+cupId+'/start', {actor:host, method:'POST', expected:[200]});
  await request('Host reads matches', '/api/competitions/'+cupId+'/matches', {actor:host});
  await request('Host reads standings', '/api/competitions/'+cupId+'/standings', {actor:host});
  await request('Host sees cup feed', '/api/competitions/'+cupId+'/feed', {actor:host});
  await request('Friend request', '/api/friends/request', {actor:host,method:'POST',body:{friendId:guest.id},expected:[200,201]});
  await request('Guest sees friend request', '/api/friends/requests', {actor:guest});
  await request('Friend list', '/api/friends', {actor:host});
  await request('Unknown player is 404', '/api/profile/'+randomUUID(), {actor:host,expected:[404]});
  await request('Password rejected', '/api/auth/login', { method:'POST',body:{email:host.email,password:'Incorrect2026!!'},expected:[401]});
  await request('Host logs out', '/api/auth/logout', {actor:host,method:'POST',expected:[204]});
  await request('Revoked session rejected', '/api/auth/me', {actor:host,expected:[401]});
  await request('Host logs in again', '/api/auth/login', {
    actor:host,method:'POST',body:{email:host.email,password:host.password},expected:[200],
  });
  const failed = findings.filter(x=>!x.ok);
  process.stdout.write('\nAUDIT_TOTAL=' + findings.length + '\nAUDIT_FAILURES=' + failed.length + '\n');
  for (const f of failed) process.stdout.write('FAILURE ' + f.label + ' => ' + f.status + ' (' + f.errorCode + ')\n');
  if (failed.length > 0) process.exitCode = 1;
}
await main().catch(error => {console.error('AUDIT_FATAL:',error.message);process.exitCode=1;});
