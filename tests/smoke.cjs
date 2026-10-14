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
  for (const sc of ['notes', 'focus', 'water', 'mood', 'countdowns', 'cycle', 'settings', 'alerts', 'reports', 'reminders', 'people']) await step('screen ' + sc, () => G(`g.nav.screen = '${sc}'`));

  // bank SMS → drafts → categorize
  await step('sms import', () => p.evaluate(() => {
    const now = Date.now();
    const added = smsImport([
      { sender: 'Bank Mellat', ts: now - 3600e3, body: 'بانك ملت\nبرداشت: 1,250,000\nمانده: 35,420,118' },
      { sender: 'Bank Saman', ts: now - 7200e3, body: 'بانک سامان\nواریز به حساب 849-800-123456-1\nمبلغ: 250,000,000 ریال\nمانده: 312,450,000' },
      { sender: 'x', ts: now, body: 'رمز پویا: 1234 مبلغ 50,000' },
    ]);
    smsImport([{ sender: 'Bank Mellat', ts: now - 3600e3, body: 'بانك ملت\nبرداشت: 1,250,000\nمانده: 35,420,118' }]); // duplicate ignored
    if (added.length !== 2 || pendingTx.value.length !== 2) throw new Error('expected 2 drafts, got ' + added.length);
  }));
  await step('money with review list', () => G(`g.nav.screen = null; g.nav.tab = 'money'`));
  await step('categorize draft', () => p.click('.review .rv .chip'));
  assert.equal(await p.evaluate(() => pendingTx.value.length), 1);
  await step('draft details sheet', () => p.click('.review .rv-top'));
  await step('save without category explains why', () => p.click('.sheet .btn.primary'));
  assert.ok(await p.evaluate(() => /Choose a category/.test(document.querySelector('.sheet').textContent)), 'missing category is explained');
  await step('pick category + save', async () => { await p.click('.sheet .cat-grid button'); await p.click('.sheet .btn.primary'); });
  assert.equal(await p.evaluate(() => pendingTx.value.length), 0, 'draft saved');
  // balance: user sets it, SMS "مانده" overrides it, later manual expenses adjust it
  await step('accounts sheet', () => p.click('.split-btn'));
  const bal = await p.evaluate(() => S.accounts.map(a => acctBalance(a)));
  assert.equal(bal.length, 2, 'accounts created from SMS (Mellat, Saman)');
  await step('edit balance', async () => { await p.click('.sheet .list-row'); await p.fill('.sheet .amount-in input', '2,000,000'); await p.click('.sheet .btn.primary'); });
  const b2 = await p.evaluate(() => { const a = S.accounts.find(x => x.balance === 2000000); S.money.unshift({ id: 'mx', type: 'out', amount: 300000, cat: 'food', note: '', date: R.today, created: Date.now() + 1000, acct: a.id }); return acctBalance(a); });
  assert.equal(b2, 1700000, 'manual expense after setting balance is subtracted');
  await G(`window.orbitBack()`);
  await step('budget sheet', () => p.click('.budget-line'));
  await step('set budget', async () => { await p.fill('.sheet .amount-in input', '20000000'); await p.click('.sheet .btn.primary'); });
  assert.equal(await p.evaluate(() => S.settings.budget), 20000000);
  await step('reports', () => G(`g.nav.screen = 'reports'`));
  await step('reports year', () => p.click('.seg button:nth-child(2)'));
  await step('task sheet (new)', () => G(`g.nav.screen = null; g.nav.tab = 'tasks'; g.ui.task = { preset: { due: g.R.today } }`));
  await step('task sheet (edit, reminder)', () => G(`g.ui.task = null; g.ui.task = { ref: g.S.tasks[0] }`));
  await step('money sheet', () => G(`g.ui.task = null; g.ui.tx = {}`));
  await G(`g.ui.tx = null`);
  await step('habit sheet', async () => { await G(`g.nav.tab = 'habits'`); await p.waitForTimeout(300); await p.click('.fab'); });
  await step('add own habit from idea', async () => { await p.click('.sheet .chips.scroll .chip'); await p.click('.sheet .btn.primary'); });
  const nHabits = await p.evaluate(() => S.habits.length);
  await step('habit edit mode', () => p.click('.top .chip'));
  await step('delete a default habit', () => p.click('.habit .del'));
  assert.equal(await p.evaluate(() => S.habits.length), nHabits - 1, 'default habit deleted');
  await step('reorder habit', () => p.click('.habit.manage .icon-btn:last-child'));
  await step('leave edit mode', () => p.click('.top .chip'));
  await step('note editor', async () => { await G(`g.nav.screen = 'notes'`); await p.waitForTimeout(300); await p.click('.fab'); });
  await G(`window.orbitBack()`);
  await step('countdown sheet', async () => { await G(`g.nav.screen = 'countdowns'`); await p.waitForTimeout(300); await p.click('.fab'); });
  await G(`window.orbitBack()`);
  await step('cycle settings', async () => { await G(`g.nav.screen = 'cycle'`); await p.waitForTimeout(300); await p.click('.top .icon-btn:last-child'); });
  await G(`window.orbitBack()`);

  // reminders: water is one, add from template, custom daily with two times, validation, pause, delete
  await step('reminders screen', () => G(`g.nav.screen = 'reminders'`));
  assert.ok(await p.evaluate(() => S.reminders.some(r => r.water)), 'drink water is a reminder');
  await step('template picker', () => p.click('.fab'));
  await step('add from template', async () => { await p.click('.tpl-grid .tpl >> nth=0'); await p.click('.sheet .btn.primary'); });
  await step('custom reminder', async () => { await p.click('.fab'); await p.click('.tpl-grid .tpl >> nth=-1'); });
  await step('save without name explains', () => p.click('.sheet .btn.primary'));
  assert.ok(await p.evaluate(() => /Give the reminder a name/.test(document.querySelector('.sheet').textContent)));
  await step('daily, two times', async () => {
    await p.fill('.sheet .field-title', 'Vitamins'); await p.click('.sheet .seg button:nth-child(2)'); await p.click('text=Add time');
    await p.click('.sheet .btn.primary');
  });
  const vit = await p.evaluate(() => { const r = S.reminders.find(x => x.title === 'Vitamins'); return r && { kind: r.kind, times: r.times.length, rule: remRules.value.some(x => x.id === r.id) }; });
  assert.deepEqual(vit, { kind: 'daily', times: 2, rule: true }, 'custom daily reminder saved and scheduled');
  await step('pause reminder', () => p.click('.rem:has-text("Vitamins") .toggle'));
  assert.equal(await p.evaluate(() => S.reminders.find(x => x.title === 'Vitamins').on), false, 'paused');
  await step('edit reminder', () => p.click('.rem:has-text("Vitamins") .grow'));
  await step('delete reminder', () => p.click('.sheet .btn.danger'));
  assert.ok(await p.evaluate(() => payload().rules.every(r => r.kind && r.title)), 'payload carries rules');
  await G(`g.nav.screen = 'water'`);
  await step('water → its reminder', () => p.click('.view button.list-row >> nth=0'));
  assert.equal(await p.evaluate(() => !!(ui.rem && ui.rem.ref && ui.rem.ref.water)), true, 'water screen opens the water reminder');
  await G(`window.orbitBack()`);

  // cycle: tabs, day log, settings
  await step('cycle today tab', () => G(`g.nav.screen = 'cycle'`));
  await step('tip of the day + shuffle', async () => { const a = await p.textContent('.tip-card p'); await p.click('.tip-card .icon-btn'); await p.waitForTimeout(400); if (a === await p.textContent('.tip-card p')) throw new Error('shuffle did not change the tip'); });
  await step('cycle day sheet', () => p.click('.cyc-hero .btn-row .btn:last-child'));
  await step('log symptom + mood', async () => { await p.click('.sheet .chips .chip >> nth=0'); await p.click('.sheet .flow-pick button:nth-child(4)'); });
  assert.ok(await p.evaluate(() => (S.cycleLog[R.today] || {}).sym && S.cycleDays.includes(R.today)), 'day log saved, medium flow marks period day');
  await G(`window.orbitBack()`);
  await step('cycle calendar tab', () => p.click('.view .seg button:nth-child(2)'));
  await step('calendar day tap', () => p.click('.cal button.td'));
  await G(`window.orbitBack()`);
  await step('cycle insights tab', () => p.click('.view .seg button:nth-child(3)'));
  await step('cycle settings sheet', () => p.click('.top .icon-btn:last-child'));
  await step('pill reminder on', () => G(`g.S.settings.cycle.pill.on = true; g.S.settings.cycle.fertileNotify = true; g.S.settings.cycle.tip.on = true`));
  const tips = await p.evaluate(() => {
    const out = []; for (let i = 0; i < 40; i++) { const t = cycleTip(addDays(R.today, i)); out.push(t && t.text); }
    const repeatsNextDay = out.filter((t, i) => i && t === out[i - 1]).length;
    return { all: out.every(Boolean), repeatsNextDay, planned: plan.value.filter(r => r.id.startsWith('ctip:')).length, sample: plan.value.find(r => r.id.startsWith('ctip:')) };
  });
  assert.ok(tips.all, 'a tip for every day, including predicted future cycles');
  assert.equal(tips.repeatsNextDay, 0, 'no tip repeats on consecutive days');
  assert.ok(tips.planned >= 13 && tips.planned <= 14, 'two weeks of daily tip notifications planned (today\'s skipped once its time has passed): ' + tips.planned);
  assert.ok(await p.evaluate(() => plan.value.some(r => r.id.startsWith('pill:')) && plan.value.some(r => r.id.startsWith('ovu:') || r.id.startsWith('fert:'))), 'pill and fertile reminders planned');
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
