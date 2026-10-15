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
const MAX_PHOTO = 1_800_000;          // per photo (the app sends ~200–500 KB after resizing on the phone)
const MAX_PAIR_MEDIA = 400_000_000;   // per conversation
const MAX_FILE = 15_000_000;          // any other file
const CHUNK = 1_500_000;              // files are stored in pieces (one storage value holds at most 2 MB)
const cleanName = n => String(n || 'file').replace(/[\u0000-\u001f\/\\<>:"|?*]+/g, '_').trim().slice(0, 120) || 'file';
const cleanMime = t => (/^[a-z]+\/[a-z0-9.+-]{1,80}$/i.test(String(t || '')) ? String(t).toLowerCase() : 'application/octet-stream');

/** The image type from the file's first bytes, so nothing but real images is stored or served. */
function imageType(b) {
  const u = new Uint8Array(b.slice(0, 12));
  if (u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return 'image/jpeg';
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...u.slice(0, 4)) === 'RIFF' && String.fromCharCode(...u.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (String.fromCharCode(...u.slice(0, 4)) === 'GIF8') return 'image/gif';
  return null;
}

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
  return { name, emoji, lang: b.lang === 'fa' ? 'fa' : 'en' };
}
/** Notification text in the reader's language. */
const L = (lang, en, fa) => (lang === 'fa' ? fa : en);

const label = p => p.name || '@' + p.handle;
export const user = (env, h) => env.USER.get(env.USER.idFromName(h));
export const pair = (env, id) => env.PAIR.get(env.PAIR.idFromName(id));
export const registry = env => env.REGISTRY.get(env.REGISTRY.idFromName('main'));
export { typeOf, cleanProfile, sha256, todayIn };

/* ================================================================ registry */

/**
 * The admin's view of everything. Durable Objects can't be listed by name, so users and pairs are
 * recorded here as they're created (and when an existing user next opens the app). It also holds the
 * admin's question bank changes: extra questions and hidden built-in ones.
 */
export class Registry extends DurableObject {
  async touchUser(h, p, pids) {
    const cur = await this.ctx.storage.get('u:' + h), now = Date.now();
    const lang = p.lang || (cur && cur.lang) || 'en';
    const changed = !cur || cur.name !== p.name || cur.emoji !== p.emoji || cur.lang !== lang || now - (cur.seen || 0) > 10 * 60e3;
    if (changed) await this.ctx.storage.put('u:' + h, { ...(cur || { created: now }), handle: h, name: p.name, emoji: p.emoji, lang, seen: now });
    for (const id of pids || []) if (!(await this.ctx.storage.get('p:' + id))) await this.ctx.storage.put('p:' + id, { id, members: id.split('~'), created: now });
  }

  async removeUser(h) { await this.ctx.storage.delete('u:' + h); }

  async putPair(id, data) {
    const cur = (await this.ctx.storage.get('p:' + id)) || { id, members: id.split('~'), created: Date.now() };
    await this.ctx.storage.put('p:' + id, { ...cur, ...data });
  }

  async removePair(id) { await this.ctx.storage.delete('p:' + id); }

  async list(prefix) { return [...(await this.ctx.storage.list({ prefix, limit: 5000 })).values()]; }

  async bank() { return (await this.ctx.storage.get('bank')) || { custom: [], disabled: [] }; }

  async setBank(b) { await this.ctx.storage.put('bank', b); return b; }
}

/** All questions a relationship type can get: the built-in pools plus admin-added ones, minus hidden ones. */
export function questionsFor(type, bank) {
  const t = typeOf(type);
  if (!t) return [];
  const off = new Set(bank.disabled || []);
  const custom = (bank.custom || []).filter(c => t.pools.includes(c.pool)).map(c => ({ id: c.id, tier: c.tier, text: c.text, fa: c.fa || null }));
  return Q.forType(type).concat(custom).filter(q => !off.has(q.id));
}

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
    return p ? { handle: p.handle, name: p.name, emoji: p.emoji, lang: p.lang || 'en' } : null;
  }

  async me() {
    const s = await this.all(['profile', 'conns', 'inReq', 'outReq', 'seq', 'tz', 'sub']);
    const { handle, name, emoji } = s.profile;
    return { handle, name, emoji, tz: s.tz, conns: s.conns || {}, inReq: s.inReq || {}, outReq: s.outReq || {}, seq: s.seq || 0, push: !!s.sub };
  }

  async update(b) {
    const s = await this.all(['profile', 'conns']);
    const patch = {};
    if (b.name !== undefined || b.emoji !== undefined || b.lang !== undefined) {
      const p = cleanProfile({ name: b.name ?? s.profile.name, emoji: b.emoji ?? s.profile.emoji, lang: b.lang ?? s.profile.lang });
      patch.profile = { ...s.profile, ...p };
    }
    if (b.tz !== undefined && validTz(b.tz)) patch.tz = b.tz;
    if (b.notify && typeof b.notify === 'object') patch.notify = { chat: b.notify.chat !== false, question: b.notify.question !== false };
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
    // the person's notification choices: the event still reaches the app, just without a notification
    const notify = (await this.ctx.storage.get('notify')) || {};
    if (ev.n && ((notify.chat === false && ['msg', 'react', 'req', 'conn'].includes(ev.t)) || (notify.question === false && ['q', 'ans', 'type', 'time'].includes(ev.t)))) ev.n = null;
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
      profiles: { [a.handle]: { name: a.name, emoji: a.emoji, lang: a.lang || 'en' }, [b.handle]: { name: b.name, emoji: b.emoji, lang: b.lang || 'en' } },
      mseq: 0, read: {}, asked: [],
    });
    await registry(this.env).putPair(id, { members: [a.handle, b.handle], type: null, created: Date.now() });
  }

  async meta() { return this.ctx.storage.get('meta'); }

  other(meta, h) { return meta.members.find(x => x !== h); }

  async tell(h, e) { return user(this.env, h).event(e); }

  name(profiles, h) { return (profiles[h] && profiles[h].name) || '@' + h; }

  /** A day's question as one member may see it: the partner's answer stays hidden until you answer. */
  view(meta, profiles, d, h) {
    const o = this.other(meta, h), mine = d.ans[h], theirs = d.ans[o];
    return { day: d.day, qid: d.id, qfa: d.fa || null, q: this.forReader(d.text, profiles, h, d.id, d.fa), at: d.at, mine: mine ? mine.text : null, mineAt: mine ? mine.at : null,
      theirs: mine && theirs ? theirs.text : null, theirsAt: mine && theirs ? theirs.at : null, theyAnswered: !!theirs };
  }

  /** Questions are about the other person: "{them}" becomes their first name for whoever reads it. */
  forReader(text, profiles, h, qid, fa) {
    if (profiles[h] && profiles[h].lang === 'fa' && (fa || (qid && Q.faById(qid)))) text = fa || Q.faById(qid); // their language
    const o = this.other({ members: Object.keys(profiles) }, h);
    const nm = ((profiles[o] && profiles[o].name) || '').trim().split(/\s+/)[0] || '@' + o;
    return String(text).replace(/\{them\}/g, nm);
  }

  async lastDay() {
    const l = await this.ctx.storage.list({ prefix: 'd:', reverse: true, limit: 1 });
    return [...l.values()][0] || null;
  }

  async summary(h) {
    const s = await this.all(['meta', 'profiles', 'read']);
    const { meta, profiles } = s, read = s.read || {}, o = this.other(meta, h);
    const lastL = await this.ctx.storage.list({ prefix: 'm:', reverse: true, limit: 30 });
    const last = [...lastL.values()].find(m => !m.deleted) || null;
    const after = await this.ctx.storage.list({ prefix: 'm:', start: 'm:' + pad((read[h] || 0) + 1), limit: 100 });
    const unread = [...after.values()].filter(m => m.by !== h && !m.deleted).length;
    const d = await this.lastDay();
    const today = d ? this.view(meta, profiles, d, h) : null;
    return {
      id: meta.id, with: { handle: o, ...(profiles[o] || {}) }, type: meta.type, proposal: meta.proposal, time: meta.time, tz: meta.tz, timeProposal: meta.timeProposal || null,
      last, unread, theirRead: read[o] || 0, today, todayKey: todayIn(meta.tz), asked: meta.n,
    };
  }

  async state(h) {
    const sum = await this.summary(h);
    const msgs = await this.ctx.storage.list({ prefix: 'm:', reverse: true, limit: 60 });
    return { ...sum, messages: [...msgs.values()].filter(m => !m.deleted).reverse(), days: await this.days(h) };
  }

  async messages(h, before) {
    const opts = { prefix: 'm:', reverse: true, limit: 60 };
    if (before) opts.end = 'm:' + pad(before);
    const msgs = await this.ctx.storage.list(opts);
    return [...msgs.values()].filter(m => !m.deleted).reverse();
  }

  async days(h, before) {
    const { meta, profiles } = await this.all(['meta', 'profiles']);
    const opts = { prefix: 'd:', reverse: true, limit: 30 };
    if (before) opts.end = 'd:' + before;
    const l = await this.ctx.storage.list(opts);
    return [...l.values()].map(d => this.view(meta, profiles, d, h));
  }

  /** Stores a photo for a message about to be sent; only the two members can load it back. */
  /** Stores a photo or file for a message about to be sent; only the two members can load it back. */
  async upload(h, bytes, type, name) {
    const used = (await this.ctx.storage.get('fbytes')) || 0;
    if (used + bytes.byteLength > MAX_PAIR_MEDIA) return { error: 'This chat has no room for more files', status: 413 };
    const fid = b64u.encode(crypto.getRandomValues(new Uint8Array(15)));
    if (!name) { // a photo: one piece
      await this.ctx.storage.put({ ['f:' + fid]: { by: h, type, size: bytes.byteLength, at: Date.now(), data: bytes }, fbytes: used + bytes.byteLength });
      return { fid };
    }
    const chunks = Math.ceil(bytes.byteLength / CHUNK) || 1;
    for (let i = 0; i < chunks; i++) await this.ctx.storage.put('fc:' + fid + ':' + i, bytes.slice(i * CHUNK, (i + 1) * CHUNK));
    await this.ctx.storage.put({ ['f:' + fid]: { by: h, kind: 'file', type, name, size: bytes.byteLength, chunks, at: Date.now() }, fbytes: used + bytes.byteLength });
    return { fid, name, size: bytes.byteLength, type };
  }

  async file(fid) {
    const f = await this.ctx.storage.get('f:' + fid);
    if (!f) return null;
    if (f.kind !== 'file') return { type: f.type, data: f.data };
    const out = new Uint8Array(f.size);
    for (let i = 0, o = 0; i < f.chunks; i++) { const c = new Uint8Array(await this.ctx.storage.get('fc:' + fid + ':' + i)); out.set(c, o); o += c.byteLength; }
    return { type: f.type, name: f.name, data: out.buffer, file: true };
  }

  async dropFile(fid) {
    const f = await this.ctx.storage.get('f:' + fid);
    if (!f) return;
    if (f.kind === 'file') for (let i = 0; i < f.chunks; i++) await this.ctx.storage.delete('fc:' + fid + ':' + i);
    await this.ctx.storage.delete('f:' + fid);
    await this.ctx.storage.put('fbytes', Math.max(0, ((await this.ctx.storage.get('fbytes')) || 0) - f.size));
  }

  async send(h, text, cid, re, media) {
    const s = await this.all(['meta', 'profiles', 'mseq', 'read']);
    let photo = null;
    if (media && typeof media.fid === 'string') {
      const f = await this.ctx.storage.get('f:' + media.fid);
      if (!f || f.by !== h) return { error: 'file not found', status: 404 };
      photo = f.kind === 'file' ? { fid: media.fid, kind: 'file', name: f.name, size: f.size, type: f.type }
        : { fid: media.fid, width: Math.round(Number(media.width)) || 0, height: Math.round(Number(media.height)) || 0 };
    }
    if (!text && !photo) return { error: 'empty' };
    const seq = (s.mseq || 0) + 1;
    const m = { s: seq, by: h, text, at: Date.now(), cid: typeof cid === 'string' ? cid.slice(0, 40) : undefined };
    if (photo) m.media = photo;
    if (Number.isInteger(re) && re > 0 && re < seq) { // a reply keeps a short copy of what it answers, so it shows without loading old messages
      const orig = await this.ctx.storage.get('m:' + pad(re));
      if (orig && !orig.deleted) {
        const what = orig.media ? (orig.media.kind === 'file' ? '📎 ' + orig.media.name : '📷 Photo') : '';
        m.re = re; m.rq = { by: orig.by, text: clip(orig.text || what, 140) };
        if (orig.media) m.rq[orig.media.kind === 'file' ? 'file' : 'photo'] = true;
      }
    }
    const read = s.read || {};
    read[h] = seq; // sending means you've seen everything before it
    await this.ctx.storage.put({ mseq: seq, ['m:' + pad(seq)]: m, read });
    const id = s.meta.id, o = this.other(s.meta, h);
    const lo = (s.profiles[this.other(s.meta, h)] || {}).lang;
    const label = photo ? (photo.kind === 'file' ? '📎 ' + photo.name : L(lo, '📷 Photo', '📷 عکس')) : '';
    const preview = photo ? label + (text ? ': ' + text : '') : text;
    await this.tell(o, { t: 'msg', pair: id, m, n: { title: this.name(s.profiles, h), body: clip(preview, 160), go: 'pair:' + id, tag: 'msg:' + id } });
    await this.tell(h, { t: 'msg', pair: id, m });
    return m;
  }

  /** Changes the text of your own message (a photo's caption may become empty). Both apps update quietly. */
  async edit(h, seqNo, text) {
    const meta = await this.meta(), key = 'm:' + pad(seqNo), m = await this.ctx.storage.get(key);
    if (!m || m.deleted) return { error: 'no such message', status: 404 };
    if (m.by !== h) return { error: 'You can only edit your own messages', status: 403 };
    if (!text && !m.media) return { error: 'empty' };
    m.text = text; m.edited = Date.now();
    await this.ctx.storage.put(key, m);
    for (const x of meta.members) await this.tell(x, { t: 'edit', pair: meta.id, m });
    return { ok: true, m };
  }

  /** Deletes your own message for both people, photo included; a placeholder keeps the conversation's order. */
  async remove(h, seqNo) {
    const meta = await this.meta(), key = 'm:' + pad(seqNo), m = await this.ctx.storage.get(key);
    if (!m || m.deleted) return { error: 'no such message', status: 404 };
    if (m.by !== h) return { error: 'You can only delete your own messages', status: 403 };
    if (m.media) await this.dropFile(m.media.fid);
    const gone = { s: m.s, by: m.by, at: m.at, deleted: Date.now() };
    await this.ctx.storage.put(key, gone);
    for (const x of meta.members) await this.tell(x, { t: 'del', pair: meta.id, s: m.s });
    return { ok: true };
  }

  /** One reaction per person per message; an empty emoji removes yours. */
  async react(h, seqNo, emoji) {
    const s = await this.all(['meta', 'profiles']);
    const key = 'm:' + pad(seqNo), m = await this.ctx.storage.get(key);
    if (!m || m.deleted) return { error: 'no such message', status: 404 };
    m.rx = m.rx || {};
    if (emoji) m.rx[h] = emoji; else delete m.rx[h];
    if (!Object.keys(m.rx).length) delete m.rx;
    await this.ctx.storage.put(key, m);
    const o = this.other(s.meta, h), id = s.meta.id;
    const ev = { t: 'react', pair: id, s: seqNo, by: h, emoji: emoji || null, rx: m.rx || null };
    await this.tell(o, { ...ev, n: emoji && m.by === o ? { title: this.name(s.profiles, h) + ' reacted ' + emoji, body: 'To: ' + clip(m.text || '📷 Photo', 120), go: 'pair:' + id, tag: 'msg:' + id } : null });
    await this.tell(h, ev);
    return { ok: true, rx: m.rx || null };
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
      await registry(this.env).putPair(id, { type });
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

  /** The question time is shared, so changing it is a request the other person accepts (or not). */
  async setTime(h, time, tz) {
    if (!isHHMM(time)) return { error: 'bad time' };
    const s = await this.all(['meta', 'profiles']);
    const meta = s.meta, o = this.other(meta, h), lo = (s.profiles[o] || {}).lang, nm = this.name(s.profiles, h);
    if (meta.time === time && !meta.timeProposal) return { ok: true };
    meta.timeProposal = { time, tz: validTz(tz) ? tz : meta.tz, by: h, at: Date.now() };
    await this.ctx.storage.put('meta', meta);
    await this.tell(o, { t: 'time', pair: meta.id, state: 'proposed', time, by: h,
      n: { title: L(lo, nm + ' wants the daily question at ' + time, nm + ' می‌خواد سؤال روزانه ساعت ' + time + ' بیاد'), body: L(lo, 'Open Orbit to accept or keep the current time', 'Orbit رو باز کن تا قبول کنی یا همین ساعت بمونه'), go: 'pair:' + meta.id, tag: 'time:' + meta.id } });
    await this.tell(h, { t: 'time', pair: meta.id, state: 'proposed', time, by: h });
    return { ok: true, proposed: true };
  }

  /** The other person answers a time request (yes = use it). Withdrawing your own request uses yes = false. */
  async answerTime(h, yes) {
    const s = await this.all(['meta', 'profiles']);
    const meta = s.meta, p = meta.timeProposal;
    if (!p) return { error: 'no request', status: 404 };
    if (yes && p.by === h) return { error: 'The other person has to accept it', status: 403 };
    meta.timeProposal = null;
    if (yes) { meta.time = p.time; meta.tz = p.tz; }
    await this.ctx.storage.put('meta', meta);
    if (yes) await this.reschedule();
    const by = p.by, lb = (s.profiles[by] || {}).lang, nm = this.name(s.profiles, h);
    if (by !== h) await this.tell(by, { t: 'time', pair: meta.id, state: yes ? 'set' : 'declined', time: p.time, by: h,
      n: yes ? { title: L(lb, 'Daily question moved to ' + p.time, 'سؤال روزانه رفت ساعت ' + p.time), body: L(lb, nm + ' agreed', nm + ' قبول کرد'), go: 'pair:' + meta.id, tag: 'time:' + meta.id }
        : { title: L(lb, nm + ' kept the time at ' + meta.time, nm + ' ساعت ' + meta.time + ' رو نگه داشت'), body: L(lb, 'The daily question time didn\'t change', 'ساعت سؤال روزانه عوض نشد'), go: 'pair:' + meta.id, tag: 'time:' + meta.id } });
    await this.tell(h, { t: 'time', pair: meta.id, state: yes ? 'set' : 'declined', time: p.time, by: h });
    return { ok: true, time: meta.time };
  }

  async answer(h, day, text) {
    const s = await this.all(['meta', 'profiles']);
    const meta = s.meta, d = await this.ctx.storage.get('d:' + day);
    if (!d) return { error: 'no question that day', status: 404 };
    if (d.ans[h]) return { error: 'already answered', status: 409 }; // answers are final: no changing it after seeing theirs
    d.ans[h] = { text, at: Date.now() };
    await this.ctx.storage.put('d:' + day, d);
    const o = this.other(meta, h), both = !!d.ans[o], nm = this.name(s.profiles, h), lo = (s.profiles[o] || {}).lang;
    await this.tell(o, { t: 'ans', pair: meta.id, day, by: h, both,
      n: both ? { title: L(lo, nm + ' answered 💌', nm + ' جواب داد 💌'), body: L(lo, 'See both answers: ', 'جواب هر دوتون رو ببین: ') + clip(this.forReader(d.text, s.profiles, o, d.id, d.fa), 100), go: 'pair:' + meta.id, tag: 'ans:' + meta.id + day }
        : { title: L(lo, nm + ' answered today\'s question', nm + ' به سؤال امروز جواب داد'), body: L(lo, 'Answer it too to see what they said', 'تو هم جواب بده تا جوابش رو ببینی'), go: 'pair:' + meta.id, tag: 'ans:' + meta.id + day } });
    await this.tell(h, { t: 'ans', pair: meta.id, day, by: h, both });
    return { ok: true, day: this.view(meta, s.profiles, d, h) };
  }

  /** Asks today's question unless it was already asked. `sched` marks the daily alarm (Android also arms that one locally). */
  /** Asks today's question unless it was already asked (or `replace`, for the admin, while nobody has answered). */
  async ask(sched, { replace = false, qid = null } = {}) {
    const s = await this.all(['meta', 'profiles', 'asked']);
    const meta = s.meta;
    if (!meta || !meta.type) return null;
    const day = todayIn(meta.tz);
    const existing = await this.ctx.storage.get('d:' + day);
    if (existing && !(replace && !Object.keys(existing.ans).length)) return null;
    const all = questionsFor(meta.type, await registry(this.env).bank());
    if (!all.length) return null;
    let asked = new Set(s.asked || []);
    let q = qid ? all.find(x => x.id === qid) : null;
    if (qid && !q) return null;
    if (!q) {
      let cand = all.filter(x => !asked.has(x.id) && (!existing || x.id !== existing.id));
      if (!cand.length) { asked = new Set(); cand = all; } // went through everything: start over
      // the first days stay light, then personal, then anything
      const maxTier = meta.n < 5 ? 1 : meta.n < 15 ? 2 : 3;
      const easy = cand.filter(x => x.tier <= maxTier);
      if (easy.length) cand = easy;
      q = cand[Math.floor(Math.random() * cand.length)];
    }
    asked.add(q.id);
    if (!existing) meta.n = (meta.n || 0) + 1;
    const d = { day, id: q.id, text: q.text, fa: q.fa || null, at: Date.now(), ans: {} };
    await this.ctx.storage.put({ ['d:' + day]: d, asked: [...asked], meta });
    for (const h of meta.members) {
      const o = this.other(meta, h);
      await this.tell(h, { t: 'q', pair: meta.id, day, sched,
        n: { title: L((s.profiles[h] || {}).lang, '💬 Today\'s question with ', '💬 سؤال امروز با ') + this.name(s.profiles, o), body: this.forReader(q.text, s.profiles, h, q.id, q.fa), go: 'pair:' + meta.id, tag: 'q:' + meta.id } });
    }
    return d;
  }

  /** Everything the admin panel shows about a pair. Message and answer texts stay private: only who answered. */
  async adminInfo() {
    const s = await this.all(['meta', 'profiles', 'mseq', 'asked']);
    if (!s.meta) return null;
    const l = await this.ctx.storage.list({ prefix: 'd:', reverse: true, limit: 120 });
    const days = [...l.values()].map(d => ({ day: d.day, id: d.id, text: d.text, at: d.at, answered: Object.keys(d.ans) }));
    const media = (await this.ctx.storage.get('fbytes')) || 0;
    return { ...s.meta, profiles: s.profiles, messages: s.mseq || 0, media, asked: (s.asked || []).length, days, next: await this.ctx.storage.getAlarm(), today: todayIn(s.meta.tz) };
  }

  /** Admin changes: relationship type, question time and zone. Both apps refresh; nobody gets a notification. */
  async adminSet(b) {
    const meta = await this.meta();
    if (!meta) return { error: 'not found', status: 404 };
    if (b.type !== undefined && b.type !== null && !typeOf(b.type)) return { error: 'unknown type' };
    if (b.time !== undefined && !isHHMM(b.time)) return { error: 'bad time' };
    if (b.tz !== undefined && !validTz(b.tz)) return { error: 'bad time zone' };
    const first = !meta.type && b.type;
    if (b.type !== undefined) { meta.type = b.type; meta.proposal = null; }
    if (b.time !== undefined) { meta.time = b.time; meta.timeProposal = null; }
    if (b.tz !== undefined) meta.tz = b.tz;
    await this.ctx.storage.put('meta', meta);
    await registry(this.env).putPair(meta.id, { type: meta.type });
    for (const h of meta.members) await this.tell(h, { t: 'type', pair: meta.id, type: meta.type, by: 'orbit', state: 'set' });
    if (first) await this.ask(false);
    await this.reschedule();
    return { ok: true };
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
    profiles[h] = { name: p.name, emoji: p.emoji, lang: p.lang || 'en' };
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
    await registry(this.env).removePair(meta.id);
    return { ok: true };
  }
}

/* ================================================================ http */

/** Deletes an account with its connections and pending requests (used by the user and by the admin). */
export async function deleteAccount(env, h) {
  const stub = user(env, h);
  const conns = await stub.connections();
  for (const id of Object.keys(conns)) await pair(env, id).leave(h).catch(() => {});
  const { inReq = {}, outReq = {} } = await stub.requests();
  for (const o of Object.keys(inReq)) await user(env, o).setRequest('out', h, null);
  for (const o of Object.keys(outReq)) await user(env, o).setRequest('in', h, null);
  await stub.destroy();
  await registry(env).removeUser(h);
}

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
export async function social(req, env, url, json, cors = {}) {
  const path = url.pathname.slice(2); // drop "/s"
  const upload = req.method === 'POST' && /\/upload$/.test(path); // a photo: raw bytes, not JSON
  const body = req.method === 'POST' && !upload ? await readJson(req) : {};

  if (path === '/signup' && req.method === 'POST') {
    const handle = String(body.handle || '').trim().toLowerCase().replace(/^@/, '');
    if (!HANDLE.test(handle)) return json({ error: 'Pick 3–20 letters, numbers, dots or underscores, starting with a letter' }, 400);
    const secret = b64u.encode(crypto.getRandomValues(new Uint8Array(32)));
    const ok = await user(env, handle).create(handle, cleanProfile(body), validTz(body.tz) ? body.tz : 'UTC', await sha256(secret));
    if (!ok) return json({ error: 'That ID is taken' }, 409);
    await registry(env).touchUser(handle, await user(env, handle).profile(), []);
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
    await registry(env).touchUser(me, m, Object.keys(m.conns)).catch(() => {});
    const pairs = await Promise.all(Object.keys(m.conns).map(id => pair(env, id).summary(me).catch(() => null)));
    return json({ ...m, pairs: pairs.filter(Boolean) });
  }
  if (path === '/me' && req.method === 'POST') {
    const r = await meStub.update(body);
    if (r.profile) {
      await Promise.all(r.conns.map(id => pair(env, id).setProfile(me, r.profile).catch(() => {})));
      await registry(env).touchUser(me, r.profile, r.conns);
    }
    return json({ ok: true });
  }
  if (path === '/me' && req.method === 'DELETE') {
    await deleteAccount(env, me);
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

  // a pair: /s/p/<id>/<action>, and its photos: /s/p/<id>/file/<fid>
  const pm = /^\/p\/([a-z0-9_.~]{7,41})\/([a-z]+)(?:\/([A-Za-z0-9_-]{10,40}))?$/.exec(path);
  if (pm) {
    const [, pid, action, fid] = pm;
    if (!pid.split('~').includes(me)) return json({ error: 'not found' }, 404);
    const conns = await meStub.connections();
    if (!conns[pid]) return json({ error: 'not found' }, 404);
    const p = pair(env, pid);
    if (action === 'file' && fid && req.method === 'GET') {
      const f = await p.file(fid);
      if (!f) return json({ error: 'not found' }, 404);
      const headers = { ...cors, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Expose-Headers': 'Content-Disposition' };
      // files are only ever downloaded, never shown, so nothing in them can run here
      if (f.file) Object.assign(headers, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(f.name), 'Content-Security-Policy': 'sandbox' });
      else headers['Content-Type'] = f.type;
      return new Response(f.data, { headers });
    }
    if (upload && action === 'upload') {
      const bytes = await req.arrayBuffer();
      const named = url.searchParams.get('name'); // a file (any type) rather than a photo
      if (named) {
        if (bytes.byteLength > MAX_FILE) return json({ error: 'Files can be up to 15 MB' }, 413);
        if (!bytes.byteLength) return json({ error: 'That file is empty' }, 400);
        const r = await p.upload(me, bytes, cleanMime(req.headers.get('Content-Type')), cleanName(named));
        return r.error ? json({ error: r.error }, r.status) : json(r);
      }
      if (bytes.byteLength > MAX_PHOTO) return json({ error: 'That photo is too big' }, 413);
      const type = imageType(bytes);
      if (!type) return json({ error: 'Only photos can be sent' }, 415);
      const r = await p.upload(me, bytes, type);
      return r.error ? json({ error: r.error }, r.status) : json(r);
    }
    const done = r => (r && r.error ? json({ error: r.error }, r.status || 400) : json(r));
    if (action === 'state' && req.method === 'GET') return json(await p.state(me));
    if (action === 'messages' && req.method === 'GET') return json(await p.messages(me, parseInt(url.searchParams.get('before') || '0', 10) || 0));
    if (action === 'days' && req.method === 'GET') return json(await p.days(me, url.searchParams.get('before') || ''));
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    if (action === 'send') {
      const text = cleanText(body.text);
      if (!text && !body.media) return json({ error: 'empty' }, 400);
      const r = await p.send(me, text, body.cid, Number(body.re) || 0, body.media);
      return r.error ? json({ error: r.error }, r.status || 400) : json(r);
    }
    if (action === 'react') {
      const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';
      if (emoji.length > 16 || /[\s<>]/.test(emoji)) return json({ error: 'bad emoji' }, 400);
      return done(await p.react(me, Number(body.s) || 0, emoji));
    }
    if (action === 'edit') return done(await p.edit(me, Number(body.s) || 0, cleanText(body.text)));
    if (action === 'delete') return done(await p.remove(me, Number(body.s) || 0));
    if (action === 'read') return json({ seq: await p.markRead(me, Number(body.seq) || 0) });
    if (action === 'type') return done(await p.propose(me, String(body.type || '')));
    if (action === 'decline') return done(await p.decline(me));
    if (action === 'time') return done(await p.setTime(me, String(body.time || ''), body.tz));
    if (action === 'timeok') return done(await p.answerTime(me, true));
    if (action === 'timeno') return done(await p.answerTime(me, false));
    if (action === 'answer') {
      const text = cleanText(body.text);
      if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.day))) return json({ error: 'empty' }, 400);
      return done(await p.answer(me, body.day, text));
    }
    if (action === 'leave') return done(await p.leave(me));
  }
  return json({ error: 'not found' }, 404);
}
