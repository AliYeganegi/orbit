// Orbit admin API, used by web/admin/. Every request needs `Authorization: Admin <ADMIN_TOKEN>`
// (a Worker secret). The admin sees accounts, connections and which questions were asked and
// answered, but never message or answer texts: users were told those are only for the two of them.

import '../../web/questions.js';
import { user, pair, registry, typeOf, cleanProfile, sha256, deleteAccount, questionsFor } from './social.js';

const Q = globalThis.OrbitQuestions;
const POOLS = Object.keys(Q.POOLS);

async function isAdmin(req, env) {
  const t = (req.headers.get('Authorization') || '').replace(/^Admin\s+/, '');
  if (!env.ADMIN_TOKEN || t.length < 24) return false;
  return (await sha256(t)) === (await sha256(env.ADMIN_TOKEN)); // hashing first keeps the comparison time constant
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > 20_000) throw new Error('too large');
  return JSON.parse(text || '{}');
}

/** Handles /admin/* requests. `json(data, status)` adds CORS headers. */
export async function admin(req, env, url, json) {
  if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);
  const path = url.pathname.slice('/admin'.length);
  const body = req.method === 'POST' ? await readJson(req) : {};
  const reg = registry(env);
  const done = r => (r && r.error ? json({ error: r.error }, r.status || 400) : json(r || { ok: true }));

  if (path === '/overview' && req.method === 'GET') {
    const [users, pairs] = await Promise.all([reg.list('u:'), reg.list('p:')]);
    const infos = await Promise.all(pairs.map(p => pair(env, p.id).adminInfo().catch(() => null)));
    const rows = pairs.map((p, i) => {
      const x = infos[i];
      if (!x) return { ...p, missing: true };
      const both = x.days.filter(d => d.answered.length === 2).length;
      return { id: p.id, members: x.members, profiles: x.profiles, type: x.type, proposal: x.proposal, time: x.time, tz: x.tz, created: x.created,
        messages: x.messages, media: x.media || 0, questions: x.days.length, both, lastDay: x.days[0] ? x.days[0].day : null, next: x.next };
    });
    const conns = {};
    for (const r of rows) for (const h of r.members || []) conns[h] = (conns[h] || 0) + 1;
    return json({ users: users.map(u => ({ ...u, connections: conns[u.handle] || 0 })), pairs: rows, types: Q.TYPES });
  }

  // users
  const um = /^\/users\/([a-z][a-z0-9_.]{2,19})$/.exec(path);
  if (um) {
    const h = um[1], stub = user(env, h);
    if (!(await stub.profile())) { await reg.removeUser(h); return json({ error: 'not found' }, 404); }
    if (req.method === 'GET') {
      const m = await stub.me();
      return json({ handle: m.handle, name: m.name, emoji: m.emoji, tz: m.tz, push: m.push, conns: m.conns, inReq: m.inReq, outReq: m.outReq });
    }
    if (req.method === 'POST') {
      const p = cleanProfile({ name: body.name, emoji: body.emoji });
      if (!p.name) return json({ error: 'Name can\'t be empty' }, 400);
      const r = await stub.update(p);
      await Promise.all(r.conns.map(id => pair(env, id).setProfile(h, r.profile).catch(() => {})));
      await reg.touchUser(h, r.profile, r.conns);
      return json({ ok: true });
    }
    if (req.method === 'DELETE') { await deleteAccount(env, h); return json({ ok: true }); }
  }

  // pairs
  const pm = /^\/pairs\/([a-z0-9_.~]{7,41})(\/ask)?$/.exec(path);
  if (pm) {
    const id = pm[1], stub = pair(env, id);
    const info = await stub.adminInfo();
    if (!info) { await reg.removePair(id); return json({ error: 'not found' }, 404); }
    if (pm[2] && req.method === 'POST') {
      // a new question today: only while nobody has answered today's, so no answer is ever thrown away
      const d = await stub.ask(false, { replace: true, qid: body.qid || null });
      return d ? json({ ok: true, day: d.day, text: d.text }) : json({ error: 'Today\'s question was already answered, or that question doesn\'t fit this relationship' }, 409);
    }
    if (pm[2]) return json({ error: 'not found' }, 404);
    if (req.method === 'GET') return json(info);
    if (req.method === 'POST') {
      const b = {};
      for (const k of ['type', 'time', 'tz']) if (body[k] !== undefined) b[k] = body[k];
      return done(await stub.adminSet(b));
    }
    if (req.method === 'DELETE') return done(await stub.leave('orbit'));
  }

  // question bank: admin-added questions and hidden built-in ones
  if (path === '/bank' && req.method === 'GET') return json(await reg.bank());
  if (path === '/bank' && req.method === 'POST') {
    const b = await reg.bank();
    if (body.add) {
      const text = String(body.add.text || '').trim().slice(0, 200), tier = Number(body.add.tier);
      if (!text || !POOLS.includes(body.add.pool) || ![1, 2, 3].includes(tier)) return json({ error: 'Pick a pool, a depth and write the question' }, 400);
      // daily questions are always about the other person, who appears in the text as {them}
      if (!text.includes('{them}')) return json({ error: 'Ask about the other person: put {them} where their name goes' }, 400);
      const fa = String(body.add.fa || '').trim().slice(0, 200);
      if (fa && !fa.includes('{them}')) return json({ error: 'The Persian version needs {them} too' }, 400);
      b.custom.push({ id: 'c.' + body.add.pool + '.' + Date.now().toString(36), pool: body.add.pool, tier, text, fa: fa || undefined, added: Date.now() });
    }
    if (body.remove) b.custom = b.custom.filter(c => c.id !== body.remove);
    if (body.hide !== undefined) {
      const set = new Set(b.disabled);
      if (body.on === false) set.delete(body.hide); else set.add(body.hide);
      b.disabled = [...set];
    }
    return json(await reg.setBank(b));
  }
  // which questions a relationship type can get right now (for "ask this question")
  const tm = /^\/questions\/([a-z]+)$/.exec(path);
  if (tm && req.method === 'GET') {
    if (!typeOf(tm[1])) return json({ error: 'unknown type' }, 404);
    return json(questionsFor(tm[1], await reg.bank()));
  }
  return json({ error: 'not found' }, 404);
}
