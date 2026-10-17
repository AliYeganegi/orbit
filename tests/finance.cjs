// Finance test: SMS de-duplication, confidence, balances, refunds, transfers, drafts, CSV, search.
// Usage: PW=<path to playwright> node tests/finance.cjs [url]   (web/ served locally)
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const assert = require('node:assert/strict');
const URL = process.argv[2] || 'http://127.0.0.1:8766/';
const ok = m => console.log('✓ ' + m);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const origin = new globalThis.URL(URL).origin;
  const state = { settings: { onboarded: true, name: 'T', sms: { on: true, unit: 'rial', since: 1, last: 1 } } };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'orbit.v1', value: JSON.stringify(state) }] }] } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(700);

  // 1. the same SMS via the live receiver (SMS-centre clock) and the inbox scan (phone clock) → one draft
  const r1 = await p.evaluate(() => {
    const body = '0123.4567.12345678.1\n-1,250,000 \n07/21_14:35\nمانده: 35,420,118';
    const t = Date.now() - 3600e3;
    smsImport([{ sender: 'B.Pasargad', ts: t - 2000, body }]);
    smsImport([{ sender: 'B.Pasargad', ts: t + 9000, body }]);
    const a = S.accounts.find(x => x.bank === 'Pasargad');
    return { drafts: S.money.length, bal: a && acctBalance(a) };
  });
  assert.deepEqual(r1, { drafts: 1, bal: 3542012 });
  ok('one SMS seen twice (different clocks) creates one draft; confident balance applied');

  // 2. uncertain readings never move a balance; unknown banks never touch a manual account
  const r2 = await p.evaluate(() => {
    S.accounts.push({ id: 'cash', name: 'Cash', bank: '', tail: '', balance: 500000, at: Date.now() - 864e5, src: 'user' });
    const pas = S.accounts.find(x => x.bank === 'Pasargad'); const before = acctBalance(pas);
    smsImport([{ sender: 'Bank Mellat', ts: Date.now() - 60e3, body: 'بانک ملت\nمبلغ: 2,000,000\nمانده: 99,000,000' }]); // direction unclear
    smsImport([{ sender: 'Snapp', ts: Date.now() - 50e3, body: 'کیف پول اسنپ\nپرداخت سفر: 85,000 تومان\nموجودی: 120,000 تومان' }]); // not a bank
    const mel = S.accounts.find(x => x.bank === 'Mellat');
    const drafts = S.money.filter(t => t.pending);
    return { cash: acctBalance(S.accounts.find(x => x.id === 'cash')), pasSame: acctBalance(pas) === before, melBal: mel ? mel.balance : null,
      uncertain: drafts.filter(t => t.uncertain).length, snappAcct: drafts.find(t => t.amount === 85000).acct };
  });
  assert.deepEqual(r2, { cash: 500000, pasSame: true, melBal: 0, uncertain: 2, snappAcct: '' });
  ok('uncertain SMS kept for review but never change balances; non-bank SMS never touch the Cash account');

  // 3. a balance the person set themselves is not overwritten by an SMS that disagrees: it's offered instead
  const r3 = await p.evaluate(() => {
    const pas = S.accounts.find(x => x.bank === 'Pasargad');
    pas.balance = 1000000; pas.at = Date.now() - 1000; pas.src = 'user';
    smsImport([{ sender: 'B.Pasargad', ts: Date.now(), body: '0123.4567.12345678.1\n-500,000 \n07/22_10:00\nمانده: 7,000,000' }]);
    return { bal: acctBalance(pas), suggest: pas.suggest && pas.suggest.v };
  });
  assert.deepEqual(r3, { bal: 1000000, suggest: 700000 });
  ok("a manually set balance isn't overwritten; the bank's number is offered as a suggestion");

  // 4. drafts don't count as spending until confirmed; refunds reduce their category; income excludes refunds
  const r4 = await p.evaluate(() => {
    const before = spentThisMonth.value;
    const draft = S.money.find(t => t.pending && t.type === 'out' && t.amount === 125000);
    categorize(draft, 'food');
    const afterConfirm = spentThisMonth.value;
    S.money.unshift({ id: 'ref', type: 'in', refund: true, amount: 25000, cat: 'food', note: '', date: R.today, created: Date.now() });
    S.money.unshift({ id: 'sal', type: 'in', amount: 900000, cat: 'salary', note: '', date: R.today, created: Date.now() });
    const list = monthTx(curJ.value.y, curJ.value.m);
    return { before, confirmed: afterConfirm - before, net: spentThisMonth.value - before, food: spendByCat(list).food, income: sumIncome(list) };
  });
  assert.equal(r4.confirmed, 125000); assert.equal(r4.net, 100000); assert.equal(r4.food, 100000); assert.equal(r4.income, 900000);
  ok('drafts excluded until confirmed; refund nets against Food; income excludes refunds');

  // 5. transfers move money between accounts and are neither spending nor income
  const r5 = await p.evaluate(() => {
    const cash = S.accounts.find(x => x.id === 'cash'), pas = S.accounts.find(x => x.bank === 'Pasargad');
    const spent = spentThisMonth.value, inc = sumIncome(monthTx(curJ.value.y, curJ.value.m)), c0 = acctBalance(cash), p0 = acctBalance(pas);
    S.money.unshift({ id: 'tr', type: 'transfer', amount: 200000, acct: pas.id, acct2: cash.id, cat: 'transfer', note: '', date: R.today, created: Date.now() + 5000 });
    return { spent: spentThisMonth.value - spent, inc: sumIncome(monthTx(curJ.value.y, curJ.value.m)) - inc, cash: acctBalance(cash) - c0, pas: acctBalance(pas) - p0 };
  });
  assert.deepEqual(r5, { spent: 0, inc: 0, cash: 200000, pas: -200000 });
  ok('transfer: −200k from Pasargad, +200k to Cash, spending and income unchanged');

  // 6. transfer editor validation, then search across months
  await p.evaluate(() => { nav.tab = 'money'; ui.tx = {}; }); await p.waitForTimeout(500);
  await p.click('.sheet .seg button:nth-child(3)');
  await p.fill('.sheet .amount-in input', '50000');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(200);
  assert.match(await p.textContent('.sheet'), /Pick both accounts/);
  await p.click('.sheet .flabel:text-is("From") + .chips .chip >> nth=0');
  await p.click('.sheet .flabel:text-is("To") + .chips .chip >> nth=1');
  await p.click('.sheet .btn.primary'); await p.waitForTimeout(300);
  if (await p.evaluate(() => !!ui.tx)) console.log('sheet still open:', (await p.textContent('.sheet')).slice(0, 300));
  assert.equal(await p.evaluate(() => S.money.filter(t => t.type === 'transfer').length), 2, 'transfer saved from the editor');
  ok('transfer editor explains what is missing, then saves');
  await p.evaluate(() => { S.money.push({ id: 'old', type: 'out', amount: 777000, cat: 'shop', note: 'Winter coat', date: addDays(R.today, -70), created: 1 }); });
  await p.fill('.view .search input', 'coat'); await p.waitForTimeout(300);
  assert.match(await p.textContent('.view'), /Winter coat/);
  await p.fill('.view .search input', '777000'); await p.waitForTimeout(300);
  assert.match(await p.textContent('.view'), /Winter coat/);
  ok('search finds transactions from other months by note or amount');

  // 7. CSV: formula guard, BOM, real file name
  const csv = await p.evaluate(async () => {
    S.money.unshift({ id: 'evil', type: 'out', amount: 1000, cat: 'food', note: '=HYPERLINK("http://x","a")', date: R.today, created: Date.now() });
    let got = null; const orig = Native.shareFile; Native.shareFile = (name, mime, text) => { got = { name, mime, text }; };
    nav.screen = 'reports'; await new Promise(r => setTimeout(r, 500));
    document.querySelector('.top .icon-btn:last-child').click();
    Native.shareFile = orig; return got;
  });
  assert.ok(csv && csv.name.endsWith('.csv') && csv.mime === 'text/csv', 'csv file');
  assert.equal(csv.text.charCodeAt(0), 0xFEFF, 'BOM');
  assert.ok(csv.text.includes(`"'=HYPERLINK(""http://x"",""a"")"`), 'formula neutralised');
  assert.ok(/Transfer/.test(csv.text) && /Refund/.test(csv.text), 'types exported');
  ok('CSV export: BOM, formulas neutralised, transfers and refunds labelled, .csv file');

  assert.deepEqual(errs, [], errs.join(' | '));
  await b.close();
  console.log('ALL GOOD');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
