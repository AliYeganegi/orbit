/* App state: loading and saving (orbit.v1), data shape checks, migrations, backup and restore. */
/* ================= state ================= */
const KEY = 'orbit.v1';
const defaults = () => ({
  settings: {
    name: '', theme: 'system', onboarded: false, lang: 'en',
    waterGoal: 8, glassMl: 250, budget: 0,
    focus: { work: 25, short: 5, long: 15, rounds: 4, goal: 4, autoBreak: false, autoFocus: false, sound: true, keepAwake: true },
    cycle: { name: '', len: 28, plen: 5, expected: '', notify: true, goal: 'track', fertileNotify: false, showToday: true, pill: { on: false, time: '21:00' }, tip: { on: false, time: '09:00' } },
    notify: { tasks: true, focus: true, chat: true, question: true },
    sms: { on: false, unit: 'rial', last: 0, since: 0 },
    waterRemind: { on: false, every: 60, start: '09:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6], stopAtGoal: true },
    // Today: hidden sections and their order; evening wrap-up done for this day
    today: { hide: [], order: [] }, wrap: '',
    // what the timeline and weekly review include (cycle only when asked for)
    review: { money: true, cycle: false },
  },
  tasks: [], habits: [], notes: [], money: [], customCats: [], countdowns: [], cycleDays: [], cycleLog: {}, smsSeen: [], accounts: [], reminders: [],
  water: {}, mood: {}, focusLog: {}, reviews: {},
  timer: { mode: 'work', running: false, endAt: 0, left: 25 * 60, total: 25 * 60, count: 0, label: '' },
});
// Data format version. Bump it when a migration below changes the shape of saved data.
const SCHEMA = 2;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
// expected type of every top-level field; anything else from storage or a restore falls back to the default
const SHAPE = {
  tasks: 'list', habits: 'list', notes: 'list', money: 'list', customCats: 'list', countdowns: 'list', accounts: 'list', reminders: 'list',
  cycleDays: 'strings', smsSeen: 'strings', cycleLog: 'map', water: 'map', mood: 'map', focusLog: 'map', timer: 'map', settings: 'map', reviews: 'map',
};
/**
 * Merges saved (or restored) data over the defaults, type-checking every field so one bad value can't stop the app
 * from starting. `issues` collects the names of fields that were dropped. Unknown top-level fields (from a newer
 * version) are kept so a round trip doesn't lose them.
 */
function hydrate(raw, issues = []) {
  const d = defaults();
  if (!isObj(raw)) { issues.push('format'); return d; }
  for (const k of Object.keys(raw)) {
    const v = raw[k], want = SHAPE[k];
    if (!want) { if (!(k in d) && k !== 'schema') d[k] = v; continue; }
    if (v === undefined) continue;
    if (want === 'list' && Array.isArray(v)) { d[k] = v.filter(isObj); if (d[k].length !== v.length) issues.push(k); }
    else if (want === 'strings' && Array.isArray(v)) d[k] = v.filter(x => typeof x === 'string');
    else if (want === 'map' && isObj(v)) d[k] = v;
    else issues.push(k);
  }
  d.timer = { ...defaults().timer, ...(isObj(raw.timer) ? raw.timer : {}) };
  const s = isObj(raw.settings) ? raw.settings : {}, ds = defaults().settings, o = v => (isObj(v) ? v : {});
  const cy = o(s.cycle);
  d.settings = { ...ds, ...s, sms: { ...ds.sms, ...o(s.sms) }, focus: { ...ds.focus, ...o(s.focus) },
    cycle: { ...ds.cycle, ...cy, pill: { ...ds.cycle.pill, ...o(cy.pill) }, tip: { ...ds.cycle.tip, ...o(cy.tip) } },
    notify: { ...ds.notify, ...o(s.notify) }, waterRemind: { ...ds.waterRemind, ...o(s.waterRemind) },
    today: { hide: Array.isArray(o(s.today).hide) ? s.today.hide : [], order: Array.isArray(o(s.today).order) ? s.today.order : [] },
    review: { ...ds.review, ...o(s.review) } };
  d.schema = SCHEMA;
  return d;
}
// storage health, shown as a banner when something is wrong
const Store = reactive({ error: '', corrupt: '', readonly: false });
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { Store.error = 'unavailable'; }
  if (raw == null) return defaults();
  try { return hydrate(JSON.parse(raw)); } catch (e) {
    // unreadable: keep the original text so it can still be recovered, and never write over it unasked
    const k = KEY + '.corrupt.' + Date.now();
    try { localStorage.setItem(k, raw); Store.corrupt = k; } catch (e2) { Store.corrupt = KEY; Store.readonly = true; }
    return defaults();
  }
}
const S = reactive(load());
let saveT;
function saveNow() {
  if (Store.readonly) return false;
  const json = JSON.stringify(S);
  try { localStorage.setItem(KEY, json); Store.error = ''; return true; } catch (e) {
    // the chat cache is only a cache: drop it to make room, then try once more
    try { localStorage.removeItem('orbit.chatcache'); localStorage.setItem(KEY, json); Store.error = ''; return true; } catch (e2) { Store.error = 'full'; return false; }
  }
}
watch(S, () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 200); }, { deep: true });
document.addEventListener('visibilitychange', () => document.hidden && saveNow());
// migrations never stop the app from starting: a failure is skipped and retried on the next launch
const migrate = (name, fn) => { try { fn(); } catch (e) { console.warn('migration skipped: ' + name); } };

/* ---------- backup & restore ---------- */
// a backup can hold the whole app or only some parts; restoring replaces only the parts it contains
const MODULES = [
  { id: 'tasks', l: 'Tasks', keys: ['tasks'] },
  { id: 'habits', l: 'Habits', keys: ['habits'] },
  { id: 'notes', l: 'Notes & weekly reviews', keys: ['notes', 'reviews'] },
  { id: 'money', l: 'Money', keys: ['money', 'accounts', 'customCats', 'smsSeen'] },
  { id: 'reminders', l: 'Reminders & countdowns', keys: ['reminders', 'countdowns'] },
  { id: 'wellbeing', l: 'Water, mood & focus', keys: ['water', 'mood', 'focusLog'] },
  { id: 'cycle', l: 'Cycle', keys: ['cycleDays', 'cycleLog'] },
  { id: 'settings', l: 'Settings', keys: ['settings', 'timer'] },
];
const MAX_BACKUP = 25e6;
const BEFORE_RESTORE = KEY + '.before-restore';
function makeBackup(mods) {
  const all = mods.length === MODULES.length, data = {};
  for (const m of MODULES) if (mods.includes(m.id)) for (const k of m.keys) data[k] = S[k];
  if (all) for (const k of Object.keys(S)) if (!(k in data) && k !== 'schema') data[k] = S[k]; // fields from newer versions
  return JSON.stringify({ app: 'orbit', v: 2, schema: SCHEMA, appVersion: APP_VERSION, at: new Date().toISOString(), modules: mods, data });
}
const countOf = d => ({
  tasks: (d.tasks || []).length, habits: (d.habits || []).length, notes: (d.notes || []).length + Object.keys(d.reviews || {}).length, money: (d.money || []).length,
  reminders: (d.reminders || []).length + (d.countdowns || []).length, wellbeing: Object.keys(d.water || {}).length + Object.keys(d.mood || {}).length + Object.keys(d.focusLog || {}).length,
  cycle: (d.cycleDays || []).length + Object.keys(d.cycleLog || {}).length, settings: d.settings ? 1 : 0,
});
/** Reads and checks a backup without changing anything. Returns { error } or a preview. */
function readBackup(text) {
  text = String(text || '').trim();
  if (!text) return { error: 'The backup is empty' };
  if (text.length > MAX_BACKUP) return { error: 'This file is too large to be an Orbit backup' };
  let j;
  try { j = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { return { error: 'This isn\'t a readable backup file. Make sure you copied all of it' }; }
  let data, mods, at = '', ver = '';
  if (isObj(j) && j.app === 'orbit' && isObj(j.data)) {
    data = j.data; at = j.at || ''; ver = j.appVersion || '';
    mods = Array.isArray(j.modules) ? MODULES.map(m => m.id).filter(id => j.modules.includes(id)) : MODULES.map(m => m.id);
  } else if (isObj(j) && Object.keys(SHAPE).filter(k => k in j).length >= 3) {
    data = j; mods = MODULES.map(m => m.id); // very old backups were the raw saved state
  } else return { error: 'This isn\'t an Orbit backup' };
  const issues = [];
  const typed = hydrate(data, issues);
  const wanted = new Set(mods.flatMap(id => MODULES.find(m => m.id === id).keys));
  const bad = issues.filter(k => wanted.has(k) || k === 'format');
  const newer = (j.schema || 0) > SCHEMA;
  const counts = countOf(data);
  const empty = mods.every(id => !counts[id]);
  return { data: typed, mods, at, ver, counts, bad, newer, empty };
}
/** Replaces the parts of the data a checked backup contains. A safety copy is saved first; nothing changes if that fails. */
function applyBackup(b) {
  const snap = JSON.stringify(S);
  try { localStorage.setItem(BEFORE_RESTORE, JSON.stringify({ at: Date.now(), state: snap })); } catch (e) { return 'There isn\'t enough space to keep a safety copy of your current data, so nothing was changed. Export a backup and free some space first.'; }
  const lang = S.settings.lang;
  for (const id of b.mods) for (const k of MODULES.find(m => m.id === id).keys) S[k] = b.data[k];
  if (b.mods.length === MODULES.length) for (const k of Object.keys(b.data)) if (!SHAPE[k] && k !== 'schema') S[k] = b.data[k];
  S.settings.onboarded = true;
  runMigrations();
  if (!saveNow()) { // couldn't be saved: put everything back exactly as it was
    const old = JSON.parse(snap); for (const k of Object.keys(S)) delete S[k]; Object.assign(S, old);
    return 'The restored data couldn\'t be saved (storage is full), so your current data was kept.';
  }
  if ((S.settings.lang || 'en') !== (lang || 'en')) { window.orbitBeforeReload && window.orbitBeforeReload(); location.reload(); }
  return '';
}
function undoRestore() {
  let b;
  try { b = JSON.parse(localStorage.getItem(BEFORE_RESTORE)); } catch (e) { b = null; }
  if (!b || !b.state) return false;
  const old = hydrate(JSON.parse(b.state));
  for (const k of Object.keys(S)) if (!(k in old)) delete S[k];
  Object.assign(S, old);
  if (!saveNow()) return false;
  try { localStorage.removeItem(BEFORE_RESTORE); } catch (e) {}
  return true;
}
const restoreUndoAt = () => { try { return (JSON.parse(localStorage.getItem(BEFORE_RESTORE)) || {}).at || 0; } catch (e) { return 0; } };

function runMigrations() {
// one-off cleanup of the notification test run on the developer's phone (2026-10-12); no-op elsewhere
migrate('test-cleanup', () => {
  const bk = JSON.parse(localStorage.getItem('orbit.testBackup'));
  if (bk) {
    S.tasks = S.tasks.filter(t => t.id !== 'zztest');
    Object.assign(S.settings.waterRemind, bk.water);
    const k = keyOf(new Date());
    if (bk.count) S.water[k] = bk.count; else delete S.water[k];
    localStorage.removeItem('orbit.testBackup');
  }
});

// one-off (1.6): earlier versions imported 30 days of SMS as drafts; only keep what the user already categorized
migrate('sms-backfill', () => {
  if (S.settings.sms.on && !S.settings.sms.since) {
    S.money = S.money.filter(t => !(t.src === 'sms' && t.pending));
    S.settings.sms.since = Date.now(); S.settings.sms.last = Date.now();
  }
});

// one-off (1.8): the water schedule becomes a regular, editable reminder
migrate('water-reminder', () => {
  if (!S.settings.remMigrated) {
    const w = S.settings.waterRemind || {};
    if (!S.reminders.some(r => r.water)) S.reminders.unshift({ id: 'water', on: !!w.on, water: true, title: 'Drink water', emoji: '💧', color: '#3ba4ff', note: '',
      kind: 'interval', every: w.every || 60, start: w.start || '09:00', end: w.end || '22:00', days: w.days || [0, 1, 2, 3, 4, 5, 6], stopAtGoal: w.stopAtGoal !== false,
      until: '', created: Date.now() });
    S.settings.remMigrated = true;
  }
});
}
runMigrations();

// now: every second (timers); min: once a minute, for lists that only need minute precision
const R = reactive({ now: Date.now(), min: Math.floor(Date.now() / 60e3) * 60e3, today: keyOf(new Date()), sysDark: Native.sysDark() });
// tab: bottom bar; screen: a full screen over it; arg: its parameter; plan: the Tasks tab's section (tasks | reminders)
const nav = reactive({ tab: 'today', screen: null, arg: null, plan: 'tasks' });
const ui = reactive({ task: null, tx: null, accounts: null, budget: false, rem: null, capture: null });
const toast = reactive({ msg: '', undo: null, id: 0 });
let toastT;
function say(msg, undo) {
  toast.msg = msg; toast.undo = undo || null; toast.id++;
  clearTimeout(toastT);
  toastT = setTimeout(() => { toast.msg = ''; }, undo ? 4500 : 2400);
}
function doUndo() { const u = toast.undo; toast.msg = ''; u && u(); }
/** Switching language reloads the app in the new one (right-to-left for Farsi). */
function setLang(l) {
  if ((S.settings.lang || 'en') === l) return;
  S.settings.lang = l; saveNow();
  if (Soc.acct) api('/me', { lang: l }).catch(() => {});
  if (window.orbitBeforeReload) window.orbitBeforeReload();
  location.reload();
}
const TABS = ['today', 'tasks', 'habits', 'money', 'more'];
/** Opens a place in the app: a tab ('money'), a screen ('settings'), a chat ('pair:<id>'), a screen with a
 *  parameter ('timeline:2025-10-01'), or Reminders (a section of the Tasks tab). Used by links, notifications and resume. */
function go(where) {
  nav.arg = null;
  if (!where) { nav.screen = null; return; }
  if (where.startsWith('pair:')) { Soc.open = where.slice(5); nav.screen = 'pair'; return; }
  if (where === 'reminders' || where === 'tasks') { nav.plan = where; nav.tab = 'tasks'; nav.screen = null; return; }
  if (TABS.includes(where)) { nav.tab = where; nav.screen = null; return; }
  const i = where.indexOf(':');
  if (i > 0) nav.arg = where.slice(i + 1);
  nav.screen = i > 0 ? where.slice(0, i) : where;
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
