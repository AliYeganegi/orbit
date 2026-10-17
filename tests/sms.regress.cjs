// Regression samples from the 2026-10 finance audit (digits made up). Run: node tests/sms.regress.cjs
// Each row: [name, sender, body, expected]  expected = null (ignored) or {type, amount, balance?, refund?, confident?}
const assert = require('node:assert/strict');
require('../web/sms.js');
const { parse, bodyHash } = globalThis.OrbitSms;
const P = 'B.Pasargad', SD = 'BankSaderat', ML = 'Bank Mellat';
const rows = [
  // ids, dates and times must never become the amount
  ['account no before amount', ML, 'بانک ملت\nواریز به حساب 4567891234 مبلغ 2,000,000 ریال\nمانده: 5,000,000', { type: 'in', amount: 200000, balance: 500000 }],
  ['transfer to account, signed', SD, 'بانک صادرات ایران\nانتقال به حساب 0209876543\nمبلغ:10,000,000-\nمانده:4,000,000', { type: 'out', amount: 1000000 }],
  ['transfer from account, signed', SD, 'بانک صادرات ایران\nانتقال از حساب 0209876543\nمبلغ:10,000,000+\nمانده:14,000,000', { type: 'in', amount: 1000000 }],
  ['tracking number', ML, 'بانک ملت\nخرید شماره پیگیری 123456 مبلغ 2,000,000\nمانده: 5,000,000', { type: 'out', amount: 200000 }],
  ['terminal id', SD, 'بانک صادرات ایران\nخرید از پایانه 12345678\n2,000,000-\nمانده: 5,000,000', { type: 'out', amount: 200000 }],
  ['cheque number', SD, 'بانک صادرات ایران\nبرداشت چک 1234567\nمبلغ:50,000,000\nمانده:5,000,000', { type: 'out', amount: 5000000 }],
  ['year before amount', SD, 'بانک صادرات ایران\nبرداشت 1405/07/21 مبلغ 1,250,000\nمانده 4,120,000', { type: 'out', amount: 125000 }],
  ['IBAN line', 'BMI', 'بانک ملی\nانتقال ساتنا به IR123456789012345678901234\nمبلغ:300,000,000-\nمانده:1,000,000', { type: 'out', amount: 30000000 }],
  ['pasargad hh:mm range', P, '0123.4567.12345678.1\n-1,250,000\n1405/07/21 - 14:35\nمانده: 35,420,118', { type: 'out', amount: 125000, balance: 3542012, confident: true }],
  ['pasargad 0721-1435', P, '0123.4567.12345678.1\n-1,250,000 \n0721-1435\nمانده: 35,420,118', { type: 'out', amount: 125000 }],
  ['pasargad without balance', P, '0123.4567.12345678.1\n-1,250,000\n07/21_14:35', { type: 'out', amount: 125000 }],
  ['dots as thousands (٫)', SD, 'بانک صادرات ایران\nبرداشت: ۱٫۲۵۰٫۰۰۰\nمانده: ۴٫۱۲۰٫۰۰۰', { type: 'out', amount: 125000, balance: 412000 }],
  ['label after amount', SD, 'بانک صادرات ایران\n1,250,000 برداشت شد\nمانده 4,120,000', { type: 'out', amount: 125000 }],
  ['negative balance', SD, 'بانک صادرات ایران\nبرداشت: 1,000,000\nمانده:-500,000', { type: 'out', amount: 100000, balance: -50000 }],
  // refunds and reversals are money in, flagged as refunds
  ['refund of purchase', ML, 'بانک ملت\nبرگشت از خرید\nمبلغ: 1,250,000\nمانده: 5,370,000', { type: 'in', amount: 125000, refund: true }],
  ['reversed withdrawal', ML, 'بانک ملت\nبرگشت برداشت: 1,250,000\nمانده: 5,370,000', { type: 'in', refund: true }],
  ['عودت', SD, 'بانک صادرات ایران\nعودت وجه\nمبلغ:1,250,000\nمانده:5,370,000', { type: 'in', refund: true }],
  ['cancelled purchase', ML, 'بانک ملت\nلغو خرید\nمبلغ: 1,250,000\nمانده: 5,370,000', { type: 'in', refund: true }],
  ['reversal of a failed payment', SD, 'بانک صادرات ایران\nبرگشت تراکنش ناموفق\nمبلغ:1,250,000\nحساب:0101234567\nمانده:5,370,000', { type: 'in', refund: true }],
  ['card-to-card received', SD, 'بانک صادرات ایران\nانتقال به کارت شما\nمبلغ:2,000,000\nمانده:16,000,000', { type: 'in', amount: 200000 }],
  ['installment actually paid', SD, 'بانک صادرات ایران\nپرداخت قسط تسهیلات\nمبلغ:12,500,000-\nسررسید:1405/08/01\nمانده:4,120,000', { type: 'out', amount: 1250000 }],
  ['merchant called پویا', SD, 'بانک صادرات ایران\nخرید از فروشگاه پویا\nمبلغ:1,250,000-\nمانده:4,120,000', { type: 'out', amount: 125000 }],
  ['crypto (رمزارز) purchase', SD, 'بانک صادرات ایران\nخرید رمزارز\nمبلغ:1,250,000-\nمانده:4,120,000', { type: 'out', amount: 125000 }],
  // uncertain: kept for review but flagged
  ['no direction', ML, 'بانک ملت\nمبلغ: 2,000,000\nمانده: 5,000,000', { amount: 200000, confident: false }],
  ['ambiguous transfer', ML, 'بانک ملت\nانتقال به 1234****5678\nمبلغ: 3,000,000\nمانده: 13,000,000', { confident: false }],
  ['wallet with balance', 'Snapp', 'کیف پول اسنپ\nپرداخت سفر: 85,000 تومان\nموجودی: 120,000 تومان', { type: 'out', amount: 85000, confident: false }],
  ['pasted plain amount', null, '1,250,000 تومان برداشت', { amount: 1250000 }],
  // ignored
  ['failed purchase', SD, 'بانک صادرات ایران\nخرید ناموفق\nمبلغ:1,250,000\nموجودی کافی نیست\nمانده:120,000', null],
  ['declined', SD, 'بانک صادرات ایران\nتراکنش رد شد\nخرید:1,250,000-\nمانده:120,000', null],
  ['amount blocked', ML, 'بانک ملت\nمبلغ 5,000,000 ریال از حساب شما مسدود شد', null],
  ['overdue installment', SD, 'بانک صادرات ایران\nمشتری گرامی قسط شما به مبلغ 12,500,000 ریال معوق است\nلطفا پرداخت نمایید', null],
  ['deposit advert', SD, 'بانک صادرات ایران\nبا افتتاح حساب سپرده ماهانه تا 23% سود بگیرید. مبلغ حداقل 10,000,000 ریال', null],
  ['charity', ML, 'بانک ملت\nواریز کمک های مردمی به حساب 123456 هلال احمر', null],
  ['loan advert', SD, 'بانک صادرات ایران\nوام 500,000,000 ریالی بدون ضامن! جهت دریافت به شعبه مراجعه کنید', null],
  ['balance notice', P, 'مانده حساب 0123.4567.12345678.1\nدر تاریخ 1405/07/21: 35,420,118 ریال', null],
  ['daily balance', SD, 'بانک صادرات ایران\nموجودی حساب 0101234567\nدر تاریخ 1405/07/21\n4,120,000 ریال', null],
  ['purchase OTP', '1000123', 'پاسارگاد\nخرید\nاسنپ\nمبلغ: 1,250,000\nرمز: 12345\n14:35:10', null],
];
let n = 0;
for (const [name, sender, body, want] of rows) {
  const got = parse(body, sender === null ? {} : { sender });
  if (want === null) { assert.equal(got, null, name + ': should be ignored, got ' + JSON.stringify(got)); n++; continue; }
  assert.ok(got, name + ': not parsed');
  for (const k of Object.keys(want)) assert.equal(got[k], want[k], name + ' → ' + k + ' = ' + JSON.stringify(got[k]) + ' ' + JSON.stringify(got.reasons));
  n++;
}
console.log('✓ ' + n + ' audit samples: ids/dates never taken as amounts, refunds in, failed/ads/notices ignored, uncertain flagged');
// the same SMS seen by the live receiver (SMS-centre clock) and the inbox scan (phone clock) is one message
const body = '0123.4567.12345678.1\n-1,250,000 \n07/21_14:35\nمانده: 35,420,118';
assert.equal(bodyHash(body), bodyHash(body.replace(/\n/g, '\n ')), 'whitespace-insensitive');
assert.notEqual(bodyHash(body), bodyHash(body.replace('35,420,118', '35,420,117')));
console.log('✓ content-based duplicate id ignores receive time');
