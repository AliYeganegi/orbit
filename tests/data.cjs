// Data-safety test: storage corruption, wrong types, backup/restore validation, undo, quota, autosave, drafts.
// Usage: PW=<path to playwright> node tests/data.cjs [url]   (web/ served locally, e.g. python3 -m http.server 8766)
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const URL = process.argv[2] || 'http://127.0.0.1:8766/';

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const errs = [];
  const ok = m => console.log('✓ ' + m);
  let p, ctx;
  // each scenario starts from a fresh profile whose storage already holds the given data
  const boot = async (state, raw) => {
    if (ctx) await ctx.close();
    const origin = new globalThis.URL(URL).origin;
    ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'orbit.v1', value: raw != null ? raw : JSON.stringify(state) }] }] } });
    p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(700);
  };
  const base = { settings: { onboarded: true, name: 'T' }, tasks: [{ id: 't1', title: 'Keep me', done: false, created: 1 }], habits: [{ id: 'h1', name: 'Read', emoji: '📚', color: '#f5a524', log: {}, created: 1 }] };

  // 1. unreadable storage: app still starts, the original text is kept, banner shown
  await boot(null, '{"settings":{"onboarded":true},"tasks":[{"id":"x"');
  const c1 = await p.evaluate(() => ({ banner: !!document.querySelector('.store-banner'), kept: Object.keys(localStorage).some(k => k.startsWith('orbit.v1.corrupt.')), mounted: !!document.querySelector('.view, .onb') }));
  assert.deepEqual(c1, { banner: true, kept: true, mounted: true });
  ok('unreadable data: app starts, original kept under orbit.v1.corrupt.*, warning shown');

  // 2. wrong types never brick the app
  await boot({ settings: { onboarded: true }, habits: null, reminders: 'x', tasks: [null, { id: 'a', title: 'ok', created: 1 }], cycleLog: [], water: 5 });
  const c2 = await p.evaluate(() => ({ mounted: !!document.querySelector('.view'), tasks: S.tasks.length, habits: Array.isArray(S.habits), rem: Array.isArray(S.reminders), water: typeof S.water }));
  assert.deepEqual(c2, { mounted: true, tasks: 1, habits: true, rem: true, water: 'object' });
  ok('wrong-typed fields fall back to defaults, bad items dropped, Today renders');

  // 3. restore rejects anything that isn't an Orbit backup
  await boot(base);
  const bad = await p.evaluate(() => ['', '{}', '[]', '"x"', '{"foo":1}', '{"data":null}', '{broken', '{"app":"other","data":{}}'].map(t => !!readBackup(t).error));
  assert.ok(bad.every(Boolean), 'all rejected: ' + JSON.stringify(bad));
  ok('restore rejects empty, non-JSON, wrong app and non-backup JSON');

  // 4. partial backup replaces only its parts; undo brings the old data back
  const r4 = await p.evaluate(() => {
    const prev = readBackup(JSON.stringify({ app: 'orbit', v: 2, modules: ['tasks'], data: { tasks: [{ id: 'n1', title: 'From backup', created: 2 }] } }));
    const err = applyBackup(prev);
    const after = { err, tasks: S.tasks.map(t => t.title), habits: S.habits.map(h => h.name) };
    const undone = undoRestore();
    return { prev: { mods: prev.mods, counts: prev.counts.tasks }, after, undone, back: S.tasks.map(t => t.title) };
  });
  assert.deepEqual(r4.prev, { mods: ['tasks'], counts: 1 });
  assert.deepEqual(r4.after, { err: '', tasks: ['From backup'], habits: ['Read'] });
  assert.equal(r4.undone, true); assert.deepEqual(r4.back, ['Keep me']);
  ok('partial restore replaces only tasks, habits untouched, undo restores previous data');

  // 5. full backup round trip, including fields from a newer version
  const r5 = await p.evaluate(() => {
    S.futureThing = { x: 1 };
    const text = makeBackup(MODULES.map(m => m.id));
    const prev = readBackup(text);
    S.tasks = []; S.habits = []; delete S.futureThing;
    applyBackup(prev);
    return { tasks: S.tasks.length, habits: S.habits.length, future: S.futureThing && S.futureThing.x };
  });
  assert.deepEqual(r5, { tasks: 1, habits: 1, future: 1 });
  ok('full backup round-trips, unknown newer fields preserved');

  // 6. restore UI: preview before anything changes
  await p.evaluate(() => { nav.screen = 'settings'; }); await p.waitForTimeout(400);
  await p.click('text=Restore backup'); await p.waitForTimeout(400);
  await p.fill('.sheet textarea', '{"app":"orbit","modules":["notes"],"data":{"notes":[{"id":"z","title":"N","body":"b","updated":1}]}}');
  await p.click('text=Check backup'); await p.waitForTimeout(300);
  const r6 = await p.evaluate(() => ({ preview: /Notes/.test(document.querySelector('.sheet').textContent), notes: S.notes.length }));
  assert.deepEqual(r6, { preview: true, notes: 0 }, 'preview shown, nothing changed yet');
  await p.click('text=Replace with backup'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => S.notes.length), 1);
  ok('restore sheet shows a preview, changes data only after confirming');

  // 7. a failed save is reported, not swallowed
  const r7 = await p.evaluate(async () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'orbit.v1') throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); };
    S.tasks.push({ id: 'q', title: 'q', created: 3 });
    await new Promise(r => setTimeout(r, 500));
    const shown = !!document.querySelector('.store-banner');
    Storage.prototype.setItem = real;
    S.tasks.pop(); await new Promise(r => setTimeout(r, 500));
    return { err: shown, cleared: !document.querySelector('.store-banner') };
  });
  assert.deepEqual(r7, { err: true, cleared: true });
  ok('quota error shows a warning; it clears once saving works again');

  // 8. notes save while typing
  await p.evaluate(() => { nav.screen = 'notes'; }); await p.waitForTimeout(400);
  await p.click('.fab'); await p.waitForTimeout(400);
  await p.fill('.sheet textarea', 'typed but not closed');
  await p.waitForTimeout(700);
  assert.ok(await p.evaluate(() => S.notes.some(n => n.body === 'typed but not closed')), 'note saved before closing');
  ok('notes are saved while typing (survive a crash or reload)');

  // 9. an open editor comes back after an update reload
  await p.evaluate(() => { window.orbitBack(); nav.screen = null; nav.tab = 'tasks'; ui.task = { preset: {} }; }); await p.waitForTimeout(500);
  await p.fill('.sheet .field-title', 'Half-typed task');
  await p.evaluate(() => window.orbitBeforeReload());
  await p.reload(); await p.waitForTimeout(1200);
  assert.equal(await p.evaluate(() => document.querySelector('.sheet .field-title') && document.querySelector('.sheet .field-title').value), 'Half-typed task');
  ok('task editor reopens with its text after an update reload');

  assert.deepEqual(errs, [], 'no page errors: ' + errs.join(' | '));
  await b.close();
  console.log('ALL GOOD');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
