// End-to-end: runs the worker locally (wrangler dev) against a fake push service.
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import ece from 'http_ece';

const W = 'http://127.0.0.1:8799';
const ua = createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.getRandomValues(new Uint8Array(16));
const received = [];
let respondWith = 201;
const push = createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const plain = ece.decrypt(Buffer.concat(chunks), { version: 'aes128gcm', privateKey: ua, authSecret: Buffer.from(auth) });
    received.push({ t: Date.now(), headers: req.headers, msg: JSON.parse(plain) });
    res.writeHead(respondWith).end();
  });
}).listen(8798, '127.0.0.1');
const sub = { endpoint: 'http://127.0.0.1:8798/push/abc', keys: { p256dh: Buffer.from(ua.getPublicKey()).toString('base64url'), auth: Buffer.from(auth).toString('base64url') } };

const dev = spawn('npx', ['wrangler', 'dev', '--port', '8799', '--ip', '127.0.0.1', '--log-level', 'warn'], { stdio: ['ignore', 'ignore', 'inherit'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = (path, { method = 'POST', body, token } = {}) => fetch(W + path, {
  method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(W + '/health')).ok) break; } catch {} await sleep(500); }

  const bad = await call('/register', { body: { subscription: { ...sub, endpoint: 'https://evil.example.com/x' } } });
  assert.equal(bad.status, 400, 'rejects non push-service endpoints');

  const reg = await call('/register', { body: { subscription: sub } });
  assert.equal(reg.status, 200);
  const token = reg.data.id + '.' + reg.data.token;
  assert.equal((await call('/sync', { token: reg.data.id + '.' + 'x'.repeat(43), body: {} })).status, 401, 'wrong token rejected');
  console.log('✓ register + auth');

  const due = Date.now() + 4000;
  const s = await call('/sync', { token, body: {
    tz: 'Asia/Tehran',
    reminders: [
      { id: 'task:a', at: due, ch: 'tasks', c: 'CIPHERTEXT' },
      { id: 'task:b', at: Date.now() + 3600e3, ch: 'tasks', c: 'LATER' },
      { id: 'bad', at: Date.now() + 1000, ch: 'nope', c: 'x' },
    ],
    water: { on: true, every: 60, start: '09:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6], stopAtGoal: true },
  } });
  assert.equal(s.status, 200);
  assert.equal(s.data.reminders, 2, 'invalid channel dropped');
  assert.ok(s.data.water && s.data.next <= due, 'alarm set to earliest item');
  console.log('✓ sync accepted, alarm armed');

  for (let i = 0; i < 40 && !received.length; i++) await sleep(250);
  assert.equal(received.length, 1, 'one push delivered');
  const p = received[0];
  assert.deepEqual([p.msg.id, p.msg.k, p.msg.c], ['task:a', 'tasks', 'CIPHERTEXT']);
  assert.ok(Math.abs(p.t - due) < 1500, 'delivered within 1.5s of due time (' + (p.t - due) + 'ms)');
  assert.equal(p.headers['content-encoding'], 'aes128gcm');
  assert.equal(p.headers.urgency, 'high');
  assert.match(p.headers.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  console.log('✓ reminder delivered on time (' + (p.t - due) + 'ms), encrypted, VAPID signed');

  const t = await call('/test', { token });
  assert.equal(t.status, 200); assert.equal(received.at(-1).msg.k, 'test');
  console.log('✓ test push');

  // water rule: a one-slot window at the next whole minute (UTC) must fire once, with a short TTL
  const slot = new Date(Math.ceil((Date.now() + 1000) / 60e3) * 60e3);
  const hhmm = String(slot.getUTCHours()).padStart(2, '0') + ':' + String(slot.getUTCMinutes()).padStart(2, '0');
  const ws = await call('/sync', { token, body: { tz: 'UTC', reminders: [], water: { on: true, every: 60, start: hhmm, end: hhmm, days: [0, 1, 2, 3, 4, 5, 6], stopAtGoal: true } } });
  assert.equal(ws.data.next, slot.getTime(), 'water alarm armed for next slot');
  const before = received.length;
  for (let i = 0; i < 300 && received.length === before; i++) await sleep(250);
  const wmsg = received.at(-1);
  assert.equal(wmsg.msg.k, 'water');
  assert.ok(Math.abs(wmsg.t - slot.getTime()) < 1500, 'water on time (' + (wmsg.t - slot.getTime()) + 'ms)');
  assert.equal(wmsg.headers.ttl, '1200');
  const g = await call('/sync', { token, body: { tz: 'UTC', reminders: [], water: { on: true, every: 60, start: hhmm, end: hhmm, days: [0, 1, 2, 3, 4, 5, 6], stopAtGoal: true, goalDay: slot.toISOString().slice(0, 10) } } });
  assert.ok(g.data.next >= slot.getTime() + 864e5 - 60e3, 'goal reached today skips to tomorrow');
  console.log('✓ water rule fires on time (' + (wmsg.t - slot.getTime()) + 'ms), goal pauses the day');

  // personal reminders: a one-time rule a few seconds out, and a daily rule at the next whole minute
  const soon = new Date(Math.ceil((Date.now() + 2000) / 60e3) * 60e3);
  const hm2 = String(soon.getUTCHours()).padStart(2, '0') + ':' + String(soon.getUTCMinutes()).padStart(2, '0');
  const day = soon.toISOString().slice(0, 10);
  const rs = await call('/sync', { token, body: { tz: 'UTC', reminders: [], rules: [
    { id: 'pill', kind: 'daily', times: [hm2], c: 'SEALED-PILL' },
    { id: 'rent', kind: 'once', date: day, time: hm2, c: 'SEALED-RENT' },
    { id: 'bad', kind: 'weekly', c: 'x' },
  ] } });
  assert.equal(rs.data.rules, 2, 'invalid rule kind dropped');
  const n0 = received.length;
  for (let i = 0; i < 300 && received.length < n0 + 2; i++) await sleep(250);
  const got = received.slice(n0).map(x => x.msg);
  assert.deepEqual(got.map(m => m.id).sort(), ['rule:pill', 'rule:rent']);
  assert.ok(got.every(m => m.k === 'rule' && m.c.startsWith('SEALED-')), 'rule payload carries the sealed text');
  assert.ok(Math.abs(received.at(-1).t - soon.getTime()) < 1500, 'on time');
  await sleep(2500);
  assert.equal(received.length, n0 + 2, 'each slot delivered exactly once');
  console.log('✓ personal reminder rules delivered on time, once each, text stays sealed');

  respondWith = 410; // phone unsubscribed
  await call('/test', { token });
  assert.equal((await call('/sync', { token, body: {} })).status, 401, 'device forgotten after 410 Gone');
  console.log('✓ expired subscriptions are cleaned up');

  respondWith = 201;
  const reg2 = await call('/register', { body: { subscription: sub } });
  const tok2 = reg2.data.id + '.' + reg2.data.token;
  const del = await call('/device', { method: 'DELETE', token: tok2 });
  assert.equal(del.status, 200);
  assert.equal((await call('/sync', { token: tok2, body: {} })).status, 401);
  console.log('✓ unregister deletes device data');
} finally {
  dev.kill('SIGTERM'); push.close();
}
