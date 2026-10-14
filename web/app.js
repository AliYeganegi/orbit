/* Orbit — everything in one place */
const APP_VERSION = '1.14'; // single source of truth: android/build.sh reads this for the APK versionName
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

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WK = ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'];
const JM = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];

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
const gLabel = k => { const d = parseKey(k); return MON[d.getMonth()] + ' ' + d.getDate(); };
const gFull = k => { const d = parseKey(k); return WDL[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate(); };
function rel(k) {
  const n = diffDays(R.today, k);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return WDL[parseKey(k).getDay()];
  return gLabel(k);
}
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
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
const catOf = id => CAT[id] || UNCAT;
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

/* ================= state ================= */
const KEY = 'orbit.v1';
const defaults = () => ({
  settings: {
    name: '', theme: 'system', onboarded: false,
    waterGoal: 8, glassMl: 250, budget: 0,
    focus: { work: 25, short: 5, long: 15, rounds: 4, goal: 4, autoBreak: false, autoFocus: false, sound: true, keepAwake: true },
    cycle: { name: '', len: 28, plen: 5, expected: '', notify: true, goal: 'track', fertileNotify: false, showToday: true, pill: { on: false, time: '21:00' }, tip: { on: false, time: '09:00' } },
    notify: { tasks: true, focus: true },
    sms: { on: false, unit: 'rial', last: 0, since: 0 },
    waterRemind: { on: false, every: 60, start: '09:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6], stopAtGoal: true },
  },
  tasks: [], habits: [], notes: [], money: [], countdowns: [], cycleDays: [], cycleLog: {}, smsSeen: [], accounts: [], reminders: [],
  water: {}, mood: {}, focusLog: {},
  timer: { mode: 'work', running: false, endAt: 0, left: 25 * 60, total: 25 * 60, count: 0, label: '' },
});
function hydrate(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  for (const k of Object.keys(d)) if (raw[k] !== undefined) d[k] = raw[k];
  d.timer = { ...defaults().timer, ...(raw.timer || {}) };
  const s = raw.settings || {};
  const ds = defaults().settings;
  d.settings = { ...ds, ...s, sms: { ...ds.sms, ...(s.sms || {}) }, focus: { ...ds.focus, ...(s.focus || {}) }, cycle: { ...ds.cycle, ...(s.cycle || {}), pill: { ...ds.cycle.pill, ...((s.cycle || {}).pill || {}) }, tip: { ...ds.cycle.tip, ...((s.cycle || {}).tip || {}) } }, notify: { ...ds.notify, ...(s.notify || {}) }, waterRemind: { ...ds.waterRemind, ...(s.waterRemind || {}) } };
  return d;
}
function load() { try { return hydrate(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return defaults(); } }
const S = reactive(load());
let saveT;
const saveNow = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
watch(S, () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 200); }, { deep: true });
document.addEventListener('visibilitychange', () => document.hidden && saveNow());

// one-off cleanup of the notification test run on the developer's phone (2026-10-12); no-op elsewhere
try {
  const bk = JSON.parse(localStorage.getItem('orbit.testBackup'));
  if (bk) {
    S.tasks = S.tasks.filter(t => t.id !== 'zztest');
    Object.assign(S.settings.waterRemind, bk.water);
    const k = keyOf(new Date());
    if (bk.count) S.water[k] = bk.count; else delete S.water[k];
    localStorage.removeItem('orbit.testBackup');
  }
} catch (e) {}

// one-off (1.6): earlier versions imported 30 days of SMS as drafts; only keep what the user already categorized
if (S.settings.sms.on && !S.settings.sms.since) {
  S.money = S.money.filter(t => !(t.src === 'sms' && t.pending));
  S.settings.sms.since = Date.now(); S.settings.sms.last = Date.now();
}

// one-off (1.8): the water schedule becomes a regular, editable reminder
if (!S.settings.remMigrated) {
  const w = S.settings.waterRemind || {};
  if (!S.reminders.some(r => r.water)) S.reminders.unshift({ id: 'water', on: !!w.on, water: true, title: 'Drink water', emoji: '💧', color: '#3ba4ff', note: '',
    kind: 'interval', every: w.every || 60, start: w.start || '09:00', end: w.end || '22:00', days: w.days || [0, 1, 2, 3, 4, 5, 6], stopAtGoal: w.stopAtGoal !== false,
    until: '', created: Date.now() });
  S.settings.remMigrated = true;
}

const R = reactive({ now: Date.now(), today: keyOf(new Date()), sysDark: Native.sysDark() });
const nav = reactive({ tab: 'today', screen: null });
const ui = reactive({ task: null, tx: null, accounts: null, budget: false, rem: null });
const toast = reactive({ msg: '', undo: null, id: 0 });
let toastT;
function say(msg, undo) {
  toast.msg = msg; toast.undo = undo || null; toast.id++;
  clearTimeout(toastT);
  toastT = setTimeout(() => { toast.msg = ''; }, undo ? 4500 : 2400);
}
function doUndo() { const u = toast.undo; toast.msg = ''; u && u(); }
function go(screen) {
  if (screen && screen.startsWith('pair:')) { Soc.open = screen.slice(5); nav.screen = 'pair'; return; }
  nav.screen = screen;
}

/* back handling (Android hardware back) */
const backStack = [];
const pushBack = fn => { if (!backStack.includes(fn)) backStack.push(fn); };
const popBack = fn => { const i = backStack.indexOf(fn); if (i >= 0) backStack.splice(i, 1); };
window.orbitBack = () => {
  if (backStack.length) { backStack.pop()(); return true; }
  if (nav.screen) { nav.screen = nav.screen === 'pair' ? 'people' : null; return true; }
  if (nav.tab !== 'today') { nav.tab = 'today'; return true; }
  return false;
};
window.orbitSysTheme = dark => { R.sysDark = !!dark; };
addEventListener('keydown', e => { if (e.key === 'Escape') window.orbitBack(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { if (!Native.has) R.sysDark = e.matches; });

const isDark = computed(() => S.settings.theme === 'dark' || (S.settings.theme === 'system' && R.sysDark));
watchEffect(() => {
  document.documentElement.dataset.theme = isDark.value ? 'dark' : 'light';
  Native.theme(isDark.value);
});

/* ================= domain logic ================= */
const justDone = reactive({});
function toggleTask(t) {
  if (t.done) { t.done = false; t.doneAt = null; t.doneDay = null; return; }
  if (justDone[t.id]) return;
  justDone[t.id] = true;
  Native.vibrate(14);
  setTimeout(() => {
    t.done = true; t.doneAt = Date.now(); t.doneDay = R.today;
    delete justDone[t.id];
    const left = S.tasks.filter(x => !x.done && x.due && x.due <= R.today).length;
    const had = S.tasks.some(x => x.doneDay === R.today);
    if (!left && had && t.due && t.due <= R.today) say('All of today\'s tasks are done 🎉');
  }, 380);
}
function addTask(title, due) {
  const t = { id: uid(), title: title.trim(), notes: '', due: due || null, time: '', remind: false, priority: 0, done: false, created: Date.now() };
  S.tasks.unshift(t);
  Native.vibrate(8);
  return t;
}
function delTask(t) {
  const i = S.tasks.indexOf(t);
  if (i < 0) return;
  S.tasks.splice(i, 1);
  say('Task deleted', () => S.tasks.splice(i, 0, t));
}
const prioC = p => PRIOS[p || 0].c;

function toggleHabit(h, k) {
  if (h.log[k]) delete h.log[k];
  else {
    h.log[k] = true;
    Native.vibrate(14);
    if (k === R.today && S.habits.length > 1 && S.habits.every(x => x.log[R.today])) say('Every habit done today. Legend! 🔥');
  }
}
function streak(h) {
  let k = R.today; if (!h.log[k]) k = addDays(k, -1);
  let n = 0; while (h.log[k]) { n++; k = addDays(k, -1); }
  return n;
}
function bestStreak(h) {
  const keys = Object.keys(h.log).sort();
  let best = 0, cur = 0, prev = null;
  for (const k of keys) { cur = prev && diffDays(prev, k) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = k; }
  return best;
}

const waterToday = computed(() => S.water[R.today] || 0);
function addWater(n) {
  const v = clamp((S.water[R.today] || 0) + n, 0, 40);
  S.water[R.today] = v;
  Native.vibrate(n > 0 ? 12 : 6);
  if (n > 0 && v === S.settings.waterGoal) say('Water goal reached 💧 Nice!');
}
function setMood(v) {
  const cur = S.mood[R.today];
  S.mood[R.today] = { v, note: cur ? cur.note : '' };
  Native.vibrate(12);
}

/* focus timer */
const FOCUS_PRESETS = [
  { id: 'classic', l: 'Classic', work: 25, short: 5, long: 15 },
  { id: 'deep', l: 'Deep work', work: 50, short: 10, long: 20 },
  { id: 'sprint', l: 'Sprint', work: 15, short: 3, long: 10 },
];
// keep the screen on while a session runs (native flag on Android, Wake Lock API on the web)
const wake = {
  lock: null,
  async on() {
    if (!S.settings.focus.keepAwake) return;
    try { if (AN && AN.keepAwake) return AN.keepAwake(true); } catch (e) {}
    try { if (navigator.wakeLock && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch (e) {}
  },
  off() {
    try { if (AN && AN.keepAwake) AN.keepAwake(false); } catch (e) {}
    if (this.lock) { this.lock.release().catch(() => {}); this.lock = null; }
  },
};
const Timer = {
  len(m) { return S.settings.focus[m || S.timer.mode] * 60; },
  total() { return S.timer.total || this.len(); },
  left() { const t = S.timer; return t.running ? Math.max(0, Math.ceil((t.endAt - R.now) / 1000)) : t.left; },
  elapsed() { return this.total() - this.left(); },
  progress() { return this.elapsed() / this.total(); },
  started() { return S.timer.running || this.elapsed() > 0; },
  start() {
    const t = S.timer;
    if (!t.total) t.total = this.len();
    if (t.left <= 0) t.left = t.total;
    t.endAt = Date.now() + t.left * 1000; t.running = true;
    Native.vibrate(10);
    if (!Native.has) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) {} }
    wake.on();
  },
  pause() { const t = S.timer; t.left = this.left(); t.running = false; Native.vibrate(10); wake.off(); },
  toggle() { S.timer.running ? this.pause() : this.start(); },
  // snapshot so destructive actions can be undone instead of confirmed
  snap() {
    const t = S.timer, log = S.focusLog[R.today];
    return { timer: { ...t, left: this.left(), running: t.running }, log: log ? JSON.parse(JSON.stringify(log)) : null, day: R.today };
  },
  restore(sn) {
    Object.assign(S.timer, sn.timer, { running: false });
    if (sn.log) S.focusLog[sn.day] = sn.log; else delete S.focusLog[sn.day];
    if (sn.timer.running) this.start();
  },
  withUndo(msg, fn) {
    const worth = this.elapsed() >= 30;
    const sn = this.snap();
    fn();
    if (worth) say(msg, () => this.restore(sn));
  },
  reset() {
    this.withUndo('Timer reset', () => { const t = S.timer; t.running = false; t.total = this.len(); t.left = t.total; wake.off(); });
  },
  setMode(m) {
    if (m === S.timer.mode) return;
    this.withUndo('Switched to ' + MODES[m].l.toLowerCase(), () => { const t = S.timer; t.mode = m; t.running = false; t.total = this.len(m); t.left = t.total; wake.off(); });
    Native.vibrate(6);
  },
  extend(min) {
    const t = S.timer;
    t.total += min * 60;
    if (t.running) t.endAt += min * 60e3; else t.left += min * 60;
    Native.vibrate(8);
  },
  skip() { this.withUndo(S.timer.mode === 'work' ? 'Session ended early' : 'Break skipped', () => this.finish(false)); },
  log(min) {
    const l = S.focusLog[R.today] || (S.focusLog[R.today] = { min: 0, n: 0, s: [] });
    if (!l.s) l.s = [];
    l.min += min;
    return l;
  },
  finish(auto) {
    const t = S.timer, f = S.settings.focus;
    if (t.mode === 'work') {
      const mins = auto ? Math.round(this.total() / 60) : Math.floor(this.elapsed() / 60);
      if (mins > 0) {
        const l = this.log(mins);
        if (auto) l.n++;
        l.s.push({ at: Date.now(), min: mins, label: t.label || '', done: !!auto });
      }
      if (auto) t.count++;
      t.mode = auto && t.count % f.rounds === 0 ? 'long' : 'short';
    } else t.mode = 'work';
    t.running = false; t.total = this.len(); t.left = t.total;
    wake.off();
    if (auto) {
      Native.vibrate(600);
      if (f.sound && !document.hidden) chime();
      const goalHit = t.mode !== 'work' && focusToday.value.n === f.goal;
      say(t.mode === 'work' ? 'Break over. Ready to focus?' : goalHit ? 'Daily focus goal reached! 🏆' : 'Session complete! Take a break ☕');
      if (t.mode === 'work' ? f.autoFocus : f.autoBreak) this.start();
    }
  },
  resetCycle() { S.timer.count = 0; Native.vibrate(8); },
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.timer.running) wake.on(); });
if (S.timer.running) wake.on();
const focusToday = computed(() => S.focusLog[R.today] || { min: 0, n: 0, s: [] });
const focusStreak = computed(() => {
  let k = R.today; if (!(S.focusLog[k] && S.focusLog[k].n)) k = addDays(k, -1);
  let n = 0; while (S.focusLog[k] && S.focusLog[k].n) { n++; k = addDays(k, -1); }
  return n;
});

setInterval(() => {
  R.now = Date.now();
  const k = keyOf(new Date());
  if (k !== R.today) R.today = k;
  if (S.timer.running && R.now >= S.timer.endAt) Timer.finish(true);
}, 1000);

/* money */
const curJ = computed(() => jal(R.today));
function monthTx(y, m) { return S.money.filter(t => { const j = jal(t.date); return j.y === y && j.m === m; }); }
const spentThisMonth = computed(() => monthTx(curJ.value.y, curJ.value.m).filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0));

/* Jalali calendar helpers for reports */
function jToKey(y, m, d) {
  const g = new Date(y + 621, 2, 21);
  g.setDate(g.getDate() + (m - 1) * 30 + Math.min(m - 1, 6) + d - 1);
  let k = keyOf(g);
  for (let i = 0; i < 6; i++) {
    const j = jal(k), diff = (y - j.y) * 400 + (m - j.m) * 31 + (d - j.d);
    if (!diff) return k;
    k = addDays(k, diff > 0 ? 1 : -1);
  }
  return k;
}
function jMonthKeys(y, m) {
  const out = []; let k = jToKey(y, m, 1);
  while (jal(k).m === m && out.length < 32) { out.push(k); k = addDays(k, 1); }
  return out;
}
const jShift = (y, m, n) => { m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return { y, m }; };

/* accounts: the balance is the user's (or the bank's) number; the app only applies transactions after it */
// when a transaction happened, for deciding whether a balance snapshot already includes it
function txAt(t) {
  if (t.time) { const d = parseKey(t.date); const [h, m] = t.time.split(':'); d.setHours(+h, +m, 0, 0); return d.getTime(); }
  if (t.created && keyOf(new Date(t.created)) === t.date) return t.created;
  return parseKey(t.date).getTime() + 12 * 3600e3;
}
function acctBalance(a) {
  let b = a.balance || 0;
  for (const t of S.money) if (t.acct === a.id && txAt(t) > (a.at || 0)) b += t.type === 'in' ? t.amount : -t.amount;
  return b;
}
const totalBalance = computed(() => S.accounts.reduce((s, a) => s + acctBalance(a), 0));
function acctFor(bank, card) {
  const tail = (card || '').replace(/\D/g, '').slice(-4);
  let a = S.accounts.find(x => x.bank === bank && (x.tail || '') === tail) || (!tail && S.accounts.find(x => x.bank === bank));
  if (!a) { a = { id: uid(), name: (bank || 'Bank') + (tail ? ' ••' + tail : ''), bank, tail, balance: 0, at: 0, src: 'sms' }; S.accounts.push(a); }
  return a;
}

/* bank SMS → draft transactions (Android) */
const Sms = reactive({ granted: false, blocked: false, busy: false });
function smsRefresh() {
  if (!AN || !AN.smsStatus) return;
  try { const st = JSON.parse(AN.smsStatus()); Sms.granted = st.granted; Sms.blocked = st.blocked; } catch (e) {}
}
function smsImport(list) {
  const seen = new Set(S.smsSeen), added = [];
  for (const m of list) {
    const h = OrbitSms.hash(m.sender, m.ts, m.body);
    if (seen.has(h)) continue;
    seen.add(h);
    const p = OrbitSms.parse(m.body, { sender: m.sender, unit: S.settings.sms.unit });
    if (!p || !p.amount) continue;
    const d = new Date(m.ts);
    const a = acctFor(p.bank, p.card);
    // the bank's "مانده" already includes this transaction, so it becomes the new balance snapshot
    if (p.balance != null && m.ts >= (a.at || 0)) { a.balance = p.balance; a.at = m.ts; a.src = 'sms'; }
    const tx = { id: uid(), type: p.type, amount: p.amount, cat: '', note: '', date: keyOf(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
      created: m.ts, pending: true, src: 'sms', bank: p.bank, card: p.card, balance: p.balance, sms: h, acct: a.id };
    S.money.unshift(tx); added.push(tx);
  }
  S.smsSeen = [...seen].slice(-1500);
  return added;
}
function smsSync() {
  if (!AN || !AN.smsScan || !S.settings.sms.on) return [];
  smsRefresh();
  if (!Sms.granted) return [];
  let list = [];
  try { list = JSON.parse(AN.smsDrain()); } catch (e) {}
  // only messages that arrived after the user turned this on; the small overlap covers app restarts
  const floor = S.settings.sms.since || Date.now();
  const since = Math.max(floor, (S.settings.sms.last || floor) - 3600e3);
  try { list = list.concat(JSON.parse(AN.smsScan(String(since)))); } catch (e) {}
  list = list.filter(m => m.ts >= floor);
  S.settings.sms.last = Date.now();
  return smsImport(list);
}
function smsEnable() {
  if (!AN || !AN.smsRequest) return;
  smsRefresh();
  if (Sms.granted) return smsTurnOn();
  if (Sms.blocked) { AN.openAppSettings(); say('Allow SMS in App info → Permissions'); return; }
  Sms.busy = true;
  AN.smsRequest();
}
function smsTurnOn() {
  S.settings.sms.on = true; S.settings.sms.since = Date.now(); S.settings.sms.last = Date.now();
  AN.smsEnable(true);
  Sms.busy = false;
  say('On. New bank SMS will show up here automatically');
}
function smsDisable() { S.settings.sms.on = false; if (AN && AN.smsEnable) AN.smsEnable(false); say('Bank SMS import turned off'); }
window.orbitSmsPermission = granted => {
  smsRefresh(); Sms.busy = false;
  if (granted) smsTurnOn(); else say(Sms.blocked ? 'SMS access is blocked. Allow it in App info → Permissions' : 'SMS access was not allowed');
};
async function readClipboard() {
  try { if (AN && AN.readClipboard) return AN.readClipboard(); } catch (e) {}
  try { return await navigator.clipboard.readText(); } catch (e) { return ''; }
}
const pendingTx = computed(() => S.money.filter(t => t.pending).sort((a, b) => b.created - a.created));
// the categories this person uses most, for one-tap categorizing
const topCats = computed(() => {
  const n = {};
  S.money.forEach(t => { if (t.cat && t.type === 'out') n[t.cat] = (n[t.cat] || 0) + 1; });
  const ranked = Object.keys(n).filter(id => CAT[id]).sort((a, b) => n[b] - n[a]);
  for (const c of CATS_OUT) if (!ranked.includes(c.id)) ranked.push(c.id);
  return ranked.slice(0, 5).map(id => CAT[id]);
});
function categorize(t, cat) {
  const prev = { cat: t.cat, pending: t.pending };
  t.cat = cat; t.pending = false;
  Native.vibrate(10);
  say('Added to ' + catOf(cat).l, () => Object.assign(t, prev));
}
function dismissTx(t) {
  const i = S.money.indexOf(t); S.money.splice(i, 1);
  say('Removed', () => S.money.splice(i, 0, t));
}

/* countdowns */
function cdTarget(c) {
  const t = R.today;
  if (c.repeat === 'greg') {
    const d = parseKey(c.date); const ty = parseKey(t).getFullYear();
    for (let y = ty; y <= ty + 1; y++) {
      const k = keyOf(new Date(y, d.getMonth(), d.getDate()));
      if (k >= t) return k;
    }
  }
  if (c.repeat === 'jal') {
    const j = jal(c.date);
    for (let i = 0; i < 370; i++) { const k = addDays(t, i); const jj = jal(k); if (jj.m === j.m && jj.d === j.d) return k; }
  }
  return c.date;
}
const cdSorted = computed(() => S.countdowns
  .map(c => { const k = cdTarget(c); return { c, k, days: diffDays(R.today, k) }; })
  .sort((a, b) => (a.days < 0) - (b.days < 0) || (a.days < 0 ? b.days - a.days : a.days - b.days)));

/* cycle */
const cyc = computed(() => {
  const cs = S.settings.cycle, t = R.today;
  const days = [...S.cycleDays].sort();
  const periods = [];
  for (const k of days) {
    const last = periods[periods.length - 1];
    if (last && diffDays(last.end, k) <= 2) last.end = k; else periods.push({ start: k, end: k });
  }
  const lens = [];
  for (let i = 1; i < periods.length; i++) {
    const l = diffDays(periods[i - 1].start, periods[i].start);
    if (l >= 18 && l <= 50) lens.push(l);
  }
  const len = lens.length ? Math.round(avg(lens.slice(-6))) : cs.len;
  const plens = periods.slice(-6).map(p => diffDays(p.start, p.end) + 1).filter(n => n > 1);
  const plen = plens.length ? Math.round(avg(plens)) : cs.plen;
  // nothing logged yet but the next period date is known: start from an estimated last period so the app works right away
  if (!periods.length && cs.expected) {
    const start = addDays(cs.expected, -len);
    periods.push({ start: start > t ? t : start, end: start > t ? t : start, est: true });
  }
  const base = { periods, lens, len, plen, has: periods.length > 0, map: {} };
  if (!periods.length) return base;

  const last = periods[periods.length - 1];
  const day = diffDays(last.start, t) + 1;
  const next = addDays(last.start, len);
  const toNext = diffDays(t, next);
  const ov = addDays(next, -14);
  const loggedLen = diffDays(last.start, last.end) + 1;
  const curLen = loggedLen > 1 ? loggedLen : plen;
  const inPeriod = S.cycleDays.includes(t) || (!last.est && day >= 1 && day <= curLen && (loggedLen === 1 || t <= last.end));

  // no name means she's tracking her own cycle, so tips speak to her instead of a partner
  const self = !cs.name.trim();
  let phase, pc, tip;
  if (inPeriod) { phase = 'Period'; pc = 'var(--c-cycle)'; tip = self ? 'Be gentle with yourself: rest, warmth and lots of water 🫖' : 'Comfort mode: warm drinks, rest and chocolate 🍫'; }
  else if (toNext < 0) { phase = 'Late'; pc = '#ff5a5f'; tip = 'Period is ' + -toNext + ' day' + (toNext === -1 ? '' : 's') + ' late'; }
  else if (t >= addDays(ov, -5) && t <= addDays(ov, 1)) { phase = t === ov ? 'Ovulation' : 'Fertile window'; pc = '#14b8a6'; tip = 'Fertile window: highest chance of pregnancy'; }
  else if (t < ov) { phase = 'Follicular'; pc = '#a78bfa'; tip = self ? 'Energy is rising. A great time to start new things ✨' : 'Energy is rising. Great days for plans together ✨'; }
  else if (toNext <= 3) { phase = 'PMS'; pc = '#f97316'; tip = self ? 'PMS may kick in. Extra rest and self-care today 💗' : 'PMS may kick in. Extra kindness goes a long way 💗'; }
  else { phase = 'Luteal'; pc = '#f5a524'; tip = self ? 'Energy winding down. Cosy evenings and comfort food help 💛' : 'Energy winding down. Patience and snacks help 💛'; }

  const map = {};
  S.cycleDays.forEach(k => { map[k] = 'p'; });
  if (loggedLen === 1 && !last.est) for (let i = 1; i < plen; i++) { const k = addDays(last.start, i); map[k] = map[k] || 'pp'; }
  for (let i = 0; i < 6; i++) {
    const s = addDays(next, i * len), o = addDays(s, -14);
    for (let j = -5; j <= 1; j++) { const k = addDays(o, j); if (!map[k]) map[k] = j === 0 ? 'ov' : 'f'; }
    for (let j = 0; j < plen; j++) { const k = addDays(s, j); if (!map[k]) map[k] = 'pp'; }
  }
  return { ...base, est: !!last.est, last, day, next, toNext, ov, inPeriod, phase, pc, tip, map, fStart: addDays(ov, -5), fEnd: addDays(ov, 1) };
});
function togglePeriodDay(k) {
  const i = S.cycleDays.indexOf(k);
  if (i >= 0) S.cycleDays.splice(i, 1); else S.cycleDays.push(k);
  Native.vibrate(12);
}
/* ---------- cycle tracker: logging, stats, guidance ---------- */
const FLOWS = [{ v: 0, l: 'None' }, { v: 1, l: 'Spotting', d: 1 }, { v: 2, l: 'Light', d: 1 }, { v: 3, l: 'Medium', d: 2 }, { v: 4, l: 'Heavy', d: 3 }];
const SYMPTOMS = [
  { id: 'cramps', l: 'Cramps', e: '🤕' }, { id: 'headache', l: 'Headache', e: '🤯' }, { id: 'bloating', l: 'Bloating', e: '🎈' },
  { id: 'tender', l: 'Tender breasts', e: '💢' }, { id: 'backache', l: 'Backache', e: '🦴' }, { id: 'acne', l: 'Acne', e: '😖' },
  { id: 'fatigue', l: 'Fatigue', e: '🥱' }, { id: 'nausea', l: 'Nausea', e: '🤢' }, { id: 'cravings', l: 'Cravings', e: '🍫' },
  { id: 'insomnia', l: 'Insomnia', e: '🌙' }, { id: 'dizzy', l: 'Dizziness', e: '💫' }, { id: 'digestion', l: 'Upset stomach', e: '🫄' },
];
const CMOODS = [
  { id: 'happy', l: 'Happy', e: '😊' }, { id: 'calm', l: 'Calm', e: '😌' }, { id: 'energetic', l: 'Energetic', e: '⚡' }, { id: 'sensitive', l: 'Sensitive', e: '🥺' },
  { id: 'irritable', l: 'Irritable', e: '😤' }, { id: 'anxious', l: 'Anxious', e: '😰' }, { id: 'sad', l: 'Sad', e: '😢' }, { id: 'swings', l: 'Mood swings', e: '🎢' },
  { id: 'libido', l: 'High libido', e: '🔥' },
];
const DISCHARGE = [{ id: 'dry', l: 'Dry' }, { id: 'sticky', l: 'Sticky' }, { id: 'creamy', l: 'Creamy' }, { id: 'watery', l: 'Watery' }, { id: 'egg', l: 'Egg white' }];
const SEXLOG = [{ id: 'none', l: 'None' }, { id: 'protected', l: 'Protected' }, { id: 'unprotected', l: 'Unprotected' }];
const TESTS = [{ id: '', l: 'Not taken' }, { id: 'neg', l: 'Negative' }, { id: 'pos', l: 'Positive' }];
const GOALS = [
  { id: 'track', l: 'Track periods', e: '🗓️', s: 'Predictions and patterns' },
  { id: 'conceive', l: 'Trying to conceive', e: '👶', s: 'Highlights the best days' },
  { id: 'avoid', l: 'Avoiding pregnancy', e: '🛡️', s: 'Warns on fertile days' },
];
const PHASES = {
  period: { l: 'Period', c: 'var(--c-cycle)', e: '🩸' },
  follicular: { l: 'Follicular', c: '#a78bfa', e: '🌱' },
  fertile: { l: 'Fertile window', c: '#14b8a6', e: '✨' },
  luteal: { l: 'Luteal', c: '#f5a524', e: '🍂' },
  pms: { l: 'Pre-period', c: '#f97316', e: '🌧️' },
  late: { l: 'Late', c: '#ff5a5f', e: '⏳' },
};
const PHASE_GUIDE = {
  period: {
    desc: 'The uterine lining is shedding. Lower energy and mood dips are normal on these days.',
    food: ['Iron-rich foods: lentils, spinach, red meat, dates', 'Warm soups and ginger tea can ease cramps', 'A little dark chocolate for magnesium'],
    move: ['Gentle walks, stretching or yoga', 'Skip intense workouts if you feel drained'],
    care: ['A heat pad on the lower belly', 'Extra sleep and plenty of water', 'Pain relief like ibuprofen can help, if it suits you'],
    partner: ['Bring tea, a heat pad or a favourite snack', 'Offer to cook or take over chores', 'Plan a cosy night in'],
  },
  follicular: {
    desc: 'Estrogen is rising. Energy, mood and focus usually pick up.',
    food: ['Fresh vegetables, lean protein and whole grains', 'Fermented foods like yogurt and pickles'],
    move: ['A great time for cardio and strength training', 'Try a new class or sport'],
    care: ['Start new projects and make plans', 'Social plans feel easier now'],
    partner: ['Great days for an adventure or something new together', 'Energy is usually higher, so plan things you both enjoy'],
  },
  fertile: {
    desc: 'Ovulation is near. These are the days pregnancy is most likely.',
    food: ['Berries, nuts and seeds for antioxidants', 'Stay well hydrated'],
    move: ['Strength peaks: HIIT and heavier lifts feel good'],
    care: ['Confidence and libido often peak', 'Clear, stretchy "egg white" discharge is a sign of ovulation'],
    partner: ['Plan a date night', 'Not trying for a baby? Use protection these days'],
  },
  luteal: {
    desc: 'Progesterone rises. You may feel calmer at first, then more tired toward the end.',
    food: ['Complex carbs: oats, brown rice, sweet potato', 'Magnesium: nuts, bananas, leafy greens', 'Go easy on caffeine and salt'],
    move: ['Moderate exercise: pilates, swimming, brisk walks'],
    care: ['Wind down earlier in the evening', 'Wrap up tasks rather than start big new ones'],
    partner: ['Keep plans low-key toward the end of this phase', 'Patience goes a long way'],
  },
  pms: {
    desc: 'Hormones drop before the period. Bloating, cravings and mood swings are common.',
    food: ['Small, frequent meals keep blood sugar steady', 'Chamomile or peppermint tea', 'Less sugar, salt and caffeine'],
    move: ['Light walks and stretching help mood and bloating'],
    care: ['Plan some rest and be kind to yourself', 'Keep pads or a cup handy'],
    partner: ['Snacks, patience and kindness 💗', 'Don\'t take mood swings personally', 'Ask what would help today'],
  },
  late: {
    desc: 'The period is later than expected. Stress, travel, illness and sleep changes can all delay it.',
    food: ['Regular, balanced meals'], move: ['Keep moving gently'],
    care: ['If pregnancy is possible, a home test is reliable from the day of a missed period'],
    partner: ['Stay calm and supportive', 'If pregnancy is possible, offer to get a test'],
  },
};
const phaseKey = name => ({ Period: 'period', Follicular: 'follicular', 'Fertile window': 'fertile', Ovulation: 'fertile', Luteal: 'luteal', PMS: 'pms', Late: 'late' })[name] || 'luteal';

const sd = a => { if (a.length < 2) return 0; const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) ** 2))); };
const clog = k => S.cycleLog[k] || {};
function setClog(k, patch) {
  const cur = { ...(S.cycleLog[k] || {}), ...patch };
  for (const f of Object.keys(cur)) if (cur[f] === '' || cur[f] == null || (Array.isArray(cur[f]) && !cur[f].length)) delete cur[f];
  if (Object.keys(cur).length) S.cycleLog[k] = cur; else delete S.cycleLog[k];
}
function setFlow(k, v) {
  setClog(k, { flow: v || null });
  const i = S.cycleDays.indexOf(k), isPeriod = v >= 2;
  if (isPeriod && i < 0) S.cycleDays.push(k);
  if (!isPeriod && i >= 0) S.cycleDays.splice(i, 1);
  Native.vibrate(10);
}

/** Cycle day and phase for any past or present date. */
function cycleDayInfo(k) {
  const c = cyc.value;
  if (!c.has) return null;
  let idx = -1;
  for (let i = 0; i < c.periods.length; i++) if (c.periods[i].start <= k) idx = i;
  if (idx < 0) return null;
  const p = c.periods[idx];
  const nextStart = c.periods[idx + 1] ? c.periods[idx + 1].start : addDays(p.start, c.len);
  const day = diffDays(p.start, k) + 1, toNext = diffDays(k, nextStart);
  const ov = addDays(nextStart, -14), logged = diffDays(p.start, p.end) + 1;
  const plen = p.est ? 0 : logged > 1 ? logged : c.plen;
  let phase;
  if (day <= plen || S.cycleDays.includes(k)) phase = 'period';
  else if (toNext < 0) phase = 'late';
  else if (k >= addDays(ov, -5) && k <= addDays(ov, 1)) phase = 'fertile';
  else if (k < ov) phase = 'follicular';
  else if (toNext <= 3) phase = 'pms';
  else phase = 'luteal';
  return { day, phase, ov, toNext, start: p.start };
}
/** Pregnancy chance for a date, relative to the estimated ovulation day. */
function chanceOn(k) {
  const info = cycleDayInfo(k), c = cyc.value;
  if (!c.has) return null;
  const ov = info && info.toNext >= 0 ? info.ov : c.ov;
  const d = diffDays(ov, k);
  if (info && info.phase === 'period') return { l: 'Low', v: 0 };
  if (d === 0 || d === -1) return { l: 'Peak', v: 3 };
  if (d >= -3 && d <= -2) return { l: 'High', v: 2 };
  if (d === -5 || d === -4 || d === 1) return { l: 'Medium', v: 1 };
  return { l: 'Low', v: 0 };
}

/** Cycle day and phase for any date, including future ones (uses predicted starts past the next period). */
function anyDayInfo(k) {
  const c = cyc.value;
  if (!c.has) return null;
  if (k < c.next || c.toNext < 0) return cycleDayInfo(k);
  const n = Math.floor(diffDays(c.next, k) / c.len), start = addDays(c.next, n * c.len), next = addDays(start, c.len);
  const day = diffDays(start, k) + 1, toNext = diffDays(k, next), ov = addDays(next, -14);
  const phase = day <= c.plen ? 'period' : k >= addDays(ov, -5) && k <= addDays(ov, 1) ? 'fertile' : k < ov ? 'follicular' : toNext <= 3 ? 'pms' : 'luteal';
  return { day, phase, ov, toNext, start };
}
// small seeded PRNG so each cycle gets its own shuffled order and tips don't repeat day to day
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const strHash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** The tip for a date: a special one for key days, otherwise a different pick from the phase's pool each day. */
function cycleTip(k, offset = 0) {
  const info = anyDayInfo(k);
  if (!info) return null;
  const mode = S.settings.cycle.name.trim() ? 'partner' : 'self';
  const sp = OrbitTips.special[mode];
  let pool = null;
  if (!offset) {
    if (info.day === 1) pool = sp.day1;
    else if (info.day === 2 && info.phase === 'period') pool = sp.day2;
    else if (k === info.ov) pool = sp.ovulation;
    else if (info.toNext === 1) pool = sp.beforePeriod;
  }
  if (pool) return { text: pool[strHash(k) % pool.length], phase: info.phase, day: info.day };
  pool = OrbitTips[mode][info.phase] || OrbitTips[mode].luteal;
  const rnd = seeded(strHash(info.start + info.phase + mode));
  const order = pool.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { text: pool[order[(info.day - 1 + offset) % order.length]], phase: info.phase, day: info.day };
}

const cycStats = computed(() => {
  const c = cyc.value;
  const lens = c.lens.slice(-6), dev = sd(lens);
  const regularity = c.lens.length < 2 ? { l: 'Learning', s: 'Log 2+ cycles to see this' } : dev <= 2 ? { l: 'Very regular', s: '±' + Math.round(dev) + ' days' } : dev <= 4 ? { l: 'Regular', s: '±' + Math.round(dev) + ' days' } : dev <= 7 ? { l: 'Somewhat irregular', s: '±' + Math.round(dev) + ' days' } : { l: 'Irregular', s: '±' + Math.round(dev) + ' days' };
  const margin = c.lens.length >= 2 ? Math.max(1, Math.round(dev)) : 3;
  const real = c.periods.filter(p => !p.est);
  const cycles = real.map((p, i) => {
    const next = real[i + 1];
    const logged = diffDays(p.start, p.end) + 1;
    return { start: p.start, end: p.end, plen: logged > 1 ? logged : null, clen: next ? diffDays(p.start, next.start) : null };
  });
  const preds = c.has ? Array.from({ length: 3 }, (_, i) => { const s = addDays(c.next, i * c.len), o = addDays(s, -14); return { start: s, end: addDays(s, c.plen - 1), ov: o, fStart: addDays(o, -5), fEnd: addDays(o, 1) }; }) : [];

  // symptom and mood patterns across logged days
  const counts = {}, phaseCounts = {}, cyclesWith = {}, moodByPhase = {};
  const loggedCycles = new Set();
  for (const [k, e] of Object.entries(S.cycleLog)) {
    const info = cycleDayInfo(k);
    if (!info) continue;
    loggedCycles.add(info.start);
    for (const s of e.sym || []) {
      counts[s] = (counts[s] || 0) + 1;
      (phaseCounts[s] = phaseCounts[s] || {})[info.phase] = (phaseCounts[s][info.phase] || 0) + 1;
      (cyclesWith[s] = cyclesWith[s] || new Set()).add(info.start);
    }
    for (const m of e.mood || []) { const b = moodByPhase[info.phase] = moodByPhase[info.phase] || {}; b[m] = (b[m] || 0) + 1; }
  }
  const nCycles = loggedCycles.size;
  const symptoms = Object.keys(counts).map(id => {
    const pc = phaseCounts[id], top = Object.keys(pc).sort((a, b) => pc[b] - pc[a])[0];
    return { ...SYMPTOMS.find(x => x.id === id), n: counts[id], cycles: cyclesWith[id].size, of: nCycles, phase: top };
  }).sort((a, b) => b.n - a.n).slice(0, 6);
  const moods = ['period', 'follicular', 'fertile', 'luteal', 'pms'].map(ph => {
    const b = moodByPhase[ph] || {};
    return { ph, top: Object.keys(b).sort((x, y) => b[y] - b[x]).slice(0, 3).map(id => CMOODS.find(m => m.id === id)) };
  }).filter(r => r.top.length);

  // basal body temperature for the current cycle: a sustained rise of ~0.2°C marks ovulation
  let bbt = null;
  if (c.has) {
    const pts = [];
    for (let d = 0; d <= diffDays(c.last.start, R.today); d++) { const k = addDays(c.last.start, d), t = clog(k).temp; if (t) pts.push({ d: d + 1, t: +t, k }); }
    if (pts.length >= 3) {
      let shift = null, cover = null;
      for (let i = 6; i + 2 < pts.length; i++) {
        const base = Math.max(...pts.slice(i - 6, i).map(p => p.t));
        if (pts[i].t >= base + 0.2 && pts[i + 1].t > base && pts[i + 2].t > base) { shift = pts[i - 1]; cover = base + 0.05; break; }
      }
      bbt = { pts, shift, cover, min: Math.min(...pts.map(p => p.t)) - 0.15, max: Math.max(...pts.map(p => p.t)) + 0.15 };
    }
  }

  // gentle health notes (not a diagnosis)
  const flags = [];
  const allLens = c.lens.slice(-6);
  if (allLens.length >= 3 && avg(allLens) < 21) flags.push('Your cycles average ' + Math.round(avg(allLens)) + ' days, shorter than the typical 21–35. Worth mentioning to a doctor.');
  if (allLens.length >= 3 && avg(allLens) > 35) flags.push('Your cycles average ' + Math.round(avg(allLens)) + ' days, longer than the typical 21–35. Worth mentioning to a doctor.');
  if (allLens.length >= 3 && dev > 7) flags.push('Cycle length varies by more than a week. Stress, sleep and weight changes can cause this; if it continues, check with a doctor.');
  const plens = cycles.map(x => x.plen).filter(Boolean).slice(-3);
  if (plens.length >= 2 && avg(plens) > 7) flags.push('Periods lasting longer than 7 days are worth discussing with a doctor.');
  if (c.has) {
    let heavy = 0;
    for (let d = 0; d < 10; d++) if (clog(addDays(c.last.start, d)).flow === 4) heavy++;
    if (heavy >= 3) flags.push('Several heavy days this period. If you soak through a pad every hour or feel dizzy or weak, see a doctor.');
    if (c.toNext <= -7) flags.push('Your period is ' + -c.toNext + ' days late. If pregnancy is possible, consider taking a test.');
    const pos = Object.entries(S.cycleLog).find(([k, e]) => k >= c.last.start && e.preg === 'pos');
    if (pos) flags.unshift('You logged a positive pregnancy test on ' + gLabel(pos[0]) + '. Predictions may not apply now; a doctor can confirm and guide you. 💗');
  }
  return { regularity, margin, cycles, preds, symptoms, moods, bbt, flags, nCycles, shortest: c.lens.length ? Math.min(...c.lens) : null, longest: c.lens.length ? Math.max(...c.lens) : null };
});


/* ================= people: connections, chat, daily question ================= */
// The one part of Orbit that can't live only on this phone: accounts, messages and answers are kept on
// the Orbit server (push/src/social.js) so both people see them. The login key never leaves this phone.
const SOC_KEY = 'orbit.social';
const REL = Object.fromEntries(OrbitQuestions.TYPES.map(t => [t.id, t]));
const Soc = reactive({
  acct: (() => { try { return JSON.parse(localStorage.getItem(SOC_KEY)) || null; } catch (e) { return null; } })(), // { handle, token, seen }
  me: null, chats: {}, open: null, online: false,
});
const saveSoc = () => { try { Soc.acct ? localStorage.setItem(SOC_KEY, JSON.stringify(Soc.acct)) : localStorage.removeItem(SOC_KEY); } catch (e) {} };
const socPairs = computed(() => (Soc.me ? Soc.me.pairs : []));
const pairOf = id => socPairs.value.find(p => p.id === id);
const whoName = w => (w && (w.name || '@' + w.handle)) || '';
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
/** What needs this person's attention: requests, questions waiting for an answer, unread messages. */
const socTodo = computed(() => {
  if (!Soc.me) return { reqs: 0, questions: [], unread: 0, total: 0 };
  const reqs = Object.keys(Soc.me.inReq).length;
  const questions = socPairs.value.filter(p => p.today && !p.today.mine && p.today.day === p.todayKey);
  const proposals = socPairs.value.filter(p => p.proposal && p.proposal.by !== Soc.me.handle).length;
  const unread = socPairs.value.reduce((n, p) => n + (p.unread || 0), 0);
  return { reqs, questions, unread, proposals, total: reqs + questions.length + unread + proposals };
});

async function api(path, body, method) {
  const headers = { 'Content-Type': 'application/json' };
  if (Soc.acct) headers.Authorization = 'Bearer ' + Soc.acct.token;
  const res = await fetch(PUSH_URL + '/s' + path, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong'); e.status = res.status; throw e; }
  return data;
}
const netErr = e => (e && e.status ? e.message : 'Couldn\'t reach Orbit. Check your connection');

/** Tells the Android shell who is signed in, so its background check can fetch new messages. */
function socNative() {
  try { if (AN && AN.socialAuth) AN.socialAuth(Soc.acct ? PUSH_URL : '', Soc.acct ? Soc.acct.token : '', Soc.acct ? Soc.acct.seen || 0 : 0); } catch (e) {}
}
function socSeen(seq) {
  if (!Soc.acct || !(seq > (Soc.acct.seen || 0))) return;
  Soc.acct.seen = seq; saveSoc();
  try { if (AN && AN.socialSeen) AN.socialSeen(seq); } catch (e) {}
}
async function socStart(acct) {
  Soc.acct = { ...acct, seen: 0 }; saveSoc();
  await refreshMe();
  socNative(); socConnect(); socPushSync();
}
/* the People list and recent chats are kept on the phone, so they show instantly and refresh in the background */
const CHAT_KEY = 'orbit.chatcache';
function loadChatCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CHAT_KEY));
    if (c && Soc.acct && c.handle === Soc.acct.handle) { Soc.me = c.me || null; Soc.chats = c.chats || {}; }
  } catch (e) {}
}
function saveChatCache() {
  try {
    if (!Soc.acct) { localStorage.removeItem(CHAT_KEY); return; }
    const chats = {};
    for (const [k, c] of Object.entries(Soc.chats)) {
      if (!c || !c.messages) continue;
      const messages = c.messages.filter(m => m.s).slice(-60).map(({ _photo, ...m }) => (m.media && m.media.local ? { ...m, media: { ...m.media, local: undefined } } : m));
      chats[k] = { ...c, messages, days: (c.days || []).slice(0, 30) };
    }
    localStorage.setItem(CHAT_KEY, JSON.stringify({ handle: Soc.acct.handle, me: Soc.me, chats }));
  } catch (e) {}
}
let chatSaveT;
watch(() => [Soc.me, Soc.chats], () => { clearTimeout(chatSaveT); chatSaveT = setTimeout(saveChatCache, 800); }, { deep: true });

function socSignOut(msg) {
  try { sock && sock.close(); } catch (e) {}
  Soc.acct = null; Soc.me = null; Soc.chats = {}; Soc.open = null; saveSoc(); socNative();
  try { localStorage.removeItem(CHAT_KEY); caches.delete(PHOTO_CACHE); } catch (e) {}
  if (nav.screen === 'pair') nav.screen = 'people';
  if (msg) say(msg);
}
async function refreshMe() {
  if (!Soc.acct) return;
  try {
    const me = await api('/me');
    Soc.me = me;
    if (me.seq > (Soc.acct.seen || 0)) socSeen(me.seq); // the app is looking at everything now
  } catch (e) { if (e.status === 401) socSignOut('You were signed out of People'); }
}
function mergeSummary(st) {
  if (!Soc.me) return;
  const { messages, days, ...sum } = st;
  const i = Soc.me.pairs.findIndex(p => p.id === st.id);
  if (i >= 0) Soc.me.pairs[i] = sum; else Soc.me.pairs.push(sum);
}
async function loadPair(id) {
  try {
    const st = await api('/p/' + id + '/state');
    const old = Soc.chats[id];
    if (old) st.messages.push(...old.messages.filter(m => !m.s)); // keep messages that are still sending
    Soc.chats[id] = st; mergeSummary(st);
    return st;
  } catch (e) {
    if (e.status === 404) { delete Soc.chats[id]; refreshMe(); if (Soc.open === id && nav.screen === 'pair') { nav.screen = 'people'; say('This connection has ended'); } }
    else say(netErr(e));
    return null;
  }
}
let readTimer;
function markRead(id) {
  const c = Soc.chats[id], p = pairOf(id);
  if (p) p.unread = 0;
  const last = c && [...c.messages].reverse().find(m => m.s && !m.pending);
  if (!last) return;
  clearTimeout(readTimer);
  readTimer = setTimeout(() => api('/p/' + id + '/read', { seq: last.s }).catch(() => {}), 400);
}
async function sendMsg(id, text, reply, photo) {
  const c = Soc.chats[id];
  if (!c || (!text.trim() && !photo)) return;
  const cid = uid(), re = reply && reply.s ? { re: reply.s, rq: { by: reply.by, text: clip(reply.text || '📷 Photo', 140) } } : {};
  const local = photo ? URL.createObjectURL(photo.blob) : null;
  c.messages.push({ by: Soc.acct.handle, text: text.trim(), at: Date.now(), cid, pending: true, ...re,
    ...(photo ? { media: { local, width: photo.width, height: photo.height }, _photo: photo } : {}) });
  try {
    let media;
    if (photo) {
      const res = await fetch(PUSH_URL + '/s/p/' + id + '/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + Soc.acct.token, 'Content-Type': 'image/jpeg' }, body: photo.blob });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(d.error || 'The photo didn\'t upload'); e.status = res.status; throw e; }
      media = { fid: d.fid, width: photo.width, height: photo.height };
      Photos[d.fid] = local; // no need to download what we just sent
      keepPhoto(d.fid, photo.blob);
    }
    const m = await api('/p/' + id + '/send', { text: text.trim(), cid, re: re.re, media });
    const i = c.messages.findIndex(x => x.cid === cid && !x.s);
    if (c.messages.some(x => x.s === m.s)) { if (i >= 0) c.messages.splice(i, 1); } // the live event got here first
    else if (i >= 0) c.messages.splice(i, 1, m); else c.messages.push(m);
    const p = pairOf(id); if (p) p.last = m;
  } catch (e) {
    const x = c.messages.find(x => x.cid === cid && !x.s);
    if (x) { x.pending = false; x.failed = true; }
    say(netErr(e));
  }
}
function retryMsg(id, m) {
  const c = Soc.chats[id], i = c.messages.indexOf(m);
  if (i >= 0) c.messages.splice(i, 1);
  sendMsg(id, m.text, m.re ? { s: m.re, ...m.rq } : null, m._photo);
}

/* photos: resized on the phone before upload; loaded with the login key, since only the two members may see them */
const Photos = reactive({}); // fid -> object URL | 'loading' | 'error'
const PHOTO_CACHE = 'orbit-photos';
const photoKey = fid => 'https://orbit.photos/' + fid; // just a name in the phone's cache, never fetched
async function photoCache() { try { return await caches.open(PHOTO_CACHE); } catch (e) { return null; } }
async function keepPhoto(fid, blob) { const c = await photoCache(); if (c) c.put(photoKey(fid), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })).catch(() => {}); }
async function forgetPhoto(fid) { const c = await photoCache(); if (c) c.delete(photoKey(fid)).catch(() => {}); }
async function loadPhoto(pid, fid) {
  if (Photos[fid]) return;
  Photos[fid] = 'loading';
  try {
    const c = await photoCache(), hit = c && await c.match(photoKey(fid));
    let blob = hit ? await hit.blob() : null;
    if (!blob) {
      const res = await fetch(PUSH_URL + '/s/p/' + pid + '/file/' + fid, { headers: { Authorization: 'Bearer ' + Soc.acct.token } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      blob = await res.blob();
      keepPhoto(fid, blob);
    }
    Photos[fid] = URL.createObjectURL(blob);
  } catch (e) { Photos[fid] = 'error'; }
}
const canPhoto = !AN || !!AN.pickPhoto; // Android needs app 1.12 for the photo picker
let photoWait = null;
window.orbitPhoto = r => { const f = photoWait; photoWait = null; if (f) f(r); };
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file); // applies the photo's EXIF rotation
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return { blob: await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82)), width: w, height: h };
}
/** Lets the person pick a photo: Android's system picker (resized natively), or the browser's file picker. */
function pickPhoto() {
  if (AN && AN.pickPhoto) {
    return new Promise(res => { photoWait = res; AN.pickPhoto(); }).then(r => {
      if (!r) return null;
      if (r.error) { say('Couldn\'t open that photo'); return null; }
      const bin = atob(r.data), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return { blob: new Blob([u8], { type: 'image/jpeg' }), width: r.width, height: r.height };
    });
  }
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files[0]; inp.remove();
      if (!f) return res(null);
      try { res(await shrinkPhoto(f)); } catch (e) { say('Couldn\'t open that photo'); res(null); }
    };
    inp.click();
  });
}
/** Edits your own message; the change shows right away and is undone if the server says no. */
async function editMsg(id, m, text) {
  const before = { text: m.text, edited: m.edited };
  m.text = text.trim(); m.edited = Date.now();
  try { await api('/p/' + id + '/edit', { s: m.s, text: m.text }); }
  catch (e) { Object.assign(m, before); say(netErr(e)); }
}
/** Deletes your own message for both of you. */
async function deleteMsg(id, m) {
  const c = Soc.chats[id], i = c.messages.indexOf(m);
  if (i < 0) return;
  c.messages.splice(i, 1, { s: m.s, by: m.by, at: m.at, deleted: Date.now() });
  try { await api('/p/' + id + '/delete', { s: m.s }); if (m.media && m.media.fid) forgetPhoto(m.media.fid); say('Message deleted'); }
  catch (e) { const j = c.messages.findIndex(x => x.s === m.s); if (j >= 0) c.messages.splice(j, 1, m); say(netErr(e)); }
}
const REACTS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
/** Toggles your reaction on a message (tapping the same emoji again removes it). */
async function reactMsg(id, m, emoji) {
  const me = Soc.acct.handle, before = m.rx ? { ...m.rx } : null;
  const next = { ...(m.rx || {}) };
  if (next[me] === emoji) delete next[me]; else next[me] = emoji;
  m.rx = Object.keys(next).length ? next : null;
  Native.vibrate(10);
  try { await api('/p/' + id + '/react', { s: m.s, emoji: next[me] || '' }); }
  catch (e) { m.rx = before; say(netErr(e)); }
}

/* live updates while the app is open */
let sock = null, sockRetry, sockPing;
function socConnect() {
  if (!Soc.acct || sock || document.hidden) return;
  let s;
  try { s = new WebSocket(PUSH_URL.replace(/^http/, 'ws') + '/s/ws?t=' + encodeURIComponent(Soc.acct.token)); } catch (e) { return; }
  sock = s;
  s.onopen = () => { Soc.online = true; sockPing = setInterval(() => { if (s.readyState === 1) s.send('ping'); }, 25e3); refreshMe(); if (Soc.open && Soc.chats[Soc.open]) loadPair(Soc.open); };
  s.onmessage = e => { try { const d = JSON.parse(e.data); if (d.t === 'ev') onSocEvent(d.ev); } catch (err) {} };
  s.onclose = () => {
    clearInterval(sockPing); Soc.online = false;
    if (sock === s) sock = null;
    clearTimeout(sockRetry);
    if (Soc.acct && !document.hidden) sockRetry = setTimeout(socConnect, 5000);
  };
}
function onSocEvent(ev) {
  socSeen(ev.seq);
  const p = ev.pair ? pairOf(ev.pair) : null, c = ev.pair ? Soc.chats[ev.pair] : null;
  const viewing = nav.screen === 'pair' && Soc.open === ev.pair && !document.hidden;
  if (ev.t === 'msg') {
    if (c && !c.messages.some(m => m.s === ev.m.s)) {
      const i = c.messages.findIndex(m => ev.m.cid && m.cid === ev.m.cid && !m.s);
      if (i >= 0) c.messages.splice(i, 1, ev.m); else c.messages.push(ev.m);
    }
    if (ev.m.by !== Soc.acct.handle) { // replying means they've read everything before it
      if (p) p.theirRead = Math.max(p.theirRead || 0, ev.m.s);
      if (c) c.theirRead = Math.max(c.theirRead || 0, ev.m.s);
    }
    if (p) {
      p.last = ev.m;
      if (ev.m.by !== Soc.acct.handle) { if (viewing) markRead(ev.pair); else p.unread = (p.unread || 0) + 1; }
    }
    if (ev.n && !viewing) { say(ev.n.title + ': ' + clip(ev.n.body, 60)); Native.vibrate(20); }
    return;
  }
  if (ev.t === 'read') { if (p) p.theirRead = ev.upto; if (c) c.theirRead = ev.upto; return; }
  if (ev.t === 'edit' || ev.t === 'del') {
    const i = c ? c.messages.findIndex(x => x.s === (ev.m ? ev.m.s : ev.s)) : -1;
    const next = ev.t === 'edit' ? ev.m : { s: ev.s, by: i >= 0 ? c.messages[i].by : '', at: i >= 0 ? c.messages[i].at : 0, deleted: Date.now() };
    if (ev.t === 'del' && i >= 0 && c.messages[i].media && c.messages[i].media.fid) forgetPhoto(c.messages[i].media.fid);
    if (i >= 0) c.messages.splice(i, 1, { ...next, rx: ev.t === 'edit' ? c.messages[i].rx : undefined });
    if (p && p.last && p.last.s === next.s) p.last = next;
    return;
  }
  if (ev.t === 'react') {
    const m = c && c.messages.find(x => x.s === ev.s);
    if (m) m.rx = ev.rx;
    if (ev.n && !viewing) say(ev.n.title + ': ' + clip(ev.n.body.replace(/^To: /, ''), 50));
    return;
  }
  if (ev.t === 'gone') {
    delete Soc.chats[ev.pair];
    if (viewing) { nav.screen = 'people'; say('This connection has ended'); }
    refreshMe(); return;
  }
  if (ev.n && !viewing) say(ev.n.title);
  refreshMe();
  if (c) loadPair(ev.pair);
}
function socResume() {
  if (!Soc.acct) return;
  refreshMe();
  if (Soc.open && Soc.chats[Soc.open]) loadPair(Soc.open);
  socConnect();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(sockRetry); try { sock && sock.close(); } catch (e) {} } // closed app = push, not socket
  else socResume();
});

/** iPhone: the same Web Push subscription that delivers reminders also delivers messages. */
async function socPushSync() {
  if (!Soc.acct || Native.has || !PUSH_SUPPORTED || Notification.permission !== 'granted') return;
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await api('/me', { sub: sub.toJSON(), tz: TZ }); if (Soc.me) Soc.me.push = true; }
  } catch (e) {}
}

/* ================= reminders ================= */
// One plan, two deliverers. The plan is derived purely from app data; Android arms it as exact
// on-device alarms, iPhone (which can't schedule locally) sends it to the Orbit push server.
const PUSH_URL = window.ORBIT_PUSH_URL || 'https://orbit-push.aliyeganegi.workers.dev'; // override is for local testing
const VAPID_PUBLIC = 'BOIZ_UH6C3MvvJidPGSXJPTlkmSH9JCffuuC-vxe2Gob0fjkMklZnHq5zKvWkAS6AaBabmwPgtldeZWn9YQpP4I';
const PUSH_SUPPORTED = !AN && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const BEFORE = [{ v: 0, l: 'At time' }, { v: 5, l: '5 min before' }, { v: 15, l: '15 min before' }, { v: 30, l: '30 min before' }, { v: 60, l: '1 hour before' }];
const beforeLabel = m => (m >= 60 ? (m / 60) + ' hour' + (m > 60 ? 's' : '') : m + ' min');

function taskAt(t) {
  const d = parseKey(t.due); const [h, m] = t.time.split(':');
  d.setHours(+h, +m, 0, 0);
  return d.getTime() - (t.before || 0) * 60e3;
}
const plan = computed(() => {
  const out = [], now = Date.now() - 60e3, n = S.settings.notify;
  if (n.tasks) for (const t of S.tasks) {
    if (t.done || !t.remind || !t.due || !t.time) continue;
    const at = taskAt(t);
    if (at < now) continue;
    const when = t.before ? 'Starts in ' + beforeLabel(t.before) + ' (' + t.time + ')' : 'Due now';
    out.push({ id: 'task:' + t.id, at, ch: 'tasks', title: '⏰ ' + t.title, body: t.notes ? when + ' · ' + t.notes : when, go: 'tasks', task: t.id });
  }
  const tm = S.timer;
  if (n.focus && tm.running && tm.endAt > now) {
    const work = tm.mode === 'work';
    out.push({ id: 'focus:' + tm.endAt, at: tm.endAt, ch: 'focus', title: work ? 'Focus session complete 🎉' : 'Break is over ☕', body: work ? 'Great work! Time for a break.' : 'Ready to focus again?', go: 'focus' });
  }
  const c = cyc.value;
  if (c.has && S.settings.cycle.notify) {
    const at = (k, h) => { const d = parseKey(k); d.setHours(h, 0, 0, 0); return d.getTime(); };
    const nm = S.settings.cycle.name.trim(), who = nm ? nm + '\'s' : 'Your';
    out.push({ id: 'cycle:2:' + c.next, at: at(addDays(c.next, -2), 10), ch: 'cycle', title: '💗 Heads up', body: who + ' period is expected in 2 days', go: 'cycle' });
    out.push({ id: 'cycle:0:' + c.next, at: at(c.next, 9), ch: 'cycle', title: '🌸 Period expected today', body: nm ? who + ' period may start today. Be extra kind 💗' : 'Your period may start today. Take it easy 💗', go: 'cycle' });
  }
  const cs = S.settings.cycle;
  if (c.has && cs.fertileNotify) {
    const at = (k, h) => { const d = parseKey(k); d.setHours(h, 0, 0, 0); return d.getTime(); };
    const goal = cs.goal;
    out.push({ id: 'fert:' + c.fStart, at: at(c.fStart, 9), ch: 'cycle', title: goal === 'avoid' ? '🛡️ Fertile window starts today' : '🌱 Fertile window starts today',
      body: goal === 'avoid' ? 'Pregnancy is more likely for the next 6 days. Use protection.' : goal === 'conceive' ? 'Your best chances are over the next 6 days.' : 'The fertile window runs for about 6 days.', go: 'cycle' });
    out.push({ id: 'ovu:' + c.ov, at: at(c.ov, 9), ch: 'cycle', title: '✨ Ovulation day (estimated)', body: goal === 'conceive' ? 'Today and yesterday are the most fertile days.' : 'Today is the estimated ovulation day.', go: 'cycle' });
  }
  if (c.has && cs.tip.on && /^\d\d:\d\d$/.test(cs.tip.time)) {
    const [h, m] = cs.tip.time.split(':').map(Number), nm = cs.name.trim();
    for (let i = 0; i < 14; i++) {
      const k = addDays(R.today, i), tip = cycleTip(k);
      if (!tip) continue;
      const d = parseKey(k); d.setHours(h, m, 0, 0);
      out.push({ id: 'ctip:' + k, at: d.getTime(), ch: 'cycle', title: (nm ? '💗 ' + nm + ' · day ' : '🌸 Day ') + tip.day + ' · ' + PHASES[tip.phase].l, body: tip.text, go: 'cycle' });
    }
  }
  if (cs.pill.on && /^\d\d:\d\d$/.test(cs.pill.time)) {
    const [h, m] = cs.pill.time.split(':').map(Number);
    for (let i = 0; i < 30; i++) {
      const k = addDays(R.today, i);
      if (i === 0 && (S.cycleLog[k] || {}).pill) continue;
      const d = parseKey(k); d.setHours(h, m, 0, 0);
      out.push({ id: 'pill:' + k, at: d.getTime(), ch: 'cycle', title: '💊 Pill reminder', body: 'Time to take your pill', go: 'cycle' });
    }
  }
  // Android arms the daily question as an exact local alarm (iPhone gets it as push from the server)
  if (Native.has) for (const p of socPairs.value) {
    if (!p.type) continue;
    for (const at of OrbitSchedule.ruleTimes({ kind: 'daily', times: [p.time], days: ALL_DAYS }, Date.now(), p.tz, 7)) {
      const day = OrbitSchedule.dayKey(OrbitSchedule.localParts(at, p.tz));
      if (p.today && p.today.day === day) continue; // that day's question was already asked
      out.push({ id: 'dq:' + p.id + ':' + day, at, ch: 'social', title: '💬 Today\'s question with ' + whoName(p.with), body: 'Answer it, then see what ' + whoName(p.with) + ' said', go: 'pair:' + p.id });
    }
  }
  return out.filter(r => r.at >= now).sort((a, b) => a.at - b.at);
});
/* ---------- personal reminders (water is one of them) ---------- */
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_DOTS = [{ l: 'Sa', v: 6 }, { l: 'Su', v: 0 }, { l: 'Mo', v: 1 }, { l: 'Tu', v: 2 }, { l: 'We', v: 3 }, { l: 'Th', v: 4 }, { l: 'Fr', v: 5 }];
const DAY_PRESETS = [{ l: 'Every day', v: ALL_DAYS }, { l: 'Sat–Wed', v: [6, 0, 1, 2, 3] }, { l: 'Thu & Fri', v: [4, 5] }];
const REM_EMOJI = ['💧', '💊', '🧍', '👀', '😴', '🧘', '📞', '🏠', '💳', '🏋️', '🌱', '🍎', '📚', '🙏', '🐶', '🚗', '🎂', '🧹', '💼', '⏰', '☕', '🦷', '🌙', '❤️'];
const REM_TEMPLATES = [
  { title: 'Drink water', emoji: '💧', color: '#3ba4ff', water: true, kind: 'interval', every: 60, start: '09:00', end: '22:00', stopAtGoal: true, note: '' },
  { title: 'Take medicine', emoji: '💊', color: '#22c55e', kind: 'daily', times: ['09:00', '21:00'], note: 'With a glass of water' },
  { title: 'Stand up & stretch', emoji: '🧍', color: '#f97316', kind: 'interval', every: 60, start: '10:00', end: '18:00', days: [6, 0, 1, 2, 3], note: 'Two minutes away from the screen' },
  { title: 'Eye break', emoji: '👀', color: '#14b8a6', kind: 'interval', every: 30, start: '10:00', end: '18:00', days: [6, 0, 1, 2, 3], note: 'Look 6 metres away for 20 seconds' },
  { title: 'Bedtime', emoji: '😴', color: '#7c6cff', kind: 'daily', times: ['23:30'], note: 'Screens off, wind down' },
  { title: 'Meditate', emoji: '🧘', color: '#a78bfa', kind: 'daily', times: ['07:30'], note: 'Five calm minutes' },
  { title: 'Call mom', emoji: '📞', color: '#ff5c9a', kind: 'daily', times: ['18:00'], days: [5], note: '' },
  { title: 'Pay rent', emoji: '🏠', color: '#f5a524', kind: 'monthly', dom: 1, cal: 'jal', time: '10:00', note: '' },
  { title: 'Pay bills', emoji: '💳', color: '#ef4444', kind: 'monthly', dom: 25, cal: 'jal', time: '10:00', note: 'Electricity, internet, phone' },
  { title: 'Workout', emoji: '🏋️', color: '#ff6b5b', kind: 'daily', times: ['18:00'], days: [6, 1, 3], note: '' },
  { title: 'Water the plants', emoji: '🌱', color: '#22c55e', kind: 'daily', times: ['09:00'], days: [6, 2], note: '' },
  { title: 'Custom reminder', emoji: '⏰', color: '#64748b', kind: 'once', note: '', custom: true },
];
function newReminder(tpl) {
  const t = JSON.parse(JSON.stringify(tpl || REM_TEMPLATES[REM_TEMPLATES.length - 1]));
  delete t.custom;
  const soon = new Date(Date.now() + 3600e3);
  return {
    id: tpl && tpl.water ? 'water' : uid(), on: true, water: false, title: '', emoji: '⏰', color: '#64748b', note: '',
    kind: 'once', date: keyOf(soon), time: pad(soon.getHours()) + ':00', times: ['09:00'], every: 60, start: '09:00', end: '22:00',
    days: [...ALL_DAYS], dom: 1, cal: 'jal', until: '', stopAtGoal: true, created: Date.now(), ...t, title: tpl && !tpl.custom ? t.title : '',
  };
}
function daysLabel(days) {
  const d = [...(days || ALL_DAYS)].sort();
  if (d.length === 7) return 'Every day';
  const same = a => a.length === d.length && [...a].sort().every((x, i) => x === d[i]);
  if (same([6, 0, 1, 2, 3])) return 'Sat–Wed';
  if (same([4, 5])) return 'Thu & Fri';
  return DAY_DOTS.filter(x => d.includes(x.v)).map(x => WD[x.v]).join(', ');
}
function remSummary(r) {
  if (r.kind === 'once') return r.date ? 'Once · ' + rel(r.date) + ' at ' + r.time : 'Once';
  if (r.kind === 'daily') return daysLabel(r.days) + ' at ' + (r.times || []).slice().sort().join(', ');
  if (r.kind === 'interval') return 'Every ' + everyLabel(r.every) + ' · ' + r.start + '–' + r.end + (daysLabel(r.days) === 'Every day' ? '' : ' · ' + daysLabel(r.days));
  if (r.kind === 'monthly') return 'Monthly on day ' + r.dom + (r.cal === 'jal' ? ' (Shamsi)' : '') + ' at ' + r.time;
  return '';
}
/** The rule a deliverer needs: schedule fields + display text (+ live water progress). */
function remRule(r) {
  const base = { id: r.id, on: r.on !== false, kind: r.kind, until: r.until || '', water: !!r.water, title: (r.emoji ? r.emoji + ' ' : '') + (r.title || 'Reminder'), body: r.note || remSummary(r) };
  if (r.kind === 'once') Object.assign(base, { date: r.date, time: r.time });
  if (r.kind === 'daily') Object.assign(base, { times: r.times, days: r.days });
  if (r.kind === 'interval') Object.assign(base, { every: r.every, start: r.start, end: r.end, days: r.days, stopAtGoal: !!r.stopAtGoal });
  if (r.kind === 'monthly') Object.assign(base, { dom: r.dom, cal: r.cal, time: r.time });
  if (r.water) {
    const goal = S.settings.waterGoal, count = waterToday.value;
    Object.assign(base, { title: '💧 Time for some water', goal, count, day: R.today, glassMl: S.settings.glassMl, goalDay: count >= goal ? R.today : null });
  }
  return base;
}
const remRules = computed(() => S.reminders.filter(r => r.on !== false).map(remRule));
const remNext = r => OrbitSchedule.ruleTimes(remRule(r), Date.now(), TZ, 3);
const waterRem = computed(() => S.reminders.find(r => r.water));
const waterNext = computed(() => { R.now; return waterRem.value && waterRem.value.on !== false ? remNext(waterRem.value) : []; });

/* small IndexedDB key-value store, shared with the service worker */
const idb = {
  open() {
    return this.p || (this.p = new Promise((res, rej) => {
      const r = indexedDB.open('orbit', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
};
const b64u = {
  enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)), c => c.charCodeAt(0)),
};
// reminder texts are sealed with a key that never leaves this phone; the service worker opens them
async function sealKey() {
  let k = await idb.get('key');
  if (!k) { k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await idb.set('key', k); }
  return k;
}
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64u.enc(out);
}

const PUSH_KEY = 'orbit.push';
const Rem = reactive({
  push: (() => { try { return JSON.parse(localStorage.getItem(PUSH_KEY)) || {}; } catch (e) { return {}; } })(),
  state: 'idle', last: 0, perm: PUSH_SUPPORTED ? Notification.permission : 'default', androidOn: true, busy: false,
});
const savePush = () => { try { localStorage.setItem(PUSH_KEY, JSON.stringify(Rem.push)); } catch (e) {} };
// can this phone deliver reminders right now?
const remReady = computed(() => (Native.has ? Rem.androidOn : !!Rem.push.token && Rem.perm === 'granted'));
const remPossible = Native.has || PUSH_SUPPORTED || IOS;

function refreshAndroidStatus() {
  if (!AN || !AN.notifStatus) return;
  try { Rem.androidOn = !!JSON.parse(AN.notifStatus()).enabled; } catch (e) {}
}
function payload() {
  return { v: 2, tz: TZ, reminders: plan.value, rules: remRules.value, water: null };
}
let syncTimer, retryIn = 30e3;
function scheduleSync(ms = 600) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms); }
async function syncNow() {
  const p = payload();
  if (AN) {
    try { AN.sync(JSON.stringify(p)); Rem.state = 'ok'; Rem.last = Date.now(); } catch (e) { Rem.state = 'error'; }
    return;
  }
  if (!Rem.push.token) return;
  try {
    Rem.state = 'syncing';
    await idb.set('water', { day: R.today, count: waterToday.value, goal: S.settings.waterGoal });
    const key = await sealKey();
    const reminders = await Promise.all(p.reminders.map(async r => ({ id: r.id, at: r.at, ch: r.ch, c: await seal(key, { title: r.title, body: r.body, go: r.go }) })));
    // schedules go in the clear, texts are sealed like one-shot reminders
    const rules = await Promise.all(p.rules.map(async r => {
      const { title, body, goal, count, day, glassMl, ...sched } = r;
      return { ...sched, c: await seal(key, { title, body, go: r.water ? 'water' : 'reminders' }) };
    }));
    const water = null;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const res = await fetch(PUSH_URL + '/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Rem.push.token },
      body: JSON.stringify({ tz: TZ, reminders, rules, water, subscription: sub ? sub.toJSON() : undefined }),
    });
    if (res.status === 401) { Rem.push = {}; savePush(); Rem.state = 'idle'; return; } // server forgot us (e.g. subscription expired)
    if (!res.ok) throw new Error('HTTP ' + res.status);
    Rem.state = 'ok'; Rem.last = Date.now(); retryIn = 30e3;
  } catch (e) {
    Rem.state = 'error';
    scheduleSync(retryIn); retryIn = Math.min(retryIn * 3, 30 * 60e3);
  }
}
watch(() => JSON.stringify(payload()), () => scheduleSync(), { immediate: true });
setInterval(() => { if (Rem.push.token) scheduleSync(0); }, 6 * 3600e3); // keep the server's copy fresh

async function enablePush() {
  if (!PUSH_SUPPORTED) return;
  Rem.busy = true;
  try {
    const perm = await Notification.requestPermission(); // must be the first await: iOS needs the tap gesture
    Rem.perm = perm;
    if (perm !== 'granted') { say('Notifications were not allowed'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u.dec(VAPID_PUBLIC) }));
    const res = await fetch(PUSH_URL + '/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    Rem.push = { token: d.id + '.' + d.token, since: Date.now() }; savePush();
    await syncNow();
    socPushSync();
    say('Notifications are on ✅');
  } catch (e) {
    say('Couldn\'t reach the reminder server. Check your connection and try again');
  } finally { Rem.busy = false; }
}
async function disablePush() {
  Rem.busy = true;
  try {
    await fetch(PUSH_URL + '/device', { method: 'DELETE', headers: { Authorization: 'Bearer ' + Rem.push.token } }).catch(() => {});
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (e) {}
  Rem.push = {}; savePush(); Rem.state = 'idle'; Rem.busy = false;
  if (Soc.acct) api('/me', { sub: null }).catch(() => {});
  say('Notifications turned off');
}
async function testNotify() {
  if (Native.has) { say('Sending a test in 5 seconds…'); AN.sync(JSON.stringify({ ...payload(), reminders: [...plan.value, { id: 'test:' + Date.now(), at: Date.now() + 5000, ch: 'tasks', title: '🔔 Orbit test', body: 'Notifications work!', go: 'alerts' }] })); return; }
  Rem.busy = true;
  try {
    const r = await fetch(PUSH_URL + '/test', { method: 'POST', headers: { Authorization: 'Bearer ' + Rem.push.token } });
    say(r.ok ? 'Test sent. It should arrive in a few seconds' : 'The server couldn\'t reach your phone. Try turning notifications off and on');
  } catch (e) { say('Couldn\'t reach the reminder server'); } finally { Rem.busy = false; }
}
function askAndroidNotify() {
  Native.askNotify();
  setTimeout(() => { refreshAndroidStatus(); if (!Rem.androidOn && AN.openNotifSettings) AN.openNotifSettings(); }, 1500);
}

/* actions taken from Android notifications (+1 glass, Done) while the app was closed */
function drainNative() {
  if (!AN || !AN.drain) return;
  let q = [];
  try { q = JSON.parse(AN.drain()); } catch (e) {}
  for (const a of q) {
    if (a.t === 'water') S.water[a.day] = clamp((S.water[a.day] || 0) + (a.n || 1), 0, 40);
    if (a.t === 'done') {
      const t = S.tasks.find(x => x.id === a.id);
      if (t && !t.done) { t.done = true; t.doneAt = a.at; t.doneDay = keyOf(new Date(a.at)); }
    }
  }
}
/* Android updates: new screens arrive by themselves (signed, see WebUpdate.java); a new APK is offered here */
const Upd = reactive({ info: null, state: '', dismissed: (() => { try { return +localStorage.getItem('orbit.updDismissed') || 0; } catch (e) { return 0; } })() });
function refreshUpdate() {
  if (!AN || !AN.updateInfo) return;
  try { Upd.info = JSON.parse(AN.updateInfo()); if (Upd.info.state && !Upd.state) Upd.state = Upd.info.state; } catch (e) {}
}
function installUpdate() { if (AN && AN.installUpdate) { Upd.state = 'downloading'; AN.installUpdate(); } }
function dismissUpdate() { Upd.dismissed = Upd.info.update.code; try { localStorage.setItem('orbit.updDismissed', Upd.dismissed); } catch (e) {} }
window.orbitUpdate = st => {
  if (st !== 'checked' && st !== 'ready') Upd.state = st;
  if (st === 'failed') say('Couldn\'t download the update. Try again in a bit');
  if (st === 'permission') say('Allow Orbit to install updates, then tap Install again');
  refreshUpdate();
};
const updAvail = computed(() => (Upd.info && Upd.info.update ? Upd.info.update : null));

window.orbitResume = () => {
  drainNative(); refreshAndroidStatus(); socResume(); refreshUpdate();
  if (Upd.state === 'installing' || Upd.state === 'permission') Upd.state = '';
  const added = smsSync();
  if (added.length === 1) say('New transaction: ' + fmt(added[0].amount) + ' T. Add a category');
  else if (added.length > 1) say(added.length + ' new bank transactions to review');
};
window.orbitGo = where => {
  if (where && where.startsWith('pair:')) { Soc.open = where.slice(5); nav.screen = 'pair'; return; }
  const tabs = ['today', 'tasks', 'habits', 'money', 'more'];
  if (tabs.includes(where)) { nav.tab = where; nav.screen = null; } else if (where) nav.screen = where;
};
drainNative(); refreshAndroidStatus(); smsRefresh(); refreshUpdate();
if (Soc.acct) { loadChatCache(); socNative(); refreshMe().then(socPushSync); socConnect(); }

/* ================= base components ================= */
const Ic = {
  props: { n: String, s: { default: 20 }, w: { default: 2 } },
  computed: { p() { return ICONS[this.n] || ''; } },
  template: '<svg class="ic" :width="s" :height="s" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="w" stroke-linecap="round" stroke-linejoin="round" v-html="p"></svg>',
};

const Ring = {
  props: { v: Number, size: { default: 64 }, sw: { default: 7 }, c: String },
  computed: {
    r() { return (this.size - this.sw) / 2; },
    C() { return 2 * Math.PI * this.r; },
    off() { return this.C * (1 - clamp(this.v || 0, 0, 1)); },
  },
  template: `<div class="ring" :style="{width:size+'px',height:size+'px'}">
    <svg :width="size" :height="size" :viewBox="'0 0 '+size+' '+size">
      <circle :cx="size/2" :cy="size/2" :r="r" fill="none" :stroke-width="sw" class="ring-track"/>
      <circle :cx="size/2" :cy="size/2" :r="r" fill="none" :stroke="c" :stroke-width="sw" stroke-linecap="round"
        :stroke-dasharray="C" :stroke-dashoffset="off" :stroke-opacity="v>0.001?1:0" class="ring-bar" :transform="'rotate(-90 '+size/2+' '+size/2+')'"/>
    </svg>
    <div class="ring-in"><slot/></div>
  </div>`,
};

const Check = {
  props: { on: Boolean, c: String },
  emits: ['toggle'],
  template: '<button class="chk" :class="{on}" :style="{\'--c\': c}" @click.stop="$emit(\'toggle\')" @pointerdown.stop><Ic n="check" :s="14" :w="3.2"/></button>',
};

const Sheet = {
  props: { open: Boolean, title: String, full: Boolean },
  emits: ['close'],
  setup(props, { emit }) {
    const close = () => emit('close');
    watch(() => props.open, o => (o ? pushBack(close) : popBack(close)), { immediate: true });
    onBeforeUnmount(() => popBack(close));
    const dy = ref(0); let sy = null;
    const down = e => { sy = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); };
    const move = e => { if (sy !== null) dy.value = Math.max(0, e.clientY - sy); };
    const up = () => { if (dy.value > 100) close(); sy = null; dy.value = 0; };
    return { close, dy, down, move, up };
  },
  template: `<Teleport to="body"><Transition name="sheet" :duration="340">
    <div v-if="open" class="sheet-wrap" @click.self="close">
      <div class="sheet" :class="{full}" :style="dy ? {transform:'translateY('+dy+'px)', transition:'none'} : null">
        <div class="grab" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"><span></span></div>
        <div class="sheet-head" v-if="title || $slots.head"><h3>{{ title }}</h3><slot name="head"/></div>
        <div class="sheet-body"><slot/></div>
      </div>
    </div></Transition></Teleport>`,
};

const Swipe = {
  emits: ['remove', 'tap'],
  setup(_, { emit }) {
    const x = ref(0), dragging = ref(false);
    let sx = 0, sy = 0, active = false, lock = null, moved = false;
    const down = e => { sx = e.clientX; sy = e.clientY; active = true; lock = null; moved = false; };
    const move = e => {
      if (!active) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (lock === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (lock === 'x') { moved = true; dragging.value = true; x.value = Math.min(0, dx); }
    };
    const up = () => {
      if (!active) return;
      active = false; dragging.value = false;
      if (x.value < -100) { x.value = -600; Native.vibrate(15); setTimeout(() => emit('remove'), 200); }
      else x.value = 0;
    };
    const click = () => { if (!moved) emit('tap'); };
    return { x, dragging, down, move, up, click };
  },
  template: `<div class="swipe"><div class="swipe-bg" :style="{opacity: x < -4 ? 1 : 0}"><Ic n="trash-2"/></div>
    <div class="swipe-fg" :style="{transform:'translateX('+x+'px)', transition: dragging ? 'none' : ''}"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @click="click"><slot/></div></div>`,
};

const Head = {
  props: { title: String, sub: String },
  template: `<header class="top sm">
    <button class="icon-btn" @click="nav.screen = null" aria-label="Back"><Ic n="chevron-left" :s="22"/></button>
    <div class="grow"><h1>{{ title }}</h1><div class="sub" v-if="sub" style="margin-top:2px">{{ sub }}</div></div>
    <slot/>
  </header>`,
};

const Stepper = {
  props: { modelValue: Number, min: Number, max: Number, step: { default: 1 }, unit: String },
  emits: ['update:modelValue'],
  methods: { set(d) { this.$emit('update:modelValue', clamp(this.modelValue + d * this.step, this.min, this.max)); Native.vibrate(6); } },
  template: `<div class="stepper"><button @click="set(-1)" :disabled="modelValue<=min"><Ic n="minus" :s="18"/></button>
    <b>{{ modelValue }}<small v-if="unit"> {{ unit }}</small></b>
    <button @click="set(1)" :disabled="modelValue>=max"><Ic n="plus" :s="18"/></button></div>`,
};

const Toggle = {
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  template: '<button class="toggle" :class="{on: modelValue}" @click="$emit(\'update:modelValue\', !modelValue); Native.vibrate(8)"></button>',
};

/* Date chooser: quick chips + native picker */
const DatePick = {
  props: { modelValue: String, none: { default: true }, past: Boolean },
  emits: ['update:modelValue'],
  computed: {
    opts() {
      const t = R.today;
      const o = this.past
        ? [{ l: 'Today', k: t }, { l: 'Yesterday', k: addDays(t, -1) }]
        : [{ l: 'Today', k: t }, { l: 'Tomorrow', k: addDays(t, 1) }, { l: 'Next week', k: addDays(t, 7) }];
      return this.none ? [{ l: 'No date', k: null }, ...o] : o;
    },
    custom() { return this.modelValue && !this.opts.some(o => o.k === this.modelValue); },
  },
  methods: { set(k) { this.$emit('update:modelValue', k || null); Native.vibrate(6); } },
  template: `<div>
    <div class="chips">
      <button v-for="o in opts" :key="o.l" class="chip" :class="{on: modelValue === o.k}" @click="set(o.k)">{{ o.l }}</button>
      <label class="chip" :class="{on: custom}"><Ic n="calendar" :s="15"/>{{ custom ? gLabel(modelValue) : 'Pick date' }}
        <input type="date" :value="modelValue || R.today" @change="set($event.target.value)"></label>
    </div>
    <div v-if="modelValue" class="muted" style="font-size:13px;margin:8px 4px 0;font-weight:550">{{ gFull(modelValue) }} · {{ jFull(modelValue) }}</div>
  </div>`,
};

const Empty = {
  props: { e: String, t: String, s: String },
  template: '<div class="empty"><span class="em">{{ e }}</span><b>{{ t }}</b><span>{{ s }}</span><div v-if="$slots.default" style="margin-top:16px"><slot/></div></div>',
};

/* ================= global sheets ================= */
const TaskSheet = {
  setup() {
    const d = reactive({});
    const titleEl = ref(null);
    watch(() => ui.task, v => {
      if (!v) return;
      Object.assign(d, { title: '', notes: '', due: null, time: '', remind: false, before: 0, priority: 0 }, v.ref ? JSON.parse(JSON.stringify(v.ref)) : (v.preset || {}));
      if (!v.ref) nextTick(() => setTimeout(() => titleEl.value && titleEl.value.focus(), 250));
    });
    const isEdit = computed(() => ui.task && ui.task.ref);
    function save() {
      if (!d.title.trim()) return;
      if (!d.due) { d.time = ''; d.remind = false; }
      if (!d.time) d.remind = false;
      let t;
      const fields = { notes: d.notes, due: d.due, time: d.time, remind: d.remind, before: d.remind ? d.before : 0, priority: d.priority };
      if (isEdit.value) { t = ui.task.ref; Object.assign(t, { title: d.title.trim(), ...fields }); }
      else { t = addTask(d.title, d.due); Object.assign(t, fields); }
      if (t.remind && Native.has) Native.askNotify();
      ui.task = null;
    }
    function remove() { const t = ui.task.ref; ui.task = null; delTask(t); }
    function setup() { ui.task = null; nav.screen = 'alerts'; }
    const past = computed(() => d.remind && d.due && d.time && taskAt(d) < Date.now());
    return { d, save, remove, isEdit, titleEl, PRIOS, setup, past };
  },
  template: `<Sheet :open="!!ui.task" :title="isEdit ? 'Edit task' : 'New task'" @close="ui.task = null">
    <div style="--acc:var(--c-tasks)">
      <input ref="titleEl" class="field-title" v-model="d.title" placeholder="What needs doing?" @keydown.enter="save" enterkeyhint="done">
      <textarea class="field" v-model="d.notes" placeholder="Notes (optional)" style="min-height:70px;margin-top:6px"></textarea>
      <span class="flabel">Due</span>
      <DatePick v-model="d.due"/>
      <template v-if="d.due">
        <span class="flabel">{{ remPossible ? 'Time & reminder' : 'Time' }}</span>
        <div class="row">
          <label class="chip" :class="{on: d.time}"><Ic n="clock" :s="15"/>{{ d.time || 'Add time' }}<input type="time" v-model="d.time"></label>
          <button v-if="d.time" class="chip" @click="d.time=''; d.remind=false" aria-label="Clear time"><Ic n="x" :s="14"/></button>
          <div class="grow"></div>
          <template v-if="d.time && remPossible"><Ic n="bell" :s="18" :class="d.remind ? '' : 'muted'" :style="{color: d.remind ? 'var(--c-tasks)' : ''}"/><Toggle v-model="d.remind"/></template>
        </div>
        <template v-if="d.time && d.remind">
          <div class="chips" style="margin-top:12px"><button v-for="b in BEFORE" :key="b.v" class="chip" :class="{on: (d.before || 0) === b.v}" @click="d.before = b.v">{{ b.l }}</button></div>
          <div v-if="!remReady" class="hint warn"><Ic n="bell" :s="16"/><span class="grow">Notifications aren't set up on this phone yet</span><button class="btn sm primary" @click="setup">Set up</button></div>
          <div v-else-if="past" class="hint"><Ic n="clock" :s="16"/><span class="grow">That time has already passed, so no reminder will be sent</span></div>
          <div v-else-if="!S.settings.notify.tasks" class="hint"><Ic n="bell" :s="16"/><span class="grow">Task reminders are turned off in Notifications</span><button class="btn sm" @click="setup">Open</button></div>
        </template>
      </template>
      <span class="flabel">Priority</span>
      <div class="prio">
        <button v-for="p in PRIOS" :key="p.v" :class="{on: d.priority === p.v}" :style="{'--c': p.c}" @click="d.priority = p.v">
          <Ic n="flag" :s="15" :style="{color: p.c}"/>{{ p.l }}</button>
      </div>
      <div class="btn-row">
        <button v-if="isEdit" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove"><Ic n="trash-2"/></button>
        <button class="btn primary" :disabled="!d.title || !d.title.trim()" @click="save">{{ isEdit ? 'Save changes' : 'Add task' }}</button>
      </div>
    </div>
  </Sheet>`,
};

const TxSheet = {
  setup() {
    const d = reactive({});
    watch(() => ui.tx, v => {
      if (!v) return;
      Object.assign(d, { type: 'out', amount: 0, cat: 'food', note: '', date: R.today, time: '', pending: false, bank: '', card: '', balance: null, acct: S.accounts.length ? S.accounts[0].id : '' }, v.ref ? JSON.parse(JSON.stringify(v.ref)) : {});
      need.value = '';
    });
    const isEdit = computed(() => ui.tx && ui.tx.ref);
    const cats = computed(() => (d.type === 'in' ? CATS_IN : CATS_OUT));
    const amt = computed({
      get: () => (d.amount ? fmt(d.amount) : ''),
      set: v => { d.amount = Math.min(parseInt(toEn(v).replace(/\D/g, '') || '0', 10), 1e13); },
    });
    watch(() => d.type, t => { if (d.cat && !cats.value.some(c => c.id === d.cat)) d.cat = d.pending ? '' : cats.value[0].id; });
    function bump(n) { d.amount = (d.amount || 0) + n; Native.vibrate(6); }
    async function paste() {
      const text = await readClipboard();
      const p = text && OrbitSms.parse(text, { unit: S.settings.sms.unit });
      if (!p) { say(text ? 'That doesn\'t look like a bank SMS' : 'Copy a bank SMS first, then tap paste'); return; }
      d.type = p.type; d.amount = p.amount;
      if (p.date && p.date.jy) d.date = jToKey(p.date.jy, p.date.jm, p.date.jd);
      if (p.time) d.time = p.time;
      d.bank = p.bank; d.card = p.card; d.balance = p.balance;
      if (!d.cat || !cats.value.some(c => c.id === d.cat)) d.cat = cats.value[0].id;
      Native.vibrate(12);
      say('Filled from SMS: ' + fmt(p.amount) + ' T' + (p.bank ? ' · ' + p.bank : ''));
    }
    const need = ref('');
    function save() {
      // say what's missing instead of greying out the button
      if (!d.amount) { need.value = 'amount'; Native.vibrate(30); return; }
      if (!d.cat) { need.value = 'cat'; Native.vibrate(30); document.querySelector('.sheet .cat-grid') && document.querySelector('.sheet .cat-grid').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      const rec = { type: d.type, amount: d.amount, cat: d.cat, note: d.note.trim(), date: d.date || R.today, time: d.time || '', pending: false, bank: d.bank || '', card: d.card || '', balance: d.balance, acct: d.acct || '' };
      if (isEdit.value) Object.assign(ui.tx.ref, rec);
      else S.money.unshift({ id: uid(), created: Date.now(), ...rec });
      say(isEdit.value ? 'Saved' : (d.type === 'in' ? 'Income' : 'Expense') + ' added');
      Native.vibrate(12);
      ui.tx = null;
    }
    function remove() {
      const t = ui.tx.ref; ui.tx = null;
      const i = S.money.indexOf(t); S.money.splice(i, 1);
      say('Transaction deleted', () => S.money.splice(i, 0, t));
    }
    watch(() => [d.amount, d.cat], () => { need.value = ''; });
    return { d, amt, cats, save, remove, isEdit, bump, paste, need };
  },
  template: `<Sheet :open="!!ui.tx" :title="d.pending ? 'Add details' : isEdit ? 'Edit transaction' : 'New transaction'" @close="ui.tx = null">
    <div :style="{'--acc': d.type === 'in' ? 'var(--c-habits)' : 'var(--c-money)'}">
      <div v-if="d.pending || d.bank" class="hint" style="margin:0 0 14px"><Ic n="message-square-text" :s="16"/><span class="grow">From {{ d.bank ? d.bank + ' ' : '' }}SMS{{ d.time ? ' at ' + d.time : '' }}{{ d.card ? ' · ' + d.card : '' }}{{ d.balance != null ? ' · balance ' + short(d.balance) : '' }}</span></div>
      <button v-else-if="!isEdit" class="btn block sm" style="margin-bottom:14px" @click="paste"><Ic n="clipboard-paste" :s="16"/>Paste a bank SMS</button>
      <div class="seg"><button :class="{on: d.type==='out'}" @click="d.type='out'"><Ic n="arrow-up-right" :s="16"/>Expense</button>
        <button :class="{on: d.type==='in'}" @click="d.type='in'"><Ic n="arrow-down-left" :s="16"/>Income</button></div>
      <div class="amount-in">
        <input v-model="amt" inputmode="numeric" placeholder="0" enterkeyhint="done" @keydown.enter="$event.target.blur()">
        <div class="u">{{ d.amount ? words(d.amount) : 'Toman' }}</div>
      </div>
      <div class="chips" style="justify-content:center;margin-top:10px">
        <button class="chip" v-for="n in [50000, 100000, 500000, 1000000]" :key="n" @click="bump(n)">+{{ short(n) }}</button>
      </div>
      <div v-if="need === 'amount'" class="hint warn"><span class="grow">Enter an amount to save</span></div>
      <span class="flabel">Category</span>
      <div v-if="need === 'cat'" class="hint warn" style="margin:0 0 10px"><span class="grow">Choose a category to save</span></div>
      <div class="cat-grid" :class="{shake: need === 'cat'}">
        <button v-for="c in cats" :key="c.id" :class="{on: d.cat === c.id}" @click="d.cat = c.id"><span class="e">{{ c.e }}</span>{{ c.l }}</button>
      </div>
      <template v-if="S.accounts.length">
        <span class="flabel">Account</span>
        <div class="chips"><button v-for="a in S.accounts" :key="a.id" class="chip" :class="{on: d.acct === a.id}" @click="d.acct = a.id">{{ a.name }}</button>
          <button class="chip" :class="{on: !d.acct}" @click="d.acct = ''">None</button></div>
      </template>
      <span class="flabel">Note</span>
      <input class="field" v-model="d.note" placeholder="e.g. Lunch with Sara" enterkeyhint="done">
      <span class="flabel">Date</span>
      <DatePick v-model="d.date" :none="false" past/>
      <div class="btn-row">
        <button v-if="isEdit" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove"><Ic n="trash-2"/></button>
        <button class="btn primary" @click="save">{{ d.pending ? 'Save' : isEdit ? 'Save changes' : (d.type === 'in' ? 'Add income' : 'Add expense') }}</button>
      </div>
    </div>
  </Sheet>`,
};

const AccountsSheet = {
  setup() {
    const edit = ref(null);
    const f = reactive({ name: '', bal: 0 });
    const balStr = computed({ get: () => (f.bal ? fmt(f.bal) : ''), set: v => { const neg = /^\s*[-−]/.test(v); const n = parseInt(toEn(v).replace(/\D/g, '') || '0', 10); f.bal = neg ? -n : n; } });
    function open(a) { edit.value = a || 'new'; Object.assign(f, a ? { name: a.name, bal: acctBalance(a) } : { name: '', bal: 0 }); }
    watch(() => ui.accounts, v => { edit.value = null; if (v === 'new') open(null); });
    function save() {
      const name = f.name.trim() || 'Account';
      if (edit.value === 'new') S.accounts.push({ id: uid(), name, bank: '', tail: '', balance: f.bal, at: Date.now(), src: 'user' });
      else Object.assign(edit.value, { name, balance: f.bal, at: Date.now(), src: 'user' });
      edit.value = null; Native.vibrate(10); say('Balance saved');
      if (ui.accounts === 'new') ui.accounts = null;
    }
    function remove() {
      const a = edit.value, i = S.accounts.indexOf(a);
      S.accounts.splice(i, 1); edit.value = null;
      say('Account removed', () => S.accounts.splice(i, 0, a));
    }
    return { edit, f, balStr, open, save, remove, acctBalance };
  },
  template: `<Sheet :open="!!ui.accounts" :title="edit ? (edit === 'new' ? 'New account' : 'Edit account') : 'Accounts'" @close="ui.accounts = null">
    <div style="--acc:var(--c-money)">
      <template v-if="!edit">
        <p class="muted" style="font-size:13.5px;margin:-2px 2px 12px">Set each balance to what your bank shows. Orbit then adds and subtracts your transactions, and bank SMS update it automatically.</p>
        <div class="settings-group" style="box-shadow:none">
          <button v-for="a in S.accounts" :key="a.id" class="list-row" style="width:100%;text-align:left" @click="open(a)">
            <span class="bubble" style="--c:var(--c-money)"><Ic n="wallet" :s="18"/></span>
            <div class="grow"><div class="t">{{ a.name }}</div><div class="s">{{ a.at ? (a.src === 'sms' ? 'Updated from bank SMS ' : 'Set by you ') + ago(a.at).toLowerCase() : 'Tap to set the balance' }}</div></div>
            <b style="white-space:nowrap">{{ fmt(acctBalance(a)) }}</b><Ic n="pencil" :s="15" class="muted"/></button>
          <div v-if="!S.accounts.length" class="list-row"><div class="grow muted" style="font-size:14px">No accounts yet. Add one to track your real balance.</div></div>
        </div>
        <button class="btn block" style="margin-top:14px" @click="open(null)"><Ic n="plus" :s="17"/>Add account</button>
      </template>
      <template v-else>
        <span class="flabel" style="margin-top:4px">Name</span>
        <input class="field" v-model="f.name" placeholder="e.g. Pasargad card, Cash" enterkeyhint="next">
        <span class="flabel">Current balance</span>
        <div class="amount-in" style="padding-top:0"><input v-model="balStr" inputmode="numeric" placeholder="0" enterkeyhint="done" @keydown.enter="save"><div class="u">{{ f.bal ? words(Math.abs(f.bal)) : 'Toman, as your bank shows it right now' }}</div></div>
        <div class="btn-row">
          <button v-if="edit !== 'new'" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove" aria-label="Delete account"><Ic n="trash-2"/></button>
          <button class="btn" style="flex:0 0 auto" @click="edit = null">Back</button>
          <button class="btn primary" @click="save">Save</button>
        </div>
      </template>
    </div>
  </Sheet>`,
};

const BudgetSheet = {
  setup() {
    const v = ref(0);
    watch(() => ui.budget, o => { if (o) v.value = S.settings.budget || 0; });
    const str = computed({ get: () => (v.value ? fmt(v.value) : ''), set: x => { v.value = parseInt(toEn(x).replace(/\D/g, '') || '0', 10); } });
    function save() { S.settings.budget = v.value; ui.budget = false; say(v.value ? 'Budget set to ' + short(v.value) : 'Budget removed'); }
    return { str, v, save };
  },
  template: `<Sheet :open="ui.budget" title="Monthly budget" @close="ui.budget = false">
    <div style="--acc:var(--c-money)">
      <div class="amount-in"><input v-model="str" inputmode="numeric" placeholder="0" enterkeyhint="done" @keydown.enter="save"><div class="u">{{ v ? words(v) + ' a month' : 'How much do you want to spend per month?' }}</div></div>
      <div class="chips" style="justify-content:center;margin-top:10px"><button class="chip" v-for="n in [10e6, 20e6, 30e6, 50e6]" :key="n" @click="v = n">{{ short(n) }}</button></div>
      <div class="btn-row"><button v-if="S.settings.budget" class="btn" @click="v = 0; save()">Remove</button><button class="btn primary" @click="save">Save</button></div>
    </div>
  </Sheet>`,
};

/* ================= onboarding ================= */
const Onboarding = {
  setup() {
    const name = ref('');
    const picks = ref([0, 1, 4]);
    const feats = [
      { n: 'list-checks', l: 'Tasks', c: 'var(--c-tasks)' }, { n: 'flame', l: 'Habits', c: 'var(--c-habits)' },
      { n: 'wallet', l: 'Money', c: 'var(--c-money)' }, { n: 'notebook-pen', l: 'Notes', c: 'var(--c-notes)' },
      { n: 'timer', l: 'Focus', c: 'var(--c-focus)' }, { n: 'droplet', l: 'Water', c: 'var(--c-water)' },
      { n: 'smile', l: 'Mood', c: 'var(--c-mood)' }, { n: 'hourglass', l: 'Countdowns', c: 'var(--c-count)' },
      { n: 'flower-2', l: 'Cycle', c: 'var(--c-cycle)' },
    ];
    const tog = i => { const a = picks.value; const j = a.indexOf(i); j >= 0 ? a.splice(j, 1) : a.push(i); Native.vibrate(6); };
    function finish() {
      S.settings.name = name.value.trim();
      picks.value.sort().forEach(i => S.habits.push({ id: uid(), ...HABIT_SUGGEST[i], log: {}, created: Date.now() }));
      S.settings.onboarded = true;
      Native.vibrate(20);
      Native.askNotify();
    }
    return { name, picks, tog, finish, feats, HABIT_SUGGEST };
  },
  template: `<div class="onb" style="--acc:var(--c-tasks)">
    <div v-if="IOS && !STANDALONE" class="install-tip">
      <b>Install Orbit on your iPhone</b>
      <span>Tap <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M8 11H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2"/></svg> Share, then <b>Add to Home Screen</b>. Your data stays private on this phone.</span>
    </div>
    <div class="logo"><svg width="46" height="46" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="8" fill="#fff"/><ellipse cx="24" cy="24" rx="20" ry="9" stroke="#fff" stroke-opacity=".75" stroke-width="3" transform="rotate(-25 24 24)"/><circle cx="41" cy="16" r="3.2" fill="#fff"/></svg></div>
    <h1>Your whole day,<br>in one orbit.</h1>
    <p>Tasks, habits, money, notes and more. Private, offline, and all in one place.</p>
    <div class="feat"><span v-for="f in feats" :key="f.l" :style="{'--c': f.c}"><Ic :n="f.n" :s="15"/>{{ f.l }}</span></div>
    <span class="flabel" style="margin-top:30px">What should we call you?</span>
    <input class="field" v-model="name" placeholder="Your name" enterkeyhint="done">
    <span class="flabel">Pick a few habits to start</span>
    <div class="chips">
      <button v-for="(h, i) in HABIT_SUGGEST" :key="i" class="chip" :class="{on: picks.includes(i)}" @click="tog(i)">{{ h.emoji }} {{ h.name }}</button>
    </div>
    <div class="grow"></div>
    <button class="btn primary block" style="height:56px;font-size:16px;margin-top:28px" @click="finish">Get started <Ic n="chevron-right" :s="18"/></button>
  </div>`,
};

/* ================= views ================= */
const TodayView = {
  setup() {
    const q = ref('');
    const hour = computed(() => new Date(R.now).getHours());
    const greet = computed(() => { const h = hour.value; return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night'; });
    const greetE = computed(() => { const h = hour.value; return h < 5 || h >= 22 ? '🌙' : h < 12 ? '☀️' : h < 17 ? '👋' : '🌆'; });
    const rel = computed(() => S.tasks.filter(t => t.due && (t.done ? t.doneDay === R.today && t.due <= R.today : t.due <= R.today)));
    const tTotal = computed(() => rel.value.length);
    const tDone = computed(() => rel.value.filter(t => t.done).length);
    const hTotal = computed(() => S.habits.length);
    const hDone = computed(() => S.habits.filter(h => h.log[R.today]).length);
    const pct = computed(() => { const tot = tTotal.value + hTotal.value; return tot ? (tDone.value + hDone.value) / tot : 0; });
    const hero = computed(() => {
      const tot = tTotal.value + hTotal.value, p = pct.value, left = tot - tDone.value - hDone.value;
      if (!tot) return ['A blank canvas', 'Add a task or habit to get rolling'];
      if (p === 0) return ['Let\'s get started', tot + ' thing' + (tot > 1 ? 's' : '') + ' on your plate today'];
      if (p < 0.5) return ['Good start', 'Keep the momentum going'];
      if (p < 1) return ['Almost there', left + ' left. You\'ve got this'];
      return ['All done! 🎉', 'Enjoy the rest of your day'];
    });
    const list = computed(() => {
      const open = rel.value.filter(t => !t.done).sort((a, b) => (b.priority - a.priority) || ((a.time || '99') < (b.time || '99') ? -1 : 1));
      const done = rel.value.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);
      return [...open, ...done].slice(0, 6);
    });
    const openCount = computed(() => rel.value.filter(t => !t.done).length);
    function addQuick() { if (!q.value.trim()) return; addTask(q.value, R.today); q.value = ''; }
    const mood = computed(() => S.mood[R.today]);
    const nextCd = computed(() => cdSorted.value.find(x => x.days >= 0));
    const pinned = computed(() => S.notes.filter(n => n.pinned).slice(0, 2));
    const showCyc = computed(() => cyc.value.has && S.settings.cycle.showToday);
    const both = computed(() => showCyc.value && nextCd.value);
    const updBanner = computed(() => updAvail.value && updAvail.value.code !== Upd.dismissed);
    return { q, greet, greetE, tTotal, tDone, hTotal, hDone, pct, hero, list, openCount, addQuick, mood, nextCd, pinned, both, showCyc, updBanner };
  },
  template: `<div class="view" style="--acc:var(--c-tasks)">
    <header class="top">
      <div class="grow">
        <div class="sub" style="margin:0 0 6px">{{ gFull(R.today) }} · <b>{{ jFull(R.today) }}</b></div>
        <h1>{{ greet }}<template v-if="S.settings.name">,<br>{{ S.settings.name }}</template> {{ greetE }}</h1>
      </div>
      <button class="icon-btn" @click="go('settings')" aria-label="Settings"><Ic n="settings"/></button>
    </header>

    <div class="hero tap" @click="nav.tab = 'tasks'">
      <Ring :v="pct" :size="92" :sw="9" c="#fff"><div class="pct">{{ Math.round(pct * 100) }}%</div></Ring>
      <div style="flex:1;min-width:0">
        <h2>{{ hero[0] }}</h2><div class="hl">{{ hero[1] }}</div>
        <div class="stats"><span><Ic n="circle-check" :s="14"/>{{ tDone }}/{{ tTotal }} tasks</span><span><Ic n="flame" :s="14"/>{{ hDone }}/{{ hTotal }} habits</span></div>
      </div>
    </div>

    <div v-if="updBanner" class="card upd-card">
      <span class="bubble" style="--c:var(--c-tasks)"><Ic n="download" :s="18"/></span>
      <div class="grow"><b>Orbit {{ updAvail.name }} is available</b><div class="muted" style="font-size:13px">A quick install, your data stays</div></div>
      <button class="btn sm primary" :disabled="Upd.state === 'downloading'" @click="installUpdate">{{ Upd.state === 'downloading' ? 'Downloading…' : 'Install' }}</button>
      <button class="icon-btn plain" @click="dismissUpdate" aria-label="Later"><Ic n="x" :s="17"/></button>
    </div>

    <div v-if="socTodo.total" class="card people-card tap" style="margin-top:14px" @click="socTodo.questions.length === 1 && !socTodo.unread && !socTodo.reqs ? go('pair:' + socTodo.questions[0].id) : go('people')">
      <div class="sec" style="margin-bottom:8px"><h3><Ic n="users" :s="16" style="color:var(--c-people)"/>People</h3><span class="link">Open <Ic n="chevron-right" :s="16"/></span></div>
      <div v-for="x in socTodo.questions.slice(0, 2)" :key="x.id" class="pq"><b>💬 {{ whoName(x.with) }}</b><span>{{ x.today.q }}</span></div>
      <div v-if="socTodo.unread" class="muted" style="font-size:14px;margin-top:4px">{{ socTodo.unread }} new message{{ socTodo.unread > 1 ? 's' : '' }}</div>
      <div v-if="socTodo.reqs" class="muted" style="font-size:14px;margin-top:4px">{{ socTodo.reqs }} connection request{{ socTodo.reqs > 1 ? 's' : '' }}</div>
      <div v-if="socTodo.proposals" class="muted" style="font-size:14px;margin-top:4px">Someone set your relationship type. Tap to accept</div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="sec"><h3>Today's tasks <span class="badge" v-if="openCount">{{ openCount }}</span></h3>
        <button class="link" @click="nav.tab = 'tasks'">All tasks <Ic n="chevron-right" :s="16"/></button></div>
      <TransitionGroup name="list" tag="div" class="rel">
        <div v-for="t in list" :key="t.id" class="mini-task" :class="{done: t.done || justDone[t.id]}" @click="ui.task = {ref: t}">
          <Check :on="t.done || !!justDone[t.id]" :c="prioC(t.priority) === 'var(--muted)' ? 'var(--c-tasks)' : prioC(t.priority)" @toggle="toggleTask(t)"/>
          <span class="t">{{ t.title }}</span>
          <span v-if="!t.done && t.due < R.today" class="badge" style="color:var(--c-danger);background:color-mix(in srgb,var(--c-danger) 14%,transparent)">Late</span>
          <span v-else-if="t.time && !t.done" class="muted" style="font-size:12.5px;font-weight:650">{{ t.time }}</span>
        </div>
      </TransitionGroup>
      <div v-if="!list.length" class="muted" style="padding:4px 0 12px;font-size:14px">Nothing due today. Add something below ✨</div>
      <div class="quick"><span class="plus"><Ic n="plus" :s="14" :w="2.6"/></span>
        <input v-model="q" placeholder="Add a task for today" @keydown.enter="addQuick" enterkeyhint="done"></div>
    </div>

    <div class="card">
      <div class="sec"><h3>Habits</h3><button class="link" @click="nav.tab = 'habits'">{{ hDone }}/{{ hTotal }} done <Ic n="chevron-right" :s="16"/></button></div>
      <div class="hchips" v-if="S.habits.length">
        <button v-for="h in S.habits" :key="h.id" class="hchip" :class="{on: h.log[R.today]}" :style="{'--c': h.color}" @click="toggleHabit(h, R.today)">
          <span class="ok"><Ic n="check" :s="11" :w="3.5"/></span><span class="e">{{ h.emoji }}</span><div class="n">{{ h.name }}</div>
        </button>
      </div>
      <button v-else class="btn block" @click="nav.tab = 'habits'"><Ic n="plus" :s="18"/>Add your first habit</button>
    </div>

    <div class="grid2">
      <div class="card tile tap" style="--c:var(--c-water)" @click="go('water')">
        <div class="tt"><span class="bubble" style="width:30px;height:30px;border-radius:10px"><Ic n="droplet" :s="16"/></span>Water</div>
        <div class="big">{{ waterToday }}<small>/ {{ S.settings.waterGoal }}</small></div>
        <div class="cap">{{ fmt(waterToday * S.settings.glassMl) }} ml</div>
        <div class="bar" style="margin-right:48px"><i :style="{width: Math.min(100, waterToday / S.settings.waterGoal * 100) + '%'}"></i></div>
        <button class="add" @click.stop="addWater(1)" aria-label="Add glass"><Ic n="plus" :s="20" :w="2.6"/></button>
      </div>
      <div class="card tile tap" style="--c:var(--c-mood)" @click="go('mood')">
        <div class="tt"><span class="bubble" style="width:30px;height:30px;border-radius:10px"><Ic n="smile" :s="16"/></span>Mood</div>
        <template v-if="mood"><div class="big" style="font-size:36px">{{ MOODS[mood.v - 1].e }}</div><div class="cap">Feeling {{ MOODS[mood.v - 1].l.toLowerCase() }}</div></template>
        <template v-else><div class="cap" style="margin-top:14px">How's today going?</div>
          <div class="moods-mini"><button v-for="m in MOODS" :key="m.v" @click.stop="setMood(m.v)">{{ m.e }}</button></div></template>
      </div>
      <div class="card tile tap" style="--c:var(--c-focus)" @click="go('focus')">
        <div class="tt"><span class="bubble" style="width:30px;height:30px;border-radius:10px"><Ic n="timer" :s="16"/></span>Focus</div>
        <template v-if="S.timer.running || Timer.left() < Timer.total()">
          <div class="big">{{ mmss(Timer.left()) }}</div><div class="cap">{{ MODES[S.timer.mode].l }}{{ S.timer.running ? '' : ' · paused' }}</div></template>
        <template v-else><div class="big">{{ focusToday.min }}<small>min</small></div><div class="cap">{{ focusToday.n }} session{{ focusToday.n === 1 ? '' : 's' }} today</div></template>
        <button class="add" @click.stop="Timer.toggle()" :aria-label="S.timer.running ? 'Pause' : 'Start'"><Ic :n="S.timer.running ? 'pause' : 'play'" :s="18" :w="2.4"/></button>
      </div>
      <div class="card tile tap" style="--c:var(--c-money)" @click="nav.tab = 'money'">
        <div class="tt"><span class="bubble" style="width:30px;height:30px;border-radius:10px"><Ic n="wallet" :s="16"/></span>Money</div>
        <div class="big">{{ short(spentThisMonth) }}<small>T</small></div>
        <div class="cap">Spent in {{ JM[curJ.m - 1] }}</div>
        <div class="bar" v-if="S.settings.budget" style="margin-right:48px"><i :style="{width: Math.min(100, spentThisMonth / S.settings.budget * 100) + '%', background: spentThisMonth > S.settings.budget ? 'var(--c-danger)' : ''}"></i></div>
        <button class="add" @click.stop="ui.tx = {}" aria-label="Add expense"><Ic n="plus" :s="20" :w="2.6"/></button>
      </div>
    </div>

    <div class="grid2" v-if="showCyc || nextCd">
      <div v-if="showCyc" class="card tile tap cycle-card" style="--c:var(--c-cycle)" :style="{gridColumn: both ? '' : '1 / -1'}" @click="go('cycle')">
        <div class="tt"><span class="bubble" style="width:30px;height:30px;border-radius:10px"><Ic n="flower-2" :s="16"/></span>{{ S.settings.cycle.name || 'Cycle' }}</div>
        <div class="big">Day {{ cyc.day }}</div>
        <div class="cap" :style="{color: cyc.pc, fontWeight: 700}">{{ cyc.phase }}</div>
        <div class="cap">{{ cyc.toNext > 0 ? 'Period in ' + cyc.toNext + 'd' : cyc.toNext === 0 ? 'Period due today' : 'Late by ' + -cyc.toNext + 'd' }}</div>
      </div>
      <div v-if="nextCd" class="card tile tap" style="--c:var(--c-count)" :style="{gridColumn: both ? '' : '1 / -1'}" @click="go('countdowns')">
        <div class="tt"><span class="bubble" style="width:30px;height:30px;border-radius:10px"><Ic n="hourglass" :s="16"/></span>Countdown</div>
        <div class="big">{{ nextCd.days === 0 ? 'Today!' : nextCd.days }}<small v-if="nextCd.days">day{{ nextCd.days === 1 ? '' : 's' }}</small></div>
        <div class="cap" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ nextCd.c.emoji }} {{ nextCd.c.title }}</div>
      </div>
    </div>

    <div v-if="pinned.length" class="card">
      <div class="sec"><h3><Ic n="pin" :s="16" style="color:var(--c-notes)"/>Pinned notes</h3><button class="link" @click="go('notes')">Notes <Ic n="chevron-right" :s="16"/></button></div>
      <div v-for="n in pinned" :key="n.id" class="list-row tap" @click="go('notes')">
        <div class="grow"><div class="t">{{ n.title || 'Untitled' }}</div><div class="s" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ n.body }}</div></div>
      </div>
    </div>
  </div>`,
};

const TasksView = {
  setup() {
    const f = ref('today');
    const q = ref('');
    const open = computed(() => S.tasks.filter(t => !t.done));
    const sortT = (a, b) => (b.priority - a.priority) || ((a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0) || a.created - b.created;
    const counts = computed(() => {
      const t = R.today, o = open.value;
      return { today: o.filter(x => x.due && x.due <= t).length, upcoming: o.filter(x => x.due && x.due > t).length, all: o.length, done: S.tasks.length - o.length };
    });
    const groups = computed(() => {
      const t = R.today, o = open.value, g = [], fv = f.value;
      const add = (id, title, items, cls) => { if (items.length) g.push({ id, title, items: items.sort(sortT), cls }); };
      if (fv === 'today' || fv === 'all') {
        add('late', 'Overdue', o.filter(x => x.due && x.due < t), 'red');
        add('today', 'Today · ' + jLabel(t), o.filter(x => x.due === t));
      }
      if (fv === 'upcoming' || fv === 'all') {
        const by = {};
        o.filter(x => x.due && x.due > t).forEach(x => (by[x.due] = by[x.due] || []).push(x));
        Object.keys(by).sort().forEach(k => add(k, rel(k) + ' · ' + jLabel(k), by[k]));
      }
      if (fv === 'all') add('none', 'Someday', o.filter(x => !x.due));
      if (fv === 'today') add('donet', 'Completed today', S.tasks.filter(x => x.done && x.doneDay === t), 'done');
      if (fv === 'done') {
        const by = {};
        S.tasks.filter(x => x.done).forEach(x => (by[x.doneDay || ''] = by[x.doneDay || ''] || []).push(x));
        Object.keys(by).sort().reverse().forEach(k => g.push({ id: 'd' + k, title: k ? rel(k) : 'Earlier', items: by[k].sort((a, b) => b.doneAt - a.doneAt) }));
      }
      return g;
    });
    function addQuick() {
      if (!q.value.trim()) return;
      addTask(q.value, f.value === 'today' ? R.today : f.value === 'upcoming' ? addDays(R.today, 1) : null);
      q.value = '';
    }
    function clearDone() {
      const removed = S.tasks.filter(t => t.done);
      if (!removed.length) return;
      const keep = S.tasks.filter(t => !t.done);
      S.tasks.splice(0, S.tasks.length, ...keep);
      say(removed.length + ' completed task' + (removed.length > 1 ? 's' : '') + ' cleared', () => S.tasks.push(...removed));
    }
    const empty = computed(() => ({
      today: ['🌤️', 'All clear for today', 'Add a task above or enjoy the free time.'],
      upcoming: ['🗓️', 'Nothing upcoming', 'Plan ahead by giving tasks a future date.'],
      all: ['✨', 'No open tasks', 'Your list is empty. Nice!'],
      done: ['🏁', 'Nothing completed yet', 'Finished tasks will show up here.'],
    })[f.value]);
    const quickPh = computed(() => ({ today: 'Add a task for today', upcoming: 'Add a task for tomorrow', all: 'Add a task', done: 'Add a task' })[f.value]);
    return { f, q, counts, groups, addQuick, clearDone, empty, quickPh };
  },
  template: `<div class="view" style="--acc:var(--c-tasks)">
    <header class="top"><div class="grow"><h1>Tasks</h1><div class="sub"><b>{{ counts.today }}</b> due today · <b>{{ counts.all }}</b> open</div></div>
      <button v-if="f === 'done' && counts.done" class="icon-btn" @click="clearDone" aria-label="Clear completed"><Ic n="trash-2" :s="19"/></button></header>
    <div class="quickbar">
      <input v-model="q" :placeholder="quickPh" @keydown.enter="addQuick" enterkeyhint="done">
      <button class="go" :disabled="!q.trim()" @click="addQuick" aria-label="Add"><Ic n="plus" :s="20" :w="2.6"/></button>
    </div>
    <div class="seg" style="margin-top:12px">
      <button v-for="k in ['today','upcoming','all','done']" :key="k" :class="{on: f === k}" @click="f = k">
        {{ k[0].toUpperCase() + k.slice(1) }}<span class="badge" v-if="counts[k] && k !== 'done'">{{ counts[k] }}</span></button>
    </div>
    <Transition name="fade" mode="out-in">
      <div :key="f">
        <template v-if="groups.length">
          <div v-for="g in groups" :key="g.id">
            <div class="group-h" :class="g.cls">{{ g.title }} <span class="badge" style="height:19px;font-size:11px">{{ g.items.length }}</span></div>
            <TransitionGroup name="list" tag="div" class="tlist rel">
              <Swipe v-for="t in g.items" :key="t.id" @remove="delTask(t)" @tap="ui.task = {ref: t}">
                <div class="task" :class="{done: t.done || justDone[t.id]}">
                  <Check :on="t.done || !!justDone[t.id]" :c="prioC(t.priority) === 'var(--muted)' ? 'var(--c-tasks)' : prioC(t.priority)" @toggle="toggleTask(t)"/>
                  <div class="main"><div class="tt">{{ t.title }}</div>
                    <div class="meta" v-if="(t.due && f !== 'today') || t.time || t.notes || (t.due && t.due < R.today && !t.done)">
                      <span v-if="t.due && (f !== 'today' || t.due < R.today)" :class="{late: !t.done && t.due < R.today}"><Ic n="calendar" :s="13"/>{{ rel(t.due) }}</span>
                      <span v-if="t.time"><Ic :n="t.remind ? 'bell' : 'clock'" :s="13"/>{{ t.time }}</span>
                      <span v-if="t.notes"><Ic n="notebook-pen" :s="13"/>Note</span>
                    </div>
                  </div>
                  <Ic v-if="t.priority" n="flag" :s="16" :style="{color: prioC(t.priority)}"/>
                </div>
              </Swipe>
            </TransitionGroup>
          </div>
          <p class="muted" style="text-align:center;font-size:12.5px;margin-top:22px">Swipe left to delete · tap to edit</p>
        </template>
        <Empty v-else :e="empty[0]" :t="empty[1]" :s="empty[2]"/>
      </div>
    </Transition>
    <button class="fab" @click="ui.task = {preset: {due: f === 'today' ? R.today : f === 'upcoming' ? addDays(R.today, 1) : null}}" aria-label="New task"><Ic n="plus" :s="26" :w="2.4"/></button>
  </div>`,
};

const HabitsView = {
  setup() {
    const sheet = ref(false);
    const d = reactive({ name: '', emoji: '💧', color: HABIT_COLORS[0] });
    const editing = ref(null);
    const week = computed(() => Array.from({ length: 7 }, (_, i) => { const k = addDays(R.today, i - 6); return { k, l: WD[parseKey(k).getDay()][0] }; }));
    const done = computed(() => S.habits.filter(h => h.log[R.today]).length);
    function openNew() { editing.value = null; Object.assign(d, { name: '', emoji: HABIT_EMOJI[Math.floor(Math.random() * 8)], color: HABIT_COLORS[S.habits.length % HABIT_COLORS.length] }); sheet.value = true; }
    function openEdit(h) { editing.value = h; Object.assign(d, { name: h.name, emoji: h.emoji, color: h.color }); sheet.value = true; }
    function save() {
      if (!d.name.trim()) return;
      if (editing.value) Object.assign(editing.value, { name: d.name.trim(), emoji: d.emoji, color: d.color });
      else S.habits.push({ id: uid(), name: d.name.trim(), emoji: d.emoji, color: d.color, log: {}, created: Date.now() });
      sheet.value = false;
    }
    function removeHabit(h) {
      const i = S.habits.indexOf(h);
      if (i < 0) return;
      S.habits.splice(i, 1);
      say('"' + h.name + '" deleted', () => S.habits.splice(i, 0, h));
    }
    function remove() { const h = editing.value; sheet.value = false; removeHabit(h); }
    const managing = ref(false);
    function move(h, dir) {
      const i = S.habits.indexOf(h), j = i + dir;
      if (j < 0 || j >= S.habits.length) return;
      S.habits.splice(i, 1); S.habits.splice(j, 0, h); Native.vibrate(6);
    }
    const ideas = computed(() => HABIT_IDEAS.filter(x => !S.habits.some(h => h.name.toLowerCase() === x.name.toLowerCase())).slice(0, 12));
    function useIdea(x) { Object.assign(d, x); Native.vibrate(6); }
    const heat = computed(() => {
      const t = R.today, start = addDays(t, -satIdx(t) - 7 * 17);
      return Array.from({ length: 126 }, (_, i) => { const k = addDays(start, i); return { k, fut: k > t }; });
    });
    const stats = computed(() => {
      const h = editing.value; if (!h) return null;
      let n30 = 0; for (let i = 0; i < 30; i++) if (h.log[addDays(R.today, -i)]) n30++;
      return { cur: streak(h), best: bestStreak(h), rate: Math.round(n30 / 30 * 100), total: Object.keys(h.log).length };
    });
    return { sheet, d, editing, week, done, openNew, openEdit, save, remove, removeHabit, managing, move, ideas, useIdea, heat, stats, HABIT_COLORS, HABIT_EMOJI };
  },
  template: `<div class="view" style="--acc:var(--c-habits)">
    <header class="top"><div class="grow"><h1>Habits</h1>
      <div class="sub" v-if="S.habits.length"><b>{{ done }} of {{ S.habits.length }}</b> done today{{ done === S.habits.length ? ' · perfect day 🔥' : '' }}</div>
      <div class="sub" v-else>Small steps, every day</div></div>
      <button v-if="S.habits.length" class="chip" :class="{on: managing}" style="margin-top:6px" @click="managing = !managing">{{ managing ? 'Done' : 'Edit' }}</button></header>
    <template v-if="S.habits.length">
      <TransitionGroup v-if="managing" name="list" tag="div" class="stack rel">
        <div v-for="(h, i) in S.habits" :key="h.id" class="card habit manage" :style="{'--c': h.color}">
          <div class="h-top">
            <button class="del" @click="removeHabit(h)" :aria-label="'Delete ' + h.name"><Ic n="minus" :s="18" :w="3"/></button>
            <div class="em" style="width:42px;height:42px;font-size:22px">{{ h.emoji }}</div>
            <div class="grow tap" @click="openEdit(h)"><div class="nm">{{ h.name }}</div><div class="st">Tap to rename or change icon</div></div>
            <button class="icon-btn plain" :disabled="i === 0" @click="move(h, -1)" aria-label="Move up"><Ic n="chevron-up" :s="18"/></button>
            <button class="icon-btn plain" :disabled="i === S.habits.length - 1" @click="move(h, 1)" aria-label="Move down"><Ic n="chevron-down" :s="18"/></button>
          </div>
        </div>
      </TransitionGroup>
      <TransitionGroup v-else name="list" tag="div" class="stack rel">
        <Swipe v-for="h in S.habits" :key="h.id" @remove="removeHabit(h)" @tap="openEdit(h)">
        <div class="card habit" :style="{'--c': h.color}">
          <div class="h-top">
            <div class="em">{{ h.emoji }}</div>
            <div class="grow" style="flex:1;min-width:0"><div class="nm">{{ h.name }}</div>
              <div class="st" :class="{hot: streak(h) >= 3}"><template v-if="streak(h)"><Ic n="flame" :s="14"/>{{ streak(h) }} day streak</template><template v-else>Start your streak today</template></div></div>
            <button class="h-check" :class="{on: h.log[R.today]}" @click.stop="toggleHabit(h, R.today)" aria-label="Done today"><Ic n="check" :s="22" :w="2.8"/></button>
          </div>
          <div class="h-week">
            <button v-for="w in week" :key="w.k" class="h-day" :class="{on: h.log[w.k], today: w.k === R.today}" @click.stop="toggleHabit(h, w.k)"><small>{{ w.l }}</small><i></i></button>
          </div>
        </div>
        </Swipe>
      </TransitionGroup>
      <p class="muted" style="text-align:center;font-size:12.5px;margin-top:18px">{{ managing ? 'Delete with − · reorder with the arrows' : 'Tap a habit to edit · swipe left to delete · Edit to reorder' }}</p>
    </template>
    <Empty v-else e="🌱" t="Build your first habit" s="Track daily wins and watch your streaks grow.">
      <button class="btn primary" @click="openNew"><Ic n="plus" :s="18"/>New habit</button></Empty>
    <button class="fab" @click="openNew" aria-label="New habit"><Ic n="plus" :s="26" :w="2.4"/></button>

    <Sheet :open="sheet" :title="editing ? 'Edit habit' : 'New habit'" @close="sheet = false">
      <div style="--acc:var(--c-habits)">
        <template v-if="editing && stats">
          <div class="stat-row">
            <div class="stat"><b>{{ stats.cur }}🔥</b><span>Current streak</span></div>
            <div class="stat"><b>{{ stats.best }}</b><span>Best streak</span></div>
            <div class="stat"><b>{{ stats.rate }}%</b><span>Last 30 days</span></div>
          </div>
          <span class="flabel">Last 18 weeks · {{ stats.total }} check-ins</span>
          <div class="heat" :style="{'--c': d.color}"><i v-for="c in heat" :key="c.k" :class="{on: editing.log[c.k], fut: c.fut}"></i></div>
        </template>
        <template v-if="!editing && ideas.length">
          <span class="flabel" style="margin-top:4px">Ideas</span>
          <div class="chips scroll" style="margin:0 -20px;padding:2px 20px"><button v-for="x in ideas" :key="x.name" class="chip" :class="{on: d.name === x.name}" @click="useIdea(x)">{{ x.emoji }} {{ x.name }}</button></div>
        </template>
        <span class="flabel">Name</span>
        <input class="field" v-model="d.name" placeholder="Or write your own, e.g. Read 10 pages" enterkeyhint="done">
        <span class="flabel">Icon</span>
        <div class="emoji-grid"><button v-for="e in HABIT_EMOJI" :key="e" :class="{on: d.emoji === e}" @click="d.emoji = e">{{ e }}</button></div>
        <span class="flabel">Color</span>
        <div class="swatches"><button v-for="c in HABIT_COLORS" :key="c" :style="{'--c': c}" :class="{on: d.color === c}" @click="d.color = c"></button></div>
        <div class="btn-row">
          <button v-if="editing" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove"><Ic n="trash-2"/></button>
          <button class="btn primary" :disabled="!d.name.trim()" @click="save">{{ editing ? 'Save' : 'Create habit' }}</button>
        </div>
      </div>
    </Sheet>
  </div>`,
};

const MoneyView = {
  setup() {
    const ym = ref({ y: curJ.value.y, m: curJ.value.m });
    const shift = n => { let { y, m } = ym.value; m += n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } ym.value = { y, m }; };
    const isCur = computed(() => ym.value.y === curJ.value.y && ym.value.m === curJ.value.m);
    const txs = computed(() => monthTx(ym.value.y, ym.value.m).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created)));
    const spent = computed(() => txs.value.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0));
    const income = computed(() => txs.value.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0));
    const cats = computed(() => {
      const m = {};
      txs.value.filter(t => t.type === 'out').forEach(t => { m[t.cat] = (m[t.cat] || 0) + t.amount; });
      return Object.entries(m).map(([id, v]) => ({ ...catOf(id), id, v, n: txs.value.filter(t => t.cat === id).length, p: spent.value ? v / spent.value : 0 })).sort((a, b) => b.v - a.v);
    });
    const days = computed(() => {
      const by = {};
      txs.value.forEach(t => (by[t.date] = by[t.date] || []).push(t));
      return Object.keys(by).sort().reverse().map(k => ({ k, items: by[k], out: by[k].filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0) }));
    });
    const budget = computed(() => S.settings.budget);
    function del(t) { const i = S.money.indexOf(t); S.money.splice(i, 1); say('Transaction deleted', () => S.money.splice(i, 0, t)); }
    const showAll = ref(false);
    const review = computed(() => (showAll.value ? pendingTx.value : pendingTx.value.slice(0, 3)));
    const smsOffer = computed(() => Native.has && !S.settings.sms.on && !S.settings.sms.dismissed);
    return { ym, shift, isCur, spent, income, cats, days, budget, del, showAll, review, smsOffer };
  },
  template: `<div class="view" style="--acc:var(--c-money)">
    <header class="top"><div class="grow"><h1>Money</h1><div class="sub">Spending in Toman</div></div>
      <button class="icon-btn" @click="go('reports')" aria-label="Reports"><Ic n="chart-pie" :s="19"/></button></header>

    <div v-if="smsOffer" class="card sms-offer">
      <div class="row" style="align-items:flex-start"><span class="bubble" style="--c:var(--c-money)"><Ic n="message-square-text" :s="19"/></span>
        <div class="grow"><b>Add transactions from bank SMS</b><div class="s">Orbit can read your bank's SMS and create the transaction for you. You just pick a category. Messages are read on this phone only and never uploaded.</div></div></div>
      <div class="btn-row" style="margin-top:14px"><button class="btn sm" @click="S.settings.sms.dismissed = true">Not now</button><button class="btn sm primary" :disabled="Sms.busy" @click="smsEnable">Allow SMS access</button></div>
    </div>

    <div v-if="pendingTx.length" class="card review">
      <div class="sec"><h3><Ic n="inbox" :s="17"/>To review <span class="badge">{{ pendingTx.length }}</span></h3><span class="muted" style="font-size:12.5px;font-weight:600">from bank SMS</span></div>
      <TransitionGroup name="list" tag="div" class="rel">
        <div v-for="t in review" :key="t.id" class="rv">
          <div class="rv-top tap" @click="ui.tx = {ref: t}">
            <div class="grow"><b :class="{in: t.type === 'in'}">{{ t.type === 'in' ? '+' : '−' }}{{ fmt(t.amount) }} <small>T</small></b>
              <div class="s">{{ t.bank || 'Bank' }}{{ t.card ? ' ••' + t.card.replace(/\D/g, '').slice(-4) : '' }} · {{ rel(t.date) }} {{ t.time }}</div></div>
            <button class="icon-btn plain" @click.stop="dismissTx(t)" aria-label="Not a real transaction"><Ic n="x" :s="17"/></button>
          </div>
          <div class="chips scroll" style="margin:8px -16px 0;padding:2px 16px">
            <template v-if="t.type === 'out'"><button v-for="c in topCats" :key="c.id" class="chip" @click="categorize(t, c.id)">{{ c.e }} {{ c.l }}</button></template>
            <template v-else><button v-for="c in CATS_IN" :key="c.id" class="chip" @click="categorize(t, c.id)">{{ c.e }} {{ c.l }}</button></template>
            <button class="chip" @click="ui.tx = {ref: t}">More…</button>
          </div>
        </div>
      </TransitionGroup>
      <button v-if="pendingTx.length > 3" class="link-btn" @click="showAll = !showAll">{{ showAll ? 'Show less' : 'Show all ' + pendingTx.length }}</button>
    </div>

    <div class="month-nav">
      <button @click="shift(-1)" aria-label="Previous month"><Ic n="chevron-left"/></button>
      <div style="text-align:center"><b>{{ JM[ym.m - 1] }} {{ ym.y }}</b><div class="muted" style="font-size:12px;font-weight:600">{{ isCur ? 'This month' : '' }}</div></div>
      <button @click="shift(1)" :style="{visibility: isCur ? 'hidden' : ''}" aria-label="Next month"><Ic n="chevron-right"/></button>
    </div>
    <div class="card money-hero">
      <div class="k">Spent</div>
      <div class="amt">{{ fmt(spent) }}<small>T</small></div>
      <button v-if="budget" class="budget-line" @click="ui.budget = true">
        <div class="bar"><i :style="{width: Math.min(100, spent / budget * 100) + '%', background: spent > budget ? '#ffd1d1' : ''}"></i></div>
        <div class="bl">{{ spent > budget ? short(spent - budget) + ' over budget' : short(budget - spent) + ' left of ' + short(budget) + ' budget' }}<Ic n="pencil" :s="12"/></div>
      </button>
      <button v-else class="budget-line" @click="ui.budget = true"><div class="bl"><Ic n="target" :s="13"/>Set a monthly budget</div></button>
      <div class="split">
        <div><small><Ic n="trending-up" :s="13"/>Income</small><b>{{ short(income) }}</b></div>
        <button class="split-btn" @click="ui.accounts = S.accounts.length ? true : 'new'">
          <small><Ic n="wallet" :s="13"/>{{ S.accounts.length ? 'Balance' : 'Net this month' }}<Ic n="pencil" :s="11" style="margin-left:auto;opacity:.8"/></small>
          <b v-if="S.accounts.length">{{ totalBalance < 0 ? '−' : '' }}{{ short(Math.abs(totalBalance)) }}</b>
          <b v-else>{{ income - spent < 0 ? '−' : '' }}{{ short(Math.abs(income - spent)) }}</b>
          <span v-if="!S.accounts.length" class="set">Set your balance</span>
        </button>
      </div>
    </div>
    <div class="card" v-if="cats.length">
      <div class="sec"><h3>Where it went</h3></div>
      <div class="stack-bar"><i v-for="c in cats" :key="c.id" :style="{flex: c.v, background: c.c}"></i></div>
      <div v-for="c in cats.slice(0, 6)" :key="c.id" class="cat-row">
        <div class="e">{{ c.e }}</div>
        <div class="n">{{ c.l }}<small>{{ c.n }} transaction{{ c.n > 1 ? 's' : '' }}</small></div>
        <div class="v">{{ short(c.v) }}<small>{{ Math.round(c.p * 100) }}%</small></div>
      </div>
    </div>
    <template v-if="days.length">
      <div v-for="g in days" :key="g.k">
        <div class="tx-day"><span>{{ rel(g.k) }} · {{ jLabel(g.k) }}</span><span v-if="g.out">−{{ short(g.out) }}</span></div>
        <TransitionGroup name="list" tag="div" class="tlist rel">
          <Swipe v-for="t in g.items" :key="t.id" @remove="del(t)" @tap="ui.tx = {ref: t}">
            <div class="tx"><div class="e">{{ catOf(t.cat).e }}</div>
              <div class="n">{{ catOf(t.cat).l }}<small v-if="t.note || t.bank">{{ t.note || t.bank + (t.time ? ' · ' + t.time : '') }}</small></div>
              <div class="v" :class="{in: t.type === 'in'}">{{ t.type === 'in' ? '+' : '−' }}{{ fmt(t.amount) }}</div></div>
          </Swipe>
        </TransitionGroup>
      </div>
    </template>
    <p v-if="days.length" class="muted" style="text-align:center;font-size:12.5px;margin-top:18px">Tap a transaction to edit it · swipe left to delete</p>
    <Empty v-else e="💸" t="No transactions yet" :s="'Nothing logged for ' + JM[ym.m - 1] + '. Tap + to add one.'"/>
    <button class="fab" @click="ui.tx = {}" aria-label="New transaction"><Ic n="plus" :s="26" :w="2.4"/></button>
  </div>`,
};

const MoreView = {
  setup() {
    const apps = computed(() => {
      const m = S.mood[R.today], nx = cdSorted.value.find(x => x.days >= 0), c = cyc.value;
      return [
        { id: 'reminders', n: 'bell', l: 'Reminders', c: 'var(--c-mood)', s: (() => { const n = S.reminders.filter(r => r.on !== false).length; return n ? n + ' active' : 'Set your own nudges'; })() },
        { id: 'notes', n: 'notebook-pen', l: 'Notes', c: 'var(--c-notes)', s: S.notes.length + ' note' + (S.notes.length === 1 ? '' : 's') },
        { id: 'focus', n: 'timer', l: 'Focus', c: 'var(--c-focus)', s: S.timer.running ? mmss(Timer.left()) + ' left' : focusToday.value.min + ' min today' },
        { id: 'water', n: 'droplet', l: 'Water', c: 'var(--c-water)', s: waterToday.value + ' / ' + S.settings.waterGoal + ' glasses' },
        { id: 'mood', n: 'smile', l: 'Mood', c: 'var(--c-mood)', s: m ? MOODS[m.v - 1].e + ' ' + MOODS[m.v - 1].l : 'Not logged today' },
        { id: 'countdowns', n: 'hourglass', l: 'Countdowns', c: 'var(--c-count)', s: nx ? (nx.days ? nx.days + ' days to ' + nx.c.title : nx.c.title + ' is today!') : 'Nothing planned' },
        { id: 'cycle', n: 'flower-2', l: 'Cycle', c: 'var(--c-cycle)', s: c.has ? 'Day ' + c.day + ' · ' + c.phase : 'Set up tracking' },
        { id: 'people', n: 'users', l: 'People', c: 'var(--c-people)', dot: socTodo.value.total, s: (() => {
          const t = socTodo.value;
          if (!Soc.acct) return 'Daily questions & chat';
          if (t.questions.length) return 'Today\'s question is waiting';
          if (t.unread) return t.unread + ' new message' + (t.unread > 1 ? 's' : '');
          if (t.reqs) return t.reqs + ' request' + (t.reqs > 1 ? 's' : '');
          return socPairs.value.length + ' connection' + (socPairs.value.length === 1 ? '' : 's');
        })() },
      ];
    });
    return { apps };
  },
  template: `<div class="view">
    <header class="top"><div class="grow"><h1>More</h1><div class="sub">All your tools</div></div></header>
    <div class="apps">
      <button v-for="a in apps" :key="a.id" class="app-tile tap" :style="{'--c': a.c}" @click="go(a.id)">
        <div class="ico"><Ic :n="a.n" :s="22" :w="2.2"/><i v-if="a.dot" class="tab-dot"></i></div><b>{{ a.l }}</b><small>{{ a.s }}</small></button>
    </div>
    <div class="label" style="margin-top:26px">App</div>
    <div class="settings-group">
      <button class="list-row" style="width:100%;text-align:left" @click="go('settings')">
        <span class="bubble" style="--c:var(--muted)"><Ic n="settings" :s="18"/></span>
        <div class="grow"><div class="t">Settings</div><div class="s">Profile, theme, budget, backup</div></div><Ic n="chevron-right" :s="18" class="muted"/></button>
    </div>
  </div>`,
};

const NotesView = {
  setup() {
    const q = ref('');
    const open = ref(false);
    const cur = ref(null);
    const d = reactive({ title: '', body: '', color: '', pinned: false });
    const list = computed(() => {
      const s = q.value.trim().toLowerCase();
      return S.notes.filter(n => !s || (n.title + ' ' + n.body).toLowerCase().includes(s)).sort((a, b) => b.updated - a.updated);
    });
    const pinned = computed(() => list.value.filter(n => n.pinned));
    const others = computed(() => list.value.filter(n => !n.pinned));
    function edit(n) { cur.value = n || null; Object.assign(d, n ? { title: n.title, body: n.body, color: n.color, pinned: n.pinned } : { title: '', body: '', color: '', pinned: false }); open.value = true; }
    function close() {
      const has = d.title.trim() || d.body.trim();
      if (cur.value) {
        if (!has) { const i = S.notes.indexOf(cur.value); S.notes.splice(i, 1); }
        else if (cur.value.title !== d.title || cur.value.body !== d.body || cur.value.color !== d.color || cur.value.pinned !== d.pinned) Object.assign(cur.value, { ...d, updated: Date.now() });
      } else if (has) S.notes.unshift({ id: uid(), ...d, updated: Date.now() });
      open.value = false;
    }
    function remove() {
      const n = cur.value; open.value = false;
      if (!n) return;
      const i = S.notes.indexOf(n); S.notes.splice(i, 1);
      say('Note deleted', () => S.notes.splice(i, 0, n));
    }
    const nc = c => (c ? 'color-mix(in srgb, ' + c + ' 16%, var(--surface))' : '');
    return { q, open, cur, d, pinned, others, edit, close, remove, nc, NOTE_COLORS };
  },
  template: `<div class="view" style="--acc:var(--c-notes)">
    <Head title="Notes" :sub="S.notes.length + ' note' + (S.notes.length === 1 ? '' : 's')"/>
    <div class="search" v-if="S.notes.length"><Ic n="search" :s="18"/><input v-model="q" placeholder="Search notes"><button v-if="q" @click="q=''"><Ic n="x" :s="16"/></button></div>
    <template v-if="pinned.length"><div class="label"><Ic n="pin" :s="12" style="display:inline;vertical-align:-1px"/> Pinned</div>
      <div class="masonry"><button v-for="n in pinned" :key="n.id" class="note tap" :style="{'--nc': nc(n.color)}" @click="edit(n)">
        <h4 v-if="n.title">{{ n.title }}</h4><p v-if="n.body">{{ n.body }}</p><small>{{ ago(n.updated) }}</small></button></div></template>
    <template v-if="others.length"><div class="label" v-if="pinned.length">Others</div>
      <div class="masonry"><button v-for="n in others" :key="n.id" class="note tap" :style="{'--nc': nc(n.color)}" @click="edit(n)">
        <h4 v-if="n.title">{{ n.title }}</h4><p v-if="n.body">{{ n.body }}</p><small>{{ ago(n.updated) }}</small></button></div></template>
    <Empty v-if="!S.notes.length" e="📝" t="Capture a thought" s="Ideas, lists, passwords to remember (well, maybe not passwords)."/>
    <Empty v-else-if="!pinned.length && !others.length" e="🔍" t="No matches" :s="'Nothing found for “' + q + '”'"/>
    <button class="fab" @click="edit(null)" aria-label="New note"><Ic n="pencil" :s="24" :w="2.2"/></button>

    <Sheet :open="open" full @close="close">
      <template #head>
        <button class="chip" @click="close"><Ic n="check" :s="16"/>Done</button>
        <div class="row" style="gap:6px">
          <button class="icon-btn plain" @click="d.pinned = !d.pinned" :style="{color: d.pinned ? 'var(--c-notes)' : ''}" aria-label="Pin"><Ic n="pin" :s="19"/></button>
          <button v-if="cur" class="icon-btn plain" @click="remove" aria-label="Delete"><Ic n="trash-2" :s="19"/></button>
        </div>
      </template>
      <div class="note-edit">
        <div class="swatches" style="margin:4px 0 12px">
          <button v-for="c in NOTE_COLORS" :key="c" :style="{'--c': c || 'var(--surface-3)'}" :class="{on: d.color === c}" @click="d.color = c"></button>
        </div>
        <input class="field-title" v-model="d.title" placeholder="Title">
        <textarea v-model="d.body" placeholder="Start writing…"></textarea>
      </div>
    </Sheet>
  </div>`,
};

const FocusView = {
  setup() {
    const cfg = ref(false), pick = ref(false), custom = ref('');
    const f = S.settings.focus;
    const mode = computed(() => MODES[S.timer.mode]);
    const week = computed(() => Array.from({ length: 7 }, (_, i) => { const k = addDays(R.today, i - 6); const l = S.focusLog[k]; return { k, l: WD[parseKey(k).getDay()][0], v: l ? l.min : 0 }; }));
    const max = computed(() => Math.max(30, ...week.value.map(w => w.v)));
    const weekTotal = computed(() => week.value.reduce((s, w) => s + w.v, 0));
    const round = computed(() => (S.timer.count % f.rounds) + 1);
    const status = computed(() => {
      const t = S.timer;
      if (t.running) return t.mode === 'work' ? 'Stay with it' : 'Breathe, stretch, relax';
      if (Timer.elapsed() > 0) return 'Paused';
      return t.mode === 'work' ? 'Ready when you are' : 'Time for a break';
    });
    const mainLabel = computed(() => (S.timer.running ? 'Pause' : Timer.elapsed() > 0 ? 'Resume' : 'Start'));
    const endsAt = computed(() => (S.timer.running ? hm(S.timer.endAt) : ''));
    const openTasks = computed(() => S.tasks.filter(t => !t.done && (!t.due || t.due <= addDays(R.today, 1))).slice(0, 8));
    const label = computed(() => { const l = S.timer.label; if (!l) return ''; const t = S.tasks.find(x => 'task:' + x.id === l); return t ? t.title : l.startsWith('task:') ? '' : l; });
    function setLabel(v) { S.timer.label = v; pick.value = false; custom.value = ''; Native.vibrate(6); }
    const preset = computed(() => (FOCUS_PRESETS.find(p => p.work === f.work && p.short === f.short && p.long === f.long) || {}).id);
    function applyPreset(p) { Object.assign(f, { work: p.work, short: p.short, long: p.long }); Native.vibrate(8); }
    watch(() => [f.work, f.short, f.long], () => { if (!Timer.started()) { S.timer.total = Timer.len(); S.timer.left = S.timer.total; } });
    function clearToday() {
      const prev = S.focusLog[R.today];
      if (!prev) return;
      delete S.focusLog[R.today];
      cfg.value = false;
      say('Today\'s focus history cleared', () => { S.focusLog[R.today] = prev; });
    }
    const sessions = computed(() => [...(focusToday.value.s || [])].reverse());
    return { cfg, pick, custom, f, mode, week, max, weekTotal, round, status, mainLabel, endsAt, openTasks, label, setLabel, preset, applyPreset, clearToday, sessions, MODES, FOCUS_PRESETS };
  },
  template: `<div class="view" :style="{'--acc': mode.c, '--c': 'var(--c-focus)'}">
    <Head title="Focus" :sub="focusStreak > 1 ? focusStreak + ' day streak 🔥' : 'One thing at a time'"><button class="icon-btn" @click="cfg = true" aria-label="Timer settings"><Ic n="settings" :s="19"/></button></Head>
    <div class="seg"><button v-for="(m, k) in MODES" :key="k" :class="{on: S.timer.mode === k}" @click="Timer.setMode(k)">{{ m.l }}</button></div>

    <button v-if="S.timer.mode === 'work'" class="focus-on tap" @click="pick = true">
      <Ic :n="label ? 'target' : 'plus'" :s="16"/><span>{{ label || 'What are you working on?' }}</span><Ic v-if="label" n="chevron-right" :s="16" class="muted"/>
    </button>

    <div class="focus-wrap">
      <div class="focus-ring" :class="{run: S.timer.running}">
        <Ring :v="Timer.progress()" :size="264" :sw="14" :c="mode.c">
          <div><div class="timer-txt">{{ mmss(Timer.left()) }}</div>
            <div class="timer-sub">{{ status }}</div>
            <div class="timer-meta">
              <template v-if="S.timer.mode === 'work'">Round {{ round }} of {{ f.rounds }}</template>
              <template v-else>{{ mode.l }}</template>
              <template v-if="endsAt"> · ends {{ endsAt }}</template>
            </div>
            <div class="rounds" v-if="S.timer.mode === 'work'"><i v-for="i in f.rounds" :key="i" :class="{on: i === round, done: i < round}"></i></div></div>
        </Ring>
      </div>
      <div class="controls labeled">
        <button class="side" @click="Timer.reset()" :disabled="!Timer.started()" aria-label="Reset"><Ic n="rotate-ccw"/><small>Reset</small></button>
        <button class="main" :class="{run: S.timer.running}" @click="Timer.toggle()"><Ic :n="S.timer.running ? 'pause' : 'play'" :s="30" :w="2.2"/><small>{{ mainLabel }}</small></button>
        <button class="side" @click="Timer.skip()" aria-label="Skip"><Ic n="skip-forward"/><small>{{ S.timer.mode === 'work' ? 'Finish' : 'Skip' }}</small></button>
      </div>
      <Transition name="fade"><button v-if="Timer.started()" class="chip extend" @click="Timer.extend(5)"><Ic n="plus" :s="14"/>5 min</button></Transition>
    </div>

    <div class="card focus-today">
      <Ring :v="Math.min(1, focusToday.n / f.goal)" :size="64" :sw="7" c="var(--c-focus)"><b style="font-size:15px">{{ focusToday.n }}</b></Ring>
      <div class="grow">
        <div class="t">{{ focusToday.n >= f.goal ? 'Daily goal reached 🏆' : (f.goal - focusToday.n) + ' session' + (f.goal - focusToday.n === 1 ? '' : 's') + ' to your goal' }}</div>
        <div class="s">{{ focusToday.min }} min focused today · goal {{ f.goal }} sessions</div>
      </div>
    </div>

    <div class="card">
      <div class="sec"><h3>This week</h3><span class="muted" style="font-size:13px;font-weight:600">{{ Math.floor(weekTotal / 60) }}h {{ weekTotal % 60 }}m</span></div>
      <div class="week-bars">
        <div v-for="w in week" :key="w.k" :class="{today: w.k === R.today}"><span class="v">{{ w.v || '' }}</span><i :style="{height: (w.v / max * 70) + '%'}"></i><small>{{ w.l }}</small></div>
      </div>
    </div>

    <template v-if="sessions.length">
      <div class="label">Today's sessions</div>
      <div class="settings-group">
        <div v-for="(x, i) in sessions" :key="x.at" class="list-row">
          <span class="bubble" :style="{'--c': x.done ? 'var(--c-focus)' : 'var(--muted)'}"><Ic :n="x.done ? 'circle-check' : 'timer'" :s="17"/></span>
          <div class="grow"><div class="t">{{ x.label && x.label.startsWith('task:') ? ((S.tasks.find(t => 'task:' + t.id === x.label) || {}).title || 'Focus session') : (x.label || 'Focus session') }}</div><div class="s">{{ hm(x.at) }} · {{ x.min }} min{{ x.done ? '' : ' · ended early' }}</div></div>
        </div>
      </div>
    </template>

    <Sheet :open="pick" title="What are you working on?" @close="pick = false">
      <div :style="{'--acc': 'var(--c-focus)'}">
        <div v-if="openTasks.length" class="settings-group" style="box-shadow:none">
          <button v-for="t in openTasks" :key="t.id" class="list-row" style="width:100%;text-align:left" @click="setLabel('task:' + t.id)">
            <span class="bubble" style="--c:var(--c-tasks)"><Ic n="circle-check" :s="17"/></span><div class="grow"><div class="t">{{ t.title }}</div><div class="s" v-if="t.due">{{ rel(t.due) }}</div></div>
            <Ic v-if="S.timer.label === 'task:' + t.id" n="check" :s="18" style="color:var(--c-focus)"/></button>
        </div>
        <span class="flabel">Or type something</span>
        <div class="quickbar"><input v-model="custom" placeholder="e.g. Study chapter 4" @keydown.enter="custom.trim() && setLabel(custom.trim())" enterkeyhint="done">
          <button class="go" :disabled="!custom.trim()" @click="setLabel(custom.trim())" aria-label="Set"><Ic n="check" :s="20" :w="2.6"/></button></div>
        <button v-if="S.timer.label" class="btn block" style="margin-top:14px" @click="setLabel('')">Clear</button>
      </div>
    </Sheet>

    <Sheet :open="cfg" title="Timer settings" @close="cfg = false">
      <div :style="{'--acc': 'var(--c-focus)'}">
        <div class="presets">
          <button v-for="p in FOCUS_PRESETS" :key="p.id" :class="{on: preset === p.id}" @click="applyPreset(p)"><b>{{ p.l }}</b><small>{{ p.work }} · {{ p.short }} · {{ p.long }} min</small></button>
        </div>
        <div class="settings-group" style="box-shadow:none;margin-top:14px">
          <div class="list-row"><div class="grow"><div class="t">Focus</div></div><Stepper v-model="f.work" :min="5" :max="120" :step="5" unit="min"/></div>
          <div class="list-row"><div class="grow"><div class="t">Short break</div></div><Stepper v-model="f.short" :min="1" :max="30" unit="min"/></div>
          <div class="list-row"><div class="grow"><div class="t">Long break</div></div><Stepper v-model="f.long" :min="5" :max="60" :step="5" unit="min"/></div>
          <div class="list-row"><div class="grow"><div class="t">Long break every</div></div><Stepper v-model="f.rounds" :min="2" :max="8" unit="rounds"/></div>
          <div class="list-row"><div class="grow"><div class="t">Daily goal</div></div><Stepper v-model="f.goal" :min="1" :max="16" unit="sessions"/></div>
        </div>
        <div class="settings-group" style="box-shadow:none;margin-top:12px">
          <div class="list-row"><div class="grow"><div class="t">Auto-start breaks</div></div><Toggle v-model="f.autoBreak"/></div>
          <div class="list-row"><div class="grow"><div class="t">Auto-start next focus</div></div><Toggle v-model="f.autoFocus"/></div>
          <div class="list-row"><div class="grow"><div class="t">Sound when time's up</div><div class="s">Plays while Orbit is open</div></div><Toggle v-model="f.sound"/></div>
          <div class="list-row"><div class="grow"><div class="t">Keep screen on</div><div class="s">While a session is running</div></div><Toggle v-model="f.keepAwake"/></div>
        </div>
        <p class="fine">{{ remReady && S.settings.notify.focus ? 'You\\'ll also get a notification when a session ends, even if Orbit is closed.' : 'Turn on notifications to be alerted when Orbit is closed.' }}</p>
        <div class="btn-row">
          <button class="btn" :disabled="!S.timer.count" @click="Timer.resetCycle(); say('Rounds reset')">Reset rounds</button>
          <button class="btn danger" :disabled="!focusToday.min" @click="clearToday">Clear today</button>
        </div>
      </div>
    </Sheet>
  </div>`,
};

const WaterView = {
  setup() {
    const goal = computed(() => S.settings.waterGoal);
    const pct = computed(() => Math.min(1, waterToday.value / goal.value));
    const week = computed(() => Array.from({ length: 7 }, (_, i) => { const k = addDays(R.today, i - 6); return { k, l: WD[parseKey(k).getDay()][0], v: S.water[k] || 0 }; }));
    const max = computed(() => Math.max(goal.value, ...week.value.map(w => w.v)));
    return { goal, pct, week, max };
  },
  template: `<div class="view" style="--acc:var(--c-water);--c:var(--c-water)">
    <Head title="Water" :sub="pct >= 1 ? 'Goal reached today 🎉' : (goal - waterToday) + ' more glass' + (goal - waterToday === 1 ? '' : 'es') + ' to go'"/>
    <div class="bottle-wrap"><div class="bottle">
      <div class="fill" :style="{height: (pct * 100) + '%'}">
        <svg v-if="pct > 0 && pct < 1" class="wave" viewBox="0 0 200 20" preserveAspectRatio="none"><path d="M0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 V 20 H 0 Z" fill="#5cb6ff"/></svg>
        <div class="bubbles" v-if="pct > 0.15"><i style="left:22%;animation-delay:0s"></i><i style="left:55%;animation-delay:1.3s;width:6px;height:6px"></i><i style="left:76%;animation-delay:2.4s"></i></div>
      </div>
      <div class="lbl" :class="{light: pct > 0.55}"><b>{{ waterToday }}</b><span>of {{ goal }} glasses</span><span style="opacity:.65">{{ fmt(waterToday * S.settings.glassMl) }} ml</span></div>
    </div></div>
    <div class="controls" style="margin-top:22px">
      <button class="side" @click="addWater(-1)" :disabled="!waterToday" aria-label="Remove glass"><Ic n="minus"/></button>
      <button class="main" style="width:auto;padding:0 26px;gap:8px;display:flex;align-items:center;font-weight:700;font-size:16px" @click="addWater(1)"><Ic n="plus" :s="22" :w="2.6"/>{{ S.settings.glassMl }} ml</button>
    </div>
    <div class="glasses"><i v-for="i in Math.max(goal, waterToday)" :key="i" :class="{on: i <= waterToday}"></i></div>
    <div class="card" style="margin-top:22px">
      <div class="sec"><h3>Last 7 days</h3></div>
      <div class="week-bars"><div v-for="w in week" :key="w.k" :class="{today: w.k === R.today}"><span class="v">{{ w.v || '' }}</span><i :style="{height: (w.v / max * 70) + '%', background: w.v >= goal ? 'var(--c-water)' : ''}"></i><small>{{ w.l }}</small></div></div>
    </div>
    <div class="label">Reminders</div>
    <div class="settings-group"><button class="list-row" style="width:100%;text-align:left" @click="ui.rem = waterRem ? {ref: waterRem} : {tpl: REM_TEMPLATES[0]}">
      <span class="bubble" style="--c:var(--c-water)"><Ic n="bell" :s="18"/></span>
      <div class="grow"><div class="t">{{ waterRem && waterRem.on !== false ? remSummary(waterRem) : 'Water reminders are off' }}</div>
        <div class="s">{{ waterRem && waterRem.on !== false ? (waterNext.length ? 'Next at ' + hm(waterNext[0]) + (isToday(waterNext[0]) ? '' : ' ' + rel(keyOf(new Date(waterNext[0]))).toLowerCase()) : 'No upcoming reminders') : 'Get a nudge to drink through the day' }}</div></div>
      <Ic n="chevron-right" :s="18" class="muted"/></button></div>
    <div class="label">Daily goal</div>
    <div class="settings-group">
      <div class="list-row"><div class="grow"><div class="t">Glasses per day</div><div class="s">{{ fmt(goal * S.settings.glassMl) }} ml total</div></div><Stepper v-model="S.settings.waterGoal" :min="1" :max="20"/></div>
      <div class="list-row" style="display:block"><div class="t" style="margin-bottom:10px">Glass size</div>
        <div class="chips"><button v-for="m in [200, 250, 330, 500]" :key="m" class="chip" :class="{on: S.settings.glassMl === m}" @click="S.settings.glassMl = m">{{ m }} ml</button></div></div>
    </div>
  </div>`,
};

const MoodView = {
  setup() {
    const entry = computed(() => S.mood[R.today]);
    const note = computed({
      get: () => (entry.value ? entry.value.note : ''),
      set: v => { if (entry.value) entry.value.note = v; },
    });
    const cal = computed(() => {
      const t = R.today, start = addDays(t, -satIdx(t) - 28);
      return Array.from({ length: 35 }, (_, i) => { const k = addDays(start, i); return { k, d: parseKey(k).getDate(), m: S.mood[k], fut: k > t }; });
    });
    const last30 = computed(() => { const a = []; for (let i = 0; i < 30; i++) { const m = S.mood[addDays(R.today, -i)]; if (m) a.push(m.v); } return a; });
    const dist = computed(() => MOODS.map(m => ({ ...m, n: last30.value.filter(v => v === m.v).length })));
    const avg7 = computed(() => { const a = []; for (let i = 0; i < 7; i++) { const m = S.mood[addDays(R.today, -i)]; if (m) a.push(m.v); } return a.length ? avg(a) : 0; });
    const maxD = computed(() => Math.max(1, ...dist.value.map(x => x.n)));
    return { entry, note, cal, dist, avg7, maxD, WK };
  },
  template: `<div class="view" style="--acc:var(--c-mood)">
    <Head title="Mood" sub="A daily check-in with yourself"/>
    <div class="card">
      <div class="sec"><h3>How are you feeling today?</h3></div>
      <div class="moods"><button v-for="m in MOODS" :key="m.v" :class="{on: entry && entry.v === m.v}" :style="{'--c': m.c}" @click="setMood(m.v)"><span class="e">{{ m.e }}</span>{{ m.l }}</button></div>
      <Transition name="fade"><textarea v-if="entry" class="field" v-model="note" placeholder="What's on your mind? (optional)" style="margin-top:14px;min-height:80px"></textarea></Transition>
    </div>
    <div class="card">
      <div class="sec"><h3>Last 5 weeks</h3><span v-if="avg7" class="muted" style="font-size:13px;font-weight:600">Week avg {{ MOODS[Math.round(avg7) - 1].e }}</span></div>
      <div class="mood-cal">
        <div v-for="w in WK" :key="w" class="wd">{{ w }}</div>
        <div v-for="c in cal" :key="c.k" :class="{t: c.k === R.today}" :style="{opacity: c.fut ? .3 : 1, background: c.m ? 'color-mix(in srgb, ' + MOODS[c.m.v - 1].c + ' 22%, transparent)' : ''}">
          <small>{{ c.d }}</small>{{ c.m ? MOODS[c.m.v - 1].e : '' }}</div>
      </div>
    </div>
    <div class="card">
      <div class="sec"><h3>Last 30 days</h3></div>
      <div v-for="m in dist" :key="m.v" class="row" style="margin:8px 0">
        <span style="font-size:20px;width:28px">{{ m.e }}</span>
        <div class="bar grow" style="margin:0;height:10px;--c:transparent"><i :style="{width: (m.n / maxD * 100) + '%', background: m.c}"></i></div>
        <b style="width:24px;text-align:right;font-size:14px">{{ m.n }}</b>
      </div>
    </div>
  </div>`,
};

const CountdownsView = {
  setup() {
    const open = ref(false);
    const editing = ref(null);
    const d = reactive({ title: '', emoji: '🎂', date: R.today, repeat: 'none' });
    function edit(c) { editing.value = c || null; Object.assign(d, c ? { title: c.title, emoji: c.emoji, date: c.date, repeat: c.repeat || 'none' } : { title: '', emoji: '🎉', date: addDays(R.today, 30), repeat: 'none' }); open.value = true; }
    function save() {
      if (!d.title.trim() || !d.date) return;
      const rec = { title: d.title.trim(), emoji: d.emoji, date: d.date, repeat: d.repeat };
      if (editing.value) Object.assign(editing.value, rec); else S.countdowns.push({ id: uid(), ...rec });
      open.value = false;
    }
    function remove() { const c = editing.value, i = S.countdowns.indexOf(c); S.countdowns.splice(i, 1); open.value = false; say('Countdown deleted', () => S.countdowns.splice(i, 0, c)); }
    const hero = computed(() => cdSorted.value.find(x => x.days >= 0));
    const rest = computed(() => cdSorted.value.filter(x => x !== hero.value));
    return { open, editing, d, edit, save, remove, hero, rest, CD_EMOJI };
  },
  template: `<div class="view" style="--acc:var(--c-count)">
    <Head title="Countdowns" sub="Birthdays, trips, deadlines"/>
    <div v-if="hero" class="card cd-hero tap" @click="edit(hero.c)">
      <div class="e">{{ hero.c.emoji }}</div>
      <div class="num">{{ hero.days === 0 ? '🎉' : hero.days }}</div>
      <div class="u">{{ hero.days === 0 ? 'It\\'s today!' : 'day' + (hero.days === 1 ? '' : 's') + ' to go' }}</div>
      <div class="t">{{ hero.c.title }}</div>
      <div class="u" style="font-size:13px">{{ gFull(hero.k) }} · {{ jFull(hero.k) }}</div>
    </div>
    <div class="stack" style="margin-top:12px">
      <div v-for="x in rest" :key="x.c.id" class="card cd tap" :class="{soon: x.days >= 0 && x.days <= 7, past: x.days < 0}" @click="edit(x.c)">
        <div class="e">{{ x.c.emoji }}</div>
        <div class="n"><b>{{ x.c.title }}</b><small>{{ gLabel(x.k) }} · {{ jLabel(x.k) }}{{ x.c.repeat !== 'none' ? ' · yearly' : '' }}</small></div>
        <div class="d"><b>{{ Math.abs(x.days) }}</b><small>{{ x.days < 0 ? 'days ago' : 'days' }}</small></div>
      </div>
    </div>
    <Empty v-if="!S.countdowns.length" e="⏳" t="Something to look forward to" s="Add birthdays, trips or deadlines and count down the days."/>
    <button class="fab" @click="edit(null)" aria-label="New countdown"><Ic n="plus" :s="26" :w="2.4"/></button>
    <Sheet :open="open" :title="editing ? 'Edit countdown' : 'New countdown'" @close="open = false">
      <div style="--acc:var(--c-count)">
        <input class="field" v-model="d.title" placeholder="e.g. Sara's birthday" enterkeyhint="done">
        <span class="flabel">Icon</span>
        <div class="emoji-grid"><button v-for="e in CD_EMOJI" :key="e" :class="{on: d.emoji === e}" @click="d.emoji = e">{{ e }}</button></div>
        <span class="flabel">Date</span>
        <label class="field row" style="position:relative"><Ic n="calendar" :s="18" class="muted"/><span class="grow">{{ d.date ? gFull(d.date) : 'Pick a date' }}</span><span class="muted" style="font-size:13px">{{ d.date ? jFull(d.date) : '' }}</span>
          <input type="date" class="overlay-input" v-model="d.date"></label>
        <span class="flabel">Repeat</span>
        <div class="seg"><button :class="{on: d.repeat === 'none'}" @click="d.repeat = 'none'">Once</button><button :class="{on: d.repeat === 'greg'}" @click="d.repeat = 'greg'">Yearly</button><button :class="{on: d.repeat === 'jal'}" @click="d.repeat = 'jal'">Yearly (Shamsi)</button></div>
        <div class="btn-row">
          <button v-if="editing" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove"><Ic n="trash-2"/></button>
          <button class="btn primary" :disabled="!d.title.trim() || !d.date" @click="save">{{ editing ? 'Save' : 'Add countdown' }}</button>
        </div>
      </div>
    </Sheet>
  </div>`,
};

const CycleDaySheet = {
  props: { day: String },
  emits: ['close'],
  setup(props) {
    const e = computed(() => (props.day ? clog(props.day) : {}));
    const info = computed(() => (props.day ? cycleDayInfo(props.day) : null));
    const flow = computed(() => e.value.flow || (props.day && S.cycleDays.includes(props.day) ? 3 : 0));
    const toggle = (field, id) => { const a = [...(e.value[field] || [])]; const i = a.indexOf(id); i >= 0 ? a.splice(i, 1) : a.push(id); setClog(props.day, { [field]: a }); Native.vibrate(6); };
    const pick = (field, id) => { setClog(props.day, { [field]: e.value[field] === id ? null : id }); Native.vibrate(6); };
    const temp = computed({
      get: () => (e.value.temp ? String(e.value.temp) : ''),
      set: v => { const n = parseFloat(toEn(v).replace(',', '.')); setClog(props.day, { temp: n >= 34 && n <= 43 ? Math.round(n * 100) / 100 : null }); },
    });
    const note = computed({ get: () => e.value.note || '', set: v => setClog(props.day, { note: v }) });
    return { e, info, flow, toggle, pick, temp, note, setFlow, setClog, FLOWS, SYMPTOMS, CMOODS, DISCHARGE, SEXLOG, TESTS, PHASES };
  },
  template: `<Sheet :open="!!day" :title="day ? (day === R.today ? 'Today' : gFull(day)) : ''" @close="$emit('close')">
    <div v-if="day" style="--acc:var(--c-cycle)">
      <div class="muted" style="font-size:13px;font-weight:600;margin:-4px 2px 8px">{{ jFull(day) }}<template v-if="info"> · Cycle day {{ info.day }} · {{ PHASES[info.phase].l }}</template></div>
      <span class="flabel">Period</span>
      <div class="flow-pick">
        <button v-for="f in FLOWS" :key="f.v" :class="{on: flow === f.v}" @click="setFlow(day, f.v)">
          <span class="drops"><Ic v-for="i in (f.d || 0)" :key="i" n="droplet" :s="13" :w="2.4"/><Ic v-if="!f.d" n="x" :s="13"/></span>{{ f.l }}</button>
      </div>
      <span class="flabel">Symptoms</span>
      <div class="chips"><button v-for="s in SYMPTOMS" :key="s.id" class="chip" :class="{on: (e.sym || []).includes(s.id)}" @click="toggle('sym', s.id)">{{ s.e }} {{ s.l }}</button></div>
      <span class="flabel">Mood</span>
      <div class="chips"><button v-for="m in CMOODS" :key="m.id" class="chip" :class="{on: (e.mood || []).includes(m.id)}" @click="toggle('mood', m.id)">{{ m.e }} {{ m.l }}</button></div>
      <span class="flabel">Discharge</span>
      <div class="chips"><button v-for="x in DISCHARGE" :key="x.id" class="chip" :class="{on: e.dis === x.id}" @click="pick('dis', x.id)">{{ x.l }}</button></div>
      <span class="flabel">Sex</span>
      <div class="chips"><button v-for="x in SEXLOG" :key="x.id" class="chip" :class="{on: e.sex === x.id}" @click="pick('sex', x.id)">{{ x.l }}</button></div>
      <div class="grid2" style="margin-top:4px">
        <div><span class="flabel">Ovulation test</span><div class="chips"><button v-for="x in TESTS.slice(1)" :key="x.id" class="chip" :class="{on: e.ovu === x.id}" @click="pick('ovu', x.id)">{{ x.l }}</button></div></div>
        <div><span class="flabel">Pregnancy test</span><div class="chips"><button v-for="x in TESTS.slice(1)" :key="x.id" class="chip" :class="{on: e.preg === x.id}" @click="pick('preg', x.id)">{{ x.l }}</button></div></div>
      </div>
      <span class="flabel">Basal temperature</span>
      <div class="row"><input class="field" style="max-width:140px" v-model.lazy="temp" inputmode="decimal" placeholder="36.50" enterkeyhint="done"><span class="muted">°C · take it right after waking</span></div>
      <template v-if="S.settings.cycle.pill.on">
        <div class="list-row" style="padding:16px 2px 0;border:0"><span class="bubble" style="--c:var(--c-cycle)"><Ic n="pill" :s="18"/></span><div class="grow"><div class="t">Pill taken</div></div><Toggle :model-value="!!e.pill" @update:model-value="v => setClog(day, {pill: v || null})"/></div>
      </template>
      <span class="flabel">Note</span>
      <textarea class="field" v-model.lazy="note" placeholder="Anything else worth remembering?" style="min-height:70px"></textarea>
      <button class="btn primary block" style="margin-top:18px" @click="$emit('close')">Done</button>
    </div>
  </Sheet>`,
};

const CycleView = {
  setup() {
    const tab = ref('today'), cfg = ref(false), dayOpen = ref(null), guide = ref('food');
    const now = parseKey(R.today);
    const cm = ref({ y: now.getFullYear(), m: now.getMonth() });
    const shift = n => { let { y, m } = cm.value; m += n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } cm.value = { y, m }; };
    const cells = computed(() => {
      const { y, m } = cm.value, first = keyOf(new Date(y, m, 1));
      const start = addDays(first, -satIdx(first));
      const arr = Array.from({ length: 42 }, (_, i) => { const k = addDays(start, i); return { k, d: parseKey(k).getDate(), j: jal(k).d, out: parseKey(k).getMonth() !== m }; });
      return arr[35].out ? arr.slice(0, 35) : arr;
    });
    const jRange = computed(() => {
      const { y, m } = cm.value;
      const a = jal(keyOf(new Date(y, m, 1))), b = jal(keyOf(new Date(y, m + 1, 0)));
      return JM[a.m - 1] + ' – ' + JM[b.m - 1] + ' ' + b.y;
    });
    const cs = S.settings.cycle;
    const who = computed(() => cs.name.trim());
    const startDate = ref(R.today);
    // "next" lets someone start before a period is logged: they give the expected date and we estimate backwards
    const startMode = ref('last'), nextDate = ref(addDays(R.today, 7));
    function logStart() {
      if (startMode.value === 'next') cs.expected = nextDate.value;
      else if (!S.cycleDays.includes(startDate.value)) S.cycleDays.push(startDate.value);
      Native.vibrate(14); if (Native.has) Native.askNotify();
    }
    const primary = computed(() => {
      const t = R.today;
      if (S.cycleDays.includes(t)) return { l: 'Period logged', ghost: true };
      if (S.cycleDays.includes(addDays(t, -1))) return { l: 'Still on period' };
      return { l: 'Log period' };
    });
    function periodToday() {
      if (S.cycleDays.includes(R.today)) { dayOpen.value = R.today; return; }
      setFlow(R.today, 3);
    }
    function tapDay(c) {
      if (c.k <= R.today) { dayOpen.value = c.k; return; }
      const t = cyc.value.map[c.k];
      say(t === 'pp' ? 'Predicted period' : t === 'ov' ? 'Estimated ovulation · peak fertility' : t === 'f' ? 'Fertile window · ' + chanceOn(c.k).l.toLowerCase() + ' chance' : gFull(c.k));
    }
    const pk = computed(() => (cyc.value.has ? phaseKey(cyc.value.phase) : 'follicular'));
    const g = computed(() => PHASE_GUIDE[pk.value]);
    const chance = computed(() => (cyc.value.has ? chanceOn(R.today) : null));
    const goalLine = computed(() => {
      const ch = chance.value; if (!ch || cs.goal === 'track') return '';
      if (cs.goal === 'conceive') return ch.v >= 2 ? '🌱 ' + ch.l + ' chance of conceiving today' : ch.v === 1 ? 'Medium chance today. Your best days are coming' : 'Low chance today';
      return ch.v >= 1 ? '🛡️ ' + ch.l + ' chance of pregnancy today. Use protection' : 'Lower chance today, but no day is 100% safe';
    });
    const todayLog = computed(() => clog(R.today));
    const todaySummary = computed(() => {
      const e = todayLog.value, out = [];
      if (e.flow) out.push(FLOWS[e.flow].l + (e.flow >= 2 ? ' flow' : ''));
      (e.sym || []).forEach(id => { const s = SYMPTOMS.find(x => x.id === id); if (s) out.push(s.e + ' ' + s.l); });
      (e.mood || []).forEach(id => { const m = CMOODS.find(x => x.id === id); if (m) out.push(m.e + ' ' + m.l); });
      if (e.temp) out.push('🌡️ ' + e.temp + '°');
      return out;
    });
    const upcoming = computed(() => {
      const c = cyc.value; if (!c.has) return [];
      const st = cycStats.value, list = [];
      const p0 = st.preds[0];
      if (c.toNext >= 0) list.push({ i: 'droplet', c: 'var(--c-cycle)', t: 'Next period', s: gFull(c.next) + ' · ' + jLabel(c.next) + (st.margin ? ' (±' + st.margin + 'd)' : ''), d: c.toNext });
      if (c.fStart > R.today) list.push({ i: 'sparkles', c: '#14b8a6', t: 'Fertile window', s: gLabel(c.fStart) + ' – ' + gLabel(c.fEnd), d: diffDays(R.today, c.fStart) });
      else if (c.fEnd >= R.today) list.push({ i: 'sparkles', c: '#14b8a6', t: 'Fertile window ends', s: gFull(c.fEnd), d: diffDays(R.today, c.fEnd) });
      if (c.ov > R.today) list.push({ i: 'target', c: '#14b8a6', t: 'Ovulation (estimated)', s: gFull(c.ov), d: diffDays(R.today, c.ov) });
      st.preds.slice(1).forEach(p => list.push({ i: 'calendar', c: 'var(--muted)', t: 'Period', s: gFull(p.start) + ' · ' + jLabel(p.start), d: diffDays(R.today, p.start) }));
      return list.sort((a, b) => a.d - b.d);
    });
    const maxLen = computed(() => Math.max(35, ...cycStats.value.cycles.map(x => x.clen || 0)));
    const bbtPath = computed(() => {
      const b = cycStats.value.bbt; if (!b) return null;
      const W = 300, H = 120, maxD = Math.max(cyc.value.len, ...b.pts.map(p => p.d));
      const x = d => (d - 1) / Math.max(1, maxD - 1) * W, y = t => H - (t - b.min) / (b.max - b.min) * H;
      return { W, H, line: b.pts.map((p, i) => (i ? 'L' : 'M') + x(p.d).toFixed(1) + ' ' + y(p.t).toFixed(1)).join(' '), dots: b.pts.map(p => ({ x: x(p.d), y: y(p.t) })),
        cover: b.cover ? y(b.cover) : null, shiftX: b.shift ? x(b.shift.d) : null };
    });
    const history = computed(() => [...cycStats.value.cycles].reverse().slice(0, 10));
    const tipShift = ref(0);
    const tip = computed(() => cycleTip(R.today, tipShift.value));
    return { tip, tipShift, tab, cfg, dayOpen, guide, cm, shift, cells, jRange, who, startDate, startMode, nextDate, logStart, primary, periodToday, tapDay, pk, g, chance, goalLine, todaySummary, upcoming, maxLen, bbtPath, history, cs, WK, MONTHS, PHASES, GOALS, SYMPTOMS };
  },
  template: `<div class="view" style="--acc:var(--c-cycle)">
    <Head title="Cycle" :sub="who ? 'Tracking for ' + who + ' 💗' : 'Your period & fertility tracker'"><button class="icon-btn" @click="cfg = true" aria-label="Cycle settings"><Ic n="settings" :s="19"/></button></Head>

    <template v-if="!cyc.has">
      <div class="card" style="text-align:center;padding:28px 20px">
        <div style="font-size:48px">🌸</div>
        <h2 style="font-size:20px;font-weight:750;margin-top:8px">Let's set things up</h2>
        <p class="muted" style="margin-top:6px">Start from {{ who ? who + '\\'s' : 'your' }} last period, or from when the next one is due. Predictions get smarter with every cycle you log.</p>
        <span class="flabel" style="text-align:left">What's the goal?</span>
        <div class="goal-pick"><button v-for="x in GOALS" :key="x.id" :class="{on: cs.goal === x.id}" @click="cs.goal = x.id"><span>{{ x.e }}</span><b>{{ x.l }}</b></button></div>
        <span class="flabel" style="text-align:left">Name (optional)</span>
        <input class="field" v-model="cs.name" placeholder="Leave empty if it's your own cycle" enterkeyhint="done">
        <span class="flabel" style="text-align:left">Start from</span>
        <div class="seg"><button :class="{on: startMode === 'last'}" @click="startMode = 'last'">Last period</button><button :class="{on: startMode === 'next'}" @click="startMode = 'next'">Next period</button></div>
        <template v-if="startMode === 'last'">
          <span class="flabel" style="text-align:left">Last period started</span>
          <label class="field row" style="position:relative;text-align:left"><Ic n="calendar" :s="18" class="muted"/><span class="grow">{{ gFull(startDate) }}</span><span class="muted" style="font-size:13px">{{ jFull(startDate) }}</span>
            <input type="date" class="overlay-input" v-model="startDate" :max="R.today"></label>
        </template>
        <template v-else>
          <span class="flabel" style="text-align:left">Next period expected</span>
          <label class="field row" style="position:relative;text-align:left"><Ic n="calendar" :s="18" class="muted"/><span class="grow">{{ gFull(nextDate) }}</span><span class="muted" style="font-size:13px">{{ jFull(nextDate) }}</span>
            <input type="date" class="overlay-input" v-model="nextDate" :min="R.today" :max="addDays(R.today, cs.len)"></label>
          <div class="list-row" style="text-align:left;padding:14px 2px 0;border:0"><div class="grow"><div class="t">Usual cycle length</div><div class="s">Used to estimate where you are now</div></div><Stepper v-model="cs.len" :min="20" :max="45" unit="d"/></div>
        </template>
        <button class="btn primary block" style="margin-top:20px" @click="logStart">Start tracking</button>
      </div>
    </template>

    <template v-else>
      <div class="seg"><button :class="{on: tab === 'today'}" @click="tab = 'today'">Today</button><button :class="{on: tab === 'calendar'}" @click="tab = 'calendar'">Calendar</button><button :class="{on: tab === 'insights'}" @click="tab = 'insights'">Insights</button></div>

      <Transition name="fade" mode="out-in"><div :key="tab" style="margin-top:12px">

      <template v-if="tab === 'today'">
        <div class="card cyc-hero" :style="{'--pc': cyc.pc}">
          <div style="display:flex;justify-content:center">
            <Ring :v="Math.min(1, cyc.day / cyc.len)" :size="196" :sw="13" :c="cyc.pc">
              <div><div class="day">Day</div><div class="num">{{ cyc.day }}</div><span class="ph"><span class="dot" :style="{background: cyc.pc}"></span>{{ cyc.phase }}</span></div>
            </Ring>
          </div>
          <div class="msg">{{ cyc.toNext > 1 ? 'Next period in ' + cyc.toNext + ' days' : cyc.toNext === 1 ? 'Period expected tomorrow' : cyc.toNext === 0 ? 'Period expected today' : 'Period is ' + -cyc.toNext + ' day' + (cyc.toNext === -1 ? '' : 's') + ' late' }}</div>
          <div class="msg2">{{ gFull(cyc.next) }} · {{ jFull(cyc.next) }}</div>
          <div v-if="cyc.est" class="msg2" style="margin-top:6px">Estimated from the date you gave. Log your period when it starts and Orbit takes it from there.</div>
          <div v-if="goalLine" class="goal-line" :class="cs.goal">{{ goalLine }}</div>
          <div class="msg2" v-else style="margin-top:12px;color:var(--text-2)">{{ cyc.tip }}</div>
          <div class="btn-row" style="margin-top:16px">
            <button class="btn" :class="primary.ghost ? '' : 'primary'" @click="periodToday"><Ic n="droplet" :s="17"/>{{ primary.l }}</button>
            <button class="btn" @click="dayOpen = R.today"><Ic n="plus" :s="17"/>Log</button>
          </div>
        </div>

        <div v-if="tip" class="card tip-card" :style="{'--pc': PHASES[tip.phase].c}">
          <div class="sec" style="margin-bottom:6px"><h3><Ic n="quote" :s="16"/>{{ who ? 'Kind idea for today' : 'Tip for today' }}</h3>
            <button class="icon-btn plain" @click="tipShift++; Native.vibrate(6)" aria-label="Another tip"><Ic n="shuffle" :s="17"/></button></div>
          <Transition name="fade" mode="out-in"><p :key="tip.text">{{ tip.text }}</p></Transition>
          <button v-if="!cs.tip.on" class="link-btn" style="margin:8px 0 0;padding:0" @click="cs.tip.on = true; Native.has && Native.askNotify(); say('You\\'ll get a tip every day at ' + cs.tip.time)">Get a tip like this every morning →</button>
        </div>

        <div class="card tap" @click="dayOpen = R.today">
          <div class="sec" style="margin-bottom:8px"><h3>Today's log</h3><span class="link">{{ todaySummary.length ? 'Edit' : 'Add' }} <Ic n="chevron-right" :s="16"/></span></div>
          <div v-if="todaySummary.length" class="chips"><span v-for="x in todaySummary" :key="x" class="chip on" style="height:32px">{{ x }}</span></div>
          <div v-else class="muted" style="font-size:14px">How are you feeling? Log symptoms, mood, discharge and more.</div>
        </div>

        <div v-if="cs.pill.on" class="card row">
          <span class="bubble" style="--c:var(--c-cycle)"><Ic n="pill" :s="19"/></span>
          <div class="grow"><div style="font-weight:650">Pill today</div><div class="muted" style="font-size:13px">Reminder at {{ cs.pill.time }}</div></div>
          <button class="h-check" :class="{on: clog(R.today).pill}" :style="{'--c': 'var(--c-cycle)'}" @click="setClog(R.today, {pill: clog(R.today).pill ? null : true}); Native.vibrate(12)"><Ic n="check" :s="20" :w="2.8"/></button>
        </div>

        <div class="card phase-card" :style="{'--pc': PHASES[pk].c}">
          <div class="row"><span class="ph-e">{{ PHASES[pk].e }}</span><div class="grow"><b>{{ PHASES[pk].l }}{{ ['follicular', 'luteal'].includes(pk) ? ' phase' : '' }}</b><div class="s">{{ g.desc }}</div></div></div>
          <div class="seg" style="margin-top:14px">
            <template v-if="!who"><button :class="{on: guide === 'food'}" @click="guide = 'food'"><Ic n="utensils" :s="15"/>Eat</button><button :class="{on: guide === 'move'}" @click="guide = 'move'"><Ic n="dumbbell" :s="15"/>Move</button><button :class="{on: guide === 'care'}" @click="guide = 'care'"><Ic n="heart" :s="15"/>Care</button></template>
            <template v-else><button :class="{on: guide !== 'care'}" @click="guide = 'food'"><Ic n="heart-handshake" :s="15"/>How to support {{ who }}</button><button :class="{on: guide === 'care'}" @click="guide = 'care'"><Ic n="lightbulb" :s="15"/>What she may feel</button></template>
          </div>
          <ul class="tips"><li v-for="x in (who ? (guide === 'care' ? g.care.concat(g.food.slice(0, 1)) : g.partner) : g[guide])" :key="x">{{ x }}</li></ul>
        </div>

        <div class="label">Coming up</div>
        <div class="settings-group">
          <div v-for="u in upcoming" :key="u.t + u.s" class="list-row">
            <span class="bubble" :style="{'--c': u.c}"><Ic :n="u.i" :s="17"/></span>
            <div class="grow"><div class="t">{{ u.t }}</div><div class="s">{{ u.s }}</div></div>
            <span class="badge">{{ u.d === 0 ? 'Today' : 'in ' + u.d + 'd' }}</span>
          </div>
        </div>
        <template v-if="cycStats.flags.length">
          <div class="label">Health notes</div>
          <div class="card flags"><div v-for="f in cycStats.flags" :key="f" class="insight"><span>🩺</span>{{ f }}</div></div>
        </template>
      </template>

      <template v-else-if="tab === 'calendar'">
        <div class="card">
          <div class="cal-head">
            <button class="icon-btn plain" @click="shift(-1)" aria-label="Previous month"><Ic n="chevron-left"/></button>
            <div style="text-align:center"><b>{{ MONTHS[cm.m] }} {{ cm.y }}</b><small>{{ jRange }}</small></div>
            <button class="icon-btn plain" @click="shift(1)" aria-label="Next month"><Ic n="chevron-right"/></button>
          </div>
          <div class="cal">
            <div v-for="w in WK" :key="w" class="wd">{{ w }}</div>
            <button v-for="c in cells" :key="c.k" :class="[cyc.map[c.k], {out: c.out, td: c.k === R.today, lg: S.cycleLog[c.k] && (S.cycleLog[c.k].sym || S.cycleLog[c.k].mood || S.cycleLog[c.k].temp || S.cycleLog[c.k].sex || S.cycleLog[c.k].note)}]" @click="tapDay(c)">{{ c.d }}<small>{{ c.j }}</small></button>
          </div>
          <div class="legend">
            <span><i style="background:var(--c-cycle)"></i>Period</span>
            <span><i style="border:2px dashed var(--c-cycle)"></i>Predicted</span>
            <span><i style="background:color-mix(in srgb,#2dd4bf 30%,transparent)"></i>Fertile</span>
            <span><i style="background:#14b8a6"></i>Ovulation</span>
            <span><i style="background:var(--c-mood);width:6px;height:6px;margin:3px"></i>Logged</span>
          </div>
          <p class="muted" style="font-size:12.5px;margin-top:10px">Tap a day to log period, symptoms and more. Future days show predictions.</p>
        </div>
      </template>

      <template v-else>
        <div class="kpis">
          <div class="kpi"><small>Average cycle</small><b>{{ cyc.len }} days</b><span class="muted">{{ cycStats.shortest ? cycStats.shortest + '–' + cycStats.longest + ' days' : 'from your settings' }}</span></div>
          <div class="kpi"><small>Average period</small><b>{{ cyc.plen }} days</b><span class="muted">{{ cycStats.cycles.filter(c => c.plen).length }} logged</span></div>
          <div class="kpi"><small>Regularity</small><b style="font-size:19px">{{ cycStats.regularity.l }}</b><span class="muted">{{ cycStats.regularity.s }}</span></div>
          <div class="kpi"><small>Cycles tracked</small><b>{{ cycStats.cycles.length }}</b><span class="muted">predictions ±{{ cycStats.margin }} days</span></div>
        </div>

        <div class="card" v-if="cycStats.cycles.some(c => c.clen)">
          <div class="sec"><h3>Cycle history</h3><span class="muted" style="font-size:12.5px;font-weight:600">avg {{ cyc.len }}d</span></div>
          <div v-for="c in history.filter(x => x.clen)" :key="c.start" class="cyc-bar">
            <small>{{ gLabel(c.start) }}</small>
            <div class="track"><i class="p" :style="{width: ((c.plen || cyc.plen) / maxLen * 100) + '%'}"></i><i class="r" :style="{width: ((c.clen - (c.plen || cyc.plen)) / maxLen * 100) + '%'}"></i>
              <em :style="{left: (cyc.len / maxLen * 100) + '%'}"></em></div>
            <b>{{ c.clen }}</b>
          </div>
        </div>

        <div class="card">
          <div class="sec"><h3>Symptom patterns</h3></div>
          <template v-if="cycStats.symptoms.length">
            <div v-for="s in cycStats.symptoms" :key="s.id" class="sym-row">
              <span class="e">{{ s.e }}</span>
              <div class="grow"><div class="t">{{ s.l }}</div><div class="s">In {{ s.cycles }} of {{ s.of }} cycle{{ s.of > 1 ? 's' : '' }} · mostly {{ PHASES[s.phase].l.toLowerCase() }}</div>
                <div class="bar" style="margin-top:6px;height:6px" :style="{'--c': PHASES[s.phase].c}"><i :style="{width: (s.cycles / s.of * 100) + '%'}"></i></div></div>
            </div>
          </template>
          <div v-else class="muted" style="font-size:14px">Log symptoms for a cycle or two and patterns will show up here.</div>
        </div>

        <div v-if="cycStats.moods.length" class="card">
          <div class="sec"><h3>Mood by phase</h3></div>
          <div v-for="m in cycStats.moods" :key="m.ph" class="list-row">
            <span class="bubble" :style="{'--c': PHASES[m.ph].c}">{{ PHASES[m.ph].e }}</span>
            <div class="grow"><div class="t">{{ PHASES[m.ph].l }}</div></div>
            <span class="mood-tops">{{ m.top.map(x => x.e).join(' ') }}</span>
          </div>
        </div>

        <div class="card">
          <div class="sec"><h3><Ic n="thermometer" :s="17"/>Basal temperature</h3><span v-if="cycStats.bbt && cycStats.bbt.shift" class="badge" style="color:#14b8a6">Ovulation detected</span></div>
          <template v-if="bbtPath">
            <svg class="bbt" :viewBox="'-6 -8 ' + (bbtPath.W + 12) + ' ' + (bbtPath.H + 16)">
              <line v-if="bbtPath.cover != null" x1="0" :x2="bbtPath.W" :y1="bbtPath.cover" :y2="bbtPath.cover" class="cover"/>
              <line v-if="bbtPath.shiftX != null" :x1="bbtPath.shiftX" :x2="bbtPath.shiftX" y1="0" :y2="bbtPath.H" class="shift"/>
              <path :d="bbtPath.line" class="ln"/>
              <circle v-for="(d, i) in bbtPath.dots" :key="i" :cx="d.x" :cy="d.y" r="3.5" class="pt"/>
            </svg>
            <div class="muted" style="font-size:12px;margin-top:6px">{{ cycStats.bbt.shift ? 'A sustained rise after day ' + cycStats.bbt.shift.d + ' suggests ovulation happened.' : 'Log your temperature each morning. A rise of about 0.2°C for 3 days suggests ovulation.' }}</div>
          </template>
          <div v-else class="muted" style="font-size:14px">Log your temperature right after waking. After a few days you'll see a chart here, and Orbit can spot the rise that follows ovulation.</div>
        </div>

        <div class="card">
          <div class="sec"><h3>History</h3></div>
          <div v-for="h in history" :key="h.start" class="list-row">
            <span class="bubble" style="--c:var(--c-cycle)"><Ic n="droplet" :s="17"/></span>
            <div class="grow"><div class="t">{{ gLabel(h.start) }} · {{ jLabel(h.start) }}</div><div class="s">{{ h.plen ? h.plen + ' day period' : 'Start logged' }}</div></div>
            <span v-if="h.clen" class="badge">{{ h.clen }}d cycle</span><span v-else class="badge" style="color:var(--c-cycle)">Current</span>
          </div>
        </div>
        <template v-if="cycStats.flags.length">
          <div class="label">Health notes</div>
          <div class="card flags"><div v-for="f in cycStats.flags" :key="f" class="insight"><span>🩺</span>{{ f }}</div></div>
        </template>
      </template>
      </div></Transition>
      <p class="muted" style="font-size:12px;text-align:center;margin:18px 10px 0">Predictions are estimates based on your logged cycles. They are not medical advice and not a reliable method of contraception.</p>
    </template>

    <CycleDaySheet :day="dayOpen" @close="dayOpen = null"/>

    <Sheet :open="cfg" title="Cycle settings" @close="cfg = false">
      <div style="--acc:var(--c-cycle)">
        <span class="flabel" style="margin-top:4px">Goal</span>
        <div class="goal-pick"><button v-for="x in GOALS" :key="x.id" :class="{on: cs.goal === x.id}" @click="cs.goal = x.id"><span>{{ x.e }}</span><b>{{ x.l }}</b><small>{{ x.s }}</small></button></div>
        <span class="flabel">Name</span>
        <input class="field" v-model="cs.name" placeholder="Leave empty if it's your own cycle" enterkeyhint="done">
        <div class="settings-group" style="box-shadow:none;margin-top:16px">
          <div class="list-row"><div class="grow"><div class="t">Typical cycle length</div><div class="s">Used until 2+ cycles are logged</div></div><Stepper v-model="cs.len" :min="20" :max="45" unit="d"/></div>
          <div class="list-row"><div class="grow"><div class="t">Typical period length</div></div><Stepper v-model="cs.plen" :min="2" :max="10" unit="d"/></div>
          <div v-if="cyc.est" class="list-row"><div class="grow"><div class="t">Next period expected</div><div class="s">Until your first period is logged</div></div>
            <label class="chip on time-chip"><Ic n="calendar" :s="15"/>{{ gLabel(cs.expected) }}<input type="date" v-model="cs.expected" :min="R.today" :max="addDays(R.today, cs.len)"></label></div>
        </div>
        <div class="label">Reminders</div>
        <div class="settings-group" style="box-shadow:none">
          <div class="list-row"><div class="grow"><div class="t">Period coming</div><div class="s">2 days before and on the expected day</div></div><Toggle v-model="cs.notify"/></div>
          <div class="list-row"><div class="grow"><div class="t">Fertile window & ovulation</div><div class="s">When the fertile window starts and on ovulation day</div></div><Toggle v-model="cs.fertileNotify"/></div>
          <div class="list-row"><div class="grow"><div class="t">Daily tip</div><div class="s">{{ cs.tip.on ? 'A new suggestion every day at ' + cs.tip.time : 'A kind, phase-based suggestion each day' }}</div></div><Toggle v-model="cs.tip.on"/></div>
          <div v-if="cs.tip.on" class="list-row"><div class="grow"><div class="t">Tip time</div></div><label class="chip on time-chip"><Ic n="clock" :s="15"/>{{ cs.tip.time }}<input type="time" v-model="cs.tip.time"></label></div>
          <div class="list-row"><div class="grow"><div class="t">Daily pill reminder</div><div class="s">{{ cs.pill.on ? 'Every day at ' + cs.pill.time : 'Off' }}</div></div><Toggle v-model="cs.pill.on"/></div>
          <div v-if="cs.pill.on" class="list-row"><div class="grow"><div class="t">Pill time</div></div><label class="chip on time-chip"><Ic n="clock" :s="15"/>{{ cs.pill.time }}<input type="time" v-model="cs.pill.time"></label></div>
        </div>
        <div class="label">Privacy</div>
        <div class="settings-group" style="box-shadow:none">
          <div class="list-row"><div class="grow"><div class="t">Show on Today screen</div><div class="s">Turn off to keep cycle info out of sight</div></div><Toggle v-model="cs.showToday"/></div>
        </div>
        <button v-if="S.cycleDays.length || Object.keys(S.cycleLog).length || cs.expected" class="btn danger block" style="margin-top:18px" @click="S.cycleDays.splice(0); S.cycleLog = {}; cs.expected = ''; cfg = false; say('Cycle data cleared')">Clear all cycle data</button>
      </div>
    </Sheet>
  </div>`,
};

const AVATARS = ['🙂', '😎', '🦊', '🐼', '🐱', '🦋', '🌸', '🌙', '⭐', '🔥', '🍀', '🎧'];
function shareText(text, done) {
  if (!AN && navigator.share) { navigator.share({ text }).catch(() => {}); return; }
  try { navigator.clipboard.writeText(text).then(() => say(done || 'Copied'), () => say('Couldn\'t copy')); } catch (e) { say('Couldn\'t copy'); }
}
/** One line about where a connection stands, for the list. */
function pairLine(p) {
  const me = Soc.acct && Soc.acct.handle, nm = whoName(p.with);
  if (p.proposal && p.proposal.by !== me) return { t: nm + ' says you are ' + REL[p.proposal.type].l + ' ' + REL[p.proposal.type].e, hot: true };
  if (!p.type) return { t: p.proposal ? 'Waiting for ' + nm + ' to accept' : 'Choose what you are to each other', hot: !p.proposal };
  if (p.today && p.today.day === p.todayKey && !p.today.mine) return { t: '💬 Today\'s question is waiting' + (p.today.theyAnswered ? ' · ' + nm + ' answered' : ''), hot: true };
  if (p.today && p.today.day === p.todayKey && !p.today.theirs) return { t: 'You answered · waiting for ' + nm };
  if (p.last) return { t: (p.last.by === me ? 'You: ' : '') + (p.last.deleted ? 'Message deleted' : clip(p.last.text || '📷 Photo', 60)) };
  return { t: 'Say hi 👋' };
}

const PeopleView = {
  setup() {
    const f = reactive({ handle: '', name: S.settings.name || '', emoji: '🙂', key: '', keyMode: false, busy: false, err: '' });
    const handleOk = computed(() => /^@?[a-zA-Z][a-zA-Z0-9_.]{2,19}$/.test(f.handle.trim()));
    async function signup() {
      f.busy = true; f.err = '';
      try { await socStart(await api('/signup', { handle: f.handle.trim(), name: f.name.trim(), emoji: f.emoji, tz: TZ })); say('Welcome! Your ID is @' + Soc.acct.handle); Native.askNotify(); }
      catch (e) { f.err = netErr(e); } finally { f.busy = false; }
    }
    async function signin() {
      const key = f.key.trim(), m = /^([a-z][a-z0-9_.]{2,19}):[A-Za-z0-9_-]{40,64}$/.exec(key);
      if (!m) { f.err = 'That doesn\'t look like an Orbit login key'; return; }
      f.busy = true; f.err = '';
      try {
        Soc.acct = { handle: m[1], token: key, seen: 0 };
        await api('/me');
        await socStart({ handle: m[1], token: key });
        say('Signed in as @' + m[1]);
      } catch (e) { Soc.acct = null; saveSoc(); f.err = e.status === 401 ? 'That key doesn\'t work anymore' : netErr(e); } finally { f.busy = false; }
    }

    const q = ref(''), found = ref(null), searching = ref(false), missing = ref('');
    async function find() {
      const h = q.value.trim().replace(/^@/, '').toLowerCase();
      if (!h) return;
      searching.value = true; found.value = null; missing.value = '';
      try { found.value = await api('/find?h=' + encodeURIComponent(h)); }
      catch (e) { missing.value = e.status === 404 ? 'No one has the ID @' + h : netErr(e); } finally { searching.value = false; }
    }
    const busyH = ref('');
    async function act(path, h, msg) {
      busyH.value = h;
      try {
        const r = await api(path, path === '/connect' || path === '/cancel' ? { to: h } : { from: h });
        await refreshMe();
        if (found.value && found.value.handle === h) found.value = null, q.value = '';
        if (r.pair) { say('You\'re connected 🎉'); Soc.open = r.pair.id; nav.screen = 'pair'; } else if (msg) say(msg);
        Native.vibrate(15);
      } catch (e) { say(netErr(e)); } finally { busyH.value = ''; }
    }
    const inReqs = computed(() => (Soc.me ? Object.entries(Soc.me.inReq).map(([h, p]) => ({ ...p, handle: h })) : []));
    const outReqs = computed(() => (Soc.me ? Object.entries(Soc.me.outReq).map(([h, p]) => ({ ...p, handle: h })) : []));
    const list = computed(() => [...socPairs.value].map(p => ({ p, line: pairLine(p) }))
      .sort((a, b) => (b.line.hot + (b.p.unread > 0)) - (a.line.hot + (a.p.unread > 0)) || ((b.p.last || {}).at || 0) - ((a.p.last || {}).at || 0)));
    function open(p) { Soc.open = p.id; nav.screen = 'pair'; }

    const menu = ref(false), del = ref(false), prof = reactive({ name: '', emoji: '' });
    watch(menu, o => { if (o && Soc.me) { prof.name = Soc.me.name; prof.emoji = Soc.me.emoji; } });
    async function saveProfile() {
      try { await api('/me', { name: prof.name.trim(), emoji: prof.emoji }); await refreshMe(); menu.value = false; say('Profile updated'); } catch (e) { say(netErr(e)); }
    }
    async function deleteAccount() {
      try { await api('/me', null, 'DELETE'); del.value = false; menu.value = false; socSignOut('Your Orbit ID and conversations were deleted'); } catch (e) { say(netErr(e)); }
    }
    const notifOff = computed(() => !Native.has && !(PUSH_SUPPORTED && Rem.perm === 'granted' && Soc.me && Soc.me.push));
    onMounted(() => { if (Soc.acct) refreshMe(); });
    return { f, handleOk, signup, signin, q, found, searching, missing, find, busyH, act, inReqs, outReqs, list, open, menu, del, prof, saveProfile, deleteAccount, notifOff, AVATARS, shareText, socSignOut };
  },
  template: `<div class="view" style="--acc:var(--c-people)">
    <Head title="People" sub="Daily questions & chat"><button v-if="Soc.acct" class="icon-btn" @click="menu = true" aria-label="People settings"><Ic n="settings" :s="19"/></button></Head>

    <template v-if="!Soc.acct">
      <div class="card" style="text-align:center;padding:26px 18px">
        <div style="font-size:46px">💬</div>
        <h2 style="font-size:20px;font-weight:750;margin-top:8px">Closer, one question a day</h2>
        <p class="muted" style="margin-top:6px;font-size:14.5px">Connect with your partner, friends or family. Each day you both answer the same question, and you only see their answer after sending yours.</p>
        <template v-if="!f.keyMode">
          <span class="flabel" style="text-align:left">Pick your look</span>
          <div class="chips" style="justify-content:center"><button v-for="e in AVATARS" :key="e" class="chip av-pick" :class="{on: f.emoji === e}" @click="f.emoji = e">{{ e }}</button></div>
          <span class="flabel" style="text-align:left">Your name</span>
          <input class="field" v-model="f.name" placeholder="How friends see you" maxlength="40" enterkeyhint="next">
          <span class="flabel" style="text-align:left">Choose your ID</span>
          <label class="field row" style="text-align:left"><span class="muted" style="font-weight:700">@</span><input class="grow" v-model="f.handle" placeholder="e.g. ali.y" maxlength="21" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" @keydown.enter="handleOk && signup()" style="background:none;border:0;outline:none;font-size:16px;padding:0;min-width:0"></label>
          <div class="muted" style="font-size:12.5px;text-align:left;margin:6px 4px 0">Others find you by this ID. 3–20 letters, numbers, dots or underscores.</div>
          <div v-if="f.err" class="form-err">{{ f.err }}</div>
          <button class="btn primary block" style="margin-top:18px" :disabled="!handleOk || f.busy" @click="signup">{{ f.busy ? 'Creating…' : 'Create my ID' }}</button>
          <button class="link-btn" style="margin-top:12px" @click="f.keyMode = true; f.err = ''">Already have an ID? Sign in with your key</button>
        </template>
        <template v-else>
          <span class="flabel" style="text-align:left">Login key</span>
          <textarea class="field" v-model="f.key" placeholder="yourid:…" style="min-height:76px;font-family:monospace;font-size:13px" autocapitalize="none" spellcheck="false"></textarea>
          <div class="muted" style="font-size:12.5px;text-align:left;margin:6px 4px 0">Copy it from People → settings on your other phone.</div>
          <div v-if="f.err" class="form-err">{{ f.err }}</div>
          <button class="btn primary block" style="margin-top:18px" :disabled="!f.key.trim() || f.busy" @click="signin">{{ f.busy ? 'Signing in…' : 'Sign in' }}</button>
          <button class="link-btn" style="margin-top:12px" @click="f.keyMode = false; f.err = ''">Create a new ID instead</button>
        </template>
        <p class="muted" style="font-size:12px;margin-top:16px"><Ic n="lock" :s="12" style="vertical-align:-1px"/> Messages and answers are kept on the Orbit server so both of you can see them. Everything else in Orbit stays on this phone.</p>
      </div>
    </template>

    <template v-else-if="Soc.me">
      <div class="card me-card">
        <span class="av lg">{{ Soc.me.emoji }}</span>
        <div class="grow"><div style="font-weight:700;font-size:17px">{{ Soc.me.name }}</div><div class="muted" style="font-size:14px;font-weight:600">@{{ Soc.me.handle }}</div></div>
        <button class="btn sm" @click="shareText('Add me on Orbit: @' + Soc.me.handle, 'ID copied')"><Ic n="copy" :s="16"/>Share ID</button>
      </div>

      <button v-if="notifOff" class="card notice tap" @click="PUSH_SUPPORTED ? enablePush() : go('alerts')">
        <Ic n="bell" :s="18"/><span class="grow">Turn on notifications to hear about new messages and your daily question</span><Ic n="chevron-right" :s="16"/></button>

      <div class="card">
        <div class="sec" style="margin-bottom:10px"><h3><Ic n="user-plus" :s="17"/>Add someone</h3></div>
        <div class="search-row">
          <label class="field row grow"><span class="muted" style="font-weight:700">@</span><input class="grow" v-model="q" placeholder="Their ID" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="search" @keydown.enter="find" style="background:none;border:0;outline:none;font-size:16px;padding:0;min-width:0"></label>
          <button class="btn primary" style="height:50px;width:56px;padding:0" :disabled="!q.trim() || searching" @click="find" aria-label="Search"><Ic n="search" :s="19"/></button>
        </div>
        <div v-if="missing" class="muted" style="font-size:14px;margin:12px 4px 0">{{ missing }}</div>
        <div v-if="found" class="list-row" style="border:0;padding-bottom:0">
          <span class="av">{{ found.emoji }}</span>
          <div class="grow"><div class="t">{{ found.name }}</div><div class="s">@{{ found.handle }}</div></div>
          <span v-if="found.self" class="badge">That's you</span>
          <span v-else-if="found.connected" class="badge">Connected</span>
          <span v-else-if="Soc.me.outReq[found.handle]" class="badge">Requested</span>
          <button v-else class="btn sm primary" :disabled="busyH === found.handle" @click="act('/connect', found.handle, 'Request sent to ' + found.name)">{{ Soc.me.inReq[found.handle] ? 'Accept' : 'Connect' }}</button>
        </div>
      </div>

      <template v-if="inReqs.length">
        <div class="label">Requests</div>
        <div class="settings-group">
          <div v-for="r in inReqs" :key="r.handle" class="list-row">
            <span class="av">{{ r.emoji }}</span>
            <div class="grow"><div class="t">{{ r.name }}</div><div class="s">@{{ r.handle }} wants to connect</div></div>
            <button class="icon-btn plain" :disabled="busyH === r.handle" @click="act('/decline', r.handle, 'Request declined')" aria-label="Decline"><Ic n="x" :s="19"/></button>
            <button class="btn sm primary" :disabled="busyH === r.handle" @click="act('/accept', r.handle)">Accept</button>
          </div>
        </div>
      </template>

      <div class="label">Connections</div>
      <div v-if="list.length" class="settings-group">
        <button v-for="x in list" :key="x.p.id" class="list-row" style="width:100%;text-align:left" @click="open(x.p)">
          <span class="av">{{ x.p.with.emoji || '🙂' }}</span>
          <div class="grow"><div class="t">{{ whoName(x.p.with) }} <span v-if="x.p.type" class="rel-tag">{{ REL[x.p.type].e }} {{ REL[x.p.type].l }}</span></div>
            <div class="s" :class="{hot: x.line.hot}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ x.line.t }}</div></div>
          <span v-if="x.p.unread" class="badge unread">{{ x.p.unread }}</span>
          <span v-else-if="x.line.hot" class="dot" style="background:var(--c-people)"></span>
        </button>
      </div>
      <div v-else class="card"><Empty e="🫶" t="No connections yet" s="Share your ID or search for someone's ID above."/></div>

      <template v-if="outReqs.length">
        <div class="label">Sent</div>
        <div class="settings-group">
          <div v-for="r in outReqs" :key="r.handle" class="list-row">
            <span class="av">{{ r.emoji }}</span>
            <div class="grow"><div class="t">{{ r.name }}</div><div class="s">Waiting for @{{ r.handle }} to accept</div></div>
            <button class="btn sm" :disabled="busyH === r.handle" @click="act('/cancel', r.handle, 'Request cancelled')">Cancel</button>
          </div>
        </div>
      </template>
    </template>
    <div v-else class="card"><Empty e="⏳" t="Loading…" s="Connecting to Orbit"/></div>

    <Sheet :open="menu" title="Your profile" @close="menu = false">
      <div v-if="Soc.me" style="--acc:var(--c-people)">
        <div class="chips"><button v-for="e in AVATARS" :key="e" class="chip av-pick" :class="{on: prof.emoji === e}" @click="prof.emoji = e">{{ e }}</button></div>
        <span class="flabel">Name</span>
        <input class="field" v-model="prof.name" maxlength="40" enterkeyhint="done">
        <button class="btn primary block" style="margin-top:14px" :disabled="!prof.name.trim()" @click="saveProfile">Save</button>
        <div class="label">Your ID on another phone</div>
        <div class="settings-group" style="box-shadow:none">
          <button class="list-row" style="width:100%;text-align:left" @click="shareText(Soc.acct.token, 'Login key copied. Keep it private')">
            <span class="bubble" style="--c:var(--c-people)"><Ic n="key-round" :s="18"/></span>
            <div class="grow"><div class="t">Copy login key</div><div class="s">Anyone with this key can read your chats. Keep it private</div></div></button>
          <button class="list-row" style="width:100%;text-align:left" @click="menu = false; socSignOut('Signed out. Use your login key to sign back in')">
            <span class="bubble" style="--c:var(--muted)"><Ic n="log-out" :s="18"/></span>
            <div class="grow"><div class="t">Sign out on this phone</div><div class="s">Copy your login key first, or you can't get back in</div></div></button>
          <button class="list-row" style="width:100%;text-align:left" @click="del = true">
            <span class="bubble" style="--c:var(--c-danger)"><Ic n="trash-2" :s="18"/></span>
            <div class="grow"><div class="t" style="color:var(--c-danger)">Delete my ID</div><div class="s">Removes all your connections and conversations</div></div></button>
        </div>
      </div>
    </Sheet>
    <Sheet :open="del" title="Delete your ID?" @close="del = false">
      <p class="muted">Your connections, chats and answers will be deleted for everyone. This can't be undone.</p>
      <div class="btn-row"><button class="btn" @click="del = false">Cancel</button><button class="btn" style="background:var(--c-danger);color:#fff" @click="deleteAccount">Delete</button></div>
    </Sheet>
  </div>`,
};

/** The relationship picker: proposing a type needs the other person to accept it. */
const RelPick = {
  props: { p: Object },
  emits: ['done'],
  setup(props, { emit }) {
    const busy = ref('');
    async function pick(t) {
      busy.value = t;
      try {
        const r = await api('/p/' + props.p.id + '/type', { type: t });
        await loadPair(props.p.id);
        say(r.set ? 'You\'re now ' + REL[t].l + ' ' + REL[t].e : 'Sent. ' + whoName(props.p.with) + ' needs to accept');
        Native.vibrate(15); emit('done');
      } catch (e) { say(netErr(e)); } finally { busy.value = ''; }
    }
    return { busy, pick, TYPES: OrbitQuestions.TYPES };
  },
  template: `<div class="rel-grid">
    <button v-for="t in TYPES" :key="t.id" class="rel-btn" :class="{on: p.type === t.id, prop: p.proposal && p.proposal.type === t.id}" :disabled="!!busy" @click="pick(t.id)">
      <span>{{ t.e }}</span><b>{{ t.l }}</b></button>
  </div>`,
};

const PairView = {
  setup() {
    const id = Soc.open;
    const st = computed(() => Soc.chats[id]);
    const p = computed(() => pairOf(id) || st.value);
    const meH = computed(() => Soc.acct && Soc.acct.handle);
    const nm = computed(() => (p.value ? whoName(p.value.with) : ''));
    const tab = ref(null);
    const needsQ = c => !c.type || (c.proposal && c.proposal.by !== meH.value) || (c.today && c.today.day === c.todayKey && !c.today.mine);
    const cached = pairOf(id);
    if (cached) tab.value = needsQ(cached) ? 'q' : 'chat';
    loadPair(id).then(c => { if (c && !tab.value) tab.value = needsQ(c) ? 'q' : 'chat'; });

    // chat
    const draft = ref(''), box = ref(null);
    const toBottom = (smooth) => nextTick(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
    // the chat sticks to its newest message (as photos load, messages arrive or the keyboard opens)
    // unless the reader has scrolled up; then a button offers the way back, counting what's new
    const atBottom = ref(true), newCount = ref(0), chatEl = ref(null);
    const nearBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 140;
    let pinUntil = Date.now() + 900; // while the screen opens (its transition scrolls to the top), stay pinned to the end
    function onScroll() {
      if (tab.value !== 'chat') return;
      if (Date.now() < pinUntil) { atBottom.value = true; return; }
      atBottom.value = nearBottom(); if (atBottom.value) newCount.value = 0;
    }
    addEventListener('scroll', onScroll, { passive: true });
    let chatRo = null;
    watch(chatEl, el => {
      if (chatRo) chatRo.disconnect();
      if (el && window.ResizeObserver) { chatRo = new ResizeObserver(() => { if (atBottom.value || Date.now() < pinUntil) window.scrollTo(0, document.documentElement.scrollHeight); }); chatRo.observe(el); }
    });
    onBeforeUnmount(() => { removeEventListener('scroll', onScroll); if (chatRo) chatRo.disconnect(); });
    function latest() { atBottom.value = true; newCount.value = 0; toBottom(true); }
    watch(() => st.value && st.value.messages.length, (n, o) => {
      if (tab.value !== 'chat' || !o || n <= o) return;
      const last = st.value.messages[n - 1];
      if (atBottom.value || (last && last.by === meH.value)) latest(); else newCount.value += n - o;
      markRead(id);
    });
    watch(tab, t => { if (t === 'chat') { atBottom.value = true; pinUntil = Date.now() + 900; toBottom(false); markRead(id); } else window.scrollTo(0, 0); });
    const sel = ref(null), replyTo = ref(null), flash = ref(null), pending = ref(null), viewer = ref(null), comp = ref(null);
    const editing = ref(null), delAsk = ref(null);
    function startEdit(m) {
      editing.value = m; replyTo.value = null; pending.value = null; sel.value = null;
      draft.value = m.text || '';
      nextTick(() => { if (box.value) { box.value.focus(); grow({ target: box.value }); } });
    }
    function cancelEdit() { editing.value = null; draft.value = ''; if (box.value) box.value.style.height = ''; }
    function askDelete(m) { sel.value = null; delAsk.value = m; }
    function confirmDelete() { const m = delAsk.value; delAsk.value = null; if (m) deleteMsg(id, m); }
    function send() {
      if (editing.value) {
        const m = editing.value, t = draft.value.trim();
        if (!t && !m.media) return;
        if (t !== m.text) editMsg(id, m, t);
        cancelEdit(); Native.vibrate(8); return;
      }
      const t = draft.value; if (!t.trim() && !pending.value) return;
      draft.value = ''; sendMsg(id, t, replyTo.value, pending.value); replyTo.value = null; pending.value = null; Native.vibrate(8);
      if (box.value) box.value.style.height = '';
    }
    async function attach() {
      const ph = await pickPhoto();
      if (ph) { pending.value = { ...ph, url: URL.createObjectURL(ph.blob) }; toBottom(true); }
    }
    // tap a message for reactions and reply; long-press does the same on photos (a tap opens the photo)
    let pressT = null, pressed = false;
    function pressStart(m) {
      pressed = false; clearTimeout(pressT);
      pressT = setTimeout(() => { if (m.s && !m.deleted) { pressed = true; sel.value = m.s; Native.vibrate(15); } }, 450);
    }
    const pressEnd = () => clearTimeout(pressT);
    function tapMsg(m) {
      if (pressed) { pressed = false; return; }
      if (m.failed) return retryMsg(id, m);
      if (!m.s || m.deleted) return;
      sel.value = sel.value === m.s ? null : m.s;
    }
    const srcOf = m => (m.media ? m.media.local || (Photos[m.media.fid] && !['loading', 'error'].includes(Photos[m.media.fid]) ? Photos[m.media.fid] : null) : null);
    function openPhoto(m) {
      if (pressed) { pressed = false; return; }
      const src = srcOf(m); if (src) viewer.value = src;
    }
    const closeViewer = () => { viewer.value = null; };
    watch(viewer, v => (v ? pushBack(closeViewer) : popBack(closeViewer)));
    watchEffect(() => { for (const m of (st.value ? st.value.messages : [])) if (m.media && m.media.fid && !m.media.local) loadPhoto(id, m.media.fid); });
    function bgTap(e) { if (sel.value != null && !e.target.closest('.msg, .msg-tools')) sel.value = null; }
    // keep the last messages visible above the box (its height changes with replies and photos)
    let ro = null;
    watch(comp, el => {
      if (ro) ro.disconnect();
      if (el && window.ResizeObserver) { ro = new ResizeObserver(() => document.documentElement.style.setProperty('--composer-h', el.offsetHeight + 'px')); ro.observe(el); }
    });
    onBeforeUnmount(() => { if (ro) ro.disconnect(); popBack(closeViewer); });
    const onFocus = () => setTimeout(() => toBottom(true), 350); // after the keyboard has opened
    function reply(m) { replyTo.value = m; sel.value = null; nextTick(() => box.value && box.value.focus()); }
    function react(m, e) { reactMsg(id, m, e); sel.value = null; }
    function copyMsg(m) { sel.value = null; try { navigator.clipboard.writeText(m.text).then(() => say('Copied')); } catch (e) {} }
    function jump(s) {
      const el = document.getElementById('msg' + s);
      if (!el) return say('That message is further back');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash.value = s; setTimeout(() => { if (flash.value === s) flash.value = null; }, 1400);
    }
    const rxList = m => Object.entries(m.rx || {}).map(([h, e]) => ({ h, e, mine: h === meH.value }));
    function grow(e) { const el = e.target; el.style.height = ''; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; }
    const rows = computed(() => {
      const out = []; let lastDay = '';
      for (const m of (st.value ? st.value.messages : [])) {
        const k = keyOf(new Date(m.at));
        if (k !== lastDay) { out.push({ sep: rel(k) === 'Today' ? 'Today' : gFull(k), key: 'sep' + k }); lastDay = k; }
        out.push({ m, key: m.s ? 's' + m.s : 'c' + m.cid });
      }
      return out;
    });
    const older = ref(false), noMore = ref(false);
    async function loadOlder() {
      const c = st.value, first = c && c.messages.find(m => m.s);
      if (!first) return;
      older.value = true;
      try {
        const more = await api('/p/' + id + '/messages?before=' + first.s);
        if (more.length < 60) noMore.value = true;
        const fromEnd = document.documentElement.scrollHeight - window.scrollY; // keep the reader's place
        c.messages.unshift(...more.filter(m => !c.messages.some(x => x.s === m.s)));
        nextTick(() => window.scrollTo(0, document.documentElement.scrollHeight - fromEnd));
      } catch (e) { say(netErr(e)); } finally { older.value = false; }
    }

    // daily question
    const drafts = reactive({}), sending = ref('');
    async function answer(d) {
      const text = (drafts[d.day] || '').trim();
      if (!text) return;
      sending.value = d.day;
      try {
        const r = await api('/p/' + id + '/answer', { day: d.day, text });
        const days = st.value.days, i = days.findIndex(x => x.day === d.day);
        if (i >= 0) days.splice(i, 1, r.day);
        delete drafts[d.day];
        say(r.day.theirs ? 'Here\'s what ' + nm.value + ' said 💌' : 'Sent! You\'ll see ' + nm.value + '\'s answer when they reply');
        Native.vibrate(20);
        refreshMe();
      } catch (e) { say(netErr(e)); } finally { sending.value = ''; }
    }
    const today = computed(() => { const c = st.value; return c && c.days[0] && c.days[0].day === c.todayKey ? c.days[0] : null; });
    const past = computed(() => (st.value ? st.value.days.filter(d => d !== today.value) : []));
    async function decline() { try { await api('/p/' + id + '/decline', {}); await loadPair(id); } catch (e) { say(netErr(e)); } }
    async function accept() {
      const t = p.value.proposal.type;
      try { await api('/p/' + id + '/type', { type: t }); await loadPair(id); say('You\'re now ' + REL[t].l + ' ' + REL[t].e); Native.vibrate(20); } catch (e) { say(netErr(e)); }
    }
    const relOpen = ref(false), leaveAsk = ref(false);
    async function setTime(t) {
      try { await api('/p/' + id + '/time', { time: t, tz: TZ }); await loadPair(id); say('Daily question at ' + t + ' for both of you'); } catch (e) { say(netErr(e)); }
    }
    async function leave() {
      try { await api('/p/' + id + '/leave', {}); leaveAsk.value = false; delete Soc.chats[id]; await refreshMe(); nav.screen = 'people'; say('Connection removed'); } catch (e) { say(netErr(e)); }
    }
    const tzNote = computed(() => (p.value && p.value.tz !== TZ ? ' (' + p.value.tz + ')' : ''));
    return { atBottom, newCount, chatEl, latest, editing, delAsk, startEdit, cancelEdit, askDelete, confirmDelete, pending, viewer, comp, attach, pressStart, pressEnd, srcOf, openPhoto, bgTap, onFocus, canPhoto, Photos, sel, replyTo, flash, tapMsg, reply, react, copyMsg, jump, rxList, REACTS, st, p, meH, nm, tab, draft, box, send, grow, rows, older, noMore, loadOlder, drafts, sending, answer, today, past, decline, accept, relOpen, leaveAsk, setTime, leave, tzNote, retryMsg, id };
  },
  template: `<div class="view pair-view" :class="{chatting: tab === 'chat'}" style="--acc:var(--c-people)" @click="bgTap">
    <header class="top sm">
      <button class="icon-btn" @click="nav.screen = 'people'" aria-label="Back"><Ic n="chevron-left" :s="22"/></button>
      <span v-if="p" class="av">{{ p.with.emoji || '🙂' }}</span>
      <div class="grow" v-if="p"><h1 style="font-size:20px">{{ nm }}</h1><div class="sub" style="margin-top:1px">{{ p.type ? REL[p.type].e + ' ' + REL[p.type].l : '@' + p.with.handle }}</div></div>
      <button v-if="p" class="icon-btn" @click="relOpen = true" aria-label="Connection settings"><Ic n="settings" :s="19"/></button>
    </header>
    <template v-if="st && p">
      <div class="seg pair-tabs"><button :class="{on: tab === 'q'}" @click="tab = 'q'"><Ic n="heart" :s="15"/>Daily question<span v-if="today && !today.mine" class="dot" style="background:var(--c-people)"></span></button>
        <button :class="{on: tab === 'chat'}" @click="tab = 'chat'"><Ic n="messages-square" :s="15"/>Chat<span v-if="p.unread" class="badge">{{ p.unread }}</span></button></div>

      <template v-if="tab === 'q'">
        <div v-if="p.proposal && p.proposal.by !== meH" class="card q-card" style="margin-top:12px">
          <div style="font-size:34px">{{ REL[p.proposal.type].e }}</div>
          <h3>{{ nm }} says you are {{ REL[p.proposal.type].l }}</h3>
          <p class="muted">Accept and you'll both get a question every day that fits your relationship.</p>
          <div class="btn-row"><button class="btn" @click="decline">Not now</button><button class="btn primary" @click="accept">Accept</button></div>
          <button class="link-btn" style="margin-top:10px" @click="relOpen = true">Choose something else</button>
        </div>
        <div v-else-if="!p.type" class="card q-card" style="margin-top:12px">
          <h3>What are you to each other?</h3>
          <p class="muted" v-if="!p.proposal">Pick one. When {{ nm }} accepts, your first question arrives right away, then a new one every day.</p>
          <p class="muted" v-else>Waiting for {{ nm }} to accept <b>{{ REL[p.proposal.type].l }} {{ REL[p.proposal.type].e }}</b>. You can pick something else.</p>
          <RelPick :p="p" style="margin-top:14px"/>
          <button v-if="p.proposal" class="link-btn" style="margin-top:10px" @click="decline">Withdraw</button>
        </div>

        <template v-if="p.type">
          <div v-if="today" class="card q-card today" style="margin-top:12px">
            <div class="q-head"><span>💬 Today's question</span><span class="muted">{{ p.time }}{{ tzNote }}</span></div>
            <h2 class="q-text">{{ today.q }}</h2>
            <template v-if="!today.mine">
              <textarea class="field" v-model="drafts[today.day]" placeholder="Your answer…" maxlength="2000" style="margin-top:14px"></textarea>
              <div class="q-status"><Ic :n="today.theyAnswered ? 'check' : 'lock'" :s="14"/>{{ today.theyAnswered ? nm + ' has answered. Send yours to see it' : 'You\\'ll see ' + nm + '\\'s answer after you send yours' }}</div>
              <button class="btn primary block" style="margin-top:12px" :disabled="!(drafts[today.day] || '').trim() || sending === today.day" @click="answer(today)"><Ic n="send" :s="17"/>Send answer</button>
            </template>
            <div v-else class="answers">
              <div class="ans mine"><small>You</small>{{ today.mine }}</div>
              <div v-if="today.theirs" class="ans theirs"><small>{{ nm }}</small>{{ today.theirs }}</div>
              <div v-else class="ans waiting"><Ic n="hourglass" :s="15"/>Waiting for {{ nm }}'s answer</div>
            </div>
          </div>
          <div v-else class="card q-card" style="margin-top:12px">
            <h3>Next question at {{ p.time }}{{ tzNote }}</h3>
            <p class="muted">You'll both get a notification. Change the time in settings ⚙️</p>
          </div>

          <template v-if="past.length">
            <div class="label">Earlier</div>
            <div v-for="d in past" :key="d.day" class="card q-card past">
              <div class="q-head"><span>{{ rel(d.day) }}</span></div>
              <div class="q-text sm">{{ d.q }}</div>
              <template v-if="!d.mine">
                <textarea class="field" v-model="drafts[d.day]" placeholder="Answer it now…" maxlength="2000" style="margin-top:10px;min-height:64px"></textarea>
                <button class="btn sm primary" style="margin-top:8px" :disabled="!(drafts[d.day] || '').trim() || sending === d.day" @click="answer(d)">Send{{ d.theyAnswered ? ' & see theirs' : '' }}</button>
              </template>
              <div v-else class="answers">
                <div class="ans mine"><small>You</small>{{ d.mine }}</div>
                <div v-if="d.theirs" class="ans theirs"><small>{{ nm }}</small>{{ d.theirs }}</div>
                <div v-else class="ans waiting">{{ nm }} hasn't answered</div>
              </div>
            </div>
          </template>
        </template>
      </template>

      <template v-else>
        <div class="chat" ref="chatEl">
          <button v-if="st.messages.length >= 60 && !noMore" class="link-btn" style="display:block;margin:6px auto" :disabled="older" @click="loadOlder">{{ older ? 'Loading…' : 'Load earlier messages' }}</button>
          <div v-if="!st.messages.length" class="muted" style="text-align:center;padding:40px 10px">Say hi to {{ nm }} 👋</div>
          <template v-for="r in rows" :key="r.key">
            <div v-if="r.sep" class="chat-sep">{{ r.sep }}</div>
            <template v-else>
            <div class="msg" :id="r.m.s ? 'msg' + r.m.s : null" :class="{me: r.m.by === meH, failed: r.m.failed, picked: sel === r.m.s, flash: flash === r.m.s, reacted: r.m.rx && !r.m.deleted, photo: r.m.media && !r.m.deleted, deleted: r.m.deleted, editing: editing === r.m}"
              @click="tapMsg(r.m)" @pointerdown="pressStart(r.m)" @pointerup="pressEnd" @pointerleave="pressEnd" @pointercancel="pressEnd" @contextmenu.prevent>
              <template v-if="r.m.deleted"><div class="txt gone"><Ic n="x" :s="13"/>Message deleted</div><div class="meta">{{ hm(r.m.at) }}</div></template>
              <template v-else>
              <div v-if="r.m.rq" class="quote" @click.stop="jump(r.m.re)"><b>{{ r.m.rq.by === meH ? 'You' : nm }}</b><span>{{ r.m.rq.text }}</span></div>
              <button v-if="r.m.media" class="pic" :style="{aspectRatio: (r.m.media.width || 4) + ' / ' + (r.m.media.height || 3)}" @click.stop="openPhoto(r.m)" aria-label="Open photo">
                <img v-if="srcOf(r.m)" :src="srcOf(r.m)" alt="" draggable="false">
                <span v-else class="pic-wait"><Ic :n="Photos[r.m.media.fid] === 'error' ? 'circle-alert' : 'image'" :s="24"/></span>
                <span v-if="r.m.pending" class="pic-up"><Ic n="clock" :s="16"/></span></button>
              <div v-if="r.m.text" class="txt">{{ r.m.text }}</div>
              <div class="meta">{{ r.m.failed ? 'Not sent · tap to retry' : (r.m.edited ? 'edited · ' : '') + hm(r.m.at) }}
                <template v-if="r.m.by === meH && !r.m.failed"><Ic v-if="r.m.pending" n="clock" :s="12"/><Ic v-else :n="st.theirRead >= r.m.s ? 'check-check' : 'check'" :s="13" :class="{seen: st.theirRead >= r.m.s}"/></template></div>
              <div v-if="r.m.rx" class="rx" @click.stop="sel = r.m.s"><span v-for="x in rxList(r.m)" :key="x.h" :class="{mine: x.mine}">{{ x.e }}</span></div>
              </template>
            </div>
            <div v-if="sel === r.m.s" class="msg-tools" :class="{me: r.m.by === meH}">
              <button v-for="e in REACTS" :key="e" class="rx-btn" :class="{on: r.m.rx && r.m.rx[meH] === e}" @click="react(r.m, e)">{{ e }}</button>
              <span class="sep"></span>
              <button class="tool" @click="reply(r.m)" aria-label="Reply"><Ic n="reply" :s="17"/></button>
              <button v-if="r.m.text" class="tool" @click="copyMsg(r.m)" aria-label="Copy"><Ic n="copy" :s="16"/></button>
              <template v-if="r.m.by === meH">
                <button class="tool" @click="startEdit(r.m)" aria-label="Edit"><Ic n="pencil" :s="16"/></button>
                <button class="tool danger" @click="askDelete(r.m)" aria-label="Delete"><Ic n="trash-2" :s="16"/></button>
              </template>
            </div>
            </template>
          </template>
        </div>
        <Transition name="fade"><button v-if="!atBottom && st.messages.length" class="jump-latest" @click="latest" aria-label="Go to the latest message">
          <Ic n="chevron-down" :s="22"/><span v-if="newCount" class="badge unread">{{ newCount }}</span></button></Transition>
        <div class="composer" ref="comp">
          <div v-if="editing" class="reply-bar"><Ic n="pencil" :s="15"/><div class="grow"><b>Editing</b><span>{{ editing.text || '📷 Photo caption' }}</span></div>
            <button @pointerdown.prevent @mousedown.prevent @click="cancelEdit" aria-label="Cancel editing"><Ic n="x" :s="16"/></button></div>
          <div v-if="replyTo" class="reply-bar"><Ic n="reply" :s="15"/><div class="grow"><b>{{ replyTo.by === meH ? 'You' : nm }}</b><span>{{ replyTo.text || '📷 Photo' }}</span></div>
            <button @pointerdown.prevent @mousedown.prevent @click="replyTo = null" aria-label="Cancel reply"><Ic n="x" :s="16"/></button></div>
          <div v-if="pending" class="attach-bar"><img :src="pending.url" alt=""><span class="grow">Photo ready · add a caption or send</span>
            <button @pointerdown.prevent @mousedown.prevent @click="pending = null" aria-label="Remove photo"><Ic n="x" :s="16"/></button></div>
          <button v-if="canPhoto && !editing" class="attach" @pointerdown.prevent @mousedown.prevent @click="attach" aria-label="Add a photo"><Ic n="image" :s="21"/></button>
          <textarea ref="box" v-model="draft" rows="1" :placeholder="pending ? 'Add a caption…' : 'Message'" maxlength="2000" @input="grow" @focus="onFocus" @keydown.enter.exact="!IOS && !Native.has && ($event.preventDefault(), send())"></textarea>
          <button class="send" :disabled="editing ? !draft.trim() && !editing.media : !draft.trim() && !pending" @pointerdown.prevent @mousedown.prevent @click="send" :aria-label="editing ? 'Save' : 'Send'"><Ic :n="editing ? 'check' : 'send'" :s="19"/></button>
        </div>
        <Teleport to="body"><Transition name="fade"><div v-if="viewer" class="viewer" @click="viewer = null"><img :src="viewer" alt=""><button class="close" aria-label="Close"><Ic n="x" :s="22"/></button></div></Transition></Teleport>
      </template>
    </template>
    <div v-else class="card" style="margin-top:12px"><Empty e="⏳" t="Loading…" s=""/></div>

    <Sheet :open="relOpen" title="Connection" @close="relOpen = false">
      <div v-if="p" style="--acc:var(--c-people)">
        <span class="flabel" style="margin-top:2px">What are you to each other?</span>
        <RelPick :p="p" @done="relOpen = false"/>
        <div class="muted" style="font-size:12.5px;margin:8px 2px 0">{{ p.proposal ? (p.proposal.by === meH ? 'Waiting for ' + nm + ' to accept ' + REL[p.proposal.type].l : nm + ' suggested ' + REL[p.proposal.type].l) : 'Changes need ' + nm + ' to accept.' }}</div>
        <div class="settings-group" style="box-shadow:none;margin-top:16px">
          <div class="list-row"><div class="grow"><div class="t">Daily question time</div><div class="s">The same for both of you{{ tzNote }}</div></div>
            <label class="chip on time-chip"><Ic n="clock" :s="15"/>{{ p.time }}<input type="time" :value="p.time" @change="setTime($event.target.value)"></label></div>
        </div>
        <button class="btn danger block" style="margin-top:18px" @click="leaveAsk = true">Remove {{ nm }}</button>
      </div>
    </Sheet>
    <Sheet :open="!!delAsk" title="Delete message?" @close="delAsk = null">
      <p class="muted">It will be removed for both of you{{ delAsk && delAsk.media ? ', photo included' : '' }}.</p>
      <div class="btn-row"><button class="btn" @click="delAsk = null">Cancel</button><button class="btn" style="background:var(--c-danger);color:#fff" @click="confirmDelete">Delete</button></div>
    </Sheet>
    <Sheet :open="leaveAsk" title="Remove connection?" @close="leaveAsk = false">
      <p class="muted">Your chat and all your answers with {{ nm }} will be deleted for both of you.</p>
      <div class="btn-row"><button class="btn" @click="leaveAsk = false">Cancel</button><button class="btn" style="background:var(--c-danger);color:#fff" @click="leave">Remove</button></div>
    </Sheet>
  </div>`,
};

const NotificationsView = {
  setup() {
    const ICON = { tasks: ['circle-check', 'var(--c-tasks)'], water: ['droplet', 'var(--c-water)'], focus: ['timer', 'var(--c-focus)'], cycle: ['flower-2', 'var(--c-cycle)'], reminders: ['bell', 'var(--c-mood)'] };
    const upcoming = computed(() => {
      R.now;
      const rem = S.reminders.filter(r => r.on !== false).flatMap(r => remNext(r).map(at => ({ id: r.id + at, at, ch: r.water ? 'water' : 'reminders', title: r.emoji + ' ' + r.title })));
      return [...plan.value, ...rem].sort((a, b) => a.at - b.at).slice(0, 6);
    });
    const whenLabel = ms => (isToday(ms) ? 'Today' : rel(keyOf(new Date(ms)))) + ' · ' + hm(ms);
    const status = computed(() => {
      if (Native.has) return Rem.androidOn ? 'on' : 'blocked';
      if (!PUSH_SUPPORTED) return IOS && !STANDALONE ? 'install' : 'unsupported';
      if (Rem.perm === 'denied') return 'denied';
      if (!Rem.push.token) return 'off';
      return Rem.state === 'error' ? 'error' : 'on';
    });
    return { upcoming, whenLabel, status, ICON, everyLabel, hm };
  },
  template: `<div class="view" style="--acc:var(--c-tasks)">
    <Head title="Notifications" :sub="Native.has ? 'Delivered by this phone, even offline' : 'Delivered by Orbit\\'s push server'"/>

    <div class="card status-card" :class="status">
      <template v-if="status === 'on'">
        <div class="row"><span class="bubble" style="--c:var(--c-habits)"><Ic n="bell" :s="19"/></span>
          <div class="grow"><b>Notifications are on</b><div class="s">{{ Native.has ? 'Exact alarms, even when Orbit is closed' : (Rem.last ? 'Synced ' + ago(Rem.last).toLowerCase() : 'Connected') }}</div></div></div>
        <div class="btn-row" style="margin-top:14px"><button class="btn sm" :disabled="Rem.busy" @click="testNotify"><Ic n="sparkles" :s="16"/>Send a test</button>
          <button v-if="!Native.has" class="btn sm" :disabled="Rem.busy" @click="disablePush">Turn off</button></div>
      </template>
      <template v-else-if="status === 'blocked'">
        <div class="row"><span class="bubble" style="--c:var(--c-focus)"><Ic n="bell" :s="19"/></span>
          <div class="grow"><b>Notifications are blocked</b><div class="s">Allow them so reminders can reach you</div></div></div>
        <button class="btn primary block" style="margin-top:14px" @click="askAndroidNotify">Allow notifications</button>
      </template>
      <template v-else-if="status === 'off'">
        <div class="row"><span class="bubble" style="--c:var(--c-tasks)"><Ic n="bell" :s="19"/></span>
          <div class="grow"><b>Turn on notifications</b><div class="s">Get task, water, focus and cycle reminders on this iPhone</div></div></div>
        <button class="btn primary block" style="margin-top:14px" :disabled="Rem.busy" @click="enablePush">{{ Rem.busy ? 'Connecting…' : 'Turn on notifications' }}</button>
        <p class="fine">🔒 Reminder texts are encrypted on this phone. The server only knows when to ping you, never what about.</p>
      </template>
      <template v-else-if="status === 'error'">
        <div class="row"><span class="bubble" style="--c:var(--c-mood)"><Ic n="rotate-ccw" :s="19"/></span>
          <div class="grow"><b>Can't reach the reminder server</b><div class="s">Reminders you already set will still arrive. Changes will sync when you're back online.</div></div></div>
        <button class="btn sm" style="margin-top:14px" @click="scheduleSync(0)">Retry now</button>
      </template>
      <template v-else-if="status === 'denied'">
        <div class="row"><span class="bubble" style="--c:var(--c-focus)"><Ic n="bell" :s="19"/></span>
          <div class="grow"><b>Notifications are blocked</b><div class="s">Open iPhone Settings → Notifications → Orbit and turn on Allow Notifications</div></div></div>
      </template>
      <template v-else-if="status === 'install'">
        <div class="row"><span class="bubble" style="--c:var(--c-water)"><Ic n="download" :s="19"/></span>
          <div class="grow"><b>Add Orbit to your Home Screen first</b><div class="s">iPhone only allows notifications for installed apps. In Safari tap Share, then Add to Home Screen, then open Orbit from there.</div></div></div>
      </template>
      <template v-else>
        <div class="row"><span class="bubble" style="--c:var(--muted)"><Ic n="bell" :s="19"/></span>
          <div class="grow"><b>Not available here</b><div class="s">This browser can't receive notifications. Use Safari on iPhone (installed to Home Screen) or the Android app.</div></div></div>
      </template>
    </div>

    <div class="label">Personal reminders</div>
    <div class="settings-group">
      <button class="list-row" style="width:100%;text-align:left" @click="go('reminders')">
        <span class="bubble" style="--c:var(--c-mood)"><Ic n="bell" :s="18"/></span>
        <div class="grow"><div class="t">Reminders</div><div class="s">{{ S.reminders.length ? S.reminders.filter(r => r.on !== false).length + ' active · water, medicine, anything you set' : 'Water, medicine, stretching, bills…' }}</div></div>
        <Ic n="chevron-right" :s="18" class="muted"/></button>
    </div>

    <div class="label">Other reminders</div>
    <div class="settings-group">
      <div class="list-row"><span class="bubble" style="--c:var(--c-tasks)"><Ic n="circle-check" :s="18"/></span>
        <div class="grow"><div class="t">Task reminders</div><div class="s">At the time you set on each task</div></div><Toggle v-model="S.settings.notify.tasks"/></div>
      <div class="list-row"><span class="bubble" style="--c:var(--c-focus)"><Ic n="timer" :s="18"/></span>
        <div class="grow"><div class="t">Focus timer</div><div class="s">When a session or break ends</div></div><Toggle v-model="S.settings.notify.focus"/></div>
      <div class="list-row"><span class="bubble" style="--c:var(--c-cycle)"><Ic n="flower-2" :s="18"/></span>
        <div class="grow"><div class="t">Cycle</div><div class="s">{{ cyc.has ? '2 days before and on the expected day' : 'Set up the cycle tracker first' }}</div></div><Toggle v-model="S.settings.cycle.notify"/></div>
    </div>

    <div class="label">Coming up</div>
    <div class="settings-group">
      <div v-for="u in upcoming" :key="u.id" class="list-row">
        <span class="bubble" :style="{'--c': ICON[u.ch][1]}"><Ic :n="ICON[u.ch][0]" :s="17"/></span>
        <div class="grow" style="min-width:0"><div class="t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ u.title.replace(/^\\W+\\s/, '') }}</div><div class="s">{{ whenLabel(u.at) }}</div></div>
      </div>
      <div v-if="!upcoming.length" class="list-row"><div class="grow muted" style="font-size:14px">Nothing scheduled. Add a reminder to a task or turn on water reminders.</div></div>
    </div>
  </div>`,
};

/* ---------- charts ---------- */
const Bars = {
  props: { items: Array, h: { default: 130 }, c: { default: 'var(--c-money)' }, avg: Number, fmtv: Function },
  computed: { max() { return Math.max(1, ...this.items.map(i => Math.max(i.v || 0, i.v2 || 0)), this.avg || 0); } },
  template: `<div class="bars" :style="{height: h + 'px'}">
    <div v-if="avg" class="bars-avg" :style="{bottom: (avg / max * (h - 34) + 20) + 'px'}"><span>avg {{ fmtv ? fmtv(avg) : avg }}</span></div>
    <div v-for="(it, i) in items" :key="i" class="bar-col" :class="{hl: it.hl}">
      <span class="bv">{{ it.v && it.show ? (fmtv ? fmtv(it.v) : it.v) : '' }}</span>
      <div class="bar-pair">
        <i v-if="it.v2 != null" class="b2" :style="{height: (it.v2 / max * (h - 34)) + 'px'}"></i>
        <i :style="{height: Math.max(it.v ? 3 : 0, it.v / max * (h - 34)) + 'px', background: it.c || c}"></i>
      </div>
      <small>{{ it.l }}</small>
    </div>
  </div>`,
};
const Donut = {
  props: { parts: Array, size: { default: 150 }, sw: { default: 20 } },
  computed: {
    r() { return (this.size - this.sw) / 2; },
    C() { return 2 * Math.PI * this.r; },
    segs() {
      const tot = this.parts.reduce((s, p) => s + p.v, 0) || 1; let acc = 0;
      return this.parts.map(p => { const len = p.v / tot * this.C; const seg = { c: p.c, len: Math.max(0, len - 2), off: -acc }; acc += len; return seg; });
    },
  },
  template: `<div class="ring" :style="{width: size + 'px', height: size + 'px'}">
    <svg :width="size" :height="size" :viewBox="'0 0 ' + size + ' ' + size" :style="{transform: 'rotate(-90deg)'}">
      <circle :cx="size/2" :cy="size/2" :r="r" fill="none" :stroke-width="sw" class="ring-track"/>
      <circle v-for="(s, i) in segs" :key="i" :cx="size/2" :cy="size/2" :r="r" fill="none" :stroke="s.c" :stroke-width="sw"
        :stroke-dasharray="s.len + ' ' + C" :stroke-dashoffset="s.off" class="ring-bar"/>
    </svg>
    <div class="ring-in"><slot/></div>
  </div>`,
};

const ReportsView = {
  setup() {
    const mode = ref('month');
    const ym = ref({ y: curJ.value.y, m: curJ.value.m });
    const shift = n => { ym.value = mode.value === 'month' ? jShift(ym.value.y, ym.value.m, n) : { y: ym.value.y + n, m: ym.value.m }; };
    const isCur = computed(() => (mode.value === 'month' ? ym.value.y === curJ.value.y && ym.value.m === curJ.value.m : ym.value.y === curJ.value.y));
    const inPeriod = (t, y, m) => { const j = jal(t.date); return j.y === y && (mode.value === 'year' || j.m === m); };
    const txs = computed(() => S.money.filter(t => inPeriod(t, ym.value.y, ym.value.m)));
    const prevYm = computed(() => (mode.value === 'month' ? jShift(ym.value.y, ym.value.m, -1) : { y: ym.value.y - 1, m: 1 }));
    const prevTx = computed(() => S.money.filter(t => inPeriod(t, prevYm.value.y, prevYm.value.m)));
    const sum = (list, type) => list.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
    const out = computed(() => txs.value.filter(t => t.type === 'out'));
    const spent = computed(() => sum(txs.value, 'out'));
    const income = computed(() => sum(txs.value, 'in'));
    const prevSpent = computed(() => sum(prevTx.value, 'out'));
    const change = computed(() => (prevSpent.value ? (spent.value - prevSpent.value) / prevSpent.value : null));
    const keys = computed(() => (mode.value === 'month' ? jMonthKeys(ym.value.y, ym.value.m) : null));
    const daysElapsed = computed(() => {
      if (mode.value === 'month') { const k = keys.value; if (!isCur.value) return k.length; return Math.max(1, k.indexOf(R.today) + 1); }
      const first = jToKey(ym.value.y, 1, 1);
      return isCur.value ? diffDays(first, R.today) + 1 : diffDays(first, jToKey(ym.value.y + 1, 1, 1));
    });
    const perDay = computed(() => spent.value / daysElapsed.value);
    const savedRate = computed(() => (income.value ? (income.value - spent.value) / income.value : null));

    // budget pace (current month only)
    const pace = computed(() => {
      const b = S.settings.budget;
      if (mode.value !== 'month' || !b || !isCur.value) return null;
      const total = keys.value.length, proj = perDay.value * total;
      return { b, proj, over: proj - b, safe: Math.max(0, (b - spent.value) / Math.max(1, total - daysElapsed.value + 1)), pct: spent.value / b, timePct: daysElapsed.value / total };
    });

    const trend = computed(() => {
      if (mode.value === 'month') {
        return keys.value.map((k, i) => {
          const v = out.value.filter(t => t.date === k).reduce((s, t) => s + t.amount, 0);
          return { l: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '', v, hl: k === R.today };
        });
      }
      return Array.from({ length: 12 }, (_, i) => {
        const v = out.value.filter(t => jal(t.date).m === i + 1).reduce((s, t) => s + t.amount, 0);
        return { l: JM[i].slice(0, 3), v, hl: isCur.value && i + 1 === curJ.value.m, show: true };
      });
    });
    const months6 = computed(() => Array.from({ length: 6 }, (_, i) => {
      const { y, m } = jShift(ym.value.y, mode.value === 'month' ? ym.value.m : 12, i - 5);
      const list = S.money.filter(t => { const j = jal(t.date); return j.y === y && j.m === m; });
      return { l: JM[m - 1].slice(0, 3), v: sum(list, 'out'), v2: sum(list, 'in'), hl: y === ym.value.y && m === ym.value.m };
    }));

    const cats = computed(() => {
      const cur = {}, prev = {};
      out.value.forEach(t => { cur[t.cat] = (cur[t.cat] || 0) + t.amount; });
      prevTx.value.filter(t => t.type === 'out').forEach(t => { prev[t.cat] = (prev[t.cat] || 0) + t.amount; });
      return Object.entries(cur).map(([id, v]) => ({ ...catOf(id), id, v, p: spent.value ? v / spent.value : 0, n: out.value.filter(t => t.cat === id).length,
        ch: prev[id] ? (v - prev[id]) / prev[id] : null })).sort((a, b) => b.v - a.v);
    });
    const weekday = computed(() => {
      const order = [6, 0, 1, 2, 3, 4, 5], tot = {}, cnt = {};
      // average per weekday: total spent on that weekday / how many of those weekdays passed in the period
      const ks = mode.value === 'month' ? keys.value.slice(0, daysElapsed.value) : Array.from({ length: daysElapsed.value }, (_, i) => addDays(jToKey(ym.value.y, 1, 1), i));
      ks.forEach(k => { const w = parseKey(k).getDay(); cnt[w] = (cnt[w] || 0) + 1; });
      out.value.forEach(t => { const w = parseKey(t.date).getDay(); tot[w] = (tot[w] || 0) + t.amount; });
      const items = order.map(w => ({ l: WK[order.indexOf(w)], v: cnt[w] ? (tot[w] || 0) / cnt[w] : 0 }));
      const top = items.reduce((a, b) => (b.v > a.v ? b : a), items[0]);
      items.forEach(i => { i.hl = i === top && i.v > 0; });
      return items;
    });
    const timeOfDay = computed(() => {
      const slots = [{ l: 'Morning', e: '🌅', r: [5, 12] }, { l: 'Afternoon', e: '☀️', r: [12, 17] }, { l: 'Evening', e: '🌆', r: [17, 22] }, { l: 'Night', e: '🌙', r: [22, 29] }];
      const v = [0, 0, 0, 0]; let known = 0;
      out.value.forEach(t => {
        let h = null;
        if (t.time) h = +t.time.split(':')[0];
        else if (t.created && keyOf(new Date(t.created)) === t.date) h = new Date(t.created).getHours();
        if (h == null) return;
        known += t.amount;
        const hh = h < 5 ? h + 24 : h;
        const i = slots.findIndex(s => hh >= s.r[0] && hh < s.r[1]); if (i >= 0) v[i] += t.amount;
      });
      return { slots: slots.map((s, i) => ({ ...s, v: v[i], p: known ? v[i] / known : 0 })), known };
    });
    const top = computed(() => [...out.value].sort((a, b) => b.amount - a.amount).slice(0, 5));
    const places = computed(() => {
      const g = {};
      out.value.forEach(t => {
        const n = (t.note || '').trim(); if (!n) return;
        const k = n.toLowerCase();
        (g[k] = g[k] || { name: n, n: 0, v: 0, cat: t.cat }).n++; g[k].v += t.amount;
      });
      return Object.values(g).sort((a, b) => b.v - a.v).slice(0, 5);
    });
    const insights = computed(() => {
      const list = [];
      if (change.value != null && Math.abs(change.value) >= 0.1) list.push({ e: change.value > 0 ? '📈' : '📉', t: 'You spent ' + Math.round(Math.abs(change.value) * 100) + '% ' + (change.value > 0 ? 'more' : 'less') + ' than ' + (mode.value === 'month' ? JM[prevYm.value.m - 1] : prevYm.value.y) });
      const up = cats.value.filter(c => c.ch != null && c.ch > 0.25 && c.v > spent.value * 0.08).sort((a, b) => b.ch - a.ch)[0];
      if (up) list.push({ e: up.e, t: up.l + ' is up ' + Math.round(up.ch * 100) + '% compared with last ' + (mode.value === 'month' ? 'month' : 'year') });
      if (cats.value[0] && cats.value[0].p > 0.35) list.push({ e: cats.value[0].e, t: cats.value[0].l + ' takes ' + Math.round(cats.value[0].p * 100) + '% of your spending' });
      const wd = weekday.value.find(w => w.hl);
      if (wd && out.value.length >= 8) list.push({ e: '📅', t: 'You spend the most on ' + WDL[[6, 0, 1, 2, 3, 4, 5][weekday.value.indexOf(wd)]] + 's' });
      if (savedRate.value != null && income.value) list.push({ e: savedRate.value >= 0 ? '💰' : '⚠️', t: savedRate.value >= 0 ? 'You kept ' + Math.round(savedRate.value * 100) + '% of your income' : 'You spent ' + short(spent.value - income.value) + ' more than you earned' });
      if (pendingTx.value.length) list.push({ e: '❔', t: pendingTx.value.length + ' transaction' + (pendingTx.value.length > 1 ? 's' : '') + ' still need a category' });
      return list;
    });
    function exportCsv() {
      const rows = [['Date', 'Shamsi date', 'Time', 'Type', 'Amount (Toman)', 'Category', 'Note', 'Bank']];
      [...txs.value].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach(t => rows.push([t.date, jFull(t.date), t.time || '', t.type === 'in' ? 'Income' : 'Expense', t.amount, catOf(t.cat).l, t.note || '', t.bank || '']));
      Native.share(rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\n'));
    }
    const pct = v => (v >= 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%';
    return { mode, ym, shift, isCur, spent, income, change, perDay, savedRate, pace, trend, months6, cats, weekday, timeOfDay, top, places, insights, exportCsv, pct, out, prevYm, daysElapsed };
  },
  template: `<div class="view" style="--acc:var(--c-money)">
    <Head title="Reports" sub="Where your money goes"><button class="icon-btn" @click="exportCsv" aria-label="Export CSV"><Ic n="upload" :s="18"/></button></Head>
    <div class="seg"><button :class="{on: mode === 'month'}" @click="mode = 'month'">Month</button><button :class="{on: mode === 'year'}" @click="mode = 'year'">Year</button></div>
    <div class="month-nav" style="margin-top:12px">
      <button @click="shift(-1)" aria-label="Previous"><Ic n="chevron-left"/></button>
      <div style="text-align:center"><b>{{ mode === 'month' ? JM[ym.m - 1] + ' ' + ym.y : ym.y }}</b><div class="muted" style="font-size:12px;font-weight:600">{{ isCur ? (mode === 'month' ? 'This month' : 'This year') : '' }}</div></div>
      <button @click="shift(1)" :style="{visibility: isCur ? 'hidden' : ''}" aria-label="Next"><Ic n="chevron-right"/></button>
    </div>

    <div class="kpis">
      <div class="kpi"><small>Spent</small><b>{{ short(spent) }}</b><span v-if="change != null" :class="change > 0 ? 'up' : 'down'">{{ pct(change) }} vs {{ mode === 'month' ? JM[prevYm.m - 1].slice(0, 3) : prevYm.y }}</span><span v-else class="muted">no earlier data</span></div>
      <div class="kpi"><small>Income</small><b>{{ short(income) }}</b><span class="muted">{{ savedRate != null ? (savedRate >= 0 ? 'kept ' + Math.round(savedRate * 100) + '%' : 'overspent') : '—' }}</span></div>
      <div class="kpi"><small>Per day</small><b>{{ short(perDay) }}</b><span class="muted">{{ daysElapsed }} days</span></div>
      <div class="kpi"><small>Transactions</small><b>{{ out.length }}</b><span class="muted">avg {{ short(out.length ? spent / out.length : 0) }}</span></div>
    </div>

    <div v-if="pace" class="card pace" :class="{bad: pace.over > 0}">
      <div class="sec"><h3><Ic n="target" :s="17"/>Budget pace</h3><span class="muted" style="font-size:13px;font-weight:600">{{ short(pace.b) }} budget</span></div>
      <div class="pace-bar"><i :style="{width: Math.min(100, pace.pct * 100) + '%'}"></i><em :style="{left: Math.min(100, pace.timePct * 100) + '%'}"></em></div>
      <p>{{ pace.over > 0 ? 'At this pace you\\'ll spend about ' + short(pace.proj) + ', which is ' + short(pace.over) + ' over budget.' : 'On track. You\\'ll end around ' + short(pace.proj) + '.' }} To stay within budget, spend up to <b>{{ short(pace.safe) }}</b> a day for the rest of the month.</p>
    </div>

    <div v-if="insights.length" class="card">
      <div class="sec"><h3><Ic n="lightbulb" :s="17"/>Insights</h3></div>
      <div v-for="(x, i) in insights" :key="i" class="insight"><span>{{ x.e }}</span>{{ x.t }}</div>
    </div>

    <template v-if="out.length">
      <div class="card">
        <div class="sec"><h3>{{ mode === 'month' ? 'Daily spending' : 'Monthly spending' }}</h3></div>
        <Bars :items="trend" :avg="mode === 'month' ? perDay : spent / Math.max(1, trend.filter(t => t.v).length)" :fmtv="short"/>
      </div>

      <div class="card">
        <div class="sec"><h3>By category</h3><span class="muted" style="font-size:13px;font-weight:600">{{ cats.length }} categories</span></div>
        <div class="donut-row">
          <Donut :parts="cats.map(c => ({v: c.v, c: c.c}))"><div><b style="font-size:17px">{{ short(spent) }}</b><div class="muted" style="font-size:11px;font-weight:600">spent</div></div></Donut>
          <div class="legend-list"><div v-for="c in cats.slice(0, 5)" :key="c.id"><i :style="{background: c.c}"></i>{{ c.l }}<b>{{ Math.round(c.p * 100) }}%</b></div></div>
        </div>
        <div v-for="c in cats" :key="c.id" class="cat-row">
          <div class="e">{{ c.e }}</div>
          <div class="n">{{ c.l }}<small>{{ c.n }} transaction{{ c.n > 1 ? 's' : '' }}<template v-if="c.ch != null"> · <span :class="c.ch > 0 ? 'up' : 'down'">{{ pct(c.ch) }}</span></template></small></div>
          <div class="v">{{ short(c.v) }}<small>{{ Math.round(c.p * 100) }}%</small></div>
        </div>
      </div>

      <div class="card">
        <div class="sec"><h3>Last 6 months</h3><span class="legend-inline"><i style="background:var(--c-money)"></i>Spent <i style="background:color-mix(in srgb, var(--c-habits) 55%, transparent)"></i>Income</span></div>
        <Bars :items="months6.map(m => ({...m, show: true}))" :fmtv="short"/>
      </div>

      <div class="grid2">
        <div class="card"><div class="sec"><h3 style="font-size:15px">By weekday</h3></div><Bars :items="weekday" :h="110" c="color-mix(in srgb, var(--c-money) 45%, transparent)"/><div class="muted" style="font-size:11.5px;margin-top:6px">Average spent per day</div></div>
        <div class="card"><div class="sec"><h3 style="font-size:15px">Time of day</h3></div>
          <div v-for="sl in timeOfDay.slots" :key="sl.l" class="tod"><span>{{ sl.e }}</span><div class="grow"><div class="tl">{{ sl.l }}</div><div class="bar" style="margin:4px 0 0;height:6px;--c:var(--c-money)"><i :style="{width: (sl.p * 100) + '%'}"></i></div></div><b>{{ Math.round(sl.p * 100) }}%</b></div>
          <div v-if="!timeOfDay.known" class="muted" style="font-size:11.5px">Needs transaction times</div>
        </div>
      </div>

      <div class="card">
        <div class="sec"><h3>Biggest expenses</h3></div>
        <div v-for="t in top" :key="t.id" class="cat-row tap" @click="ui.tx = {ref: t}">
          <div class="e">{{ catOf(t.cat).e }}</div>
          <div class="n">{{ t.note || catOf(t.cat).l }}<small>{{ rel(t.date) }} · {{ jLabel(t.date) }}{{ t.bank ? ' · ' + t.bank : '' }}</small></div>
          <div class="v">{{ fmt(t.amount) }}</div>
        </div>
      </div>

      <div v-if="places.length" class="card">
        <div class="sec"><h3><Ic n="store" :s="17"/>Where you spend most</h3></div>
        <div v-for="p in places" :key="p.name" class="cat-row">
          <div class="e">{{ catOf(p.cat).e }}</div>
          <div class="n">{{ p.name }}<small>{{ p.n }} time{{ p.n > 1 ? 's' : '' }}</small></div>
          <div class="v">{{ short(p.v) }}</div>
        </div>
      </div>
    </template>
    <Empty v-else e="📊" t="Nothing to report yet" :s="'No expenses in ' + (mode === 'month' ? JM[ym.m - 1] : ym.y) + '.'"/>
  </div>`,
};

const RemSheet = {
  setup() {
    const d = reactive(newReminder());
    const picking = ref(false), emojiOpen = ref(false), need = ref('');
    const isEdit = computed(() => ui.rem && ui.rem.ref);
    watch(() => ui.rem, v => {
      if (!v) return;
      need.value = ''; emojiOpen.value = false;
      if (v.ref) { Object.assign(d, newReminder(), JSON.parse(JSON.stringify(v.ref))); picking.value = false; }
      else if (v.tpl) { Object.assign(d, newReminder(v.tpl)); picking.value = false; }
      else picking.value = true;
    });
    const templates = computed(() => REM_TEMPLATES.filter(t => !(t.water && S.reminders.some(r => r.water))));
    function useTpl(t) { Object.assign(d, newReminder(t)); picking.value = false; Native.vibrate(6); }
    const EVERY = [15, 20, 30, 45, 60, 90, 120, 180, 240];
    const KINDS = [{ id: 'once', l: 'Once' }, { id: 'daily', l: 'Daily' }, { id: 'interval', l: 'Every…' }, { id: 'monthly', l: 'Monthly' }];
    const toggleDay = v => { const i = d.days.indexOf(v); i >= 0 ? d.days.splice(i, 1) : d.days.push(v); Native.vibrate(6); };
    const sameDays = a => a.length === d.days.length && a.every(x => d.days.includes(x));
    function addTime() { const last = d.times[d.times.length - 1] || '08:00'; const [h, m] = last.split(':').map(Number); d.times.push(pad((h + 3) % 24) + ':' + pad(m)); }
    const preview = computed(() => OrbitSchedule.ruleTimes(remRule(d), Date.now(), TZ, 3));
    const problem = computed(() => {
      if (d.kind === 'interval' && d.end <= d.start) return 'The end time needs to be after the start time';
      if ((d.kind === 'daily' || d.kind === 'interval') && !d.days.length) return 'Pick at least one day';
      if (d.kind === 'daily' && !d.times.length) return 'Add at least one time';
      if (!preview.value.length) return d.kind === 'once' ? 'That time has already passed' : 'This schedule never fires. Check the dates and times';
      return '';
    });
    function save() {
      if (!d.title.trim()) { need.value = 'title'; Native.vibrate(30); return; }
      if (problem.value) { need.value = 'schedule'; Native.vibrate(30); return; }
      const rec = JSON.parse(JSON.stringify(d));
      rec.title = rec.title.trim(); rec.on = true;
      if (rec.kind === 'daily') rec.times = [...new Set(rec.times)].sort();
      if (isEdit.value) Object.assign(ui.rem.ref, rec); else S.reminders.push(rec);
      if (Native.has) Native.askNotify();
      say((isEdit.value ? 'Saved' : 'Reminder added') + ' · next ' + whenShort(preview.value[0]));
      ui.rem = null;
    }
    function remove() {
      const r = ui.rem.ref, i = S.reminders.indexOf(r);
      S.reminders.splice(i, 1); ui.rem = null;
      say('"' + r.title + '" deleted', () => S.reminders.splice(i, 0, r));
    }
    watch(() => d.title, () => { if (need.value === 'title') need.value = ''; });
    return { d, picking, emojiOpen, need, isEdit, templates, useTpl, EVERY, KINDS, toggleDay, sameDays, addTime, preview, problem, save, remove, DAY_DOTS, DAY_PRESETS, REM_EMOJI, HABIT_COLORS, everyLabel, whenShort };
  },
  template: `<Sheet :open="!!ui.rem" :title="picking ? 'New reminder' : isEdit ? 'Edit reminder' : 'New reminder'" full @close="ui.rem = null">
    <div style="--acc:var(--c-mood)">
      <template v-if="picking">
        <p class="muted" style="font-size:13.5px;margin:-2px 2px 14px">Start from an idea, or make your own.</p>
        <div class="tpl-grid">
          <button v-for="t in templates" :key="t.title" class="tpl tap" :style="{'--c': t.color}" @click="useTpl(t)">
            <span class="e">{{ t.emoji }}</span><b>{{ t.title }}</b><small>{{ t.custom ? 'Any time, any repeat' : remSummary(newReminder(t)) }}</small></button>
        </div>
      </template>
      <template v-else>
        <div class="rem-head">
          <button class="rem-emoji" :style="{'--c': d.color}" @click="emojiOpen = !emojiOpen" aria-label="Choose icon">{{ d.emoji }}</button>
          <input class="field-title" v-model="d.title" placeholder="Reminder name" enterkeyhint="done" :class="{bad: need === 'title'}">
        </div>
        <div v-if="need === 'title'" class="hint warn" style="margin-top:8px"><span class="grow">Give the reminder a name</span></div>
        <Transition name="fade"><div v-if="emojiOpen" style="margin-top:12px">
          <div class="emoji-grid"><button v-for="e in REM_EMOJI" :key="e" :class="{on: d.emoji === e}" @click="d.emoji = e; emojiOpen = false">{{ e }}</button></div>
          <div class="swatches" style="margin-top:12px"><button v-for="c in HABIT_COLORS" :key="c" :style="{'--c': c}" :class="{on: d.color === c}" @click="d.color = c"></button></div>
        </div></Transition>
        <textarea class="field" v-model="d.note" :placeholder="d.water ? 'Details (optional). The notification shows your progress.' : 'Details shown in the notification (optional)'" style="min-height:64px;margin-top:12px"></textarea>

        <span class="flabel">Repeat</span>
        <div class="seg"><button v-for="k in KINDS" :key="k.id" :class="{on: d.kind === k.id}" @click="d.kind = k.id; Native.vibrate(6)">{{ k.l }}</button></div>

        <template v-if="d.kind === 'once'">
          <span class="flabel">Date & time</span>
          <DatePick v-model="d.date" :none="false"/>
          <div class="row" style="margin-top:10px"><label class="chip on time-chip"><Ic n="clock" :s="15"/>{{ d.time }}<input type="time" v-model="d.time"></label></div>
        </template>

        <template v-if="d.kind === 'daily'">
          <span class="flabel">At</span>
          <div class="chips">
            <span v-for="(t, i) in d.times" :key="i" class="chip on time-chip">
              <label style="display:flex;align-items:center;gap:6px;position:relative"><Ic n="clock" :s="15"/>{{ t }}<input type="time" :value="t" @change="d.times[i] = $event.target.value" class="overlay-input"></label>
              <button v-if="d.times.length > 1" @click="d.times.splice(i, 1)" aria-label="Remove time" style="margin-left:2px;display:grid"><Ic n="x" :s="13"/></button>
            </span>
            <button class="chip" @click="addTime"><Ic n="plus" :s="14"/>Add time</button>
          </div>
        </template>

        <template v-if="d.kind === 'interval'">
          <span class="flabel">Every</span>
          <div class="chips"><button v-for="m in EVERY" :key="m" class="chip" :class="{on: d.every === m}" @click="d.every = m">{{ everyLabel(m) }}</button></div>
          <span class="flabel">Between</span>
          <div class="row" style="gap:10px">
            <label class="chip on time-chip"><Ic n="sun" :s="15"/>{{ d.start }}<input type="time" v-model="d.start"></label>
            <span class="muted">to</span>
            <label class="chip on time-chip"><Ic n="moon" :s="15"/>{{ d.end }}<input type="time" v-model="d.end"></label>
          </div>
          <div v-if="d.water" class="list-row" style="border:0;padding:14px 2px 0"><div class="grow"><div class="t">Pause after daily goal</div><div class="s">Stop for the day once you've had {{ S.settings.waterGoal }} glasses</div></div><Toggle v-model="d.stopAtGoal"/></div>
        </template>

        <template v-if="d.kind === 'daily' || d.kind === 'interval'">
          <span class="flabel">On</span>
          <div class="chips" style="margin-bottom:10px"><button v-for="p in DAY_PRESETS" :key="p.l" class="chip" :class="{on: sameDays(p.v)}" @click="d.days = [...p.v]">{{ p.l }}</button></div>
          <div class="day-dots"><button v-for="x in DAY_DOTS" :key="x.v" :class="{on: d.days.includes(x.v)}" @click="toggleDay(x.v)">{{ x.l }}</button></div>
        </template>

        <template v-if="d.kind === 'monthly'">
          <span class="flabel">Calendar</span>
          <div class="seg"><button :class="{on: d.cal === 'jal'}" @click="d.cal = 'jal'">Shamsi</button><button :class="{on: d.cal === 'greg'}" @click="d.cal = 'greg'">Gregorian</button></div>
          <div class="settings-group" style="box-shadow:none;margin-top:12px">
            <div class="list-row"><div class="grow"><div class="t">Day of the month</div><div class="s" v-if="d.dom > 28">Falls on the last day in shorter months</div></div><Stepper v-model="d.dom" :min="1" :max="31"/></div>
            <div class="list-row"><div class="grow"><div class="t">Time</div></div><label class="chip on time-chip"><Ic n="clock" :s="15"/>{{ d.time }}<input type="time" v-model="d.time"></label></div>
          </div>
        </template>

        <template v-if="d.kind !== 'once'">
          <div class="list-row" style="border:0;padding:16px 2px 4px"><div class="grow"><div class="t">End date</div><div class="s">{{ d.until ? 'Last reminder on ' + gFull(d.until) : 'Keeps going until you turn it off' }}</div></div>
            <Toggle :model-value="!!d.until" @update:model-value="v => d.until = v ? addDays(R.today, 30) : ''"/></div>
          <label v-if="d.until" class="chip on" style="margin-top:6px"><Ic n="calendar" :s="15"/>{{ gLabel(d.until) }} · {{ jLabel(d.until) }}<input type="date" v-model="d.until" :min="R.today"></label>
        </template>

        <div class="preview" :class="{bad: problem}">
          <template v-if="problem"><Ic n="circle-alert" :s="17"/><span>{{ problem }}</span></template>
          <template v-else><Ic n="bell" :s="17"/><span>Next: <b>{{ preview.map(whenShort).join(' · ') }}</b></span></template>
        </div>

        <div class="btn-row">
          <button v-if="isEdit" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove" aria-label="Delete reminder"><Ic n="trash-2"/></button>
          <button class="btn primary" @click="save">{{ isEdit ? 'Save' : 'Add reminder' }}</button>
        </div>
      </template>
    </div>
  </Sheet>`,
};

const RemindersView = {
  setup() {
    const list = computed(() => S.reminders.map(r => {
      const next = r.on === false ? [] : remNext(r);
      return { r, next: next[0] || null, done: r.on !== false && !next.length };
    }).sort((a, b) => (a.r.on === false) - (b.r.on === false) || (a.next || 9e15) - (b.next || 9e15)));
    const active = computed(() => S.reminders.filter(r => r.on !== false).length);
    function toggle(r, v) { r.on = v; Native.vibrate(8); if (v && Native.has) Native.askNotify(); say(v ? 'Reminder on' : 'Paused. Turn it back on any time'); }
    function remove(r) { const i = S.reminders.indexOf(r); S.reminders.splice(i, 1); say('"' + r.title + '" deleted', () => S.reminders.splice(i, 0, r)); }
    return { list, active, toggle, remove, whenShort };
  },
  template: `<div class="view" style="--acc:var(--c-mood)">
    <Head title="Reminders" :sub="active ? active + ' active' : 'Nudges you set yourself'"/>
    <button v-if="!remReady && S.reminders.length" class="card hint-card tap" @click="go('alerts')">
      <Ic n="bell" :s="18"/><span class="grow">Notifications aren't on for this phone yet. Tap to set them up.</span><Ic n="chevron-right" :s="18"/></button>
    <template v-if="S.reminders.length">
      <TransitionGroup name="list" tag="div" class="tlist rel">
        <Swipe v-for="x in list" :key="x.r.id" @remove="remove(x.r)" @tap="ui.rem = {ref: x.r}">
          <div class="rem" :class="{off: x.r.on === false || x.done}" :style="{'--c': x.r.color}">
            <span class="e">{{ x.r.emoji }}</span>
            <div class="grow">
              <div class="t">{{ x.r.title }}</div>
              <div class="s">{{ remSummary(x.r) }}</div>
              <div class="n" v-if="x.r.on === false">Paused</div>
              <div class="n" v-else-if="x.done">Finished</div>
              <div class="n on" v-else>Next {{ whenShort(x.next) }}</div>
            </div>
            <Toggle :model-value="x.r.on !== false" @update:model-value="v => toggle(x.r, v)" @click.stop @pointerdown.stop/>
          </div>
        </Swipe>
      </TransitionGroup>
      <p class="muted" style="text-align:center;font-size:12.5px;margin-top:18px">Tap to edit · switch to pause · swipe left to delete</p>
    </template>
    <Empty v-else e="⏰" t="No reminders yet" s="Water, medicine, stretching, bills… set a nudge for anything.">
      <button class="btn primary" @click="ui.rem = {}"><Ic n="plus" :s="18"/>New reminder</button></Empty>
    <button class="fab" @click="ui.rem = {}" aria-label="New reminder"><Ic n="plus" :s="26" :w="2.4"/></button>
  </div>`,
};

const SettingsView = {
  setup() {
    const imp = ref(false), txt = ref(''), reset = ref(false);
    const budgetStr = computed({
      get: () => (S.settings.budget ? fmt(S.settings.budget) : ''),
      set: v => { S.settings.budget = parseInt(toEn(v).replace(/\D/g, '') || '0', 10); },
    });
    function exportData() { Native.share(JSON.stringify({ app: 'orbit', v: 1, at: new Date().toISOString(), data: S })); }
    function importData() {
      try {
        const j = JSON.parse(txt.value.trim());
        const data = hydrate(j.data || j);
        if (!Array.isArray(data.tasks)) throw 0;
        Object.keys(data).forEach(k => { S[k] = data[k]; });
        S.settings.onboarded = true;
        imp.value = false; txt.value = '';
        say('Backup restored ✅');
      } catch (e) { say('That doesn\'t look like an Orbit backup'); }
    }
    function resetAll() { const d = defaults(); Object.keys(d).forEach(k => { S[k] = d[k]; }); reset.value = false; nav.screen = null; nav.tab = 'today'; }
    const counts = computed(() => S.tasks.length + S.habits.length + S.notes.length + S.money.length + S.countdowns.length);
    return { imp, txt, reset, budgetStr, exportData, importData, resetAll, counts };
  },
  template: `<div class="view" style="--acc:var(--c-tasks)">
    <Head title="Settings"/>
    <div class="label">Profile</div>
    <div class="settings-group"><div class="list-row"><span class="bubble" style="--c:var(--c-tasks)"><Ic n="smile" :s="18"/></span>
      <input class="grow" v-model="S.settings.name" placeholder="Your name" style="background:none;border:0;outline:none;font-size:16px;font-weight:600;padding:6px 0" enterkeyhint="done"></div></div>

    <div class="label">Appearance</div>
    <div class="seg">
      <button :class="{on: S.settings.theme === 'system'}" @click="S.settings.theme = 'system'"><Ic n="sparkles" :s="16"/>Auto</button>
      <button :class="{on: S.settings.theme === 'light'}" @click="S.settings.theme = 'light'"><Ic n="sun" :s="16"/>Light</button>
      <button :class="{on: S.settings.theme === 'dark'}" @click="S.settings.theme = 'dark'"><Ic n="moon" :s="16"/>Dark</button>
    </div>

    <div class="label">Money</div>
    <div class="settings-group"><div class="list-row"><span class="bubble" style="--c:var(--c-money)"><Ic n="target" :s="18"/></span>
      <div class="grow"><div class="t">Monthly budget</div><input v-model="budgetStr" inputmode="numeric" placeholder="Not set" style="background:none;border:0;outline:none;font-size:15px;padding:4px 0 0;width:100%;color:var(--text-2)" enterkeyhint="done"></div>
      <span class="muted" style="font-weight:600">Toman</span></div>
      <div v-if="Native.has" class="list-row"><span class="bubble" style="--c:var(--c-money)"><Ic n="message-square-text" :s="18"/></span>
        <div class="grow"><div class="t">Add from bank SMS</div><div class="s">{{ S.settings.sms.on ? (Sms.granted ? 'On · read on this phone only' : 'SMS access was removed') : 'Off' }}</div></div>
        <Toggle :model-value="S.settings.sms.on && Sms.granted" @update:model-value="v => v ? smsEnable() : smsDisable()"/></div>
      <div class="list-row" style="display:block"><div class="t" style="margin-bottom:8px">My bank SMS amounts are in</div>
        <div class="seg"><button :class="{on: S.settings.sms.unit === 'rial'}" @click="S.settings.sms.unit = 'rial'">Rial (most banks)</button><button :class="{on: S.settings.sms.unit === 'toman'}" @click="S.settings.sms.unit = 'toman'">Toman</button></div>
        <div class="s" style="margin-top:6px">Used when the SMS doesn't say. Orbit stores everything in Toman.</div></div>
    </div>

    <div class="label">Notifications</div>
    <div class="settings-group"><button class="list-row" style="width:100%;text-align:left" @click="go('alerts')">
      <span class="bubble" style="--c:var(--c-focus)"><Ic n="bell" :s="18"/></span>
      <div class="grow"><div class="t">Notifications</div><div class="s">{{ remReady ? 'On · tasks, water, focus & cycle' : 'Off · tap to set up' }}</div></div>
      <span class="dot" :style="{background: remReady ? 'var(--c-habits)' : 'var(--c-focus)'}"></span><Ic n="chevron-right" :s="18" class="muted"/></button></div>

    <template v-if="Native.has && Upd.info">
      <div class="label">App updates</div>
      <div class="settings-group">
        <div class="list-row"><span class="bubble" style="--c:var(--c-tasks)"><Ic n="download" :s="18"/></span>
          <div class="grow"><div class="t">{{ updAvail ? 'Orbit ' + updAvail.name + ' is available' : 'Orbit is up to date' }}</div>
            <div class="s">App {{ Upd.info.name }} · screens {{ APP_VERSION }} (build {{ Upd.info.build }}){{ Upd.info.pendingBuild ? ' · new screens next time you open Orbit' : '' }}</div></div>
          <button v-if="updAvail" class="btn sm primary" :disabled="Upd.state === 'downloading'" @click="installUpdate">{{ Upd.state === 'downloading' ? 'Downloading…' : 'Install' }}</button>
          <button v-else class="btn sm" @click="AN.checkUpdate(); say('Checking for updates…')">Check</button></div>
      </div>
    </template>

    <div class="label">Your data</div>
    <div class="settings-group">
      <button class="list-row" style="width:100%;text-align:left" @click="exportData"><span class="bubble" style="--c:var(--c-water)"><Ic n="upload" :s="18"/></span>
        <div class="grow"><div class="t">Export backup</div><div class="s">{{ IOS ? 'Save to Files or send via Telegram' : 'Share to Telegram, email or Files' }}</div></div><Ic n="chevron-right" :s="18" class="muted"/></button>
      <button class="list-row" style="width:100%;text-align:left" @click="imp = true"><span class="bubble" style="--c:var(--c-habits)"><Ic n="download" :s="18"/></span>
        <div class="grow"><div class="t">Restore backup</div><div class="s">Paste a backup you exported</div></div><Ic n="chevron-right" :s="18" class="muted"/></button>
      <button class="list-row" style="width:100%;text-align:left" @click="reset = true"><span class="bubble" style="--c:var(--c-danger)"><Ic n="trash-2" :s="18"/></span>
        <div class="grow"><div class="t" style="color:var(--c-danger)">Erase everything</div><div class="s">{{ counts }} items stored on this phone</div></div></button>
    </div>
    <p class="muted" style="text-align:center;font-size:12.5px;margin-top:26px">Orbit {{ APP_VERSION }} · {{ Native.has ? 'Android' : IOS ? 'iPhone' : 'Web' }} · {{ Soc.acct ? 'Everything except People stays on your device' : 'Everything stays on your device' }} 🔒</p>

    <Sheet :open="imp" title="Restore backup" @close="imp = false">
      <p class="muted" style="font-size:14px;margin-bottom:12px">Paste the backup text below. This replaces all current data.</p>
      <textarea class="field" v-model="txt" placeholder='{"app":"orbit", ...}' style="min-height:160px;font-size:13px;font-family:monospace"></textarea>
      <div class="btn-row"><button class="btn primary" :disabled="!txt.trim()" @click="importData">Restore</button></div>
    </Sheet>
    <Sheet :open="reset" title="Erase everything?" @close="reset = false">
      <p class="muted">All tasks, habits, notes, transactions and logs on this phone will be deleted. Export a backup first if you want to keep them.</p>
      <div class="btn-row"><button class="btn" @click="reset = false">Cancel</button><button class="btn danger" style="background:var(--c-danger);color:#fff" @click="resetAll">Erase</button></div>
    </Sheet>
  </div>`,
};

/* ================= app shell ================= */
const App = {
  setup() {
    const kb = ref(false);
    const typing = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['date', 'time'].includes(el.type)));
    addEventListener('focusin', e => { kb.value = typing(e.target); });
    addEventListener('focusout', () => setTimeout(() => { kb.value = typing(document.activeElement); }, 50));
    // keep bottom sheets above the iOS keyboard
    const vv = window.visualViewport;
    if (vv) {
      const fit = () => {
        const st = document.documentElement.style;
        st.setProperty('--vvh', vv.height + 'px'); st.setProperty('--vvt', vv.offsetTop + 'px');
        // the part of the layout covered by the keyboard (iPhone); 0 where the page itself shrinks (Android)
        st.setProperty('--kbb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px');
      };
      vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
    }
    const tabs = [
      { id: 'today', n: 'house', l: 'Today', c: 'var(--c-tasks)' },
      { id: 'tasks', n: 'list-checks', l: 'Tasks', c: 'var(--c-tasks)' },
      { id: 'habits', n: 'flame', l: 'Habits', c: 'var(--c-habits)' },
      { id: 'money', n: 'wallet', l: 'Money', c: 'var(--c-money)' },
      { id: 'more', n: 'layout-grid', l: 'More', c: 'var(--c-count)' },
    ];
    const views = {
      today: TodayView, tasks: TasksView, habits: HabitsView, money: MoneyView, more: MoreView,
      notes: NotesView, focus: FocusView, water: WaterView, mood: MoodView, countdowns: CountdownsView, cycle: CycleView, settings: SettingsView, alerts: NotificationsView, reports: ReportsView, reminders: RemindersView, people: PeopleView, pair: PairView,
    };
    const current = computed(() => nav.screen || nav.tab);
    function tab(id) {
      Native.vibrate(6);
      if (nav.tab === id && !nav.screen) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      nav.tab = id; nav.screen = null;
    }
    const toTop = () => window.scrollTo(0, 0);
    return { kb, tabs, views, current, tab, toTop };
  },
  template: `<div :class="{kb}">
    <Onboarding v-if="!S.settings.onboarded"/>
    <template v-else>
      <Transition name="view" mode="out-in" @before-enter="toTop"><component :is="views[current]" :key="current === 'pair' ? 'pair:' + Soc.open : current"/></Transition>
      <nav class="tabbar">
        <button v-for="t in tabs" :key="t.id" :class="{on: nav.tab === t.id}" :style="{'--acc': t.c}" @click="tab(t.id)">
          <span class="pill"><Ic :n="t.n" :s="21" :w="nav.tab === t.id ? 2.3 : 2"/><i v-if="t.id === 'more' && socTodo.total" class="tab-dot"></i></span>{{ t.l }}</button>
      </nav>
      <TaskSheet/><TxSheet/><AccountsSheet/><BudgetSheet/><RemSheet/>
    </template>
    <Transition name="toast"><div v-if="toast.msg" class="toast" :key="toast.id"><span>{{ toast.msg }}</span><button v-if="toast.undo" @click="doUndo"><Ic n="undo-2" :s="15" style="display:inline;vertical-align:-2px"/> Undo</button></div></Transition>
  </div>`,
};

const app = createApp(App);
Object.assign(app.config.globalProperties, {
  APP_VERSION, S, R, nav, ui, toast, Timer, Native, IOS, STANDALONE, MOODS, Rem, PUSH_SUPPORTED, remPossible, BEFORE, enablePush, disablePush, testNotify, askAndroidNotify, MODES, JM, WDL, CAT, justDone,
  go, say, doUndo, scheduleSync, hm, isToday, everyLabel, keyOf, fmt, short, words, mmss, rel, ago, jLabel, jFull, gLabel, gFull, parseKey, addDays,
  Soc, REL, whoName, Upd, installUpdate, dismissUpdate, AN,
  remSummary, newReminder, REM_TEMPLATES, whenShort, clog, setClog, PHASES, catOf, categorize, dismissTx, smsEnable, smsDisable, Sms, CATS_IN, WK, jFull, toggleTask, delTask, prioC, toggleHabit, streak, addWater, setMood, togglePeriodDay,
});
// computed refs on globalProperties are not auto-unwrapped, so expose them as live getters
const live = { updAvail, socTodo, socPairs, waterRem, totalBalance, cycStats, pendingTx, topCats, focusStreak, waterToday, focusToday, spentThisMonth, curJ, cyc, cdSorted, plan, waterNext, remReady };
for (const [k, c] of Object.entries(live)) Object.defineProperty(app.config.globalProperties, k, { get: () => c.value });
app.component('Ic', Ic).component('Ring', Ring).component('Check', Check).component('Sheet', Sheet).component('Swipe', Swipe)
  .component('Head', Head).component('Stepper', Stepper).component('Toggle', Toggle).component('DatePick', DatePick)
  .component('Empty', Empty).component('Bars', Bars).component('CycleDaySheet', CycleDaySheet).component('Donut', Donut).component('TaskSheet', TaskSheet).component('TxSheet', TxSheet).component('AccountsSheet', AccountsSheet).component('BudgetSheet', BudgetSheet).component('RemSheet', RemSheet).component('Onboarding', Onboarding).component('RelPick', RelPick);
app.mount('#app');

if (!Native.has) {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.go) window.orbitGo(e.data.go); });
  }
  const go = new URLSearchParams(location.search).get('go');
  if (go && S.settings.onboarded) { window.orbitGo(go); history.replaceState(null, '', location.pathname); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && PUSH_SUPPORTED) { Rem.perm = Notification.permission; if (Rem.push.token) scheduleSync(0); } });
  // ask the browser not to evict saved data
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  watchEffect(() => { const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = isDark.value ? '#0b0c10' : '#f3f4f8'; });
}
