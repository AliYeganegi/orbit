// Date edge cases in the app: focus sessions that end while closed, yearly countdowns on dates some years lack.
// Usage: PW=<path to playwright> node tests/dates.cjs [url]
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const URL = process.argv[2] || 'http://127.0.0.1:8766/';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const origin = new globalThis.URL(URL).origin;
  // a 25-minute session that ended 10 hours ago, while the app was closed
  const ended = Date.now() - 10 * 3600e3;
  const state = { settings: { onboarded: true, focus: { work: 25, short: 5, long: 15, rounds: 4, goal: 4, autoBreak: true, sound: true } },
    timer: { mode: 'work', running: true, endAt: ended, left: 0, total: 1500, count: 0, label: '' },
    countdowns: [{ id: 'a', title: 'Leap birthday', emoji: '🎂', date: '2024-02-29', repeat: 'greg' }, { id: 'b', title: 'Esfand 30', emoji: '🌸', date: '2025-03-20', repeat: 'jal' }] };
  const ctx = await b.newContext({ storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'orbit.v1', value: JSON.stringify(state) }] }] } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(2000);
  const f = await p.evaluate(endedAt => {
    const day = keyOf(new Date(endedAt));
    const l = S.focusLog[day] || {};
    return { day: !!S.focusLog[day], n: l.n, at: (l.s || [])[0] && l.s[0].at, running: S.timer.running, mode: S.timer.mode };
  }, ended);
  assert.deepEqual(f, { day: true, n: 1, at: ended, running: false, mode: 'short' });
  console.log('✓ a session that ended while closed is logged when it ended; the break does not auto-start late');
  const c = await p.evaluate(() => S.countdowns.map(x => { const k = cdTarget(x); return { k, j: jal(k), days: diffDays(R.today, k) }; }));
  assert.ok(c.every(x => x.days >= 0), 'both countdowns are upcoming, not "days ago"');
  assert.ok(/-02-2[89]$/.test(c[0].k), 'Feb 29 lands on Feb 28/29');
  assert.equal(c[1].j.m, 12, 'Esfand 30 lands in Esfand');
  console.log('✓ yearly countdowns on Feb 29 and 30 Esfand stay upcoming');
  assert.deepEqual(errs, []);
  await b.close(); console.log('ALL GOOD');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
