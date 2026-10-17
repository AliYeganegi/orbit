// End-to-end security checks for People, against a local worker (wrangler dev):
// key handling, sign-out, deleted/edited text really gone, pagination around deleted messages,
// blocking, request cooldown, rate limits, reserved and recently deleted handles.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const W = 'http://127.0.0.1:8795';
const dev = spawn('npx', ['wrangler', 'dev', '--port', '8795', '--ip', '127.0.0.1', '--log-level', 'warn', '--inspector-port', '9235'], { stdio: ['ignore', 'ignore', 'inherit'], detached: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = (path, { method, body, token, raw } = {}) => fetch(W + path, {
  method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));
const run = Date.now().toString(36).slice(-5);
const signup = async (h, name) => { const r = await call('/s/signup', { body: { handle: h, name, tz: 'Asia/Tehran' } }); if (r.status !== 200) console.log('signup', h, r.status, JSON.stringify(r.data)); return r.data && r.data.token; };
const connect = async (ta, tb, a, b) => { await call('/s/connect', { body: { to: b }, token: ta }); return (await call('/s/accept', { body: { from: a }, token: tb })).data.pair.id; };
const ok = m => console.log('✓ ' + m);

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(W + '/health')).ok) break; } catch {} await sleep(500); }
  const A = 'sa' + run, B = 'sb' + run, C = 'sc' + run, D = 'sd' + run;
  const ta = await signup(A, 'Ann'), tb = await signup(B, 'Ben'), tc = await signup(C, 'Cy'), td = await signup(D, 'Di');

  // the key is only accepted in the URL for the live socket
  assert.equal((await fetch(W + '/s/me?t=' + encodeURIComponent(ta))).status, 401, '?t= rejected outside /ws');
  assert.equal((await call('/s/me', { token: ta })).status, 200);
  ok('login key: Authorization header only (URL key only for the live socket)');

  // reserved handles; a deleted handle can't be taken right away
  const rs = await call('/s/signup', { body: { handle: 'orbit', name: 'x' } });
  assert.equal(rs.status, 409, 'reserved ' + JSON.stringify(rs.data));
  const gone = 'gone' + run, tg = await signup(gone, 'G');
  assert.equal((await call('/s/me', { method: 'DELETE', token: tg })).status, 200);
  assert.equal((await call('/s/signup', { body: { handle: gone, name: 'Impostor' } })).status, 409, 'deleted handle stays reserved');
  ok('reserved handles and recently deleted handles cannot be registered');

  // pagination: deleted messages don't shorten pages, so older history stays reachable
  const pid = await connect(ta, tb, A, B);
  for (let i = 1; i <= 70; i++) await call('/s/p/' + pid + '/send', { body: { text: 'msg ' + i }, token: i % 2 ? ta : tb });
  for (let s = 51; s <= 70; s += 2) await call('/s/p/' + pid + '/delete', { body: { s }, token: ta }); // 10 of Ann's latest
  const st = (await call('/s/p/' + pid + '/state', { token: ta })).data;
  assert.equal(st.messages.length, 60, 'a full page despite deletions');
  const older = (await call('/s/p/' + pid + '/messages?before=' + st.messages[0].s, { token: ta })).data;
  assert.equal(st.messages.length + older.length, 60, 'every remaining message reachable');
  ok('pagination skips deleted messages without hiding older history');

  // deleting really removes the text: event history and reply quotes, for both people
  const secret = 'my secret ' + run;
  const orig = (await call('/s/p/' + pid + '/send', { body: { text: secret }, token: tb })).data;
  const reply = (await call('/s/p/' + pid + '/send', { body: { text: 'about that', re: orig.s }, token: ta })).data;
  assert.equal(reply.rq.text, secret);
  await call('/s/p/' + pid + '/react', { body: { s: orig.s, emoji: '❤️' }, token: ta });
  assert.equal((await call('/s/p/' + pid + '/delete', { body: { s: orig.s }, token: tb })).status, 200);
  for (const t of [ta, tb]) {
    const ev = JSON.stringify((await call('/s/events?since=0', { token: t })).data);
    assert.ok(!ev.includes(secret), 'event history no longer contains the deleted text');
  }
  const after = (await call('/s/p/' + pid + '/state', { token: ta })).data.messages.find(m => m.s === reply.s);
  assert.equal(after.rq.text, ''); assert.equal(after.rq.gone, true);
  ok('deleted message text is gone from both event histories, notification previews and reply quotes');

  // editing replaces the old text everywhere too
  const e1 = (await call('/s/p/' + pid + '/send', { body: { text: 'typo here ' + run }, token: tb })).data;
  const r2 = (await call('/s/p/' + pid + '/send', { body: { text: 'quoting', re: e1.s }, token: ta })).data;
  await call('/s/p/' + pid + '/edit', { body: { s: e1.s, text: 'fixed' }, token: tb });
  for (const t of [ta, tb]) assert.ok(!JSON.stringify((await call('/s/events?since=0', { token: t })).data).includes('typo here ' + run), 'old text gone after edit');
  assert.equal((await call('/s/p/' + pid + '/state', { token: ta })).data.messages.find(m => m.s === r2.s).rq.text, 'fixed');
  ok('edited message: old text removed from event histories, quotes updated');

  // message rate limit
  let limited = false;
  for (let i = 0; i < 70 && !limited; i++) limited = (await call('/s/p/' + pid + '/send', { body: { text: 'flood ' + i }, token: ta })).status === 429;
  assert.ok(limited, 'sending is rate limited');
  ok('sending is rate limited (429)');

  // blocking: requests vanish silently, search finds nothing, the connection ends
  await call('/s/block', { body: { handle: A }, token: tb });
  assert.equal((await call('/s/me', { token: ta })).data.pairs.length, 0, 'block ends the connection');
  assert.equal((await call('/s/find?h=' + B, { token: ta })).status, 404, 'blocked user cannot find you');
  assert.equal((await call('/s/connect', { body: { to: B }, token: ta })).data.pending, true, "requester isn't told");
  assert.ok(!(await call('/s/me', { token: tb })).data.inReq[A], 'no request reaches the blocker');
  assert.deepEqual((await call('/s/blocks', { token: tb })).data.blocks, [A]);
  await call('/s/unblock', { body: { handle: A }, token: tb });
  assert.deepEqual((await call('/s/blocks', { token: tb })).data.blocks, []);
  ok('block: ends the connection, hides you from search, silently drops their requests; unblock works');

  // cooldown after a declined request
  await call('/s/connect', { body: { to: D }, token: tc });
  await call('/s/decline', { body: { from: C }, token: td });
  assert.equal((await call('/s/connect', { body: { to: D }, token: tc })).status, 429, 'cannot re-ask right away');
  ok('declined requests have a cooldown (no request spam)');

  // search rate limit
  let fl = false;
  for (let i = 0; i < 70 && !fl; i++) fl = (await call('/s/find?h=nobody' + i, { token: tc })).status === 429;
  assert.ok(fl); ok('search is rate limited (no handle enumeration)');

  // sign out everywhere, and key rotation
  const rot = (await call('/s/rotate', { body: {}, token: tc })).data;
  assert.equal((await call('/s/me', { token: tc })).status, 401, 'old key stops working');
  assert.equal((await call('/s/me', { token: rot.token })).status, 200, 'new key works');
  assert.equal((await call('/s/logout', { body: {}, token: rot.token })).status, 200);
  assert.equal((await call('/s/me', { token: rot.token })).status, 401, 'logout signs out every phone');
  ok('rotate gives a new key and invalidates the old one; logout signs out everywhere');

  // oversize bodies are refused before being read
  const big = await fetch(W + '/s/me', { method: 'POST', headers: { Authorization: 'Bearer ' + ta, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(30000) }) });
  assert.equal(big.status, 400);
  ok('oversize request bodies are rejected');
} finally {
  (() => { try { process.kill(-dev.pid, 'SIGTERM'); } catch { dev.kill('SIGTERM'); } })();
}
