/*
 * Bank SMS parser for Iranian banks. Turns a transaction SMS into
 *   { type: 'out'|'in', amount (Toman), raw, unit, balance, card, bank, date, time,
 *     refund, confident, reasons }
 * or null when the message isn't a usable transaction (OTP codes, ads, reminders, failed or
 * declined payments...). `confident: false` means "show it for review, don't trust it blindly":
 * the app never lets an uncertain parse change an account balance.
 * Runs entirely on the phone; nothing is sent anywhere.
 */
(function (g) {
  const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
  function normalize(s) {
    return String(s || '')
      .replace(/[۰-۹]/g, d => FA.indexOf(d))
      .replace(/[٠-٩]/g, d => AR.indexOf(d))
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
      .replace(/[٬،]/g, ',').replace(/٫/g, '.')
      .replace(/−/g, '-')
      .replace(/[‌‎‏‪-‮]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      // "1.250.000" (dots as thousands separators, all groups of 3) → "1,250,000"; account numbers like
      // 0123.4567.12345678 keep their dots
      .replace(/\b\d{1,3}(?:\.\d{3}){2,}\b/g, m => m.replace(/\./g, ','));
  }

  const W = '\\u0600-\\u06FF';
  // whole words only: "کارمزد" (fee) contains "رمز" (password) and "رمزارز" is crypto, not a code
  const OTP = new RegExp('(^|[^' + W + '])(رمز|کد\\s*(تایید|تأیید|فعال\\s*سازی|ورود|امنیتی))(?![' + W + '])|\\bOTP\\b|password|verification', 'i');
  const NOISE = /یادآوری|تخفیف|جایزه|قرعه|اطلاعیه|کمپین|جشنواره|نظرسنجی|افتتاح|سود\s*بگیرید|کمک(\s*های)?\s*مردمی|هلال\s*احمر|تبریک|مراجعه\s*(کنید|فرمایید)|بدون\s*ضامن|دریافت\s*وام|تسهیلات\s*ویژه/;
  const DUE = /سررسید|معوق|مبلغ\s*قسط|لطفا\s*(نسبت\s*به\s*)?پرداخت/;
  const FAILED = /ناموفق|نا\s*موفق|عدم\s*موفق|رد\s*شد|موجودی\s*(حساب\s*)?(کافی\s*)?نیست|کافی\s*نمی|نامعتبر|مسدود|declined|failed/i;
  const BALANCE = /(مانده|موجودی|موجودي|balance)/i;
  const OUT = /(برداشت|خرید|پرداخت|کارمزد|انتقال\s*از|کسر|debit|withdraw|purchase)/i;
  const IN = /(واریز|سود|بستانکار|به\s*(حساب|کارت)\s*شما|credit|deposit|salary|حقوق)/i;
  const REFUND = /(برگشت|عودت|استرداد|اصلاحیه|لغو\s*(خرید|تراکنش)|وصول)/;
  const AMOUNT_KEY = /(برداشت|واریز|خرید|انتقال|پرداخت|مبلغ|برگشت|عودت|سود|کارمزد|کسر|حقوق|debit|credit|amount|withdraw|deposit|purchase)/i;
  // a number right after one of these is an id, not money (حساب 4567891234, پیگیری 123456, پایانه 12345678...)
  const ID_BEFORE = /(حساب|کارت|شبا|پیگیری|پایانه|ترمینال|چک|سریال|شماره|مرجع|شناسه|تسهیلات|پذیرنده|کد|ref|terminal|card|acc(ount)?|no\.?)\s*[:#.\-]?\s*$/i;
  const NUMRX = /(\d{1,3}(?:,\d{3})+|\d+)/g;
  const BANKS = [
    ['ملت', 'Mellat'], ['ملی', 'Melli'], ['صادرات', 'Saderat'], ['تجارت', 'Tejarat'], ['سامان', 'Saman'], ['پاسارگاد', 'Pasargad'],
    ['آینده', 'Ayandeh'], ['پارسیان', 'Parsian'], ['رسالت', 'Resalat'], ['کشاورزی', 'Keshavarzi'], ['مسکن', 'Maskan'], ['سپه', 'Sepah'],
    ['رفاه', 'Refah'], ['اقتصاد نوین', 'EN Bank'], ['شهر', 'Shahr'], ['دی', 'Dey'], ['سینا', 'Sina'], ['خاورمیانه', 'Middle East'],
    ['گردشگری', 'Tourism'], ['توسعه', 'Tose\'e'], ['کارآفرین', 'Karafarin'], ['بلو', 'Blu'], ['ویپاد', 'Wepod'], ['بانکینو', 'Bankino'],
    ['انصار', 'Ansar'], ['پست بانک', 'Post Bank'],
    ['mellat', 'Mellat'], ['melli', 'Melli'], ['bmi', 'Melli'], ['saderat', 'Saderat'], ['tejarat', 'Tejarat'], ['saman', 'Saman'],
    ['pasargad', 'Pasargad'], ['ayandeh', 'Ayandeh'], ['parsian', 'Parsian'], ['resalat', 'Resalat'], ['blu', 'Blu'],
    ['sepah', 'Sepah'], ['keshavarzi', 'Keshavarzi'], ['ansar', 'Ansar'], ['maskan', 'Maskan'], ['refah', 'Refah'], ['sina', 'Sina'],
  ];
  const toInt = s => parseInt(String(s).replace(/[,.]/g, ''), 10);
  // Iranian banks send from alphanumeric sender ids (B.Pasargad, BankSaderat, Bank Mellat...). Operators,
  // shops and wallets (Irancell, SnappFood, Wallex...) send ads and codes that look like money, so the
  // sender is the first filter.
  const BANK_SENDER = /bank|^b\.|pasargad|mellat|melli|bmi\b|saderat|tejarat|saman|sepah|ayandeh|parsian|resalat|keshavarzi|maskan|refah|sina|shahr|karafarin|middle ?east|tourism|tose+|blu\b|wepod|bankino|post ?bank|ansar|sarmayeh|hekmat/i;
  const isBankSender = s => !!s && BANK_SENDER.test(s);
  const AD = /https?:\/\/|www\.|لغو\s*\d+|کد تخفیف|قرعه/i;

  function bankName(text, sender) {
    const hay = (sender || '') + '\n' + text.split('\n').slice(0, 2).join(' ');
    const first = text.split('\n')[0].trim();
    for (const [k, v] of BANKS) {
      // Persian names must follow "بانک" (or be the whole first line, e.g. "بلو") and not continue into another word
      const ok = /^[a-z]/.test(k)
        ? new RegExp(k, 'i').test(sender || '') || new RegExp('\\b' + k + '\\b', 'i').test(hay)
        : new RegExp('بانک\\s*' + k + '(?![' + W + '])').test(hay) || new RegExp('^' + k + '(?![' + W + '])').test(first);
      if (ok) return v;
    }
    return '';
  }

  /**
   * Every number in the message, scored as a possible transaction amount. Ids (account, card, IBAN,
   * tracking, terminal, cheque numbers), dates and times are skipped; balances are reported separately.
   */
  function candidates(lines) {
    const out = [], balances = [];
    lines.forEach((raw, li) => {
      // hide account/card/IBAN shapes first: 849-800-123456-1, 0123.4567.12345678.1, 6037**6789, IR8201...
      const line = raw.replace(/IR\s?\d{10,}/gi, ' # ').replace(/\d+(?:[-.]\d+){2,}|\d+\s?[*xX]{2,}\s?\d+/g, m => ' '.repeat(m.length));
      const label = li > 0 && !/\d/.test(lines[li - 1]) ? lines[li - 1] : '';
      let m;
      NUMRX.lastIndex = 0;
      while ((m = NUMRX.exec(line))) {
        const s = m.index, e = s + m[0].length, digits = m[0].replace(/,/g, '');
        const before = line.slice(0, s), after = line.slice(e);
        const prevCh = line[s - 1] || '', nextCh = line[e] || '';
        // dates and times (1405/07/21, 14:35, 07/21_14:35); a label colon ("مبلغ:1,250,000") is fine
        if ((/[\/:_]/.test(prevCh) && /\d/.test(line[s - 2] || '')) || /^[\/:_]\d/.test(after)) continue;
        if (/\d/.test(prevCh) || digits.length > 13) continue;
        const sep = m[0].includes(',');
        // ids never carry thousands separators, so "کارت:850,000-" is still an amount
        if (!sep && ID_BEFORE.test(before)) continue;
        // sign: "-1,250,000", "+3,000,000", "2,350,000-"; a dash between digits (0721-1435) is not a sign
        const lead = /(^|[\s:])([-+])\s?$/.exec(before);
        const trail = /^\s?([-+])(?![\d])/.exec(after);
        const sign = lead ? lead[2] : trail ? trail[1] : '';
        if (!sign && !sep && digits.length < 4) continue;
        // movement words right after the number count too: "1,250,000 برداشت شد"
        const ctx = before + ' ' + label + ' ' + after.slice(0, 24);
        if (BALANCE.test(before) && !AMOUNT_KEY.test(before.split(BALANCE).pop())) {
          balances.push({ n: toInt(m[0]) * (sign === '-' ? -1 : 1), li });
          continue;
        }
        // a long run of digits with no separators is an id unless "مبلغ" introduces it
        if (!sep && digits.length >= 10 && !/مبلغ|amount/i.test(before)) continue;
        let score = 0;
        const why = [];
        if (sign) { score += 4; why.push('sign'); }
        if (/مبلغ|amount/i.test(ctx)) { score += 3; why.push('amount label'); }
        if (OUT.test(ctx) || IN.test(ctx) || REFUND.test(ctx)) { score += 2; why.push('keyword'); }
        if (sep) score += 1;
        if (/^\s*(ریال|تومان|rial)/i.test(after)) score += 1;
        if (/^\s*[-+]?\s*$/.test(before) && /^\s*[-+]?\s*(ریال|تومان)?\s*$/.test(after)) score += 1; // number on its own line
        out.push({ n: toInt(m[0]), sign, score, why, li, line: raw, ctx });
      }
    });
    return { out, balances };
  }

  function findDate(text) {
    let m = text.match(/(1[34]\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return { jy: +m[1], jm: +m[2], jd: +m[3] };
    m = text.match(/\b(1[34]\d{2})(\d{2})(\d{2})\b/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return { jy: +m[1], jm: +m[2], jd: +m[3] };
    return null;
  }

  function parse(raw, opts) {
    opts = opts || {};
    const text = normalize(raw).trim();
    // a failed payment is ignored, but the reversal of one ("برگشت تراکنش ناموفق") is money coming back
    if (!text || OTP.test(text) || (FAILED.test(text) && !REFUND.test(text))) return null;
    // with a known sender (SMS inbox) only trust banks, or messages that report a balance;
    // pasted text has no sender, so it is judged on content alone
    const known = opts.sender !== undefined && opts.sender !== null;
    const fromBank = known ? isBankSender(opts.sender) : true;
    if (!fromBank && !BALANCE.test(text)) return null;
    if (!fromBank && AD.test(text)) return null;
    if (NOISE.test(text) && !BALANCE.test(text)) return null;

    const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const { out: cands, balances } = candidates(lines);
    // loan/installment reminders: "مبلغ قسط ... سررسید" with no movement of money
    if (DUE.test(text) && !balances.length && !cands.some(c => c.sign)) return null;
    if (!cands.length) return null;
    const best = cands.reduce((a, b) => (b.score > a.score ? b : a));
    if (best.score < 2 && !(fromBank && best.sign)) return null; // a bare number isn't enough
    if (!(AMOUNT_KEY.test(text) || BALANCE.test(text) || /ریال|تومان|rial/i.test(text) || best.sign)) return null;
    // "مانده حساب ... 35,420,118": a balance notice with no movement isn't a transaction
    if (!best.sign && !AMOUNT_KEY.test(text)) return null;

    const reasons = [];
    let type, typeSure = true;
    const refund = REFUND.test(text) && best.sign !== '-';
    if (best.sign === '+') type = 'in';
    else if (best.sign === '-') type = 'out';
    else if (refund) type = 'in';
    else {
      const here = best.ctx;
      if (IN.test(here) && !OUT.test(here)) type = 'in';
      else if (OUT.test(here) && !IN.test(here)) type = 'out';
      else if (IN.test(text) && !OUT.test(text)) type = 'in';
      else if (OUT.test(text) && !IN.test(text)) type = 'out';
      else { type = 'out'; typeSure = false; reasons.push('direction unclear'); }
    }

    const toman = /تومان|toman/i.test(text) || opts.unit === 'toman';
    const conv = n => (n == null ? null : toman ? n : Math.round(n / 10));
    const bank = bankName(text, opts.sender);
    const others = cands.filter(c => c !== best && c.score === best.score && c.n !== best.n);
    if (others.length) reasons.push('several possible amounts');
    if (best.score < 4) reasons.push('weak amount signal');
    if (!bank) reasons.push('unknown bank');
    if (!fromBank) reasons.push('not from a bank');
    const cardM = text.match(/(\d{2,6}\s?[*xX]{2,}\s?\d{2,6}|\d{3,4}\.\d{3,4}\.\d{3,8}|\d{3}-\d{3}-\d{4,10}-\d)/);
    const accM = !cardM && text.match(/(?:حساب|کارت)\s*[:#]?\s*(\d{5,16})/);
    const timeM = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const bal = balances.length ? balances[0].n : null;
    return {
      type, amount: conv(best.n), raw: best.n, unit: toman ? 'toman' : 'rial',
      balance: conv(bal),
      card: cardM ? cardM[1].replace(/\s/g, '') : accM ? accM[1] : '',
      bank, refund: !!refund && type === 'in',
      date: findDate(text), time: timeM ? timeM[1].padStart(2, '0') + ':' + timeM[2] : '',
      confident: reasons.length === 0 && typeSure,
      reasons,
    };
  }

  const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  /** Legacy id (sender + minute + body). Kept so SMS already imported by older versions are still recognised. */
  const hash = (sender, ts, body) => fnv((sender || '') + '|' + Math.floor((ts || 0) / 60000) + '|' + normalize(body));
  /**
   * Content id: the same message seen twice (inbox scan vs live receiver, which use different clocks, or an
   * operator delivering it twice, or pasted by hand) gets the same id. Bank SMS carry the time and the
   * balance, so two real transactions practically never share a body.
   */
  const bodyHash = body => 'b' + fnv(normalize(body).replace(/\s+/g, ' ').trim());

  g.OrbitSms = { parse, hash, bodyHash, normalize, isBankSender, _candidates: t => candidates(normalize(t).split(/\n+/).map(s => s.trim()).filter(Boolean)) };
})(typeof self !== 'undefined' ? self : globalThis);
