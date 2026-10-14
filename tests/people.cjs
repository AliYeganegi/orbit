// Two phones, one conversation: sign up, connect by ID, agree on a relationship type, answer the daily
// question and chat, all through the UI. Needs the push worker running locally (cd push && npx wrangler dev
// --port 8797) with ALLOWED_ORIGINS including the app's origin, and web/ served on the given URL.
// Usage: PW=<path to playwright> node tests/people.cjs [app url] [worker url] [screenshot dir]
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const URL = process.argv[2] || 'http://127.0.0.1:8766/';
const API = process.argv[3] || 'http://127.0.0.1:8797';
const OUT = process.argv[4];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const run = Date.now().toString(36).slice(-4);
  const phones = [];
  process.on('unhandledRejection', () => {});
  const fail = async e => { if (OUT) for (const [i, x] of phones.entries()) await x.p.screenshot({ path: OUT + '/fail-' + i + '.png' }).catch(() => {}); for (const x of phones) if (x.errs.length) console.error(x.errs); throw e; };
  const phone = async name => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    await ctx.addInitScript(api => { window.ORBIT_PUSH_URL = api; }, API);
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
    await p.goto(URL); await p.waitForTimeout(400);
    await p.fill('.onb input', name); await p.click('text=Get started');
    const G = fn => p.evaluate(new Function('const g = document.querySelector("#app").__vue_app__.config.globalProperties;' + fn));
    const shot = async f => { if (OUT) await p.screenshot({ path: OUT + '/' + f + '.png' }); };
    const ok = what => { assert.deepEqual(errs, [], what); process.stdout.write('✓ ' + what + '\n'); };
    const x = { p, G, shot, ok, errs };
    phones.push(x);
    return x;
  };

  const A = await phone('Ali'), B = await phone('Sara');
  try {
  const hA = 'ali' + run, hB = 'sara' + run;

  // sign up from the People screen
  for (const [x, h, e] of [[A, hA, '🦊'], [B, hB, '🌸']]) {
    await x.G(`g.go('people')`); await x.p.waitForTimeout(300);
    await x.p.click('.av-pick >> text=' + e);
    await x.p.fill('input[placeholder="e.g. ali.y"]', h);
    await x.p.click('text=Create my ID');
    await x.p.waitForSelector('.me-card');
  }
  await A.shot('people-1-signed-up');
  A.ok('both sign up and get their ID');

  // Ali finds Sara by ID and asks to connect; Sara accepts
  await A.p.fill('input[placeholder="Their ID"]', '@' + hB);
  await A.p.click('button[aria-label="Search"]');
  await A.p.waitForSelector('text=@' + hB);
  await A.shot('people-2-found');
  await A.p.click('button:has-text("Connect")');
  await A.p.waitForSelector('text=Waiting for @' + hB);
  await B.p.waitForSelector('text=wants to connect', { timeout: 8000 }); // arrives live over the socket
  await B.shot('people-3-request');
  await B.p.click('button:has-text("Accept")');
  await B.p.waitForSelector('.pair-view');
  A.ok('find by ID, request arrives live, accept opens the conversation');

  // Sara proposes "Married"; Ali accepts and the first question arrives right away
  await B.p.click('.rel-btn:has-text("Married")');
  await B.p.waitForSelector('text=Waiting for Ali to accept');
  await A.p.waitForSelector('text=says you are Married', { timeout: 8000 });
  await A.shot('people-4-proposal-list');
  await A.p.click('.list-row:has-text("Sara")');
  await A.p.waitForSelector('.pair-view');
  await A.shot('people-5-proposal');
  await A.p.click('.q-card button:has-text("Accept")');
  await A.p.waitForSelector('.q-card.today');
  await B.p.waitForSelector('.q-card.today', { timeout: 8000 });
  const q = await A.p.textContent('.q-text');
  assert.equal(q, await B.p.textContent('.q-text'), 'same question for both');
  await A.shot('people-6-question');
  A.ok('relationship needs both, first question appears for both right away');

  // answers stay hidden until you answer
  await A.p.fill('.q-card.today textarea', 'Our Friday breakfasts ☀️');
  await A.p.click('text=Send answer');
  await A.p.waitForSelector('text=Waiting for Sara');
  await B.p.waitForSelector('text=Ali has answered', { timeout: 8000 });
  assert.equal(await B.p.locator('text=Our Friday breakfasts').count(), 0, 'Ali\'s answer hidden from Sara');
  await B.shot('people-7-they-answered');
  await B.p.fill('.q-card.today textarea', 'Walking home together');
  await B.p.click('text=Send answer');
  await B.p.waitForSelector('.ans.theirs:has-text("Our Friday breakfasts")');
  await A.p.waitForSelector('.ans.theirs:has-text("Walking home together")', { timeout: 8000 });
  await B.shot('people-8-both');
  A.ok('answers hidden until both answer, then shown to both');

  // chat, live both ways, with read ticks
  await A.p.click('.pair-tabs button:has-text("Chat")');
  await A.p.fill('.composer textarea', 'Hi Sara 👋');
  await A.p.click('.composer .send');
  await B.p.click('.pair-tabs button:has-text("Chat")');
  await B.p.waitForSelector('.msg:has-text("Hi Sara")', { timeout: 8000 });
  await B.p.fill('.composer textarea', 'Hey!');
  await B.p.click('.composer .send');
  await A.p.waitForSelector('.msg:not(.me):has-text("Hey!")', { timeout: 8000 });
  await A.p.waitForSelector('.msg.me .seen', { timeout: 8000 });
  await A.shot('people-9-chat');
  A.ok('chat delivers live both ways, read ticks');

  // badges: a message to someone who isn't looking shows up on Today and on More
  await B.G(`g.nav.screen = null; g.nav.tab = 'today'`);
  await A.p.fill('.composer textarea', 'Dinner at 8?');
  await A.p.click('.composer .send');
  await B.p.waitForSelector('.people-card:has-text("1 new message")', { timeout: 8000 });
  await B.p.waitForSelector('.tabbar .tab-dot');
  await B.shot('people-10-today');
  A.ok('Today card and More badge for unread messages');

  // cycle: start from the next expected period instead of the last one
  const C = await phone('Mina');
  await C.G(`g.go('cycle')`); await C.p.waitForTimeout(300);
  await C.p.click('.seg button:has-text("Next period")');
  await C.G(`document.querySelector('input[type=date][min]').value = g.addDays(g.R.today, 10); document.querySelector('input[type=date][min]').dispatchEvent(new Event('input'))`);
  await C.p.click('text=Start tracking');
  await C.p.waitForSelector('.cyc-hero');
  const msg = await C.p.textContent('.cyc-hero .msg');
  assert.equal(msg, 'Next period in 10 days');
  assert.ok(await C.p.locator('text=Estimated from the date you gave').count());
  await C.shot('cycle-next-period');
  C.ok('cycle starts from an upcoming period: ' + msg);

  for (const x of [A, B, C]) assert.deepEqual(x.errs, []);
  } catch (e) { await fail(e); }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
