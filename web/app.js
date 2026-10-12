/* Orbit — everything in one place */
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
    cycle: { name: '', len: 28, plen: 5, notify: true },
    notify: { tasks: true, focus: true },
    waterRemind: { on: false, every: 60, start: '09:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6], stopAtGoal: true },
  },
  tasks: [], habits: [], notes: [], money: [], countdowns: [], cycleDays: [],
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
  d.settings = { ...ds, ...s, focus: { ...ds.focus, ...(s.focus || {}) }, cycle: { ...ds.cycle, ...(s.cycle || {}) }, notify: { ...ds.notify, ...(s.notify || {}) }, waterRemind: { ...ds.waterRemind, ...(s.waterRemind || {}) } };
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

const R = reactive({ now: Date.now(), today: keyOf(new Date()), sysDark: Native.sysDark() });
const nav = reactive({ tab: 'today', screen: null });
const ui = reactive({ task: null, tx: null });
const toast = reactive({ msg: '', undo: null, id: 0 });
let toastT;
function say(msg, undo) {
  toast.msg = msg; toast.undo = undo || null; toast.id++;
  clearTimeout(toastT);
  toastT = setTimeout(() => { toast.msg = ''; }, undo ? 4500 : 2400);
}
function doUndo() { const u = toast.undo; toast.msg = ''; u && u(); }
function go(screen) { nav.screen = screen; }

/* back handling (Android hardware back) */
const backStack = [];
const pushBack = fn => { if (!backStack.includes(fn)) backStack.push(fn); };
const popBack = fn => { const i = backStack.indexOf(fn); if (i >= 0) backStack.splice(i, 1); };
window.orbitBack = () => {
  if (backStack.length) { backStack.pop()(); return true; }
  if (nav.screen) { nav.screen = null; return true; }
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
  const base = { periods, lens, len, plen, has: periods.length > 0, map: {} };
  if (!periods.length) return base;

  const last = periods[periods.length - 1];
  const day = diffDays(last.start, t) + 1;
  const next = addDays(last.start, len);
  const toNext = diffDays(t, next);
  const ov = addDays(next, -14);
  const loggedLen = diffDays(last.start, last.end) + 1;
  const curLen = loggedLen > 1 ? loggedLen : plen;
  const inPeriod = S.cycleDays.includes(t) || (day >= 1 && day <= curLen && (loggedLen === 1 || t <= last.end));

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
  if (loggedLen === 1) for (let i = 1; i < plen; i++) { const k = addDays(last.start, i); map[k] = map[k] || 'pp'; }
  for (let i = 0; i < 6; i++) {
    const s = addDays(next, i * len), o = addDays(s, -14);
    for (let j = -5; j <= 1; j++) { const k = addDays(o, j); if (!map[k]) map[k] = j === 0 ? 'ov' : 'f'; }
    for (let j = 0; j < plen; j++) { const k = addDays(s, j); if (!map[k]) map[k] = 'pp'; }
  }
  return { ...base, last, day, next, toNext, ov, inPeriod, phase, pc, tip, map, fStart: addDays(ov, -5), fEnd: addDays(ov, 1) };
});
function togglePeriodDay(k) {
  const i = S.cycleDays.indexOf(k);
  if (i >= 0) S.cycleDays.splice(i, 1); else S.cycleDays.push(k);
  Native.vibrate(12);
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
  return out.filter(r => r.at >= now).sort((a, b) => a.at - b.at);
});
const waterRule = computed(() => {
  const w = S.settings.waterRemind, goal = S.settings.waterGoal, count = waterToday.value;
  return { ...w, goal, glassMl: S.settings.glassMl, count, day: R.today, goalDay: count >= goal ? R.today : null };
});
const waterNext = computed(() => { R.now; return OrbitSchedule.waterTimes(waterRule.value, Date.now(), TZ, 3); });

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
  return { v: 1, tz: TZ, reminders: plan.value, water: waterRule.value };
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
    const w = p.water;
    const water = w.on ? { on: true, every: w.every, start: w.start, end: w.end, days: w.days, stopAtGoal: w.stopAtGoal, goalDay: w.goalDay } : null;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const res = await fetch(PUSH_URL + '/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Rem.push.token },
      body: JSON.stringify({ tz: TZ, reminders, water, subscription: sub ? sub.toJSON() : undefined }),
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
window.orbitResume = () => { drainNative(); refreshAndroidStatus(); };
window.orbitGo = where => {
  const tabs = ['today', 'tasks', 'habits', 'money', 'more'];
  if (tabs.includes(where)) { nav.tab = where; nav.screen = null; } else if (where) nav.screen = where;
};
drainNative(); refreshAndroidStatus();

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
      Object.assign(d, { type: 'out', amount: 0, cat: 'food', note: '', date: R.today }, v.ref ? JSON.parse(JSON.stringify(v.ref)) : {});
    });
    const isEdit = computed(() => ui.tx && ui.tx.ref);
    const cats = computed(() => (d.type === 'in' ? CATS_IN : CATS_OUT));
    const amt = computed({
      get: () => (d.amount ? fmt(d.amount) : ''),
      set: v => { d.amount = Math.min(parseInt(toEn(v).replace(/\D/g, '') || '0', 10), 1e13); },
    });
    watch(() => d.type, t => { if (!cats.value.some(c => c.id === d.cat)) d.cat = cats.value[0].id; });
    function bump(n) { d.amount = (d.amount || 0) + n; Native.vibrate(6); }
    function save() {
      if (!d.amount) return;
      const rec = { type: d.type, amount: d.amount, cat: d.cat, note: d.note.trim(), date: d.date || R.today };
      if (isEdit.value) Object.assign(ui.tx.ref, rec);
      else S.money.unshift({ id: uid(), created: Date.now(), ...rec });
      Native.vibrate(12);
      ui.tx = null;
    }
    function remove() {
      const t = ui.tx.ref; ui.tx = null;
      const i = S.money.indexOf(t); S.money.splice(i, 1);
      say('Transaction deleted', () => S.money.splice(i, 0, t));
    }
    return { d, amt, cats, save, remove, isEdit, bump };
  },
  template: `<Sheet :open="!!ui.tx" :title="isEdit ? 'Edit transaction' : 'New transaction'" @close="ui.tx = null">
    <div :style="{'--acc': d.type === 'in' ? 'var(--c-habits)' : 'var(--c-money)'}">
      <div class="seg"><button :class="{on: d.type==='out'}" @click="d.type='out'"><Ic n="arrow-up-right" :s="16"/>Expense</button>
        <button :class="{on: d.type==='in'}" @click="d.type='in'"><Ic n="arrow-down-left" :s="16"/>Income</button></div>
      <div class="amount-in">
        <input v-model="amt" inputmode="numeric" placeholder="0" enterkeyhint="done" @keydown.enter="$event.target.blur()">
        <div class="u">{{ d.amount ? words(d.amount) : 'Toman' }}</div>
      </div>
      <div class="chips" style="justify-content:center;margin-top:10px">
        <button class="chip" v-for="n in [50000, 100000, 500000, 1000000]" :key="n" @click="bump(n)">+{{ short(n) }}</button>
      </div>
      <span class="flabel">Category</span>
      <div class="cat-grid">
        <button v-for="c in cats" :key="c.id" :class="{on: d.cat === c.id}" @click="d.cat = c.id"><span class="e">{{ c.e }}</span>{{ c.l }}</button>
      </div>
      <span class="flabel">Note</span>
      <input class="field" v-model="d.note" placeholder="e.g. Lunch with Sara" enterkeyhint="done">
      <span class="flabel">Date</span>
      <DatePick v-model="d.date" :none="false" past/>
      <div class="btn-row">
        <button v-if="isEdit" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove"><Ic n="trash-2"/></button>
        <button class="btn primary" :disabled="!d.amount" @click="save">{{ isEdit ? 'Save changes' : (d.type === 'in' ? 'Add income' : 'Add expense') }}</button>
      </div>
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
    const both = computed(() => cyc.value.has && nextCd.value);
    return { q, greet, greetE, tTotal, tDone, hTotal, hDone, pct, hero, list, openCount, addQuick, mood, nextCd, pinned, both };
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

    <div class="grid2" v-if="cyc.has || nextCd">
      <div v-if="cyc.has" class="card tile tap cycle-card" style="--c:var(--c-cycle)" :style="{gridColumn: both ? '' : '1 / -1'}" @click="go('cycle')">
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
    function remove() {
      const h = editing.value, i = S.habits.indexOf(h);
      S.habits.splice(i, 1); sheet.value = false;
      say('Habit deleted', () => S.habits.splice(i, 0, h));
    }
    const heat = computed(() => {
      const t = R.today, start = addDays(t, -satIdx(t) - 7 * 17);
      return Array.from({ length: 126 }, (_, i) => { const k = addDays(start, i); return { k, fut: k > t }; });
    });
    const stats = computed(() => {
      const h = editing.value; if (!h) return null;
      let n30 = 0; for (let i = 0; i < 30; i++) if (h.log[addDays(R.today, -i)]) n30++;
      return { cur: streak(h), best: bestStreak(h), rate: Math.round(n30 / 30 * 100), total: Object.keys(h.log).length };
    });
    return { sheet, d, editing, week, done, openNew, openEdit, save, remove, heat, stats, HABIT_COLORS, HABIT_EMOJI };
  },
  template: `<div class="view" style="--acc:var(--c-habits)">
    <header class="top"><div class="grow"><h1>Habits</h1>
      <div class="sub" v-if="S.habits.length"><b>{{ done }} of {{ S.habits.length }}</b> done today{{ done === S.habits.length ? ' · perfect day 🔥' : '' }}</div>
      <div class="sub" v-else>Small steps, every day</div></div></header>
    <template v-if="S.habits.length">
      <TransitionGroup name="list" tag="div" class="stack rel">
        <div v-for="h in S.habits" :key="h.id" class="card habit tap" :style="{'--c': h.color}" @click="openEdit(h)">
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
      </TransitionGroup>
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
        <span class="flabel">Name</span>
        <input class="field" v-model="d.name" placeholder="e.g. Read 10 pages" enterkeyhint="done">
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
      return Object.entries(m).map(([id, v]) => ({ ...CAT[id], v, n: txs.value.filter(t => t.cat === id).length, p: spent.value ? v / spent.value : 0 })).sort((a, b) => b.v - a.v);
    });
    const days = computed(() => {
      const by = {};
      txs.value.forEach(t => (by[t.date] = by[t.date] || []).push(t));
      return Object.keys(by).sort().reverse().map(k => ({ k, items: by[k], out: by[k].filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0) }));
    });
    const budget = computed(() => S.settings.budget);
    function del(t) { const i = S.money.indexOf(t); S.money.splice(i, 1); say('Transaction deleted', () => S.money.splice(i, 0, t)); }
    return { ym, shift, isCur, spent, income, cats, days, budget, del };
  },
  template: `<div class="view" style="--acc:var(--c-money)">
    <header class="top"><div class="grow"><h1>Money</h1><div class="sub">Spending in Toman</div></div>
      <button class="icon-btn" @click="go('settings')" aria-label="Budget settings"><Ic n="target" :s="19"/></button></header>
    <div class="month-nav">
      <button @click="shift(-1)" aria-label="Previous month"><Ic n="chevron-left"/></button>
      <div style="text-align:center"><b>{{ JM[ym.m - 1] }} {{ ym.y }}</b><div class="muted" style="font-size:12px;font-weight:600">{{ isCur ? 'This month' : '' }}</div></div>
      <button @click="shift(1)" :style="{visibility: isCur ? 'hidden' : ''}" aria-label="Next month"><Ic n="chevron-right"/></button>
    </div>
    <div class="card money-hero">
      <div class="k">Spent</div>
      <div class="amt">{{ fmt(spent) }}<small>T</small></div>
      <template v-if="budget">
        <div class="bar"><i :style="{width: Math.min(100, spent / budget * 100) + '%', background: spent > budget ? '#ffd1d1' : ''}"></i></div>
        <div style="font-size:12.5px;margin-top:6px;opacity:.9;font-weight:600">{{ spent > budget ? short(spent - budget) + ' over budget' : short(budget - spent) + ' left of ' + short(budget) + ' budget' }}</div>
      </template>
      <div class="split">
        <div><small><Ic n="trending-up" :s="13"/>Income</small><b>{{ short(income) }}</b></div>
        <div><small><Ic n="wallet" :s="13"/>Balance</small><b>{{ income - spent < 0 ? '−' : '' }}{{ short(Math.abs(income - spent)) }}</b></div>
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
            <div class="tx"><div class="e">{{ CAT[t.cat] ? CAT[t.cat].e : '✨' }}</div>
              <div class="n">{{ CAT[t.cat] ? CAT[t.cat].l : 'Other' }}<small v-if="t.note">{{ t.note }}</small></div>
              <div class="v" :class="{in: t.type === 'in'}">{{ t.type === 'in' ? '+' : '−' }}{{ fmt(t.amount) }}</div></div>
          </Swipe>
        </TransitionGroup>
      </div>
    </template>
    <Empty v-else e="💸" t="No transactions yet" :s="'Nothing logged for ' + JM[ym.m - 1] + '. Tap + to add one.'"/>
    <button class="fab" @click="ui.tx = {}" aria-label="New transaction"><Ic n="plus" :s="26" :w="2.4"/></button>
  </div>`,
};

const MoreView = {
  setup() {
    const apps = computed(() => {
      const m = S.mood[R.today], nx = cdSorted.value.find(x => x.days >= 0), c = cyc.value;
      return [
        { id: 'notes', n: 'notebook-pen', l: 'Notes', c: 'var(--c-notes)', s: S.notes.length + ' note' + (S.notes.length === 1 ? '' : 's') },
        { id: 'focus', n: 'timer', l: 'Focus', c: 'var(--c-focus)', s: S.timer.running ? mmss(Timer.left()) + ' left' : focusToday.value.min + ' min today' },
        { id: 'water', n: 'droplet', l: 'Water', c: 'var(--c-water)', s: waterToday.value + ' / ' + S.settings.waterGoal + ' glasses' },
        { id: 'mood', n: 'smile', l: 'Mood', c: 'var(--c-mood)', s: m ? MOODS[m.v - 1].e + ' ' + MOODS[m.v - 1].l : 'Not logged today' },
        { id: 'countdowns', n: 'hourglass', l: 'Countdowns', c: 'var(--c-count)', s: nx ? (nx.days ? nx.days + ' days to ' + nx.c.title : nx.c.title + ' is today!') : 'Nothing planned' },
        { id: 'cycle', n: 'flower-2', l: 'Cycle', c: 'var(--c-cycle)', s: c.has ? 'Day ' + c.day + ' · ' + c.phase : 'Set up tracking' },
      ];
    });
    return { apps };
  },
  template: `<div class="view">
    <header class="top"><div class="grow"><h1>More</h1><div class="sub">All your tools</div></div></header>
    <div class="apps">
      <button v-for="a in apps" :key="a.id" class="app-tile tap" :style="{'--c': a.c}" @click="go(a.id)">
        <div class="ico"><Ic :n="a.n" :s="22" :w="2.2"/></div><b>{{ a.l }}</b><small>{{ a.s }}</small></button>
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
    <div class="settings-group"><button class="list-row" style="width:100%;text-align:left" @click="go('alerts')">
      <span class="bubble" style="--c:var(--c-water)"><Ic n="bell" :s="18"/></span>
      <div class="grow"><div class="t">{{ S.settings.waterRemind.on ? 'Every ' + everyLabel(S.settings.waterRemind.every) + ', ' + S.settings.waterRemind.start + '–' + S.settings.waterRemind.end : 'Water reminders are off' }}</div>
        <div class="s">{{ S.settings.waterRemind.on ? (waterNext.length ? 'Next at ' + hm(waterNext[0]) + (isToday(waterNext[0]) ? '' : ' ' + rel(keyOf(new Date(waterNext[0]))).toLowerCase()) : 'No upcoming reminders') : 'Get a nudge to drink through the day' }}</div></div>
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

const CycleView = {
  setup() {
    const cfg = ref(false);
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
    const who = computed(() => S.settings.cycle.name.trim());
    const startDate = ref(R.today);
    function logStart() { if (!S.cycleDays.includes(startDate.value)) S.cycleDays.push(startDate.value); Native.vibrate(14); if (Native.has) Native.askNotify(); }
    const history = computed(() => {
      const p = cyc.value.periods;
      return p.map((x, i) => ({ ...x, plen: diffDays(x.start, x.end) + 1, clen: p[i + 1] ? diffDays(x.start, p[i + 1].start) : null })).reverse().slice(0, 8);
    });
    const primary = computed(() => {
      const t = R.today;
      if (S.cycleDays.includes(t)) return { l: 'Remove today', ghost: true };
      if (S.cycleDays.includes(addDays(t, -1))) return { l: 'Period continues today' };
      return { l: 'Log period started today' };
    });
    return { cfg, cm, shift, cells, jRange, who, startDate, logStart, history, primary, WK, MONTHS };
  },
  template: `<div class="view" style="--acc:var(--c-cycle)">
    <Head title="Cycle" :sub="who ? 'Tracking for ' + who + ' 💗' : 'Your period & fertility tracker'"><button class="icon-btn" @click="cfg = true" aria-label="Cycle settings"><Ic n="settings" :s="19"/></button></Head>

    <template v-if="!cyc.has">
      <div class="card" style="text-align:center;padding:28px 20px">
        <div style="font-size:48px">🌸</div>
        <h2 style="font-size:20px;font-weight:750;margin-top:8px">Let's set things up</h2>
        <p class="muted" style="margin-top:6px">When did {{ who ? who + '\\'s' : 'the' }} last period start? Predictions get smarter with every cycle you log.</p>
        <span class="flabel" style="text-align:left">Name (optional)</span>
        <input class="field" v-model="S.settings.cycle.name" placeholder="Leave empty if it's your own cycle" enterkeyhint="done">
        <span class="flabel" style="text-align:left">Last period started</span>
        <label class="field row" style="position:relative;text-align:left"><Ic n="calendar" :s="18" class="muted"/><span class="grow">{{ gFull(startDate) }}</span><span class="muted" style="font-size:13px">{{ jFull(startDate) }}</span>
          <input type="date" class="overlay-input" v-model="startDate" :max="R.today"></label>
        <button class="btn primary block" style="margin-top:20px" @click="logStart">Start tracking</button>
      </div>
    </template>

    <template v-else>
      <div class="card cyc-hero" :style="{'--pc': cyc.pc}">
        <div style="display:flex;justify-content:center">
          <Ring :v="Math.min(1, cyc.day / cyc.len)" :size="200" :sw="13" :c="cyc.pc">
            <div><div class="day">Day</div><div class="num">{{ cyc.day }}</div><span class="ph"><span class="dot" :style="{background: cyc.pc}"></span>{{ cyc.phase }}</span></div>
          </Ring>
        </div>
        <div class="msg">{{ cyc.toNext > 1 ? 'Next period in ' + cyc.toNext + ' days' : cyc.toNext === 1 ? 'Period expected tomorrow' : cyc.toNext === 0 ? 'Period expected today' : 'Period is ' + -cyc.toNext + ' day' + (cyc.toNext === -1 ? '' : 's') + ' late' }}</div>
        <div class="msg2">{{ gFull(cyc.next) }} · {{ jFull(cyc.next) }}</div>
        <div class="msg2" style="margin-top:12px;color:var(--text-2)">{{ cyc.tip }}</div>
        <button class="btn block" :class="primary.ghost ? '' : 'primary'" style="margin-top:18px" @click="togglePeriodDay(R.today)"><Ic :n="primary.ghost ? 'x' : 'droplet'" :s="18"/>{{ primary.l }}</button>
      </div>

      <div class="grid2">
        <div class="card"><div class="muted" style="font-size:12.5px;font-weight:600">Fertile window</div><div style="font-weight:750;margin-top:4px">{{ gLabel(cyc.fStart) }} – {{ gLabel(cyc.fEnd) }}</div><div class="muted" style="font-size:12px;margin-top:2px">{{ jLabel(cyc.fStart) }} – {{ jLabel(cyc.fEnd) }}</div></div>
        <div class="card"><div class="muted" style="font-size:12.5px;font-weight:600">Ovulation</div><div style="font-weight:750;margin-top:4px">{{ gFull(cyc.ov).split(', ')[1] }}</div><div class="muted" style="font-size:12px;margin-top:2px">{{ jLabel(cyc.ov) }} · {{ WDL[parseKey(cyc.ov).getDay()] }}</div></div>
      </div>

      <div class="card" style="margin-top:12px">
        <div class="cal-head">
          <button class="icon-btn plain" @click="shift(-1)" aria-label="Previous month"><Ic n="chevron-left"/></button>
          <div style="text-align:center"><b>{{ MONTHS[cm.m] }} {{ cm.y }}</b><small>{{ jRange }}</small></div>
          <button class="icon-btn plain" @click="shift(1)" aria-label="Next month"><Ic n="chevron-right"/></button>
        </div>
        <div class="cal">
          <div v-for="w in WK" :key="w" class="wd">{{ w }}</div>
          <button v-for="c in cells" :key="c.k" :class="[cyc.map[c.k], {out: c.out, td: c.k === R.today, 'fut-dis': c.k > R.today}]" @click="togglePeriodDay(c.k)">{{ c.d }}<small>{{ c.j }}</small></button>
        </div>
        <div class="legend">
          <span><i style="background:var(--c-cycle)"></i>Period</span>
          <span><i style="border:2px dashed var(--c-cycle)"></i>Predicted</span>
          <span><i style="background:color-mix(in srgb,#2dd4bf 30%,transparent)"></i>Fertile</span>
          <span><i style="background:#14b8a6"></i>Ovulation</span>
        </div>
        <p class="muted" style="font-size:12.5px;margin-top:10px">Tap a past day to mark or unmark a period day.</p>
      </div>

      <div class="card">
        <div class="sec"><h3>Insights</h3></div>
        <div class="stat-row">
          <div class="stat"><b>{{ cyc.len }}d</b><span>Avg cycle</span></div>
          <div class="stat"><b>{{ cyc.plen }}d</b><span>Avg period</span></div>
          <div class="stat"><b>{{ cyc.periods.length }}</b><span>Logged</span></div>
        </div>
        <template v-if="history.length">
          <span class="flabel">History</span>
          <div v-for="h in history" :key="h.start" class="list-row">
            <span class="bubble" style="--c:var(--c-cycle)"><Ic n="droplet" :s="17"/></span>
            <div class="grow"><div class="t">{{ gLabel(h.start) }} · {{ jLabel(h.start) }}</div><div class="s">{{ h.plen > 1 ? h.plen + ' day period' : 'Start logged' }}</div></div>
            <span v-if="h.clen" class="badge">{{ h.clen }}d cycle</span><span v-else class="badge" style="color:var(--c-cycle)">Current</span>
          </div>
        </template>
      </div>
      <p class="muted" style="font-size:12px;text-align:center;margin:18px 10px 0">Predictions are estimates based on logged cycles. Not for contraception or medical use.</p>
    </template>

    <Sheet :open="cfg" title="Cycle settings" @close="cfg = false">
      <div style="--acc:var(--c-cycle)">
        <span class="flabel" style="margin-top:4px">Name</span>
        <input class="field" v-model="S.settings.cycle.name" placeholder="Leave empty if it's your own cycle" enterkeyhint="done">
        <div class="settings-group" style="box-shadow:none;margin-top:16px">
          <div class="list-row"><div class="grow"><div class="t">Typical cycle length</div><div class="s">Used until 2+ cycles are logged</div></div><Stepper v-model="S.settings.cycle.len" :min="20" :max="45" unit="d"/></div>
          <div class="list-row"><div class="grow"><div class="t">Typical period length</div></div><Stepper v-model="S.settings.cycle.plen" :min="2" :max="10" unit="d"/></div>
          <div class="list-row" v-if="remPossible"><div class="grow"><div class="t">Reminders</div><div class="s">2 days before & on the expected day</div></div><Toggle v-model="S.settings.cycle.notify"/></div>
        </div>
        <button v-if="S.cycleDays.length" class="btn danger block" style="margin-top:18px" @click="S.cycleDays.splice(0); cfg = false; say('Cycle data cleared')">Clear all cycle data</button>
      </div>
    </Sheet>
  </div>`,
};

const NotificationsView = {
  setup() {
    const w = S.settings.waterRemind;
    const EVERY = [30, 60, 90, 120, 180];
    const DAYS = [{ l: 'Sa', v: 6 }, { l: 'Su', v: 0 }, { l: 'Mo', v: 1 }, { l: 'Tu', v: 2 }, { l: 'We', v: 3 }, { l: 'Th', v: 4 }, { l: 'Fr', v: 5 }];
    const toggleDay = v => { const i = w.days.indexOf(v); i >= 0 ? w.days.splice(i, 1) : w.days.push(v); Native.vibrate(6); };
    const badWindow = computed(() => w.end <= w.start);
    const perDay = computed(() => OrbitSchedule.perDay(w));
    const goalHit = computed(() => w.stopAtGoal && waterToday.value >= S.settings.waterGoal);
    const ICON = { tasks: ['circle-check', 'var(--c-tasks)'], water: ['droplet', 'var(--c-water)'], focus: ['timer', 'var(--c-focus)'], cycle: ['flower-2', 'var(--c-cycle)'] };
    const upcoming = computed(() => {
      const water = w.on ? waterNext.value.map(at => ({ id: 'w' + at, at, ch: 'water', title: 'Drink water', body: '' })) : [];
      return [...plan.value, ...water].sort((a, b) => a.at - b.at).slice(0, 6);
    });
    const whenLabel = ms => (isToday(ms) ? 'Today' : rel(keyOf(new Date(ms)))) + ' · ' + hm(ms);
    function toggleWater(v) { w.on = v; if (v && Native.has) Native.askNotify(); }
    const status = computed(() => {
      if (Native.has) return Rem.androidOn ? 'on' : 'blocked';
      if (!PUSH_SUPPORTED) return IOS && !STANDALONE ? 'install' : 'unsupported';
      if (Rem.perm === 'denied') return 'denied';
      if (!Rem.push.token) return 'off';
      return Rem.state === 'error' ? 'error' : 'on';
    });
    return { w, EVERY, DAYS, toggleDay, badWindow, perDay, goalHit, upcoming, whenLabel, toggleWater, status, ICON, everyLabel, hm };
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

    <div class="label">Water</div>
    <div class="settings-group" style="--acc:var(--c-water)">
      <div class="list-row"><span class="bubble" style="--c:var(--c-water)"><Ic n="droplet" :s="18"/></span>
        <div class="grow"><div class="t">Water reminders</div><div class="s">{{ w.on ? perDay + ' a day' + (goalHit ? ' · paused today, goal reached 🎉' : '') : 'Nudges to drink through the day' }}</div></div>
        <Toggle :model-value="w.on" @update:model-value="toggleWater"/></div>
      <template v-if="w.on">
        <div class="list-row" style="display:block">
          <div class="t" style="margin-bottom:10px">Remind me every</div>
          <div class="chips"><button v-for="m in EVERY" :key="m" class="chip" :class="{on: w.every === m}" @click="w.every = m">{{ everyLabel(m) }}</button></div>
        </div>
        <div class="list-row" style="display:block">
          <div class="t" style="margin-bottom:10px">Between</div>
          <div class="row" style="gap:10px">
            <label class="chip on time-chip"><Ic n="sun" :s="15"/>{{ w.start }}<input type="time" v-model="w.start"></label>
            <span class="muted">to</span>
            <label class="chip on time-chip"><Ic n="moon" :s="15"/>{{ w.end }}<input type="time" v-model="w.end"></label>
          </div>
          <div v-if="badWindow" class="hint warn" style="margin-top:10px"><span class="grow">The end time needs to be after the start time</span></div>
        </div>
        <div class="list-row" style="display:block">
          <div class="t" style="margin-bottom:10px">On these days</div>
          <div class="day-dots"><button v-for="d in DAYS" :key="d.v" :class="{on: w.days.includes(d.v)}" @click="toggleDay(d.v)">{{ d.l }}</button></div>
        </div>
        <div class="list-row"><div class="grow"><div class="t">Pause after daily goal</div><div class="s">Stop for the day once you've had {{ S.settings.waterGoal }} glasses</div></div><Toggle v-model="w.stopAtGoal"/></div>
      </template>
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
      <span class="muted" style="font-weight:600">Toman</span></div></div>

    <div class="label">Notifications</div>
    <div class="settings-group"><button class="list-row" style="width:100%;text-align:left" @click="go('alerts')">
      <span class="bubble" style="--c:var(--c-focus)"><Ic n="bell" :s="18"/></span>
      <div class="grow"><div class="t">Notifications</div><div class="s">{{ remReady ? 'On · tasks, water, focus & cycle' : 'Off · tap to set up' }}</div></div>
      <span class="dot" :style="{background: remReady ? 'var(--c-habits)' : 'var(--c-focus)'}"></span><Ic n="chevron-right" :s="18" class="muted"/></button></div>

    <div class="label">Your data</div>
    <div class="settings-group">
      <button class="list-row" style="width:100%;text-align:left" @click="exportData"><span class="bubble" style="--c:var(--c-water)"><Ic n="upload" :s="18"/></span>
        <div class="grow"><div class="t">Export backup</div><div class="s">{{ IOS ? 'Save to Files or send via Telegram' : 'Share to Telegram, email or Files' }}</div></div><Ic n="chevron-right" :s="18" class="muted"/></button>
      <button class="list-row" style="width:100%;text-align:left" @click="imp = true"><span class="bubble" style="--c:var(--c-habits)"><Ic n="download" :s="18"/></span>
        <div class="grow"><div class="t">Restore backup</div><div class="s">Paste a backup you exported</div></div><Ic n="chevron-right" :s="18" class="muted"/></button>
      <button class="list-row" style="width:100%;text-align:left" @click="reset = true"><span class="bubble" style="--c:var(--c-danger)"><Ic n="trash-2" :s="18"/></span>
        <div class="grow"><div class="t" style="color:var(--c-danger)">Erase everything</div><div class="s">{{ counts }} items stored on this phone</div></div></button>
    </div>
    <p class="muted" style="text-align:center;font-size:12.5px;margin-top:26px">Orbit 1.0 · Everything stays on your device 🔒</p>

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
      const fit = () => { document.documentElement.style.setProperty('--vvh', vv.height + 'px'); document.documentElement.style.setProperty('--vvt', vv.offsetTop + 'px'); };
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
      notes: NotesView, focus: FocusView, water: WaterView, mood: MoodView, countdowns: CountdownsView, cycle: CycleView, settings: SettingsView, alerts: NotificationsView,
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
      <Transition name="view" mode="out-in" @before-enter="toTop"><component :is="views[current]" :key="current"/></Transition>
      <nav class="tabbar">
        <button v-for="t in tabs" :key="t.id" :class="{on: nav.tab === t.id}" :style="{'--acc': t.c}" @click="tab(t.id)">
          <span class="pill"><Ic :n="t.n" :s="21" :w="nav.tab === t.id ? 2.3 : 2"/></span>{{ t.l }}</button>
      </nav>
      <TaskSheet/><TxSheet/>
    </template>
    <Transition name="toast"><div v-if="toast.msg" class="toast" :key="toast.id"><span>{{ toast.msg }}</span><button v-if="toast.undo" @click="doUndo"><Ic n="undo-2" :s="15" style="display:inline;vertical-align:-2px"/> Undo</button></div></Transition>
  </div>`,
};

const app = createApp(App);
Object.assign(app.config.globalProperties, {
  S, R, nav, ui, toast, Timer, Native, IOS, STANDALONE, MOODS, Rem, PUSH_SUPPORTED, remPossible, BEFORE, enablePush, disablePush, testNotify, askAndroidNotify, MODES, JM, WDL, CAT, justDone,
  go, say, doUndo, scheduleSync, hm, isToday, everyLabel, keyOf, fmt, short, words, mmss, rel, ago, jLabel, jFull, gLabel, gFull, parseKey, addDays,
  toggleTask, delTask, prioC, toggleHabit, streak, addWater, setMood, togglePeriodDay,
});
// computed refs on globalProperties are not auto-unwrapped, so expose them as live getters
const live = { focusStreak, waterToday, focusToday, spentThisMonth, curJ, cyc, cdSorted, plan, waterNext, remReady };
for (const [k, c] of Object.entries(live)) Object.defineProperty(app.config.globalProperties, k, { get: () => c.value });
app.component('Ic', Ic).component('Ring', Ring).component('Check', Check).component('Sheet', Sheet).component('Swipe', Swipe)
  .component('Head', Head).component('Stepper', Stepper).component('Toggle', Toggle).component('DatePick', DatePick)
  .component('Empty', Empty).component('TaskSheet', TaskSheet).component('TxSheet', TxSheet).component('Onboarding', Onboarding);
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
