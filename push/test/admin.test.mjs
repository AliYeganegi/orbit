// End-to-end: the admin API (web/admin) against the worker running locally (wrangler dev).
// Needs ADMIN_TOKEN in push/.dev.vars (any value of 24+ characters).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const W = 'http://127.0.0.1:8795';
const ADMIN = /^ADMIN_TOKEN=(.*)$/m.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))[1].replace(/^['"]|['"]$/g, '');
const dev = spawn('npx', ['wrangler', 'dev', '--port', '8795', '--ip', '127.0.0.1', '--log-level', 'warn'], { stdio: ['ignore', 'ignore', 'inherit'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = (path, { method, body, token, admin } = {}) => fetch(W + path, {
  method: method || (body ? 'POST' : 'GET'),
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(admin ? { Authorization: 'Admin ' + admin } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));
const A = (path, opts = {}) => call('/admin' + path, { ...opts, admin: ADMIN });
const run = Date.now().toString(36).slice(-5);

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(W + '/health')).ok) break; } catch {} await sleep(500); }

  assert.equal((await call('/admin/overview')).status, 401, 'no token');
  assert.equal((await call('/admin/overview', { admin: 'x'.repeat(30) })).status, 401, 'wrong token');
  console.log('✓ admin token required');

  const a = 'ana' + run, b = 'bob' + run;
  const ta = (await call('/s/signup', { body: { handle: a, name: 'Ana', emoji: '🌸' } })).data.token;
  const tb = (await call('/s/signup', { body: { handle: b, name: 'Bob' } })).data.token;
  await call('/s/connect', { body: { to: b }, token: ta });
  const pid = (await call('/s/accept', { body: { from: a }, token: tb })).data.pair.id;
  await call('/s/p/' + pid + '/send', { body: { text: 'secret message' }, token: ta });

  let ov = (await A('/overview')).data;
  assert.ok(ov.users.some(u => u.handle === a && u.name === 'Ana' && u.connections === 1));
  const row = ov.pairs.find(p => p.id === pid);
  assert.deepEqual([row.type, row.messages, row.questions], [null, 1, 0]);
  assert.ok(!JSON.stringify(ov).includes('secret message'), 'message text never reaches the admin');
  console.log('✓ overview lists users and pairs');

  // relationship type set by the admin: no proposal needed, first question right away
  assert.equal((await A('/pairs/' + pid, { body: { type: 'nope' } })).status, 400);
  assert.equal((await A('/pairs/' + pid, { body: { type: 'married', time: '21:15', tz: 'Asia/Tehran' } })).status, 200);
  let info = (await A('/pairs/' + pid)).data;
  assert.deepEqual([info.type, info.time, info.tz, info.days.length], ['married', '21:15', 'Asia/Tehran', 1]);
  assert.ok(info.next > Date.now(), 'daily alarm armed');
  const st = (await call('/s/p/' + pid + '/state', { token: tb })).data;
  assert.equal(st.type, 'married'); assert.equal(st.days[0].q, info.days[0].text.replaceAll('{them}', 'Ana'), 'Bob is asked about Ana');
  console.log('✓ admin sets type and time; first question asked');

  // replace today's question with a chosen one, only while unanswered
  const qs = (await A('/questions/married')).data;
  assert.ok(qs.length > 300);
  const pick = qs.find(q => q.id !== info.days[0].id);
  const rep = await A('/pairs/' + pid + '/ask', { body: { qid: pick.id } });
  assert.equal(rep.data.text, pick.text);
  assert.equal((await A('/pairs/' + pid)).data.days.length, 1, 'replaced, not added');
  assert.equal((await A('/pairs/' + pid + '/ask', { body: { qid: 'friends.1.0' } })).status, 409, 'question must fit the type');
  await call('/s/p/' + pid + '/answer', { body: { day: info.today, text: 'my private answer' }, token: ta });
  info = (await A('/pairs/' + pid)).data;
  assert.deepEqual(info.days[0].answered, [a]);
  assert.ok(!JSON.stringify(info).includes('my private answer'), 'answer text never reaches the admin');
  assert.equal((await A('/pairs/' + pid + '/ask', { body: {} })).status, 409, 'no replacing once someone answered');
  console.log('✓ replace today\'s question (only while unanswered); answers stay private');

  // question bank: add, hide, remove
  assert.equal((await A('/bank', { body: { add: { pool: 'married', tier: 5, text: 'x' } } })).status, 400);
  assert.equal((await A('/bank', { body: { add: { pool: 'married', tier: 1, text: 'What made you smile today?' } } })).status, 400, 'must be about {them}');
  const bank = (await A('/bank', { body: { add: { pool: 'married', tier: 1, text: 'What did {them} do today that made you smile?' + run } } })).data;
  const custom = bank.custom.find(c => c.text.endsWith(run));
  assert.ok((await A('/questions/married')).data.some(q => q.id === custom.id), 'custom question available to married');
  assert.ok(!(await A('/questions/friends')).data.some(q => q.id === custom.id), 'not to other types');
  await A('/bank', { body: { hide: 'couple.1.0' } });
  assert.ok(!(await A('/questions/dating')).data.some(q => q.id === 'couple.1.0'), 'hidden question gone');
  await A('/bank', { body: { hide: 'couple.1.0', on: false } });
  assert.ok((await A('/questions/dating')).data.some(q => q.id === 'couple.1.0'), 'unhidden');
  await A('/bank', { body: { remove: custom.id } });
  assert.ok(!(await A('/bank')).data.custom.some(c => c.id === custom.id));
  console.log('✓ question bank: add, hide, unhide, remove');

  // users: edit, delete
  assert.equal((await A('/users/' + a, { body: { name: 'Ana K', emoji: '🦋' } })).status, 200);
  assert.equal((await call('/s/me', { token: tb })).data.pairs[0].with.name, 'Ana K', 'partner sees the new name');
  assert.equal((await A('/users/' + a)).data.emoji, '🦋');
  assert.equal((await A('/users/nobody' + run)).status, 404);
  console.log('✓ edit user');

  assert.equal((await A('/pairs/' + pid, { method: 'DELETE' })).status, 200);
  assert.equal((await call('/s/me', { token: ta })).data.pairs.length, 0);
  assert.ok(!(await A('/overview')).data.pairs.some(p => p.id === pid), 'pair gone from the registry');
  assert.equal((await A('/users/' + b, { method: 'DELETE' })).status, 200);
  assert.equal((await call('/s/me', { token: tb })).status, 401);
  ov = (await A('/overview')).data;
  assert.ok(!ov.users.some(u => u.handle === b) && ov.users.some(u => u.handle === a));
  console.log('✓ remove a connection, delete a user');
} finally {
  dev.kill('SIGTERM');
}
