// Orbit push server: stores each iPhone's reminder schedule and delivers Web Push at the exact minute.
//
// Privacy: task and cycle reminder texts arrive already encrypted by the phone (AES-GCM, key never
// leaves the device), so this server only ever sees *when* to deliver, never *what*.
//
// Design: one Durable Object per device. It holds the subscription, the one-shot reminders and the
// water rule, and keeps a single storage alarm set to the earliest due item, so there is no polling.

import { DurableObject } from 'cloudflare:workers';
import { sendPush, b64u, validSubscription } from './webpush.js';
import '../../web/schedule.js';
import { social } from './social.js';
import { admin } from './admin.js';

export { User, Pair, Registry } from './social.js';

const { nextWater, nextAt } = globalThis.OrbitSchedule;
const MAX_RULES = 60;

const MAX_REMINDERS = 400;
const MAX_BODY = 200_000;
const HORIZON = 62 * 864e5; // accept reminders up to ~2 months ahead
const EARLY = 15_000; // deliver items due within this window together
const STALE = 6 * 3600e3; // reminders this late (device was unreachable) are dropped
const CHANNELS = ['tasks', 'focus', 'cycle', 'test'];

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function sha256(text) {
  return b64u.encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}


function validTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

const isHHMM = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

function cleanWater(w) {
  if (!w || typeof w !== 'object' || !w.on) return null;
  const every = Math.round(Number(w.every));
  if (!(every >= 15 && every <= 720) || !isHHMM(w.start) || !isHHMM(w.end) || w.end < w.start) return null;
  const days = Array.isArray(w.days) ? [...new Set(w.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : [0, 1, 2, 3, 4, 5, 6];
  const goalDay = typeof w.goalDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.goalDay) ? w.goalDay : null;
  return { on: true, every, start: w.start, end: w.end, days, stopAtGoal: !!w.stopAtGoal, goalDay };
}

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Repeating personal reminders (and water). Texts arrive sealed (`c`); only the schedule is readable. */
function cleanRules(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(), out = [];
  for (const r of list) {
    if (!r || typeof r.id !== 'string' || r.id.length > 80 || seen.has(r.id) || typeof r.c !== 'string' || r.c.length > 4000) continue;
    if (!['once', 'daily', 'interval', 'monthly'].includes(r.kind)) continue;
    const days = Array.isArray(r.days) ? [...new Set(r.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))] : null;
    const x = { id: r.id, kind: r.kind, c: r.c, water: !!r.water, until: isDate(r.until) ? r.until : '', days };
    if (r.kind === 'once') { if (!isDate(r.date) || !isHHMM(r.time)) continue; Object.assign(x, { date: r.date, time: r.time }); }
    if (r.kind === 'daily') { const times = (r.times || []).filter(isHHMM).slice(0, 24); if (!times.length) continue; x.times = times; }
    if (r.kind === 'interval') {
      const every = Math.round(Number(r.every));
      if (!(every >= 15 && every <= 720) || !isHHMM(r.start) || !isHHMM(r.end) || r.end < r.start) continue;
      Object.assign(x, { every, start: r.start, end: r.end, stopAtGoal: !!r.stopAtGoal, goalDay: isDate(r.goalDay) ? r.goalDay : null });
    }
    if (r.kind === 'monthly') { const dom = Math.round(Number(r.dom)); if (!(dom >= 1 && dom <= 31) || !isHHMM(r.time)) continue; Object.assign(x, { dom, time: r.time, cal: r.cal === 'jal' ? 'jal' : 'greg' }); }
    seen.add(r.id); out.push(x);
    if (out.length >= MAX_RULES) break;
  }
  return out;
}

function cleanReminders(list, now) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .filter(r => r && typeof r.id === 'string' && r.id.length <= 120 && !seen.has(r.id) && seen.add(r.id)
      && Number.isFinite(r.at) && r.at > now - 60_000 && r.at < now + HORIZON
      && typeof r.c === 'string' && r.c.length <= 4000 && CHANNELS.includes(r.ch))
    .map(r => ({ id: r.id, at: Math.round(r.at), ch: r.ch, c: r.c }))
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_REMINDERS);
}

export class Device extends DurableObject {
  vapid() {
    return { publicKey: this.env.VAPID_PUBLIC, privateJwk: JSON.parse(this.env.VAPID_PRIVATE_JWK), subject: this.env.VAPID_SUBJECT };
  }

  async init(subscription, tokenHash) {
    await this.ctx.storage.put({ sub: subscription, tokenHash, reminders: [], water: null, tz: 'UTC', created: Date.now() });
  }

  async authorized(token) {
    const h = await this.ctx.storage.get('tokenHash');
    return !!h && h === await sha256(token);
  }

  async sync(token, body) {
    if (!(await this.authorized(token))) return { status: 401, data: { error: 'unauthorized' } };
    const now = Date.now();
    const tz = validTz(body.tz) ? body.tz : 'UTC';
    const reminders = cleanReminders(body.reminders, now);
    const water = cleanWater(body.water);
    const rules = cleanRules(body.rules);
    const patch = { reminders, water, rules, tz, synced: now };
    if (body.subscription && validSubscription(body.subscription, this.env)) patch.sub = body.subscription;
    await this.ctx.storage.put(patch);
    const next = await this.reschedule();
    return { status: 200, data: { ok: true, reminders: reminders.length, water: !!water, rules: rules.length, next } };
  }

  async test(token) {
    if (!(await this.authorized(token))) return { status: 401, data: { error: 'unauthorized' } };
    const r = await this.deliver({ id: 'test', k: 'test' }, { ttl: 300, urgency: 'high' });
    return { status: r.ok ? 200 : 502, data: { ok: r.ok, status: r.status } };
  }

  async remove(token) {
    if (!(await this.authorized(token))) return { status: 401, data: { error: 'unauthorized' } };
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    return { status: 200, data: { ok: true } };
  }

  /** Sets the storage alarm to the earliest pending item and returns that time. */
  async reschedule() {
    const { reminders = [], water, rules = [], tz = 'UTC', sent = {} } = await this.ctx.storage.get(['reminders', 'water', 'rules', 'tz', 'sent']).then(m => Object.fromEntries(m));
    const now = Date.now();
    // never compute from before the last delivery, so an early alarm can't send the same slot twice
    const nw = water ? nextWater(water, Math.max(now, sent.water || 0), tz) : null;
    const nextRules = {};
    for (const r of rules) { const at = nextAt(r, Math.max(now, sent['rule:' + r.id] || 0), tz); if (at) nextRules[r.id] = at; }
    await this.ctx.storage.put({ nextWater: nw, nextRules });
    const next = Math.min(reminders.length ? reminders[0].at : Infinity, nw || Infinity, ...Object.values(nextRules));
    if (next === Infinity) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
    return next === Infinity ? null : next;
  }

  async deliver(payload, opts) {
    const sub = await this.ctx.storage.get('sub');
    if (!sub) return { ok: false, status: 0, gone: true };
    const r = await sendPush(sub, payload, this.vapid(), opts);
    if (r.gone) { // iPhone removed the app or revoked permission: forget this device
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
    }
    return r;
  }

  async alarm() {
    const now = Date.now();
    const s = Object.fromEntries(await this.ctx.storage.get(['reminders', 'water', 'tz', 'nextWater', 'rules', 'nextRules', 'sent']));
    const sent = s.sent || {};
    const reminders = s.reminders || [];
    const due = reminders.filter(r => r.at <= now + EARLY);
    const later = reminders.filter(r => r.at > now + EARLY);
    await this.ctx.storage.put('reminders', later);

    for (const r of due) {
      if (now - r.at > STALE) continue;
      const res = await this.deliver({ id: r.id, k: r.ch, c: r.c, at: r.at }, { ttl: 6 * 3600, urgency: 'high', topic: r.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) });
      if (res.gone) return;
    }
    if (s.water && s.nextWater && s.nextWater <= now + EARLY && now - s.nextWater < 20 * 60e3) {
      // short TTL: a water nudge delivered an hour late is just noise
      const res = await this.deliver({ id: 'water', k: 'water', at: s.nextWater }, { ttl: 20 * 60, urgency: 'normal', topic: 'water' });
      if (res.gone) return;
      sent.water = s.nextWater;
    }
    for (const r of s.rules || []) {
      const due = (s.nextRules || {})[r.id];
      if (!due || due > now + EARLY) continue;
      sent['rule:' + r.id] = due;
      if (now - due > (r.water ? 20 * 60e3 : STALE)) continue;
      const res = await this.deliver({ id: 'rule:' + r.id, k: r.water ? 'water' : 'rule', c: r.c, at: due },
        { ttl: r.water ? 20 * 60 : 6 * 3600, urgency: r.water ? 'normal' : 'high', topic: ('r' + r.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) });
      if (res.gone) return;
    }
    await this.ctx.storage.put('sent', sent);
    await this.reschedule();
  }
}

function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function parseAuth(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{8,64})\.([A-Za-z0-9_-]{20,128})$/.exec(req.headers.get('Authorization') || '');
  return m ? { id: m[1], token: m[2] } : null;
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Error('too large');
  return JSON.parse(text || '{}');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const h = cors(env, req.headers.get('Origin') || '');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    try {
      if (url.pathname === '/health') return json({ ok: true }, 200, h);
      if (url.pathname === '/vapid') return json({ key: env.VAPID_PUBLIC }, 200, h);
      if (url.pathname.startsWith('/s/')) return await social(req, env, url, (data, status = 200) => json(data, status, h), h);
      if (url.pathname.startsWith('/admin/')) return await admin(req, env, url, (data, status = 200) => json(data, status, h));

      if (url.pathname === '/register' && req.method === 'POST') {
        const body = await readJson(req);
        if (!validSubscription(body.subscription, env)) return json({ error: 'bad subscription' }, 400, h);
        const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
        const token = b64u.encode(crypto.getRandomValues(new Uint8Array(32)));
        await env.DEVICE.get(env.DEVICE.idFromName(id)).init(body.subscription, await sha256(token));
        return json({ id, token }, 200, h);
      }

      const auth = parseAuth(req);
      if (!auth) return json({ error: 'unauthorized' }, 401, h);
      const device = env.DEVICE.get(env.DEVICE.idFromName(auth.id));
      let r;
      if (url.pathname === '/sync' && req.method === 'POST') r = await device.sync(auth.token, await readJson(req));
      else if (url.pathname === '/test' && req.method === 'POST') r = await device.test(auth.token);
      else if (url.pathname === '/device' && req.method === 'DELETE') r = await device.remove(auth.token);
      else return json({ error: 'not found' }, 404, h);
      return json(r.data, r.status, h);
    } catch (e) {
      // bad input is the client's problem (400); anything else is ours (500), logged with a code and no personal data
      if (e instanceof SyntaxError || /too large/.test(String(e && e.message))) return json({ error: 'bad request' }, 400, h);
      console.error('E_SERVER', e && e.name, url.pathname.replace(/\/p\/[^/]+/, '/p/*'));
      return json({ error: 'Something went wrong on the server. Please try again' }, 500, h);
    }
  },
};
