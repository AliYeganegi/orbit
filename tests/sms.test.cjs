// Bank SMS parser tests: node tests/sms.test.cjs
const assert = require('node:assert/strict');
require('../web/sms.js');
const { parse, hash } = globalThis.OrbitSms;

const cases = [
  ['Mellat', 'بانك ملت\nحساب: 1234****5678\nبرداشت: 1,250,000\nمانده: 35,420,118\n1405/07/21-14:35', { type: 'out', amount: 125000, balance: 3542012, bank: 'Mellat', time: '14:35', card: '1234****5678' }],
  ['Melli', 'بانک ملی ایران\nانتقال:500,000-\nاز:0101****1234\nمانده:12,500,000\n0721-09:12', { type: 'out', amount: 50000, balance: 1250000, bank: 'Melli', time: '09:12' }],
  ['Saderat', 'بانك صادرات ايران\nخريد 2,350,000-\nکارت 6037**6789\nمانده 4,120,000\n1405/07/21 18:40', { type: 'out', amount: 235000, bank: 'Saderat' }],
  ['Pasargad', 'Bank Pasargad\nبرداشت 1,800,000 ریال\nاز حساب 210.8000.123\nمانده 9,850,000\n14050721 20:15', { type: 'out', amount: 180000, bank: 'Pasargad', card: '210.8000.123' }],
  ['Saman deposit', 'بانک سامان\nواریز به حساب 849-800-123456-1\nمبلغ: 250,000,000 ریال\nمانده: 312,450,000\n1405/07/21 10:05', { type: 'in', amount: 25000000, bank: 'Saman' }],
  ['Tejarat', 'بانک تجارت\nخرید با کارت:850,000-\nمانده:7,410,000+\n21/07 13:44', { type: 'out', amount: 85000, balance: 741000, bank: 'Tejarat' }],
  ['Ayandeh one line', 'بانک آینده: برداشت از حساب 0201***45 مبلغ 1,500,000 ریال در تاریخ 1405/07/21 ساعت 19:20 مانده 3,000,000', { type: 'out', amount: 150000, balance: 300000, bank: 'Ayandeh', time: '19:20' }],
  ['Persian digits', 'بانک ملت\nبرداشت: ۹۸۰,۰۰۰\nمانده: ۱۲,۰۰۰,۰۰۰\n۱۴۰۵/۰۷/۲۱-۱۱:۰۲', { type: 'out', amount: 98000, balance: 1200000, time: '11:02' }],
  ['Blu toman', 'بلو\nخرید ۲۵۰,۰۰۰ تومان\nموجودی: ۱,۲۰۰,۰۰۰ تومان', { type: 'out', amount: 250000, balance: 1200000, bank: 'Blu', unit: 'toman' }],
  ['Resalat plus', 'بانک رسالت\n+3,000,000\nمانده 5,500,000', { type: 'in', amount: 300000, bank: 'Resalat' }],
  ['Salary', 'بانک ملی\nواریز حقوق\n450,000,000\nمانده: 470,000,000', { type: 'in', amount: 45000000 }],
  ['Fee', 'بانک ملت\nکارمزد: 6,000\nمانده: 35,414,118', { type: 'out', amount: 600 }],
];
for (const [name, sms, want] of cases) {
  const got = parse(sms);
  assert.ok(got, name + ': not parsed');
  for (const k of Object.keys(want)) assert.equal(got[k], want[k], name + ' → ' + k + ' = ' + got[k]);
}
console.log('✓ ' + cases.length + ' bank SMS formats parsed');

const ignore = [
  'رمز پویا: 834512\nمبلغ: 1,250,000 ریال\nپذیرنده: فروشگاه',
  'بانک ملت\nکد تایید شما 55123',
  'یادآوری: قسط وام شما به مبلغ 5,000,000 ریال در تاریخ 1405/08/01 سررسید می شود',
  'سلام، جلسه فردا ساعت 10:00',
  'تخفیف ویژه 50% خرید با کارت بانک سامان',
  'Your verification code is 123456',
];
for (const s of ignore) assert.equal(parse(s), null, 'should ignore: ' + s.slice(0, 30));
console.log('✓ ' + ignore.length + ' non-transaction messages ignored (OTP, codes, reminders, ads, chat)');

assert.equal(parse('بانک ملت\nبرداشت: 1,000,000', { unit: 'toman' }).amount, 1000000, 'toman setting');
assert.equal(hash('Mellat', 1000, 'abc'), hash('Mellat', 1500, 'abc'), 'same minute → same hash');
assert.notEqual(hash('Mellat', 1000, 'abc'), hash('Mellat', 1000, 'abd'));
console.log('✓ unit setting and de-duplication hash');
