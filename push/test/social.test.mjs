// End-to-end: accounts, connection requests, chat, relationship type and the daily question,
// against the worker running locally (wrangler dev) and a fake push service.
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import ece from 'http_ece';

const W = 'http://127.0.0.1:8797';
const ua = createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.getRandomValues(new Uint8Array(16));
const received = [];
const push = createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const plain = ece.decrypt(Buffer.concat(chunks), { version: 'aes128gcm', privateKey: ua, authSecret: Buffer.from(auth) });
    received.push(JSON.parse(plain));
    res.writeHead(201).end();
  });
}).listen(8796, '127.0.0.1');
const sub = { endpoint: 'http://127.0.0.1:8796/push/sara', keys: { p256dh: Buffer.from(ua.getPublicKey()).toString('base64url'), auth: Buffer.from(auth).toString('base64url') } };

const dev = spawn('npx', ['wrangler', 'dev', '--port', '8797', '--ip', '127.0.0.1', '--log-level', 'warn'], { stdio: ['ignore', 'ignore', 'inherit'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = (path, { method, body, token } = {}) => fetch(W + path, {
  method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));
const waitFor = async (fn, what) => { for (let i = 0; i < 40; i++) { const v = fn(); if (v) return v; await sleep(100); } throw new Error('timed out waiting for ' + what); };
const run = Date.now().toString(36).slice(-5); // fresh handles each run (local storage persists between runs)

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(W + '/health')).ok) break; } catch {} await sleep(500); }

  // accounts
  const A = 'ali' + run, B = 'sara' + run, C = 'carol' + run;
  assert.equal((await call('/s/signup', { body: { handle: 'x!' } })).status, 400, 'bad handle rejected');
  const a = await call('/s/signup', { body: { handle: '@' + A.toUpperCase(), name: 'Ali', emoji: '🦊', tz: 'Asia/Tehran' } });
  assert.equal(a.status, 200); assert.equal(a.data.handle, A, 'handle is normalized');
  assert.equal((await call('/s/signup', { body: { handle: A, name: 'Other' } })).status, 409, 'taken handle rejected');
  const ta = a.data.token;
  const tb = (await call('/s/signup', { body: { handle: B, name: 'Sara', emoji: '🌸', tz: 'Asia/Tehran' } })).data.token;
  const tc = (await call('/s/signup', { body: { handle: C, name: '' } })).data.token;
  assert.equal((await call('/s/me', { token: A + ':' + 'x'.repeat(43) })).status, 401, 'wrong secret rejected');
  assert.equal((await call('/s/me', { body: { sub: { ...sub, endpoint: 'https://evil.example.com/x' } }, token: tb })).status, 200);
  assert.equal((await call('/s/me', { token: tb })).data.push, false, 'non push-service endpoint ignored');
  await call('/s/me', { body: { sub }, token: tb });
  assert.equal((await call('/s/me', { token: tb })).data.push, true);
  console.log('✓ signup, auth, push subscription');

  // search + request
  const f = await call('/s/find?h=' + B, { token: ta });
  assert.deepEqual([f.status, f.data.name, f.data.connected], [200, 'Sara', false]);
  assert.equal((await call('/s/find?h=nobody' + run, { token: ta })).status, 404);
  assert.equal((await call('/s/connect', { body: { to: B }, token: ta })).data.pending, true);
  const reqPush = await waitFor(() => received.find(m => m.title === 'New connection request'), 'request push');
  assert.match(reqPush.body, new RegExp('@' + A)); assert.equal(reqPush.go, 'people');
  assert.ok((await call('/s/me', { token: tb })).data.inReq[A], 'request is in the inbox');
  const acc = await call('/s/accept', { body: { from: A }, token: tb });
  assert.equal(acc.status, 200);
  const pid = acc.data.pair.id;
  assert.equal(pid, [A, B].sort().join('~'));
  const meA = (await call('/s/me', { token: ta })).data;
  assert.equal(meA.pairs.length, 1); assert.equal(meA.pairs[0].with.name, 'Sara'); assert.equal(meA.pairs[0].type, null);
  assert.deepEqual(meA.outReq, {}, 'request cleared once accepted');
  assert.equal((await call('/s/p/' + pid + '/state', { token: tc })).status, 404, 'outsiders can\'t read a pair');
  console.log('✓ find by ID, request, accept');

  // chat: Ali has the app open (socket), Sara doesn't (push)
  const live = [];
  const ws = new WebSocket(W.replace('http', 'ws') + '/s/ws?t=' + encodeURIComponent(ta));
  ws.onmessage = e => live.push(JSON.parse(e.data));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const sent = await call('/s/p/' + pid + '/send', { body: { text: '  hi Ali 👋  ', cid: 'c1' }, token: tb });
  assert.equal(sent.data.text, 'hi Ali 👋');
  const evMsg = await waitFor(() => live.find(x => x.ev.t === 'msg'), 'live message');
  assert.equal(evMsg.ev.m.text, 'hi Ali 👋');
  assert.equal((await call('/s/me', { token: ta })).data.pairs[0].unread, 1);
  const before = received.length;
  await call('/s/p/' + pid + '/send', { body: { text: 'hey Sara' }, token: ta });
  const msgPush = await waitFor(() => received.slice(before).find(m => m.title === 'Ali'), 'message push');
  assert.equal(msgPush.body, 'hey Sara'); assert.equal(msgPush.go, 'pair:' + pid);
  await sleep(300);
  assert.equal(received.slice(before).length, 1, 'sender gets no push for their own message');
  assert.equal((await call('/s/me', { token: ta })).data.pairs[0].unread, 0, 'sending marks the chat read');
  await call('/s/p/' + pid + '/read', { body: { seq: 2 }, token: tb });
  await waitFor(() => live.find(x => x.ev.t === 'read' && x.ev.upto === 2), 'read receipt');
  console.log('✓ chat: live over the socket, push when the app is closed, read receipts');

  // replies carry a short copy of what they answer; one reaction per person, notifying the author
  const rep = await call('/s/p/' + pid + '/send', { body: { text: 'yes!', re: 1 }, token: ta });
  assert.deepEqual([rep.data.re, rep.data.rq.by, rep.data.rq.text], [1, B, 'hi Ali 👋']);
  assert.equal((await call('/s/p/' + pid + '/send', { body: { text: 'x', re: 99 }, token: ta })).data.re, undefined, 'reply to a missing message is a plain message');
  await call('/s/p/' + pid + '/react', { body: { s: 2, emoji: '❤️' }, token: tb });
  const rxLive = await waitFor(() => live.find(x => x.ev.t === 'react' && x.ev.by === B), 'live reaction');
  assert.deepEqual(rxLive.ev.rx, { [B]: '❤️' }); assert.equal(rxLive.ev.n.title, 'Sara reacted ❤️');
  const n0 = received.length;
  await call('/s/p/' + pid + '/react', { body: { s: 1, emoji: '😂' }, token: ta });
  const rxPush = await waitFor(() => received.slice(n0).find(m => m.title === 'Ali reacted 😂'), 'reaction push');
  assert.equal(rxPush.body, 'To: hi Ali 👋');
  await call('/s/p/' + pid + '/react', { body: { s: 1, emoji: '👍' }, token: ta }); // changing it replaces
  await call('/s/p/' + pid + '/react', { body: { s: 2, emoji: '' }, token: tb });   // empty removes
  const msgs = (await call('/s/p/' + pid + '/state', { token: ta })).data.messages;
  assert.deepEqual(msgs.find(m => m.s === 1).rx, { [A]: '👍' });
  assert.equal(msgs.find(m => m.s === 2).rx, undefined);
  assert.equal((await call('/s/p/' + pid + '/react', { body: { s: 77, emoji: '❤️' }, token: ta })).status, 404);
  assert.equal((await call('/s/p/' + pid + '/react', { body: { s: 1, emoji: '<b>' }, token: ta })).status, 400);
  console.log('✓ replies and reactions');

  // relationship type: needs both people, and the first question comes right away
  await call('/s/p/' + pid + '/type', { body: { type: 'married' }, token: ta });
  await waitFor(() => received.find(m => /says you are Married/.test(m.title)), 'proposal push');
  let st = (await call('/s/p/' + pid + '/state', { token: tb })).data;
  assert.equal(st.type, null); assert.deepEqual([st.proposal.type, st.proposal.by], ['married', A]);
  assert.equal(st.days.length, 0, 'no questions before both agree');
  assert.equal((await call('/s/p/' + pid + '/type', { body: { type: 'spouse' }, token: tb })).status, 400);
  const conf = await call('/s/p/' + pid + '/type', { body: { type: 'married' }, token: tb });
  assert.equal(conf.data.set, true);
  st = (await call('/s/p/' + pid + '/state', { token: tb })).data;
  assert.equal(st.type, 'married'); assert.equal(st.proposal, null);
  assert.equal(st.days.length, 1, 'first question asked immediately');
  const day = st.days[0];
  assert.ok(day.q.length > 5); assert.equal(day.day, st.todayKey);
  // questions are about the other person: each sees the other's first name in place of {them}
  const dayA = (await call('/s/p/' + pid + '/state', { token: ta })).data.days[0];
  assert.ok(!day.q.includes('{them}') && day.q.includes('Ali') && dayA.q.includes('Sara'), 'personal question: ' + day.q);
  assert.equal(dayA.q.replaceAll('Sara', '·'), day.q.replaceAll('Ali', '·'));
  await waitFor(() => live.find(x => x.ev.t === 'q' && x.ev.sched === false), 'question event');
  await waitFor(() => received.find(m => m.title.startsWith('💬 Today\'s question with Ali') && m.body === day.q), 'question push');
  console.log('✓ relationship type agreed by both, first question asked right away: "' + day.q + '"');

  // answers stay hidden until you've answered
  const ansA = await call('/s/p/' + pid + '/answer', { body: { day: day.day, text: 'Sunday breakfasts' }, token: ta });
  assert.deepEqual([ansA.data.day.mine, ansA.data.day.theirs], ['Sunday breakfasts', null]);
  const vb = (await call('/s/p/' + pid + '/days', { token: tb })).data[0];
  assert.deepEqual([vb.mine, vb.theirs, vb.theyAnswered], [null, null, true], 'partner answer hidden before answering');
  await waitFor(() => received.find(m => m.title === 'Ali answered today\'s question'), 'answered push');
  const ansB = await call('/s/p/' + pid + '/answer', { body: { day: day.day, text: 'Our walks' }, token: tb });
  assert.deepEqual([ansB.data.day.mine, ansB.data.day.theirs], ['Our walks', 'Sunday breakfasts'], 'both visible after answering');
  const both = await waitFor(() => live.find(x => x.ev.t === 'ans' && x.ev.both), 'both-answered event');
  assert.equal(both.ev.by, B);
  const va = (await call('/s/p/' + pid + '/days', { token: ta })).data[0];
  assert.equal(va.theirs, 'Our walks');
  assert.equal((await call('/s/p/' + pid + '/answer', { body: { day: day.day, text: 'changed' }, token: ta })).status, 409, 'answers are final');
  // asking again the same day does nothing
  await call('/s/p/' + pid + '/type', { body: { type: 'dating' }, token: ta });
  await call('/s/p/' + pid + '/type', { body: { type: 'dating' }, token: tb });
  assert.equal((await call('/s/p/' + pid + '/days', { token: ta })).data.length, 1, 'one question per day');
  console.log('✓ answers hidden until both answer, then shown to both');

  // daily time, events log (what Android's background check reads)
  assert.equal((await call('/s/p/' + pid + '/time', { body: { time: '25:00' }, token: ta })).status, 400);
  assert.equal((await call('/s/p/' + pid + '/time', { body: { time: '21:30', tz: 'Asia/Tehran' }, token: ta })).status, 200);
  const evs = (await call('/s/events?since=0', { token: tb })).data;
  assert.ok(evs.events.length >= 5 && evs.seq === evs.events.at(-1).seq);
  assert.ok(evs.events.some(e => e.t === 'time' && e.n && e.n.title === 'Daily question moved to 21:30'));
  const later = (await call('/s/events?since=' + evs.seq, { token: tb })).data;
  assert.equal(later.events.length, 0);
  console.log('✓ question time, event log');

  // profile changes reach the pair; leaving ends it for both
  await call('/s/me', { body: { name: 'Ali Y' }, token: ta });
  assert.equal((await call('/s/me', { token: tb })).data.pairs[0].with.name, 'Ali Y');
  assert.equal((await call('/s/p/' + pid + '/leave', { body: {}, token: tb })).status, 200);
  assert.equal((await call('/s/me', { token: ta })).data.pairs.length, 0);
  await waitFor(() => live.find(x => x.ev.t === 'gone'), 'gone event');
  assert.equal((await call('/s/p/' + pid + '/state', { token: ta })).status, 404);
  console.log('✓ profile updates, leaving a connection');

  // requesting someone who already requested you connects you
  await call('/s/connect', { body: { to: A }, token: tc });
  const back = await call('/s/connect', { body: { to: C }, token: ta });
  assert.ok(back.data.pair, 'mutual request connects');
  assert.equal(back.data.pair.with.name, C, 'empty name falls back to the handle');
  assert.equal((await call('/s/me', { method: 'DELETE', token: tc })).status, 200);
  assert.equal((await call('/s/me', { token: ta })).data.pairs.length, 0, 'deleting an account removes its connections');
  assert.equal((await call('/s/me', { token: tc })).status, 401);
  console.log('✓ mutual requests, account deletion');
  ws.close();
} finally {
  dev.kill('SIGTERM'); push.close();
}
