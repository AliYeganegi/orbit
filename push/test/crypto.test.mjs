import assert from 'node:assert/strict';
import { createECDH, createPublicKey, verify } from 'node:crypto';
import ece from 'http_ece';
import { encryptPayload, vapidHeader, b64u } from '../src/webpush.js';
import '../../web/schedule.js';

// --- payload encryption round-trip against the reference decryptor ---
const ua = createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.getRandomValues(new Uint8Array(16));
const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: b64u.encode(ua.getPublicKey()), auth: b64u.encode(auth) } };
for (const msg of ['{"id":"t1","k":"tasks","c":"xyz"}', 'x'.repeat(3000), '']) {
  const body = await encryptPayload(sub, msg);
  const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, authSecret: Buffer.from(auth) });
  assert.equal(plain.toString(), msg);
}
console.log('✓ aes128gcm payload decrypts with http_ece');

// --- VAPID JWT verifies with the public key ---
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
const pub = b64u.encode(await crypto.subtle.exportKey('raw', kp.publicKey));
const hdr = await vapidHeader('https://web.push.apple.com/abc/def', { publicKey: pub, privateJwk: jwk, subject: 'https://example.com/' });
const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(hdr);
assert.equal(k, pub);
const [h, c, s] = t.split('.');
const claims = JSON.parse(Buffer.from(c, 'base64url'));
assert.equal(claims.aud, 'https://web.push.apple.com');
assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 86400);
const pubKey = createPublicKey({ key: { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)) }, format: 'jwk' });
assert.ok(verify('sha256', Buffer.from(h + '.' + c), { key: pubKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
console.log('✓ VAPID JWT signature valid, aud/exp correct');

// --- water rule expansion ---
const S = globalThis.OrbitSchedule;
const tz = 'Asia/Tehran';
const at = (y, m, d, h, mi) => S.zonedToUtc(y, m, d, h, mi, tz);
const iso = ms => new Date(ms).toLocaleString('en-GB', { timeZone: tz });
const rule = { on: true, every: 60, start: '09:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6], stopAtGoal: true, goalDay: null };
assert.equal(S.nextWater(rule, at(2026, 10, 12, 14, 20), tz), at(2026, 10, 12, 15, 0));
assert.equal(S.nextWater(rule, at(2026, 10, 12, 15, 0), tz), at(2026, 10, 12, 16, 0), 'strictly after');
assert.equal(S.nextWater(rule, at(2026, 10, 12, 22, 5), tz), at(2026, 10, 13, 9, 0), 'rolls to next morning');
assert.equal(S.nextWater({ ...rule, goalDay: '2026-10-12' }, at(2026, 10, 12, 10, 0), tz), at(2026, 10, 13, 9, 0), 'goal reached skips rest of day');
assert.equal(S.nextWater({ ...rule, every: 30 }, at(2026, 10, 12, 9, 10), tz), at(2026, 10, 12, 9, 30));
assert.equal(S.nextWater({ ...rule, every: 120, start: '08:30' }, at(2026, 10, 12, 9, 0), tz), at(2026, 10, 12, 10, 30));
// Oct 12 2026 is a Monday; only Fridays (5)
assert.equal(iso(S.nextWater({ ...rule, days: [5] }, at(2026, 10, 12, 9, 0), tz)), '16/10/2026, 09:00:00');
assert.equal(S.nextWater({ ...rule, on: false }, Date.now(), tz), null);
assert.equal(S.nextWater({ ...rule, days: [] }, Date.now(), tz), null);
assert.equal(S.perDay(rule), 14);
assert.equal(S.perDay({ ...rule, every: 30 }), 27);
// DST zone sanity: Berlin spring-forward day still yields valid 09:00 local
const b = S.zonedToUtc(2026, 3, 29, 9, 0, 'Europe/Berlin');
assert.equal(new Date(b).toLocaleString('en-GB', { timeZone: 'Europe/Berlin' }), '29/03/2026, 09:00:00');
console.log('✓ water schedule: windows, intervals, goal skip, weekdays, DST');

// --- generic reminder rules ---
{
  const tz = 'Asia/Tehran', R = globalThis.OrbitSchedule;
  const at = (y, m, d, h, mi) => R.zonedToUtc(y, m, d, h, mi, tz);
  const from = at(2026, 10, 12, 14, 20); // Monday, 20 Mehr 1405
  // once
  assert.equal(R.nextAt({ kind: 'once', date: '2026-10-13', time: '08:30' }, from, tz), at(2026, 10, 13, 8, 30));
  assert.equal(R.nextAt({ kind: 'once', date: '2026-10-12', time: '09:00' }, from, tz), null, 'past one-time reminder never fires');
  // daily, several times, weekdays only (Sat–Wed in Iran: 6,0,1,2,3)
  const daily = { kind: 'daily', times: ['21:00', '08:00'], days: [6, 0, 1, 2, 3] };
  assert.deepEqual(R.ruleTimes(daily, from, tz, 3), [at(2026, 10, 12, 21, 0), at(2026, 10, 13, 8, 0), at(2026, 10, 13, 21, 0)]);
  assert.equal(R.nextAt(daily, at(2026, 10, 14, 22, 0), tz), at(2026, 10, 17, 8, 0), 'skips Thu/Fri to Saturday');
  // "skip next": a skipped occurrence is left out, the ones after it still come
  assert.deepEqual(R.ruleTimes({ ...daily, skip: [at(2026, 10, 12, 21, 0)] }, from, tz, 2), [at(2026, 10, 13, 8, 0), at(2026, 10, 13, 21, 0)]);
  // interval with end date
  const iv = { kind: 'interval', every: 90, start: '09:00', end: '18:00', until: '2026-10-12' };
  assert.equal(R.nextAt(iv, from, tz), at(2026, 10, 12, 15, 0));
  assert.equal(R.nextAt(iv, at(2026, 10, 12, 18, 1), tz), null, 'ends after the until date');
  // monthly gregorian: 31st falls on the last day of shorter months
  assert.equal(R.nextAt({ kind: 'monthly', dom: 31, cal: 'greg', time: '10:00' }, at(2026, 11, 2, 0, 0), tz), at(2026, 11, 30, 10, 0));
  // monthly shamsi: 1st of each Jalali month (1 Aban 1405 = Oct 23 2026)
  assert.equal(R.nextAt({ kind: 'monthly', dom: 1, cal: 'jal', time: '09:00' }, from, tz), at(2026, 10, 23, 9, 0));
  // 31 Shamsi in Mehr (30 days) → last day of Mehr = 30 Mehr = Oct 22
  assert.equal(R.nextAt({ kind: 'monthly', dom: 31, cal: 'jal', time: '09:00' }, from, tz), at(2026, 10, 22, 9, 0));
  // water as an interval rule with goal pause
  assert.equal(R.nextAt({ kind: 'interval', every: 60, start: '09:00', end: '22:00', stopAtGoal: true, goalDay: '2026-10-12' }, from, tz), at(2026, 10, 13, 9, 0));
  // paused rule
  assert.equal(R.nextAt({ ...daily, on: false }, from, tz), null);
  assert.equal(R.perDay(daily), 2);
  console.log('✓ reminder rules: once, daily times + weekdays, interval + end date, monthly Gregorian/Shamsi incl. short months, pause');
}

// --- DST: rules step calendar days in the zone, so a day with a clock change is never skipped ---
{
  const R = globalThis.OrbitSchedule, tz = 'Europe/Berlin';
  const at = (y, m, d, h, mi) => R.zonedToUtc(y, m, d, h, mi, tz);
  assert.equal(R.nextAt({ kind: 'interval', every: 60, start: '09:00', end: '22:00' }, at(2026, 3, 28, 23, 45), tz), at(2026, 3, 29, 9, 0), 'spring forward day kept');
  assert.equal(R.nextAt({ kind: 'daily', times: ['09:00'] }, at(2026, 10, 24, 23, 30), tz), at(2026, 10, 25, 9, 0), 'fall back day kept');
  assert.equal(R.ruleTimes({ kind: 'daily', times: ['09:00'] }, at(2026, 3, 27, 10, 0), tz, 3).length, 3);
  assert.equal(R.nextAt({ kind: 'daily', times: ['09:00'], days: [0] }, at(2026, 3, 28, 10, 0), tz), at(2026, 3, 29, 9, 0), 'weekday on the DST Sunday');
  console.log('✓ DST transitions: no skipped or doubled days');
}
