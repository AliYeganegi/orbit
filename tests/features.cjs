// Phase 2/3 features: quick capture, Today (top 3, customise, evening wrap-up), timeline, weekly review, habit insights.
// The clock is fixed to Friday 16 Oct 2026, 20:30. Usage: PW=<path to playwright> node tests/features.cjs [url]
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const URL = process.argv[2] || 'http://127.0.0.1:8766/';
const ok = m => console.log('✓ ' + m);
const NOW = new Date('2026-10-16T20:30:00');
const T = '2026-10-16', Y = '2026-10-15', TM = '2026-10-17';
const at = (k, h, m = 0) => { const d = new Date(k + 'T00:00:00'); d.setHours(h, m, 0, 0); return d.getTime(); };

const seed = lang => {
  const log = {}; // "Run" done on most days of the last 4 weeks, but never on Fridays
  for (let i = 0; i < 28; i++) { const d = new Date(at(T, 12) - i * 864e5); const k = d.toISOString().slice(0, 10); if (d.getDay() !== 5) log[k] = true; }
  return { settings: { onboarded: true, name: 'T', lang, waterGoal: 8 },
    tasks: [
      { id: 'a', title: 'Pay rent', due: T, done: false, created: at(Y, 9), priority: 0 },
      { id: 'b', title: 'Email Sara', due: T, done: false, created: at(Y, 9), priority: 0 },
      { id: 'c', title: 'Gym', due: T, done: false, created: at(Y, 9), priority: 0 },
      { id: 'd', title: 'Groceries', due: Y, done: false, created: at(Y, 9), priority: 0 },
      { id: 'e', title: 'Read report', due: T, done: true, doneAt: at(T, 10, 15), doneDay: T, created: at(Y, 9) },
    ],
    habits: [{ id: 'h1', name: 'Run', emoji: '🏃', color: '#22c55e', log, created: at(T, 0) - 40 * 864e5 }],
    water: { [T]: 5 }, mood: { [T]: { v: 4, note: '' } },
    focusLog: { [T]: { min: 25, n: 1, s: [{ at: at(T, 11), min: 25, label: '', done: true }] } },
    money: [{ id: 'm1', type: 'out', amount: 120000, cat: 'food', note: 'Lunch', date: T, time: '13:05', created: at(T, 13, 6) }],
    cycleDays: [T], notes: [], reminders: [] };
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const origin = new globalThis.URL(URL).origin;
  const open = async (lang = 'en') => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'orbit.v1', value: JSON.stringify(seed(lang)) }] }] } });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(NOW);
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(900);
    return { ctx, p, errs };
  };
  let { ctx, p, errs } = await open();

  // 1. the capture parser
  const g = await p.evaluate(() => [
    'lunch 120k', 'spent 85,000 on taxi', 'salary 30m', 'remind me to call mom at 18', 'buy milk tomorrow', 'call 3 people',
    'خرید نان ۵۰ هزار', 'جلسه فردا ساعت ۱۰', 'meeting at 9:30pm', 'x'.repeat(130),
  ].map(t => { const x = guessCapture(t); return [x.kind, x.title.slice(0, 20), x.amount, x.due, x.time]; }));
  assert.deepEqual(g, [
    ['out', 'lunch', 120000, null, ''], ['out', 'taxi', 85000, null, ''], ['in', '', 30000000, null, ''],
    ['reminder', 'call mom', 0, null, '18:00'], ['task', 'buy milk', 0, '2026-10-17', ''], ['task', 'call 3 people', 0, null, ''],
    ['out', 'نان', 50000, null, ''], ['task', 'جلسه', 0, '2026-10-17', '10:00'], ['task', 'meeting', 0, null, '21:30'], ['note', 'x'.repeat(20), 0, null, ''],
  ]);
  ok('capture sorts text into tasks, notes, expenses, income and reminders (English and Persian, Persian digits)');

  // 2. capture UI: preview first, then save in the right place; you can override the guess
  await p.click('[aria-label="Quick capture"]'); await p.waitForTimeout(350);
  await p.fill('.capture-in', 'buy milk tomorrow');
  assert.match(await p.textContent('.capture-plan'), /Task · Tomorrow/);
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => S.tasks.some(t => t.title === 'buy milk' && t.due === '2026-10-17')));
  await p.click('[aria-label="Quick capture"]'); await p.waitForTimeout(350);
  await p.fill('.capture-in', 'remind me to stretch at 21:00');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  assert.deepEqual(await p.evaluate(() => { const r = S.reminders.find(x => x.title === 'stretch'); return r && [r.kind, r.date, r.time]; }), ['once', T, '21:00']);
  await p.click('[aria-label="Quick capture"]'); await p.waitForTimeout(350);
  await p.fill('.capture-in', 'Ideas for the trip');
  await p.click('.capture-kinds .chip:has-text("Note")');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => S.notes.some(n => n.body === 'Ideas for the trip')), 'kind override respected');
  await p.click('[aria-label="Quick capture"]'); await p.waitForTimeout(350);
  await p.fill('.capture-in', 'lunch 120k');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(500);
  assert.deepEqual(await p.evaluate(() => ui.tx && ui.tx.draft && [ui.tx.draft.type, ui.tx.draft.amount, ui.tx.draft.note]), ['out', 120000, 'lunch']);
  await p.evaluate(() => { ui.tx = null; }); await p.waitForTimeout(300);
  ok('capture previews what it will do; tasks, reminders and notes save; money continues to the expense editor to pick a category');

  // 3. top 3
  const stars = await p.$$('.mini-task .star:not(.on)');
  for (const s of stars.slice(0, 4)) { await s.click(); await p.waitForTimeout(80); }
  assert.equal(await p.evaluate(() => S.tasks.filter(t => t.top === R.today).length), 3, 'never more than 3');
  assert.match(await p.textContent('.top3'), /Top 3 for today/);
  ok('top 3: up to three tasks pinned at the top of Today');

  // 4. evening wrap-up
  assert.ok(await p.$('.wrap-card'), 'wrap-up shows in the evening with open tasks');
  await p.click('.wrap-card >> text=Move all to tomorrow'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => S.tasks.filter(t => !t.done && t.due && t.due <= R.today).length), 0);
  assert.equal(await p.evaluate(() => S.tasks.filter(t => t.top === R.today && !t.done).length), 0, 'moved tasks leave the top 3');
  assert.ok(!(await p.$('.wrap-card')), 'nothing left to wrap up (mood already logged)');
  await p.evaluate(() => { S.tasks.push({ id: 'z', title: 'Late one', due: R.today, done: false, created: Date.now() }); }); await p.waitForTimeout(200);
  await p.click('.wrap-card >> text=Done for today'); await p.waitForTimeout(200);
  assert.ok(!(await p.$('.wrap-card')), 'closed for the day');
  assert.ok(await p.$('.review-nudge'), 'Friday: weekly review nudge');
  ok('evening wrap-up moves unfinished tasks to tomorrow (with undo) and can be closed for the day');

  // 5. customise Today
  await p.click('.today-custom'); await p.waitForTimeout(350);
  await p.click('.sheet .list-row:has-text("Habits") .toggle, .sheet .list-row:has-text("Habits") [role=switch], .sheet .list-row:has-text("Habits") button:last-child');
  await p.click('.sheet [aria-label="Move up: Recently"]');
  await p.evaluate(() => window.orbitBack()); await p.waitForTimeout(300);
  const cust = await p.evaluate(() => ({ hide: [...S.settings.today.hide], order: S.settings.today.order.indexOf('recent') < S.settings.today.order.indexOf('extras'), habitsCard: [...document.querySelectorAll('.view .sec h3')].some(h => /^Habits/.test(h.textContent)) }));
  assert.deepEqual(cust, { hide: ['habits'], order: true, habitsCard: false });
  ok('Today sections can be hidden and reordered');

  // 6. timeline: cycle hidden unless turned on, money toggle respected
  await p.evaluate(() => go('timeline')); await p.waitForTimeout(400);
  let tl = await p.textContent('.view');
  assert.match(tl, /10:15[\s\S]*Read report[\s\S]*11:00[\s\S]*25 min focus[\s\S]*13:05[\s\S]*120,000 T/);
  assert.match(tl, /During the day[\s\S]*5 glasses of water[\s\S]*Feeling good/);
  assert.ok(!/Period day/.test(tl), 'cycle not shown by default');
  await p.evaluate(() => { S.settings.review.cycle = true; S.settings.review.money = false; }); await p.waitForTimeout(200);
  tl = await p.textContent('.view');
  assert.ok(/Period day/.test(tl) && !/120,000/.test(tl));
  await p.evaluate(() => { S.settings.review.cycle = false; S.settings.review.money = true; });
  await p.click('[aria-label="Previous day"]'); await p.waitForTimeout(200);
  assert.match(await p.textContent('.view'), /Task added|Nothing logged/);
  ok('timeline lists the day in order; cycle only when opted in; money can be hidden');

  // 7. weekly review + insights + reflection saved and backed up
  await p.evaluate(() => go('review')); await p.waitForTimeout(400);
  const w = await p.evaluate(() => { const x = weekStats(R.today); return { done: x.tasksDone, focus: x.focusMin, spent: x.money.spent, habit: Math.round(x.habitPct * 100), cycle: 'cycle' in x }; });
  assert.deepEqual(w, { done: 1, focus: 25, spent: 120000, habit: 86, cycle: false });
  const ins = await p.evaluate(() => { const i = habitInsights(R.today); return { worst: i.worst && WEEKDAY_NAMES[i.worst.i], best: !!i.best }; });
  assert.deepEqual(ins, { worst: 'Friday', best: true });
  assert.match(await p.textContent('.view'), /least on Friday/);
  await p.fill('.view textarea >> nth=0', 'Ran six times');
  const saved = await p.evaluate(() => ({ r: S.reviews['2026-10-10'] && S.reviews['2026-10-10'].good, inBackup: JSON.parse(makeBackup(['notes'])).data.reviews['2026-10-10'].good }));
  assert.deepEqual(saved, { r: 'Ran six times', inBackup: 'Ran six times' });
  ok('weekly review: totals, habit pattern (weakest weekday), reflection saved and included in backups');
  assert.deepEqual(errs, [], errs.join(' | '));
  await ctx.close();

  // 8. Persian: the new screens have no untranslated interface text
  ({ ctx, p, errs } = await open('fa'));
  const leftovers = [];
  for (const scr of ['timeline', 'review', null]) {
    await p.evaluate(s => { nav.screen = s; }, scr); await p.waitForTimeout(500);
    if (!scr) { await p.click('[aria-label]:is([aria-label="Quick capture"], [aria-label="ثبت سریع"])'); await p.waitForTimeout(400); await p.fill('.capture-in', 'lunch 120k'); await p.waitForTimeout(150); }
    leftovers.push(...await p.evaluate(() => {
      const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const el = n.parentElement; if (!el || el.closest('[translate="no"], .tabbar, script, style') || !el.getClientRects().length) continue;
        const t = n.data.trim(); if (/[A-Za-z]{3,}/.test(t) && !/^(Orbit|T|ml|min)$/.test(t)) out.push(t);
      }
      return out;
    }));
    if (!scr) await p.evaluate(() => { ui.capture = null; });
  }
  assert.deepEqual([...new Set(leftovers)], [], 'untranslated: ' + [...new Set(leftovers)].join(' | '));
  ok('Persian: timeline, weekly review, Today and quick capture fully translated');
  assert.deepEqual(errs, [], errs.join(' | '));
  await b.close();
  console.log('ALL GOOD');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
