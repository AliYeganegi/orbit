/* Basics shared by everything: Vue imports, small helpers, constants, the Android/iPhone bridge, language. */
const { createApp, reactive, ref, computed, watch, watchEffect, nextTick, onMounted, onBeforeUnmount } = Vue;

/* ================= utils ================= */
const pad = n => String(n).padStart(2, '0');
const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const toEn = s => String(s)
  .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const satIdx = k => (parseKey(k).getDay() + 1) % 7; // Saturday-first week

// the language is read before anything renders; switching it reloads the app
const LANG = (() => { try { return ((JSON.parse(localStorage.getItem('orbit.v1')) || {}).settings || {}).lang === 'fa' ? 'fa' : 'en'; } catch (e) { return 'en'; } })();
const FA = LANG === 'fa';
const MON = FA ? ['ژانویه', 'فوریه', 'مارس', 'آوریل', 'مه', 'ژوئن', 'ژوئیه', 'اوت', 'سپتامبر', 'اکتبر', 'نوامبر', 'دسامبر'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = FA ? MON : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = FA ? ['یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = FA ? WD : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WK = FA ? ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] : ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'];
const JM = FA ? ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'] : ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];

const jfmt = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
const jcache = {};
function jal(k) {
  if (jcache[k]) return jcache[k];
  const p = jfmt.formatToParts(parseKey(k));
  const g = t => parseInt(toEn(p.find(x => x.type === t).value), 10);
  return (jcache[k] = { y: g('year'), m: g('month'), d: g('day') });
}
const jLabel = k => { const j = jal(k); return j.d + ' ' + JM[j.m - 1]; };
const jFull = k => jLabel(k) + ' ' + jal(k).y;
const gLabel = k => { const d = parseKey(k); return FA ? d.getDate() + ' ' + MON[d.getMonth()] : MON[d.getMonth()] + ' ' + d.getDate(); };
const gFull = k => { const d = parseKey(k); return FA ? WDL[d.getDay()] + '، ' + d.getDate() + ' ' + MON[d.getMonth()] : WDL[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate(); };
function rel(k) {
  const n = diffDays(R.today, k);
  if (n === 0) return FA ? 'امروز' : 'Today';
  if (n === 1) return FA ? 'فردا' : 'Tomorrow';
  if (n === -1) return FA ? 'دیروز' : 'Yesterday';
  if (n > 1 && n < 7) return WDL[parseKey(k).getDay()];
  return gLabel(k);
}
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return FA ? 'همین الان' : 'Just now';
  if (s < 3600) return FA ? Math.floor(s / 60) + ' دقیقه پیش' : Math.floor(s / 60) + ' min ago';
  if (s < 86400) return FA ? Math.floor(s / 3600) + ' ساعت پیش' : Math.floor(s / 3600) + 'h ago';
  return gLabel(keyOf(new Date(ts)));
}
const fmt = n => Math.round(n || 0).toLocaleString('en-US');
function short(n) {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return +(n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return +(n / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return Math.round(n / 1e3) + 'K';
  return fmt(n);
}
function words(n) {
  if (!n) return '';
  if (n >= 1e9) return +(n / 1e9).toFixed(3) + ' billion Toman';
  if (n >= 1e6) return +(n / 1e6).toFixed(3) + ' million Toman';
  if (n >= 1e3) return +(n / 1e3).toFixed(1) + ' thousand Toman';
  return n + ' Toman';
}
const mmss = s => pad(Math.floor(s / 60)) + ':' + pad(s % 60);
const hm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const isToday = ms => keyOf(new Date(ms)) === R.today;
const whenShort = ms => { if (!ms) return ''; const r = isToday(ms) ? 'today' : rel(keyOf(new Date(ms))); return (r === 'Tomorrow' ? 'tomorrow' : r) + ' ' + hm(ms); };
const everyLabel = m => (m < 60 ? m + ' min' : +(m / 60).toFixed(1) + ' h');

/* ================= constants ================= */
const MOODS = [
  { v: 1, e: '😣', l: 'Awful', c: '#ff5a5f' },
  { v: 2, e: '😕', l: 'Bad', c: '#f97316' },
  { v: 3, e: '😐', l: 'Okay', c: '#f5b83d' },
  { v: 4, e: '🙂', l: 'Good', c: '#22c55e' },
  { v: 5, e: '😄', l: 'Great', c: '#14b8a6' },
];
const PRIOS = [
  { v: 0, l: 'None', c: 'var(--muted)' },
  { v: 1, l: 'Low', c: '#3ba4ff' },
  { v: 2, l: 'Medium', c: '#f5a524' },
  { v: 3, l: 'High', c: '#ff5a5f' },
];
const HABIT_COLORS = ['#7c6cff', '#22c55e', '#3ba4ff', '#ff6b5b', '#f5a524', '#ff5c9a', '#14b8a6', '#a78bfa', '#f97316', '#64748b'];
const HABIT_EMOJI = ['💧', '📚', '🏋️', '🧘', '🚶', '🍎', '😴', '🧠', '💊', '🎸', '✍️', '🧹', '🌱', '🚭', '☀️', '🙏', '💻', '🎨', '🏃', '🚴', '🥗', '📵', '💰', '❤️'];
const HABIT_IDEAS = [
  { name: 'Drink water', emoji: '💧', color: '#3ba4ff' }, { name: 'Read 10 pages', emoji: '📚', color: '#f5a524' },
  { name: 'Workout', emoji: '🏋️', color: '#ff6b5b' }, { name: 'Meditate', emoji: '🧘', color: '#a78bfa' },
  { name: 'Walk 8k steps', emoji: '🚶', color: '#22c55e' }, { name: 'No sugar', emoji: '🍬', color: '#ff5c9a' },
  { name: 'Sleep before 12', emoji: '😴', color: '#7c6cff' }, { name: 'Learn something', emoji: '🧠', color: '#14b8a6' },
  { name: 'Stretch 5 minutes', emoji: '🤸', color: '#f97316' }, { name: 'Eat a fruit', emoji: '🍎', color: '#ef4444' },
  { name: 'Journal', emoji: '✍️', color: '#64748b' }, { name: 'No phone in bed', emoji: '📵', color: '#7c6cff' },
  { name: 'Take vitamins', emoji: '💊', color: '#22c55e' }, { name: 'Practice English', emoji: '🗣️', color: '#3ba4ff' },
  { name: 'Pray', emoji: '🙏', color: '#a78bfa' }, { name: 'Save money', emoji: '💰', color: '#14b8a6' },
  { name: 'Call family', emoji: '❤️', color: '#ff5c9a' }, { name: 'Tidy up 10 min', emoji: '🧹', color: '#f5a524' },
  { name: 'Code for 30 min', emoji: '💻', color: '#7c6cff' }, { name: 'Go outside', emoji: '☀️', color: '#f5a524' },
];
const HABIT_SUGGEST = [
  { name: 'Drink water', emoji: '💧', color: '#3ba4ff' },
  { name: 'Read 10 pages', emoji: '📚', color: '#f5a524' },
  { name: 'Workout', emoji: '🏋️', color: '#ff6b5b' },
  { name: 'Meditate', emoji: '🧘', color: '#a78bfa' },
  { name: 'Walk 8k steps', emoji: '🚶', color: '#22c55e' },
  { name: 'No sugar', emoji: '🍬', color: '#ff5c9a' },
  { name: 'Sleep before 12', emoji: '😴', color: '#7c6cff' },
  { name: 'Learn something', emoji: '🧠', color: '#14b8a6' },
];
const CATS_OUT = [
  { id: 'food', l: 'Food', e: '🍔', c: '#ff6b5b' },
  { id: 'groc', l: 'Groceries', e: '🛒', c: '#22c55e' },
  { id: 'cafe', l: 'Cafe', e: '☕', c: '#b07a4f' },
  { id: 'trans', l: 'Transport', e: '🚕', c: '#f5a524' },
  { id: 'shop', l: 'Shopping', e: '🛍️', c: '#ff5c9a' },
  { id: 'bills', l: 'Bills', e: '💡', c: '#3ba4ff' },
  { id: 'home', l: 'Home', e: '🏠', c: '#14b8a6' },
  { id: 'health', l: 'Health', e: '💊', c: '#ef4444' },
  { id: 'fun', l: 'Fun', e: '🎬', c: '#a78bfa' },
  { id: 'gift', l: 'Gifts', e: '🎁', c: '#f97316' },
  { id: 'edu', l: 'Learning', e: '📚', c: '#7c6cff' },
  { id: 'other', l: 'Other', e: '✨', c: '#64748b' },
];
const CATS_IN = [
  { id: 'salary', l: 'Salary', e: '💼', c: '#22c55e' },
  { id: 'free', l: 'Freelance', e: '💻', c: '#14b8a6' },
  { id: 'giftin', l: 'Gift', e: '🎁', c: '#f97316' },
  { id: 'otherin', l: 'Other', e: '💰', c: '#3ba4ff' },
];
const CAT = Object.fromEntries([...CATS_OUT, ...CATS_IN].map(c => [c.id, c]));
const UNCAT = { id: '', l: 'To review', e: '❔', c: '#94a3b8' };
const catOf = id => CAT[id] || (S.customCats || []).find(c => c.id === id) || UNCAT;
/* the built-in categories plus the person's own, with "Other" kept last */
const catsFor = type => {
  const base = type === 'in' ? CATS_IN : CATS_OUT, other = base[base.length - 1];
  return [...base.slice(0, -1), ...(S.customCats || []).filter(c => (c.type || 'out') === type), other];
};
const CAT_EMOJI = ['🍕', '🍣', '🥙', '🧃', '🍰', '🚗', '⛽', '🚌', '✈️', '🏥', '💄', '👕', '👟', '💇', '🐶', '🐱', '👶', '🎮', '📱', '💻', '🎧', '📚', '🎓', '🏋️', '⚽', '🎨', '🎵', '🎟️', '🏖️', '🕌', '🙏', '💝', '🧾', '🏦', '📈', '💳', '🔧', '🧹', '🌱', '🎉'];
const firstEmoji = str => { try { return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str.trim())][0].segment; } catch (e) { return [...str.trim()].slice(0, 2).join(''); } };
const NOTE_COLORS = ['', '#f5b83d', '#ff6b5b', '#22c55e', '#3ba4ff', '#a78bfa', '#ff5c9a'];
const CD_EMOJI = ['🎂', '✈️', '🎉', '💍', '🎓', '🏖️', '💼', '❤️', '🌸', '🏠', '👶', '⭐', '🎁', '🏆', '📅', '🌙'];
const MODES = {
  work: { l: 'Focus', c: '#ff6b5b' },
  short: { l: 'Short break', c: '#14b8a6' },
  long: { l: 'Long break', c: '#3ba4ff' },
};

/* ================= native bridge ================= */
const AN = window.Android;
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let audio;
function chime() {
  // short two-note chime; iOS web apps have no vibration or scheduled notifications
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [880, 1318.5].forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.18;
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.65);
    });
  } catch (e) {}
}
const Native = {
  has: !!AN,
  vibrate(ms = 10) { try { AN ? AN.vibrate(ms) : navigator.vibrate && navigator.vibrate(ms); } catch (e) {} },
  /** Shares a file (backup, CSV). Android 1.21+ writes a real file; older Android builds fall back to plain text. */
  shareFile(name, mime, text) {
    try { if (AN && AN.shareFile) return AN.shareFile(name, mime, text); } catch (e) {}
    try { if (AN) return AN.share(text); } catch (e) {}
    const file = new File([text], name, { type: mime });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(() => {});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  },
  share(text) {
    try { if (AN) return AN.share(text); } catch (e) {}
    if (navigator.share) {
      const file = new File([text], 'orbit-backup-' + R.today + '.json', { type: 'application/json' });
      const data = navigator.canShare && navigator.canShare({ files: [file] }) ? { files: [file], title: 'Orbit backup' } : { text, title: 'Orbit backup' };
      return navigator.share(data).catch(() => {});
    }
    navigator.clipboard && navigator.clipboard.writeText(text);
    say('Copied to clipboard');
  },
  theme(dark) { try { AN && AN.setTheme(dark); } catch (e) {} },
  askNotify() { try { AN && AN.requestNotifications(); } catch (e) {} },
  sysDark() { try { if (AN) return AN.isSystemDark(); } catch (e) {} return matchMedia('(prefers-color-scheme: dark)').matches; },
};

/* ================= language ================= */
// Farsi works as a layer over the English app: every piece of text shown is looked up in web/i18n.js
// (numbers become {n}, so "Next period in 10 days" matches "Next period in {n} days"). Things people
// write themselves (tasks, messages, names…) are marked translate="no" and left alone.
const I18N = FA ? (window.OrbitI18n || {}).fa || {} : null;
const numKey = str => { const nums = []; const key = str.replace(/\d+(?:[.,:]\d+)*/g, m => { nums.push(m); return '{n}'; }); return { key, nums }; };
/** Translates one piece of interface text (used for the screen, notifications and toasts alike). */
function tr(str) {
  if (!I18N || !str || typeof str !== 'string') return str;
  const t = str.trim();
  if (!t) return str;
  const one = x => {
    if (I18N[x] != null) return I18N[x];
    const { key, nums } = numKey(x);
    const hit = nums.length ? I18N[key] : null;
    if (hit == null) return null;
    let i = 0; return hit.replace(/\{n\}/g, () => nums[i++] || '');
  };
  let out = one(t);
  if (out == null) { const m = /^(.*?)([,:!.…]+)$/.exec(t); if (m) { const o = one(m[1]); if (o != null) out = o + m[2].replace(',', '،'); } } // "Good morning,"
  if (out == null && t.includes(' · ')) { // "10:00 · passed", "Today · 23 Mehr": each part on its own
    const parts = t.split(' · ').map(x => one(x) ?? x);
    if (parts.join(' · ') !== t) out = parts.join(' · ');
  }
  if (out == null && /^\d+ \w+$/.test(t)) { const m = /^(\d+) (\w+)$/.exec(t); const w = one(m[2]); if (w != null) out = m[1] + ' ' + w; } // "1 open"
  return out == null ? str : str.replace(t, out);
}
if (FA) {
  document.documentElement.lang = 'fa'; document.documentElement.dir = 'rtl';
  const done = new WeakMap(), ATTRS = ['placeholder', 'aria-label', 'title'];
  const skip = el => el && el.closest && el.closest('[translate="no"], input, textarea, script, style');
  const text = n => {
    if (done.get(n) === n.data || skip(n.parentElement)) return;
    const t = tr(n.data);
    if (t !== n.data) n.data = t;
    done.set(n, n.data);
  };
  const attrs = el => { if (skip(el) && !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return; for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } } };
  const walk = root => {
    if (root.nodeType === 3) return text(root);
    if (root.nodeType !== 1) return;
    attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? text(n) : attrs(n);
  };
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') text(m.target);
      else if (m.type === 'attributes') attrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
