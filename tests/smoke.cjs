// Smoke test: opens every tab, screen and sheet in a phone-sized browser and fails on any error.
// Usage: PW=<path to playwright> node tests/smoke.cjs [url] [screenshot dir]
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const URL = process.argv[2] || 'http://127.0.0.1:8766/';
const OUT = process.argv[3];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  const step = async (name, fn) => {
    await fn(); await p.waitForTimeout(350);
    const ok = await p.evaluate(() => !!document.querySelector('.view, .onb'));
    if (errs.length || !ok) throw new Error(name + ': ' + (errs.join(' | ') || 'blank screen'));
    process.stdout.write('✓ ' + name + '\n');
  };
  const G = fn => p.evaluate(new Function('const g = document.querySelector("#app").__vue_app__.config.globalProperties;' + fn));

  await p.goto(URL); await p.waitForTimeout(500);
  await step('onboarding', async () => { await p.fill('.onb input', 'Test'); await p.click('text=Get started'); });
  await G(`const k = g.R.today;
    g.S.tasks.push({ id: 't1', title: 'Write report', notes: 'n', due: k, time: '23:59', remind: true, before: 15, priority: 3, done: false, created: 1 });
    g.S.money.push({ id: 'm1', type: 'out', amount: 120000, cat: 'cafe', note: '', date: k, created: 1 });
    g.S.notes.push({ id: 'n1', title: 'Idea', body: 'x', color: '', pinned: true, updated: Date.now() });
    g.S.countdowns.push({ id: 'c1', title: 'Trip', emoji: '✈️', date: g.addDays(k, 10), repeat: 'none' });
    g.S.cycleDays.push(g.addDays(k, -8));`);

  for (const t of ['today', 'tasks', 'habits', 'money', 'more']) await step('tab ' + t, () => G(`g.nav.screen = null; g.nav.tab = '${t}'`));
  for (const sc of ['notes', 'focus', 'water', 'mood', 'countdowns', 'cycle', 'settings', 'alerts']) await step('screen ' + sc, () => G(`g.nav.screen = '${sc}'`));

  await step('task sheet (new)', () => G(`g.nav.screen = null; g.nav.tab = 'tasks'; g.ui.task = { preset: { due: g.R.today } }`));
  await step('task sheet (edit, reminder)', () => G(`g.ui.task = null; g.ui.task = { ref: g.S.tasks[0] }`));
  await step('money sheet', () => G(`g.ui.task = null; g.ui.tx = {}`));
  await G(`g.ui.tx = null`);
  await step('habit sheet', async () => { await G(`g.nav.tab = 'habits'`); await p.waitForTimeout(300); await p.click('.fab'); });
  await G(`window.orbitBack()`);
  await step('note editor', async () => { await G(`g.nav.screen = 'notes'`); await p.waitForTimeout(300); await p.click('.fab'); });
  await G(`window.orbitBack()`);
  await step('countdown sheet', async () => { await G(`g.nav.screen = 'countdowns'`); await p.waitForTimeout(300); await p.click('.fab'); });
  await G(`window.orbitBack()`);
  await step('cycle settings', async () => { await G(`g.nav.screen = 'cycle'`); await p.waitForTimeout(300); await p.click('.top .icon-btn:last-child'); });
  await G(`window.orbitBack()`);

  // focus: every control
  await step('focus screen', () => G(`g.nav.screen = 'focus'`));
  await step('focus settings sheet', () => p.click('.top .icon-btn:last-child'));
  await step('focus preset', () => p.click('.presets button:nth-child(2)'));
  assert.equal(await G(`return g.S.settings.focus.work`), 50);
  assert.equal(await G(`return g.Timer.left()`), 3000, 'idle timer follows new preset');
  await p.click('.presets button:nth-child(1)');
  await G(`window.orbitBack()`);
  await step('focus task picker', () => p.click('.focus-on'));
  await step('pick task', () => p.click('.sheet .list-row'));
  assert.equal(await G(`return g.S.timer.label`), 'task:t1');
  await step('start', () => p.click('.controls .main'));
  assert.equal(await G(`return g.S.timer.running`), true);
  await step('+5 min', () => p.click('.chip.extend'));
  assert.equal(await G(`return g.Timer.total()`), 30 * 60);
  // pretend 2 minutes passed, then reset and undo
  await G(`g.S.timer.endAt -= 120000; g.R.now = Date.now()`);
  await step('reset', () => p.click('.controls .side:first-child'));
  assert.equal(await G(`return g.S.timer.running`), false);
  await step('undo reset', () => p.click('.toast button'));
  assert.equal(await G(`return g.S.timer.running && g.Timer.elapsed() >= 119`), true, 'undo restores running timer');
  await step('finish early', () => p.click('.controls .side:last-child'));
  assert.equal(await G(`return g.S.timer.mode`), 'short');
  assert.equal(await G(`return g.focusToday.s.length && g.focusToday.s[0].label`), 'task:t1', 'partial session logged with label');
  await step('switch mode', () => p.click('.seg button:first-child'));
  assert.equal(await G(`return g.S.timer.mode`), 'work');
  await G(`g.S.timer.endAt = Date.now() + 1500; g.S.timer.running = true; g.S.timer.left = 2`);
  await p.waitForTimeout(2600);
  assert.equal(await G(`return g.focusToday.n`), 1, 'auto-complete counts a session');
  await step('focus after completion', async () => {});
  if (OUT) await p.screenshot({ path: OUT + '/focus.png', fullPage: true });
  for (const t of ['today', 'more', 'tasks']) await step('tabs still work: ' + t, () => G(`g.nav.screen = null; g.nav.tab = '${t}'`));

  await b.close();
  console.log('ALL GOOD');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
