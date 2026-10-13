// Bank SMS parser tests: node tests/sms.test.cjs
const assert = require('node:assert/strict');
require('../web/sms.js');
const { parse, hash, isBankSender } = globalThis.OrbitSms;

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

// real-world shapes seen on a phone (digits made up), always with the sender id as the inbox gives it
const real = [
  ['Pasargad purchase', 'B.Pasargad', '0123.4567.12345678.1\n-1,250,000 \n07/21_14:35\nمانده: 35,420,118', { type: 'out', amount: 125000, bank: 'Pasargad', balance: 3542012 }],
  ['Pasargad deposit', 'B.Pasargad', '0123.4567.12345678.1\n+45,000,000 \n07/21_09:10\nمانده: 80,420,118', { type: 'in', amount: 4500000, bank: 'Pasargad' }],
  ['Saderat SMS fee', 'BankSaderat', 'بانک صادرات ایران\n کارمزد سرویس پیامک: 125,000-\n حساب:12345\n مانده:4,120,000\n 0721 - 14:35 ', { type: 'out', amount: 12500, bank: 'Saderat', balance: 412000 }],
];
for (const [name, sender, sms, want] of real) {
  const got = parse(sms, { sender });
  assert.ok(got, name + ': not parsed');
  for (const k of Object.keys(want)) assert.equal(got[k], want[k], name + ' → ' + k + ' = ' + got[k]);
}
const noise = [
  ['IrancellNow', 'درخواستت برای خرید اقساطی سیم کارت 5000 جونیور تایید شد! 🤩\nهمین الان می تونی وارد اپلیکیشن ایرانسل من بشی https://my.irancell.ir/dlp?id=bnpl'],
  ['IrancellNow', 'بسته مخصوص خودت رو بخر! 💳\n10گیگابایت اینترنت 30 روزه فقط 85000 تومان 🤩\nhttps://my.irance'],
  ['SNAPPFOOD', '☕100 هزار تومان تخفیف خرید کافه از اسنپ فود\n(هر بار مصرف 50 هزار تومان)\nلغو11'],
  ['WALLEX', '#محرمانه\n کد تایید: 123456\n برداشت: 25,000,000 تومان \nشبای مقصد: IR...123'],
  ['+989121234567', 'شما در تاریخ 21/07/1405 14:35 تعداد 2 تماس داشته اید.\nبا خرید هر شارژ 100,000 تومانی یک امتیاز در قرعه کشی بگیرید.'],
  ['+98300012345', 'سیدعلی عزیز؛ واریز منظم ماهانه, بدون نیاز به معامله👇\nwlx.info/zcf\nلغو11'],
  ['BankSaderat', 'بانک صادرات ایران\nشعبه:1234\nتاریخ سررسید:1405/08/01 \nشماره تسهیلات:1234567890123\nمبلغ قسط:12,500,000'],
  ['1000123', 'پاسارگاد\nخرید\nاسنپ\nمبلغ: 1,250,000\nرمز: 12345\n14:35:10'],
];
for (const [sender, sms] of noise) assert.equal(parse(sms, { sender }), null, 'should ignore from ' + sender + ': ' + sms.slice(0, 30));
console.log('✓ ' + real.length + ' real-world bank shapes parsed, ' + noise.length + ' operator/shop/wallet messages ignored');
assert.ok(isBankSender('B.Pasargad') && isBankSender('BankSaderat') && isBankSender('Bank Mellat') && !isBankSender('IrancellNow') && !isBankSender('SNAPPFOOD') && !isBankSender('+989121234567'));
assert.equal(parse('بانک ملت\nبرداشت: 1,000,000', { unit: 'toman' }).amount, 1000000, 'toman setting');
assert.equal(hash('Mellat', 1000, 'abc'), hash('Mellat', 1500, 'abc'), 'same minute → same hash');
assert.notEqual(hash('Mellat', 1000, 'abc'), hash('Mellat', 1000, 'abd'));
console.log('✓ unit setting and de-duplication hash');
