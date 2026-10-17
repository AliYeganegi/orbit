// Android bridge contract, with a stand-in for window.Android (the real one only exists in the APK):
// the app reports a good start, sends translated notification texts and live task ids, shares real files,
// and handles the native file picker's results. Usage: PW=<path to playwright> node tests/native.cjs [url]
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const URL = process.argv[2] || 'http://127.0.0.1:8766/';
const ok = m => console.log('✓ ' + m);

const fake = () => {
  const calls = window.__an = [];
  const rec = n => (...a) => { calls.push([n, ...a]); };
  window.Android = new Proxy({
    notifStatus: () => '{"enabled":true}', updateInfo: () => '{}', socialStatus: () => '{}', drain: () => '[]', smsDrain: () => '[]',
    smsStatus: () => '{"granted":false,"on":false}', isSystemDark: () => false, readClipboard: () => '',
  }, { get: (t, k) => (k in t ? t[k] : rec(k)), has: () => true });
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const origin = new globalThis.URL(URL).origin;
  const run = async lang => {
    const state = { settings: { onboarded: true, name: 'T', lang, waterGoal: 8, glassMl: 250 },
      tasks: [{ id: 'open1', title: 'Open', done: false, created: 1 }, { id: 'done1', title: 'Done', done: true, created: 1 }],
      reminders: [{ id: 'water', on: true, water: true, title: 'Drink water', emoji: '💧', kind: 'interval', every: 60, start: '09:00', end: '22:00', stopAtGoal: true, note: '' },
        { id: 'r1', on: true, title: 'Vitamins', emoji: '💊', kind: 'daily', times: ['09:00'], note: '' }] };
    const ctx = await b.newContext({ storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'orbit.v1', value: JSON.stringify(state) }] }] } });
    await ctx.addInitScript(fake);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(2500);
    const calls = await p.evaluate(() => window.__an);
    return { p, ctx, errs, calls };
  };

  // English
  let { p, ctx, errs, calls } = await run('en');
  assert.ok(calls.some(c => c[0] === 'bootOk'), 'bootOk reported after start');
  ok('the app tells Android it started (a downloaded version that never does is rolled back)');
  const sync = JSON.parse(calls.filter(c => c[0] === 'sync').pop()[1]);
  const w = sync.rules.find(r => r.water);
  assert.equal(w.t_some, '{c} of {g} glasses so far today');
  assert.equal(sync.labels.snooze, 'Snooze {c} min');
  assert.deepEqual(sync.live, ['task:open1'], 'only undone tasks are live');
  assert.equal(sync.rules.find(r => r.id === 'r1').title, '💊 Vitamins');
  ok('reminder plan carries notification texts, button labels and live task ids');

  // files: backup goes out as a real .json file; picked files are checked before anything changes
  const r = await p.evaluate(async () => {
    window.__an.length = 0;
    Native.shareFile('orbit-backup-x.json', 'application/json', '{"a":1}');
    const share = window.__an.find(c => c[0] === 'shareFile');
    nav.screen = 'settings'; await new Promise(r => setTimeout(r, 400));
    [...document.querySelectorAll('.list-row, button')].find(e => /Restore backup/.test(e.textContent)).click();
    await new Promise(r => setTimeout(r, 400));
    [...document.querySelectorAll('.sheet button')].find(e => /Choose backup file/.test(e.textContent)).click();
    const picked = window.__an.some(c => c[0] === 'pickText');
    window.orbitPickedText(null, 'large'); await new Promise(r => setTimeout(r, 100));
    const big = document.querySelector('.sheet').textContent.includes('too large');
    window.orbitPickedText('{"app":"orbit","modules":["notes"],"data":{"notes":[{"id":"z","title":"N","body":"b","updated":1}]}}');
    await new Promise(r => setTimeout(r, 200));
    return { share: share && share.slice(1, 3), picked, big, preview: /Notes/.test(document.querySelector('.sheet').textContent), notes: S.notes.length };
  });
  assert.deepEqual(r, { share: ['orbit-backup-x.json', 'application/json'], picked: true, big: true, preview: true, notes: 0 });
  ok('backups are shared as files; the native picker result is previewed, oversize files are refused');
  assert.deepEqual(errs, [], errs.join(' | '));
  await ctx.close();

  // Persian: the water notification texts and buttons are translated, placeholders intact
  ({ p, ctx, errs, calls } = await run('fa'));
  const fa = JSON.parse(calls.filter(c => c[0] === 'sync').pop()[1]);
  const fw = fa.rules.find(r => r.water);
  assert.ok(/[؀-ۿ]/.test(fw.title) && /[؀-ۿ]/.test(fw.t_none), 'water texts in Persian');
  assert.ok(fw.t_some.includes('{c}') && fw.t_some.includes('{g}') && /[؀-ۿ]/.test(fw.t_some), 't_some: ' + fw.t_some);
  assert.ok(fw.t_add.includes('{c}') && !fw.t_add.includes('7301'), 't_add: ' + fw.t_add);
  assert.ok(/[؀-ۿ]/.test(fa.labels.done) && fa.labels.snooze.includes('{c}'), JSON.stringify(fa.labels));
  assert.equal(fa.rules.find(r => r.id === 'r1').title, '💊 Vitamins', "people's own text is never translated");
  ok('Persian: water notifications and Done/Snooze buttons translated, your own reminder text left alone');
  assert.deepEqual(errs, [], errs.join(' | '));
  await b.close();
  console.log('ALL GOOD');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
