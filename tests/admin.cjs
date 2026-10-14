// Admin panel (web/admin) against the worker running locally: seeds a few users and relations through
// the app API, then signs in to the panel and uses it. Needs ADMIN_TOKEN in push/.dev.vars and the worker's
// ALLOWED_ORIGINS to include the page's origin.
// Usage: PW=<path to playwright> node tests/admin.cjs [web url] [worker url] [screenshot dir]
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const WEB = process.argv[2] || 'http://127.0.0.1:8766/';
const API = process.argv[3] || 'http://127.0.0.1:8797';
const OUT = process.argv[4];
const ADMIN = /^ADMIN_TOKEN=(.*)$/m.exec(fs.readFileSync(__dirname + '/../push/.dev.vars', 'utf8'))[1].replace(/^['"]|['"]$/g, '');

const call = (path, body, token) => fetch(API + path, {
  method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined,
}).then(r => r.json());

(async () => {
  const run = Date.now().toString(36).slice(-4);
  const mk = async (h, name, emoji) => (await call('/s/signup', { handle: h + run, name, emoji, tz: 'Asia/Tehran' })).token;
  const t = { ali: await mk('ali', 'Ali', '🦊'), sara: await mk('sara', 'Sara', '🌸'), mina: await mk('mina', 'Mina', '🌙'), reza: await mk('reza', 'Reza', '😎') };
  const connect = async (a, b) => { await call('/s/connect', { to: b + run }, t[a]); return (await call('/s/accept', { from: a + run }, t[b])).pair.id; };
  const p1 = await connect('ali', 'sara'), p2 = await connect('mina', 'reza');
  await call('/s/p/' + p1 + '/type', { type: 'married' }, t.ali); await call('/s/p/' + p1 + '/type', { type: 'married' }, t.sara);
  await call('/s/p/' + p1 + '/send', { text: 'hi' }, t.ali);
  await call('/s/p/' + p2 + '/type', { type: 'close' }, t.mina);

  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const p = await (await b.newContext({ viewport: { width: 1200, height: 860 }, colorScheme: 'dark' })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const shot = async f => { if (OUT) await p.screenshot({ path: OUT + '/' + f + '.png' }); };
  const ok = what => { assert.deepEqual(errs, [], what); process.stdout.write('✓ ' + what + '\n'); };
  p.on('dialog', d => d.accept());

  await p.goto(WEB + 'admin/?api=' + encodeURIComponent(API));
  await p.fill('input[type=password]', 'wrong-token-wrong-token-wrong');
  await p.click('text=Sign in');
  await p.waitForSelector('text=Wrong or expired admin token');
  await p.fill('input[type=password]', ADMIN);
  await p.click('text=Sign in');
  await p.waitForSelector('tr:has-text("Ali")');
  await p.fill('input[placeholder^="Search"]', run);
  await shot('admin-1-relations');
  ok('sign in, wrong token rejected, relations listed');

  // a relation: change the time, replace today's question with a chosen one
  await p.click('tr:has-text("Sara")');
  await p.waitForSelector('.modal');
  await p.fill('.modal input[type=time]', '21:30');
  await p.click('.modal button:has-text("Save")');
  await p.waitForSelector('.toast:has-text("Saved")');
  await p.fill('input[placeholder^="Search a question"]', 'mountain');
  const sel = p.locator('.modal .row').nth(1).locator('select');
  const val = await sel.locator('option').nth(1).getAttribute('value');
  await sel.selectOption(val);
  await p.click('.modal button:has-text("Replace today")');
  await p.waitForSelector('.toast:has-text("Today\'s question")');
  const today = await p.locator('.modal h3:has-text("Today\'s question") + div').textContent();
  assert.match(today, /mountain/i);
  await shot('admin-2-relation');
  ok('relation: time saved, today\'s question replaced with a chosen one');
  await p.click('.modal button:has-text("Close")');

  // a relation without a type: set it directly, which asks the first question
  await p.click('tr:has-text("Mina")');
  await p.waitForSelector('.modal:has-text("proposed Best friends")');
  await p.locator('.modal select').first().selectOption('close');
  await p.click('.modal button:has-text("Save")');
  await p.waitForSelector('.modal:has-text("Question history (1)")');
  ok('relation: type set by admin, first question asked');
  await p.click('.modal button:has-text("Close")');

  // users
  await p.click('.tabs button:has-text("Users")');
  await p.click('tr:has-text("Reza") button:has-text("Edit")');
  await p.fill('.modal input[maxlength="40"]', 'Reza M');
  await p.click('.modal button:has-text("Save")');
  await p.waitForSelector('tr:has-text("Reza M")');
  const me = await call('/s/me', null, t.mina);
  assert.equal(me.pairs[0].with.name, 'Reza M');
  await shot('admin-3-users');
  ok('users: rename reaches their connections');

  // questions: hide one, add one
  await p.click('.tabs button:has-text("Questions")');
  await p.locator('.qlist .q').first().locator('button:has-text("Hide")').click();
  await p.waitForSelector('.qlist .q.off');
  await p.fill('input[placeholder^="Use {them}"]', 'Admin test question about {them} ' + run + '?');
  await p.click('.toolbar button:has-text("Add")');
  await p.waitForSelector('.qlist .q:has-text("Admin test question about ‹them› ' + run + '")');
  await shot('admin-4-questions');
  await p.locator('.qlist .q:has-text("Admin test question about") button:has-text("Delete")').click();
  await p.locator('.qlist .q.off button:has-text("Show")').first().click();
  await p.waitForTimeout(400);
  assert.equal(await p.locator('.qlist .q.off').count(), 0);
  ok('questions: hide, show, add, delete');

  // phone-sized
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('.tabs button:has-text("Relations")');
  await shot('admin-5-phone');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'no sideways scrolling on a phone');
  ok('works on a phone screen');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
