// People safety controls in the app, against a local worker: block from a chat, see and undo it in settings,
// and sign out other phones with a new login key while this phone stays signed in.
// Usage: PW=<path to playwright> node tests/people-safety.cjs [app url] [worker url]
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const URL = process.argv[2] || 'http://127.0.0.1:8766/';
const API = process.argv[3] || 'http://127.0.0.1:8797';
const ok = m => console.log('✓ ' + m);
const call = (path, body, token) => fetch(API + '/s' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());

(async () => {
  const run = Date.now().toString(36).slice(-5), A = 'pa' + run, B = 'pb' + run;
  const a = await call('/signup', { handle: A, name: 'Ann', tz: 'Asia/Tehran' }), bb = await call('/signup', { handle: B, name: 'Ben', tz: 'Asia/Tehran' });
  await call('/connect', { to: B }, a.token);
  const pair = (await call('/accept', { from: A }, bb.token)).pair.id;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const origin = new globalThis.URL(URL).origin;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: { cookies: [], origins: [{ origin, localStorage: [
    { name: 'orbit.v1', value: JSON.stringify({ settings: { onboarded: true, name: 'Ann' } }) }, { name: 'orbit.social', value: JSON.stringify({ handle: A, token: a.token, seen: 0 }) }] }] } });
  await ctx.addInitScript(api => { window.ORBIT_PUSH_URL = api; }, API);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1500);

  // block from the chat's settings
  await p.evaluate(id => go('pair:' + id), pair); await p.waitForTimeout(1500);
  await p.click('[aria-label="Connection settings"]'); await p.waitForTimeout(500);
  await p.click('.link-btn:has-text("Block")'); await p.waitForTimeout(300);
  await p.click('.sheet .btn:text-is("Block")'); await p.waitForTimeout(1500);
  assert.equal(await p.evaluate(() => nav.screen), 'people');
  assert.deepEqual((await call('/blocks', null, a.token)).blocks, [B]);
  ok('block from a chat ends the connection and is stored on the server');

  // People settings list it; unblock
  await p.click('[aria-label="People settings"]'); await p.waitForTimeout(1200);
  assert.match(await p.textContent('.sheet'), new RegExp('@' + B));
  await p.click('.sheet .btn:text-is("Unblock")'); await p.waitForTimeout(800);
  assert.deepEqual((await call('/blocks', null, a.token)).blocks, []);
  ok('blocked people are listed in People settings and can be unblocked');

  // sign out other phones: new key here, old key dead
  await p.click('.sheet .list-row:has-text("Sign out other phones")'); await p.waitForTimeout(400);
  await p.click('.sheet .btn:text-is("Sign them out")'); await p.waitForTimeout(1200);
  const now = await p.evaluate(() => JSON.parse(localStorage.getItem('orbit.social')).token);
  assert.notEqual(now, a.token);
  const old = await fetch(API + '/s/me', { headers: { Authorization: 'Bearer ' + a.token } });
  assert.equal(old.status, 401, 'old key rejected');
  const me = await call('/me', null, now);
  assert.equal(me.handle, A, 'this phone still signed in with the new key');
  ok('sign out other phones: new key saved here, the old key stops working');
  assert.deepEqual(errs, [], errs.join(' | '));
  await b.close();
  console.log('ALL GOOD');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
