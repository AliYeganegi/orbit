// Reminders: reachable from the Tasks tab, "skip next" (list and editor), skips sent to Android, links that open
// Reminders (notifications, Today, More, resume after an update). The clock is fixed to Friday 16 Oct 2026, 16:30.
// Usage: PW=<path to playwright> node tests/reminders.cjs [url]
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const URL = process.argv[2] || 'http://127.0.0.1:8766/';
const ok = m => console.log('✓ ' + m);
const at = (h, m = 0) => { const d = new Date('2026-10-16T00:00:00'); d.setHours(h, m, 0, 0); return d.getTime(); };
const state = { settings: { onboarded: true, name: 'T' }, tasks: [{ id: 't', title: 'A task', due: '2026-10-16', done: false, created: 1 }],
  reminders: [{ id: 'v', on: true, title: 'Vitamins', emoji: '💊', color: '#22c55e', kind: 'daily', times: ['09:00', '21:00'], note: '' },
    { id: 'o', on: true, title: 'Call bank', emoji: '📞', color: '#64748b', kind: 'once', date: '2026-10-17', time: '10:00', note: '' }] };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const origin = new globalThis.URL(URL).origin;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'orbit.v1', value: JSON.stringify(state) }] }] } });
  await ctx.addInitScript(() => { // a stand-in Android bridge that records what the app schedules
    window.__sync = [];
    window.Android = new Proxy({ sync: j => window.__sync.push(JSON.parse(j)), notifStatus: () => '{"enabled":true}', updateInfo: () => JSON.stringify({ code: window.__code || 30 }), socialStatus: () => '{}',
      drain: () => '[]', smsDrain: () => '[]', smsStatus: () => '{}', isSystemDark: () => false, readClipboard: () => '' }, { get: (t, k) => (k in t ? t[k] : () => {}), has: () => true });
  });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date('2026-10-16T16:30:00'));
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(900);
  await p.evaluate(() => { window.V = () => S.reminders.find(r => r.id === 'v'); });

  // 1. one tap from the Tasks tab
  await p.click('.tabbar button:has-text("Tasks")'); await p.waitForTimeout(300);
  await p.click('.plan-seg button:has-text("Reminders")'); await p.waitForTimeout(400);
  assert.equal(await p.textContent('.view h1'), 'Reminders');
  assert.equal(await p.getAttribute('.plan-seg button:has-text("Reminders")', 'aria-selected'), 'true');
  assert.equal(await p.$$eval('.rem', x => x.length), 3, 'vitamins, call bank, and the built-in water reminder');
  await p.click('.fab'); await p.waitForTimeout(400);
  assert.ok(await p.evaluate(() => !!ui.rem), 'the + button adds a reminder here');
  await p.evaluate(() => { ui.rem = null; }); await p.waitForTimeout(300);
  ok('Reminders is a section of the Tasks tab; + adds a reminder there');

  // an older APK (before 1.22) can't honour skips, so the option isn't offered there
  await p.evaluate(() => { window.__code = 29; refreshUpdate(); }); await p.waitForTimeout(200);
  assert.equal(await p.$$eval('.rem .mini-btn', x => x.length), 0, 'no skip on an APK that would still ring');
  await p.evaluate(() => { window.__code = 30; refreshUpdate(); }); await p.waitForTimeout(200);

  // 2. skip next from the list: 21:00 today is skipped, the next one is tomorrow 09:00; undo brings it back
  assert.equal(await p.$$eval('.rem:has-text("Call bank") .mini-btn', x => x.length), 0, 'one-time reminders have no skip');
  await p.click('.rem:has-text("Vitamins") .mini-btn'); await p.waitForTimeout(300);
  const s1 = await p.evaluate(() => ({ skip: V().skip, next: remNext(V())[0] }));
  assert.deepEqual(s1.skip, [at(21)]);
  assert.equal(s1.next, at(9) + 864e5);
  assert.match(await p.textContent('.rem:has-text("Vitamins")'), /Skipping today 21:00/);
  assert.match(await p.textContent('.rem:has-text("Vitamins")'), /Next tomorrow 09:00/);
  await p.waitForTimeout(800);
  const rule = (await p.evaluate(() => window.__sync.at(-1))).rules.find(r => r.id === 'v');
  assert.deepEqual(rule.skip, [at(21)], 'the skip is sent to Android');
  await p.click('.rem:has-text("Vitamins") .skip-line .link-sm'); await p.waitForTimeout(300);
  assert.deepEqual(await p.evaluate(() => V().skip), []);
  assert.equal(await p.evaluate(() => remNext(V())[0]), at(21));
  ok('skip next: the next time is skipped (and sent to Android), the following one stays; undo restores it');

  // 3. skip from the editor applies on save only
  await p.click('.rem:has-text("Vitamins") .t'); await p.waitForTimeout(400);
  await p.click('.preview-actions .mini-btn'); await p.waitForTimeout(150);
  assert.deepEqual(await p.evaluate(() => V().skip), [], 'not saved yet');
  assert.match(await p.textContent('.sheet .preview'), /tomorrow 09:00/);
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  assert.deepEqual(await p.evaluate(() => V().skip), [at(21)]);
  ok('the editor can skip the next time too; it applies when saved');

  // 4. old skips don't pile up or reach the deliverers once they've passed
  await p.clock.setFixedTime(new Date('2026-10-16T21:30:00')); await p.evaluate(() => { R.min = Date.now(); });
  assert.equal(await p.evaluate(() => remRule(V()).skip), undefined);
  ok('skips in the past are dropped');

  // 5. every way into Reminders lands on the same place
  for (const how of [() => go('more'), () => window.orbitGo('reminders')]) {
    await p.evaluate(() => { nav.tab = 'today'; nav.plan = 'tasks'; nav.screen = null; });
    await p.evaluate(how); await p.waitForTimeout(200);
  }
  assert.deepEqual(await p.evaluate(() => ({ tab: nav.tab, plan: nav.plan, screen: nav.screen })), { tab: 'tasks', plan: 'reminders', screen: null });
  await p.evaluate(() => { go('more'); }); await p.waitForTimeout(300);
  await p.click('.app-tile:has-text("Reminders")'); await p.waitForTimeout(300);
  assert.deepEqual(await p.evaluate(() => ({ tab: nav.tab, plan: nav.plan })), { tab: 'tasks', plan: 'reminders' });
  await p.evaluate(() => window.orbitBeforeReload()); await p.reload(); await p.waitForTimeout(1000);
  assert.deepEqual(await p.evaluate(() => ({ tab: nav.tab, plan: nav.plan, h: document.querySelector('.view h1').textContent })), { tab: 'tasks', plan: 'reminders', h: 'Reminders' });
  ok('More, notification taps and update reloads all open Reminders in the Tasks tab');

  assert.deepEqual(errs, [], errs.join(' | '));
  await b.close();
  console.log('ALL GOOD');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
