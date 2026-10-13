/*
 * Bank SMS parser for Iranian banks. Turns a transaction SMS into
 * { type: 'out'|'in', amount (Toman), rial, balance, card, bank, date, time }
 * or null when the message isn't a transaction (OTP codes, ads, reminders...).
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
      .replace(/[‌‎‏‪-‮]/g, ' ')
      .replace(/[ \t]+/g, ' ');
  }

  const NOT_TX = /(^|[^\u0600-\u06FF])رمز|پویا|کد\s*(تایید|تأیید|فعال|ورود)|OTP|password|verification|یادآوری|سررسید|قسط\s*بعدی|تخفیف|جایزه|قرعه|اطلاعیه|کمپین/i;
  const BALANCE = /(مانده|موجودی|موجودي|balance)/i;
  const OUT = /(برداشت|خرید|پرداخت|کارمزد|انتقال\s*از|کسر|debit|withdraw|purchase)/i;
  const IN = /(واریز|سود|برگشت|انتقال\s*به|بستانکار|credit|deposit)/i;
  const AMOUNT_KEY = /(برداشت|واریز|خرید|انتقال|پرداخت|مبلغ|برگشت|سود|کارمزد|کسر|debit|credit|amount|withdraw|deposit|purchase)/i;
  const NUM = /\d{1,3}(?:,\d{3})+|\d{4,}/;
  const BANKS = [
    ['ملت', 'Mellat'], ['ملی', 'Melli'], ['صادرات', 'Saderat'], ['تجارت', 'Tejarat'], ['سامان', 'Saman'], ['پاسارگاد', 'Pasargad'],
    ['آینده', 'Ayandeh'], ['پارسیان', 'Parsian'], ['رسالت', 'Resalat'], ['کشاورزی', 'Keshavarzi'], ['مسکن', 'Maskan'], ['سپه', 'Sepah'],
    ['رفاه', 'Refah'], ['اقتصاد نوین', 'EN Bank'], ['شهر', 'Shahr'], ['دی', 'Dey'], ['سینا', 'Sina'], ['خاورمیانه', 'Middle East'],
    ['گردشگری', 'Tourism'], ['توسعه', 'Tose\'e'], ['کارآفرین', 'Karafarin'], ['بلو', 'Blu'], ['ویپاد', 'Wepod'], ['بانکینو', 'Bankino'],
    ['mellat', 'Mellat'], ['melli', 'Melli'], ['bmi', 'Melli'], ['saderat', 'Saderat'], ['tejarat', 'Tejarat'], ['saman', 'Saman'],
    ['pasargad', 'Pasargad'], ['ayandeh', 'Ayandeh'], ['parsian', 'Parsian'], ['resalat', 'Resalat'], ['blu', 'Blu'],
  ];
  const toInt = s => parseInt(String(s).replace(/[,.]/g, ''), 10);
  // Iranian banks send from alphanumeric sender ids (B.Pasargad, BankSaderat, Bank Mellat...). Operators,
  // shops and wallets (Irancell, SnappFood, Wallex...) send ads and codes that look like money, so the
  // sender is the first filter.
  const BANK_SENDER = /bank|^b\.|pasargad|mellat|melli|bmi\b|saderat|tejarat|saman|sepah|ayandeh|parsian|resalat|keshavarzi|maskan|refah|sina|shahr|karafarin|middle ?east|tourism|tose+|blu\b|wepod|bankino|post ?bank|ansar|sarmayeh|hekmat/i;
  const isBankSender = s => !!s && BANK_SENDER.test(s);
  const AD = /https?:\/\/|www\.|لغو\s*\d*|تخفیف|کد تخفیف|قرعه/i;

  function bankName(text, sender) {
    const hay = (sender || '') + '\n' + text.split('\n').slice(0, 2).join(' ');
    const first = text.split('\n')[0].trim();
    for (const [k, v] of BANKS) {
      // Persian names must follow "بانک" (or be the whole first line, e.g. "بلو") and not continue into another word
      const ok = /^[a-z]/.test(k)
        ? new RegExp(k, 'i').test(sender || '') || new RegExp('\\b' + k + '\\b', 'i').test(hay)
        : new RegExp('بانک\\s*' + k + '(?![\\u0600-\\u06FF])').test(hay) || new RegExp('^' + k + '(?![\\u0600-\\u06FF])').test(first);
      if (ok) return v;
    }
    return '';
  }

  // account / card numbers look like amounts (849-800-123456-1, 6037**6789, 210.8000.123): hide them first
  const ACCOUNT = /\d+(?:[-.]\d+){2,}|\d+\s?[*xX]{2,}\s?\d+/g;

  /** Finds the transaction amount: a number on a keyword line or carrying a +/- sign, never the balance. */
  function findAmount(lines) {
    lines = lines.map(l => l.replace(ACCOUNT, ' # '));
    // pass 1: keyword lines (برداشت: 1,250,000)
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (BALANCE.test(l) && !AMOUNT_KEY.test(l.split(BALANCE)[0])) continue;
      const segment = BALANCE.test(l) ? l.split(BALANCE)[0] : l;
      if (!AMOUNT_KEY.test(segment)) continue;
      const after = segment.slice(segment.search(AMOUNT_KEY));
      const m = after.match(new RegExp('(' + NUM.source + ')\\s*([-+](?!\\d))?'));
      if (m) return { n: toInt(m[1]), sign: m[2] || '', line: l };
      // amount on the next line (label on its own line)
      const next = lines[i + 1] || '';
      const m2 = !BALANCE.test(next) && next.match(new RegExp('^\\s*(' + NUM.source + ')\\s*([-+](?!\\d))?'));
      if (m2) return { n: toInt(m2[1]), sign: m2[2] || '', line: l };
    }
    // pass 2: a signed number anywhere outside balance lines (500,000-)
    for (const l of lines) {
      if (BALANCE.test(l)) continue;
      const m = l.match(new RegExp('([-+])\\s*(' + NUM.source + ')|(' + NUM.source + ')\\s*([-+])(?!\\d)'));
      if (m) return { n: toInt(m[2] || m[3]), sign: m[1] || m[4], line: l };
    }
    return null;
  }

  function findDate(text) {
    let m = text.match(/(1[34]\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return { jy: +m[1], jm: +m[2], jd: +m[3] };
    m = text.match(/\b(1[34]\d{2})(\d{2})(\d{2})\b/);
    if (m) return { jy: +m[1], jm: +m[2], jd: +m[3] };
    m = text.match(/(?:^|\s)(\d{2})(\d{2})-\d{1,2}:\d{2}/m); // 0721-14:35
    if (m) return { jm: +m[1], jd: +m[2] };
    return null;
  }

  function parse(raw, opts) {
    opts = opts || {};
    const text = normalize(raw).trim();
    if (!text || NOT_TX.test(text)) return null;
    // with a known sender (SMS inbox) only trust banks, or messages that report a balance;
    // pasted text has no sender, so it is judged on content alone
    const known = opts.sender !== undefined && opts.sender !== null;
    const fromBank = known ? isBankSender(opts.sender) : true;
    if (!fromBank && !BALANCE.test(text)) return null;
    if (!fromBank && AD.test(text)) return null;
    const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const hit = findAmount(lines);
    if (!hit || !(hit.n > 0) || String(hit.n).length > 13) return null;
    // need at least one money signal besides a bare number
    if (!(AMOUNT_KEY.test(text) || BALANCE.test(text) || /ریال|تومان|rial/i.test(text))) return null;

    let type = 'out';
    if (hit.sign === '+') type = 'in';
    else if (hit.sign === '-') type = 'out';
    else if (IN.test(hit.line) && !OUT.test(hit.line)) type = 'in';
    else if (!OUT.test(text) && IN.test(text)) type = 'in';

    const toman = /تومان|toman/i.test(text) || opts.unit === 'toman';
    const amount = toman ? hit.n : Math.round(hit.n / 10);
    const balM = text.match(new RegExp(BALANCE.source + '[^\\d\\n]{0,12}(' + NUM.source + ')', 'i'));
    const cardM = text.match(/(\d{2,6}\s?[*xX]{2,}\s?\d{2,6}|\d{3,4}\.\d{3,4}\.\d{3,8}|\d{3}-\d{3}-\d{4,10}-\d)/);
    const timeM = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const bal = balM ? toInt(balM[2]) : null;
    return {
      type, amount, raw: hit.n, unit: toman ? 'toman' : 'rial',
      balance: bal == null ? null : toman ? bal : Math.round(bal / 10),
      card: cardM ? cardM[1].replace(/\s/g, '') : '',
      bank: bankName(text, opts.sender),
      date: findDate(text), time: timeM ? timeM[1].padStart(2, '0') + ':' + timeM[2] : '',
    };
  }

  /** Stable id for de-duplicating the same SMS seen twice (inbox scan + live receive). */
  function hash(sender, ts, body) {
    let h = 2166136261;
    const s = (sender || '') + '|' + Math.floor((ts || 0) / 60000) + '|' + normalize(body);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  g.OrbitSms = { parse, hash, normalize, isBankSender };
})(typeof self !== 'undefined' ? self : globalThis);
