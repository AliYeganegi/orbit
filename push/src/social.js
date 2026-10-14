// Orbit social: accounts by handle, connection requests, 1:1 chat and a shared daily question.
//
// Unlike reminders this part can't stay on one phone: messages and answers live here so both people
// see them. One Durable Object per user (profile, requests, event log, live sockets, Web Push) and one
// per pair (messages, relationship type, daily questions and the alarm that asks them).
//
// Every change a user should hear about becomes an event in their log. The app gets events live over
// a WebSocket while it's open, Android's background check reads the log, and iPhone gets Web Push.

import { DurableObject } from 'cloudflare:workers';
import { sendPush, b64u, validSubscription } from './webpush.js';
import '../../web/schedule.js';
import '../../web/questions.js';

const { localParts, dayKey, nextAt, isHHMM } = globalThis.OrbitSchedule;
const Q = globalThis.OrbitQuestions;

const HANDLE = /^[a-z][a-z0-9_.]{2,19}$/;
const MAX_TEXT = 2000;
const MAX_EVENTS = 300;
const LIVE = 70_000; // a socket that pinged this recently means the app is open: no push needed
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_TIME = '20:00';

const typeOf = id => Q.TYPES.find(t => t.id === id);
const pairId = (a, b) => [a, b].sort().join('~');
const pad = (n, w = 10) => String(n).padStart(w, '0');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const cleanText = (s, n = MAX_TEXT) => (typeof s === 'string' ? s.replace(/\r\n/g, '\n').trim().slice(0, n) : '');
const validTz = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
const todayIn = tz => dayKey(localParts(Date.now(), tz));

async function sha256(text) {
  return b64u.encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function cleanProfile(b) {
  const name = cleanText(b.name, 40);
  const emoji = cleanText(b.emoji, 16) || '🙂';
  return { name, emoji };
}

const label = p => p.name || '@' + p.handle;
const user = (env, h) => env.USER.get(env.USER.idFromName(h));
const pair = (env, id) => env.PAIR.get(env.PAIR.idFromName(id));

/* ================================================================ user */

export class User extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // pings are answered without waking the object; the timestamp tells us the app is still there
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async all(keys) { return Object.fromEntries(await this.ctx.storage.get(keys)); }

  async create(handle, profile, tz, tokenHash) {
    if (await this.ctx.storage.get('profile')) return false;
    await this.ctx.storage.put({ profile: { handle, ...profile, name: profile.name || handle, created: Date.now() }, tokenHash, tz, conns: {}, inReq: {}, outReq: {}, seq: 0 });
    return true;
  }

  async authorized(token) {
    const h = await this.ctx.storage.get('tokenHash');
    return !!h && h === await sha256(token);
  }

  async profile() {
    const p = await this.ctx.storage.get('profile');
    return p ? { handle: p.handle, name: p.name, emoji: p.emoji } : null;
  }

  async me() {
    const s = await this.all(['profile', 'conns', 'inReq', 'outReq', 'seq', 'tz', 'sub']);
    const { handle, name, emoji } = s.profile;
    return { handle, name, emoji, tz: s.tz, conns: s.conns || {}, inReq: s.inReq || {}, outReq: s.outReq || {}, seq: s.seq || 0, push: !!s.sub };
  }

  async update(b) {
    const s = await this.all(['profile', 'conns']);
    const patch = {};
    if (b.name !== undefined || b.emoji !== undefined) {
      const p = cleanProfile({ name: b.name ?? s.profile.name, emoji: b.emoji ?? s.profile.emoji });
      patch.profile = { ...s.profile, ...p };
    }
    if (b.tz !== undefined && validTz(b.tz)) patch.tz = b.tz;
    if (b.sub === null) await this.ctx.storage.delete('sub');
    else if (b.sub && validSubscription(b.sub, this.env)) patch.sub = b.sub;
    await this.ctx.storage.put(patch);
    return { profile: patch.profile || null, conns: Object.keys(s.conns || {}) };
  }

  async connections() { return (await this.ctx.storage.get('conns')) || {}; }

  /** kind 'in' | 'out'; data null removes the request. */
  async setRequest(kind, handle, data) {
    const key = kind === 'in' ? 'inReq' : 'outReq';
    const reqs = (await this.ctx.storage.get(key)) || {};
    if (data) reqs[handle] = data; else delete reqs[handle];
    await this.ctx.storage.put(key, reqs);
  }

  async requests() { return this.all(['inReq', 'outReq']); }

  async link(pid, other) {
    const conns = (await this.ctx.storage.get('conns')) || {};
    conns[pid] = { with: other, since: Date.now() };
    await this.ctx.storage.put('conns', conns);
  }

  async unlink(pid) {
    const conns = (await this.ctx.storage.get('conns')) || {};
    delete conns[pid];
    await this.ctx.storage.put('conns', conns);
  }

  /** Records an event for this user, hands it to open apps, and pushes it when no app is open. */
  async event(e) {
    const seq = ((await this.ctx.storage.get('seq')) || 0) + 1;
    const ev = { ...e, seq, at: Date.now() };
    await this.ctx.storage.put({ seq, ['ev:' + pad(seq)]: ev });
    if (seq > MAX_EVENTS) await this.ctx.storage.delete('ev:' + pad(seq - MAX_EVENTS));

    const now = Date.now();
    let live = false;
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(JSON.stringify({ t: 'ev', ev })); } catch { continue; }
      const att = ws.deserializeAttachment() || {};
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      if (Math.max(att.at || 0, pinged ? pinged.getTime() : 0) > now - LIVE) live = true;
    }
    if (ev.n && !live) await this.push(ev);
    return seq;
  }

  async push(ev) {
    const sub = await this.ctx.storage.get('sub');
    if (!sub || !this.env.VAPID_PRIVATE_JWK) return;
    try {
      const vapid = { publicKey: this.env.VAPID_PUBLIC, privateJwk: JSON.parse(this.env.VAPID_PRIVATE_JWK), subject: this.env.VAPID_SUBJECT };
      const tag = ev.n.tag || 'social';
      const r = await sendPush(sub, { k: 'social', id: tag, title: ev.n.title, body: ev.n.body, go: ev.n.go, at: ev.at }, vapid,
        { ttl: 24 * 3600, urgency: 'high', topic: tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) });
      if (r.gone) await this.ctx.storage.delete('sub');
    } catch { /* a failed push must never fail the action that caused it */ }
  }

  async events(since) {
    const seq = (await this.ctx.storage.get('seq')) || 0;
    const from = Math.max(since + 1, seq - MAX_EVENTS + 1, 1);
    const list = await this.ctx.storage.list({ prefix: 'ev:', start: 'ev:' + pad(from), limit: 100 });
    return { seq, events: [...list.values()] };
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ at: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage() { /* the app only sends pings, answered by the auto-response */ }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch { }
  }

  async destroy() {
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, 'account deleted'); } catch { } }
    await this.ctx.storage.deleteAll();
  }
}

/* ================================================================ pair */

export class Pair extends DurableObject {
  async all(keys) { return Object.fromEntries(await this.ctx.storage.get(keys)); }

  async init(id, a, b, tz) {
    if (await this.ctx.storage.get('meta')) return;
    await this.ctx.storage.put({
      meta: { id, members: [a.handle, b.handle], type: null, proposal: null, time: DEFAULT_TIME, tz: validTz(tz) ? tz : 'UTC', n: 0, created: Date.now() },
      profiles: { [a.handle]: { name: a.name, emoji: a.emoji }, [b.handle]: { name: b.name, emoji: b.emoji } },
      mseq: 0, read: {}, asked: [],
    });
  }

  async meta() { return this.ctx.storage.get('meta'); }

  other(meta, h) { return meta.members.find(x => x !== h); }

  async tell(h, e) { return user(this.env, h).event(e); }

  name(profiles, h) { return (profiles[h] && profiles[h].name) || '@' + h; }

  /** A day's question as one member may see it: the partner's answer stays hidden until you answer. */
  view(meta, d, h) {
    const o = this.other(meta, h), mine = d.ans[h], theirs = d.ans[o];
    return { day: d.day, q: d.text, at: d.at, mine: mine ? mine.text : null, mineAt: mine ? mine.at : null,
      theirs: mine && theirs ? theirs.text : null, theirsAt: mine && theirs ? theirs.at : null, theyAnswered: !!theirs };
  }

  async lastDay() {
    const l = await this.ctx.storage.list({ prefix: 'd:', reverse: true, limit: 1 });
    return [...l.values()][0] || null;
  }

  async summary(h) {
    const s = await this.all(['meta', 'profiles', 'read']);
    const { meta, profiles } = s, read = s.read || {}, o = this.other(meta, h);
    const lastL = await this.ctx.storage.list({ prefix: 'm:', reverse: true, limit: 1 });
    const last = [...lastL.values()][0] || null;
    const after = await this.ctx.storage.list({ prefix: 'm:', start: 'm:' + pad((read[h] || 0) + 1), limit: 100 });
    const unread = [...after.values()].filter(m => m.by !== h).length;
    const d = await this.lastDay();
    const today = d ? this.view(meta, d, h) : null;
    return {
      id: meta.id, with: { handle: o, ...(profiles[o] || {}) }, type: meta.type, proposal: meta.proposal, time: meta.time, tz: meta.tz,
      last, unread, theirRead: read[o] || 0, today, todayKey: todayIn(meta.tz), asked: meta.n,
    };
  }

  async state(h) {
    const sum = await this.summary(h);
    const msgs = await this.ctx.storage.list({ prefix: 'm:', reverse: true, limit: 60 });
    return { ...sum, messages: [...msgs.values()].reverse(), days: await this.days(h) };
  }

  async messages(h, before) {
    const opts = { prefix: 'm:', reverse: true, limit: 60 };
    if (before) opts.end = 'm:' + pad(before);
    const msgs = await this.ctx.storage.list(opts);
    return [...msgs.values()].reverse();
  }

  async days(h, before) {
    const meta = await this.meta();
    const opts = { prefix: 'd:', reverse: true, limit: 30 };
    if (before) opts.end = 'd:' + before;
    const l = await this.ctx.storage.list(opts);
    return [...l.values()].map(d => this.view(meta, d, h));
  }

  async send(h, text, cid) {
    const s = await this.all(['meta', 'profiles', 'mseq', 'read']);
    const seq = (s.mseq || 0) + 1;
    const m = { s: seq, by: h, text, at: Date.now(), cid: typeof cid === 'string' ? cid.slice(0, 40) : undefined };
    const read = s.read || {};
    read[h] = seq; // sending means you've seen everything before it
    await this.ctx.storage.put({ mseq: seq, ['m:' + pad(seq)]: m, read });
    const id = s.meta.id, o = this.other(s.meta, h);
    await this.tell(o, { t: 'msg', pair: id, m, n: { title: this.name(s.profiles, h), body: clip(text, 160), go: 'pair:' + id, tag: 'msg:' + id } });
    await this.tell(h, { t: 'msg', pair: id, m });
    return m;
  }

  async markRead(h, seq) {
    const s = await this.all(['meta', 'read', 'mseq']);
    const read = s.read || {};
    const v = Math.min(Math.max(read[h] || 0, seq | 0), s.mseq || 0);
    if (v === (read[h] || 0)) return v;
    read[h] = v;
    await this.ctx.storage.put('read', read);
    await this.tell(this.other(s.meta, h), { t: 'read', pair: s.meta.id, by: h, upto: v });
    return v;
  }

  /** Relationship type changes need both people: one proposes, the other accepts by choosing the same. */
  async propose(h, type) {
    const t = typeOf(type);
    if (!t) return { error: 'unknown type' };
    const s = await this.all(['meta', 'profiles']);
    const meta = s.meta, o = this.other(meta, h), id = meta.id;
    if (meta.type === type && !meta.proposal) return { ok: true };
    if (meta.proposal && meta.proposal.by === o && meta.proposal.type === type) {
      const first = !meta.type;
      meta.type = type; meta.proposal = null;
      await this.ctx.storage.put('meta', meta);
      await this.tell(o, { t: 'type', pair: id, type, by: h, state: 'set',
        n: { title: 'You and ' + this.name(s.profiles, h) + ' are now ' + t.l + ' ' + t.e, body: first ? 'Your first daily question is ready. Answer it to see theirs' : 'Daily questions now fit your relationship', go: 'pair:' + id, tag: 'type:' + id } });
      await this.tell(h, { t: 'type', pair: id, type, by: h, state: 'set' });
      await this.ask(false); // start right away instead of waiting for tomorrow's question time
      await this.reschedule();
      return { ok: true, set: true };
    }
    meta.proposal = { type, by: h, at: Date.now() };
    await this.ctx.storage.put('meta', meta);
    await this.tell(o, { t: 'type', pair: id, type, by: h, state: 'proposed',
      n: { title: this.name(s.profiles, h) + ' says you are ' + t.l + ' ' + t.e, body: 'Open Orbit to accept, and your daily questions begin', go: 'pair:' + id, tag: 'type:' + id } });
    await this.tell(h, { t: 'type', pair: id, type, by: h, state: 'proposed' });
    return { ok: true, proposed: true };
  }

  /** Declines the partner's proposal, or withdraws your own. */
  async decline(h) {
    const s = await this.all(['meta', 'profiles']);
    const meta = s.meta, p = meta.proposal;
    if (!p) return { ok: true };
    meta.proposal = null;
    await this.ctx.storage.put('meta', meta);
    const o = this.other(meta, h), mine = p.by === h;
    await this.tell(o, { t: 'type', pair: meta.id, state: mine ? 'withdrawn' : 'declined', by: h,
      n: mine ? null : { title: this.name(s.profiles, h) + ' kept things as they are', body: 'The relationship type didn\'t change', go: 'pair:' + meta.id, tag: 'type:' + meta.id } });
    await this.tell(h, { t: 'type', pair: meta.id, state: mine ? 'withdrawn' : 'declined', by: h });
    return { ok: true };
  }

  async setTime(h, time, tz) {
    if (!isHHMM(time)) return { error: 'bad time' };
    const s = await this.all(['meta', 'profiles']);
    const meta = s.meta;
    meta.time = time;
    if (validTz(tz)) meta.tz = tz;
    await this.ctx.storage.put('meta', meta);
    await this.reschedule();
    const o = this.other(meta, h);
    await this.tell(o, { t: 'time', pair: meta.id, time, tz: meta.tz, by: h,
      n: { title: 'Daily question moved to ' + time, body: this.name(s.profiles, h) + ' changed when your question arrives', go: 'pair:' + meta.id, tag: 'time:' + meta.id } });
    await this.tell(h, { t: 'time', pair: meta.id, time, tz: meta.tz, by: h });
    return { ok: true };
  }

  async answer(h, day, text) {
    const s = await this.all(['meta', 'profiles']);
    const meta = s.meta, d = await this.ctx.storage.get('d:' + day);
    if (!d) return { error: 'no question that day', status: 404 };
    if (d.ans[h]) return { error: 'already answered', status: 409 }; // answers are final: no changing it after seeing theirs
    d.ans[h] = { text, at: Date.now() };
    await this.ctx.storage.put('d:' + day, d);
    const o = this.other(meta, h), both = !!d.ans[o], nm = this.name(s.profiles, h);
    await this.tell(o, { t: 'ans', pair: meta.id, day, by: h, both,
      n: both ? { title: nm + ' answered 💌', body: 'See both answers: ' + clip(d.text, 100), go: 'pair:' + meta.id, tag: 'ans:' + meta.id + day }
        : { title: nm + ' answered today\'s question', body: 'Answer it too to see what they said', go: 'pair:' + meta.id, tag: 'ans:' + meta.id + day } });
    await this.tell(h, { t: 'ans', pair: meta.id, day, by: h, both });
    return { ok: true, day: this.view(meta, d, h) };
  }

  /** Asks today's question unless it was already asked. `sched` marks the daily alarm (Android also arms that one locally). */
  async ask(sched) {
    const s = await this.all(['meta', 'profiles', 'asked']);
    const meta = s.meta;
    if (!meta || !meta.type) return null;
    const day = todayIn(meta.tz);
    if (await this.ctx.storage.get('d:' + day)) return null;
    const all = Q.forType(meta.type);
    if (!all.length) return null;
    let asked = new Set(s.asked || []);
    let cand = all.filter(q => !asked.has(q.id));
    if (!cand.length) { asked = new Set(); cand = all; } // went through everything: start over
    // the first days stay light, then personal, then anything
    const maxTier = meta.n < 5 ? 1 : meta.n < 15 ? 2 : 3;
    const easy = cand.filter(q => q.tier <= maxTier);
    if (easy.length) cand = easy;
    const q = cand[Math.floor(Math.random() * cand.length)];
    asked.add(q.id);
    meta.n = (meta.n || 0) + 1;
    const d = { day, id: q.id, text: q.text, at: Date.now(), ans: {} };
    await this.ctx.storage.put({ ['d:' + day]: d, asked: [...asked], meta });
    for (const h of meta.members) {
      const o = this.other(meta, h);
      await this.tell(h, { t: 'q', pair: meta.id, day, sched,
        n: { title: '💬 Today\'s question with ' + this.name(s.profiles, o), body: q.text, go: 'pair:' + meta.id, tag: 'q:' + meta.id } });
    }
    return d;
  }

  async reschedule() {
    const meta = await this.meta();
    if (!meta || !meta.type) { await this.ctx.storage.deleteAlarm(); return null; }
    const at = nextAt({ kind: 'daily', times: [meta.time], days: ALL_DAYS }, Date.now(), meta.tz);
    if (at) await this.ctx.storage.setAlarm(at); else await this.ctx.storage.deleteAlarm();
    return at;
  }

  async alarm() {
    await this.ask(true);
    await this.reschedule();
  }

  async setProfile(h, p) {
    const profiles = (await this.ctx.storage.get('profiles')) || {};
    profiles[h] = { name: p.name, emoji: p.emoji };
    await this.ctx.storage.put('profiles', profiles);
  }

  /** Ends the connection for both people and deletes the conversation. */
  async leave(h) {
    const meta = await this.meta();
    if (!meta) return { ok: true };
    for (const x of meta.members) {
      await user(this.env, x).unlink(meta.id);
      await user(this.env, x).event({ t: 'gone', pair: meta.id, by: h });
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    return { ok: true };
  }
}

/* ================================================================ http */

function parseToken(req, url) {
  const raw = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, '') || url.searchParams.get('t') || '';
  const m = /^([a-z][a-z0-9_.]{2,19}):([A-Za-z0-9_-]{40,64})$/.exec(raw);
  return m ? { h: m[1], secret: m[2] } : null;
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > 20_000) throw new Error('too large');
  return JSON.parse(text || '{}');
}

/** Handles /s/* requests. `json(data, status)` adds CORS headers. */
export async function social(req, env, url, json) {
  const path = url.pathname.slice(2); // drop "/s"
  const body = req.method === 'POST' ? await readJson(req) : {};

  if (path === '/signup' && req.method === 'POST') {
    const handle = String(body.handle || '').trim().toLowerCase().replace(/^@/, '');
    if (!HANDLE.test(handle)) return json({ error: 'Pick 3–20 letters, numbers, dots or underscores, starting with a letter' }, 400);
    const secret = b64u.encode(crypto.getRandomValues(new Uint8Array(32)));
    const ok = await user(env, handle).create(handle, cleanProfile(body), validTz(body.tz) ? body.tz : 'UTC', await sha256(secret));
    if (!ok) return json({ error: 'That ID is taken' }, 409);
    return json({ handle, token: handle + ':' + secret });
  }

  const tok = parseToken(req, url);
  if (!tok) return json({ error: 'unauthorized' }, 401);
  const meStub = user(env, tok.h);
  if (!(await meStub.authorized(tok.secret))) return json({ error: 'unauthorized' }, 401);
  const me = tok.h;

  if (path === '/ws') return meStub.fetch(req);

  if (path === '/me' && req.method === 'GET') {
    const m = await meStub.me();
    const pairs = await Promise.all(Object.keys(m.conns).map(id => pair(env, id).summary(me).catch(() => null)));
    return json({ ...m, pairs: pairs.filter(Boolean) });
  }
  if (path === '/me' && req.method === 'POST') {
    const r = await meStub.update(body);
    if (r.profile) await Promise.all(r.conns.map(id => pair(env, id).setProfile(me, r.profile).catch(() => {})));
    return json({ ok: true });
  }
  if (path === '/me' && req.method === 'DELETE') {
    const conns = await meStub.connections();
    for (const id of Object.keys(conns)) await pair(env, id).leave(me).catch(() => {});
    const { inReq = {}, outReq = {} } = await meStub.requests();
    for (const h of Object.keys(inReq)) await user(env, h).setRequest('out', me, null);
    for (const h of Object.keys(outReq)) await user(env, h).setRequest('in', me, null);
    await meStub.destroy();
    return json({ ok: true });
  }
  if (path === '/events' && req.method === 'GET') return json(await meStub.events(parseInt(url.searchParams.get('since') || '0', 10) || 0));

  if (path === '/find' && req.method === 'GET') {
    const h = String(url.searchParams.get('h') || '').trim().toLowerCase().replace(/^@/, '');
    if (!HANDLE.test(h)) return json({ error: 'not found' }, 404);
    const p = await user(env, h).profile();
    if (!p) return json({ error: 'not found' }, 404);
    const conns = await meStub.connections();
    return json({ ...p, connected: !!conns[pairId(me, h)], self: h === me });
  }

  // connection requests
  if (['/connect', '/accept', '/decline', '/cancel'].includes(path) && req.method === 'POST') {
    const h = String(body.to || body.from || '').trim().toLowerCase().replace(/^@/, '');
    if (!HANDLE.test(h) || h === me) return json({ error: 'bad user' }, 400);
    const themStub = user(env, h);
    const them = await themStub.profile();
    const mine = await meStub.profile();
    if (!them) return json({ error: 'not found' }, 404);
    const pid = pairId(me, h);
    const conns = await meStub.connections();
    const { inReq = {} } = await meStub.requests();

    const connect = async () => {
      await pair(env, pid).init(pid, them, mine, (await meStub.me()).tz);
      await themStub.link(pid, me); await meStub.link(pid, h);
      await themStub.setRequest('out', me, null); await meStub.setRequest('in', h, null);
      await themStub.setRequest('in', me, null); await meStub.setRequest('out', h, null);
      await themStub.event({ t: 'conn', pair: pid, with: mine,
        n: { title: label(mine) + ' accepted 🎉', body: 'Say hi, then choose what you are to each other to start daily questions', go: 'pair:' + pid, tag: 'conn:' + pid } });
      await meStub.event({ t: 'conn', pair: pid, with: them });
      return json({ ok: true, pair: await pair(env, pid).summary(me) });
    };

    if (path === '/connect') {
      if (conns[pid]) return json({ error: 'Already connected' }, 409);
      if (inReq[h]) return connect(); // they already asked: requesting back is accepting
      const { outReq = {} } = await meStub.requests();
      if (outReq[h]) return json({ ok: true, pending: true });
      await meStub.setRequest('out', h, { ...them, at: Date.now() });
      await themStub.setRequest('in', me, { ...mine, at: Date.now() });
      await themStub.event({ t: 'req', from: mine, n: { title: 'New connection request', body: label(mine) + ' (@' + me + ') wants to connect', go: 'people', tag: 'req:' + me } });
      return json({ ok: true, pending: true });
    }
    if (path === '/accept') {
      if (!inReq[h]) return json({ error: 'No request from them' }, 404);
      return connect();
    }
    if (path === '/decline') {
      await meStub.setRequest('in', h, null); await themStub.setRequest('out', me, null);
      await themStub.event({ t: 'req-gone', with: me });
      return json({ ok: true });
    }
    await meStub.setRequest('out', h, null); await themStub.setRequest('in', me, null); // cancel
    await themStub.event({ t: 'req-gone', with: me });
    return json({ ok: true });
  }

  // a pair: /s/p/<id>/<action>
  const pm = /^\/p\/([a-z0-9_.~]{7,41})\/([a-z]+)$/.exec(path);
  if (pm) {
    const [, pid, action] = pm;
    if (!pid.split('~').includes(me)) return json({ error: 'not found' }, 404);
    const conns = await meStub.connections();
    if (!conns[pid]) return json({ error: 'not found' }, 404);
    const p = pair(env, pid);
    const done = r => (r && r.error ? json({ error: r.error }, r.status || 400) : json(r));
    if (action === 'state' && req.method === 'GET') return json(await p.state(me));
    if (action === 'messages' && req.method === 'GET') return json(await p.messages(me, parseInt(url.searchParams.get('before') || '0', 10) || 0));
    if (action === 'days' && req.method === 'GET') return json(await p.days(me, url.searchParams.get('before') || ''));
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    if (action === 'send') {
      const text = cleanText(body.text);
      if (!text) return json({ error: 'empty' }, 400);
      return json(await p.send(me, text, body.cid));
    }
    if (action === 'read') return json({ seq: await p.markRead(me, Number(body.seq) || 0) });
    if (action === 'type') return done(await p.propose(me, String(body.type || '')));
    if (action === 'decline') return done(await p.decline(me));
    if (action === 'time') return done(await p.setTime(me, String(body.time || ''), body.tz));
    if (action === 'answer') {
      const text = cleanText(body.text);
      if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.day))) return json({ error: 'empty' }, 400);
      return done(await p.answer(me, body.day, text));
    }
    if (action === 'leave') return done(await p.leave(me));
  }
  return json({ error: 'not found' }, 404);
}
