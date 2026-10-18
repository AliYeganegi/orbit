/* Reminders: the delivery plan (tasks, focus, cycle, personal rules), Android sync and iPhone push. */
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
  if (Native.has && S.settings.notify.question !== false) for (const p of socPairs.value) {
    if (!p.type) continue;
    for (const at of OrbitSchedule.ruleTimes({ kind: 'daily', times: [p.time], days: ALL_DAYS }, Date.now(), p.tz, 7)) {
      const day = OrbitSchedule.dayKey(OrbitSchedule.localParts(at, p.tz));
      if (p.today && p.today.day === day) continue; // that day's question was already asked
      out.push({ id: 'dq:' + p.id + ':' + day, at, ch: 'social', title: '💬 Today\'s question with ' + whoName(p.with), body: 'Answer it, then see what ' + whoName(p.with) + ' said', go: 'pair:' + p.id });
    }
  }
  return out.filter(r => r.at >= now).sort((a, b) => a.at - b.at).map(r => (FA ? { ...r, title: tr(r.title), body: tr(r.body) } : r));
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
  return DAY_DOTS.filter(x => d.includes(x.v)).map(x => WD[x.v]).join(FA ? '، ' : ', ');
}
function remSummary(r) {
  const AT = FA ? ' ساعت ' : ' at ';
  if (r.kind === 'once') return r.date ? (FA ? 'یک‌بار · ' : 'Once · ') + rel(r.date) + AT + r.time : (FA ? 'یک‌بار' : 'Once');
  if (r.kind === 'daily') return daysLabel(r.days) + AT + (r.times || []).slice().sort().join(FA ? '، ' : ', ');
  if (r.kind === 'interval') return 'Every ' + everyLabel(r.every) + ' · ' + r.start + '–' + r.end + (daysLabel(r.days) === 'Every day' ? '' : ' · ' + daysLabel(r.days));
  if (r.kind === 'monthly') return 'Monthly on day ' + r.dom + (r.cal === 'jal' ? ' (Shamsi)' : '') + ' at ' + r.time;
  return '';
}
/** The rule a deliverer needs: schedule fields + display text (+ live water progress). */
function remRule(r) {
  const base = { id: r.id, on: r.on !== false, kind: r.kind, until: r.until || '', water: !!r.water, title: (r.emoji ? r.emoji + ' ' : '') + (r.title || tr('Reminder')), body: r.note || tr(remSummary(r)) };
  if (r.kind === 'once') Object.assign(base, { date: r.date, time: r.time });
  if (r.kind === 'daily') Object.assign(base, { times: r.times, days: r.days });
  if (r.kind === 'interval') Object.assign(base, { every: r.every, start: r.start, end: r.end, days: r.days, stopAtGoal: !!r.stopAtGoal });
  if (r.kind === 'monthly') Object.assign(base, { dom: r.dom, cal: r.cal, time: r.time });
  if (r.water) {
    const goal = S.settings.waterGoal, count = waterToday.value;
    Object.assign(base, { title: tr('💧 Time for some water'), goal, count, day: R.today, glassMl: S.settings.glassMl, goalDay: count >= goal ? R.today : null });
  }
  return base;
}
/** Notification text for Android, in the person's language; {c} and {g} are filled in on the phone. */
const trSlots = str => tr(str.replace('{c}', '7301').replace('{g}', '7302')).replace('7301', '{c}').replace('7302', '{g}');
const WATER_TEXT = () => ({ t_none: tr('No water logged yet today'), t_some: trSlots('{c} of {g} glasses so far today'), t_add: trSlots('+1 glass ({c} ml)'),
  t_goal: tr('Goal reached! 🎉'), t_logged: tr('Logged 💧'), t_today: trSlots('{c} of {g} glasses today') });
const remRules = computed(() => S.reminders.filter(r => r.on !== false).map(remRule));
const remNext = r => OrbitSchedule.ruleTimes(remRule(r), Date.now(), TZ, 3);
const waterRem = computed(() => S.reminders.find(r => r.water));
const waterNext = computed(() => { R.min; return waterRem.value && waterRem.value.on !== false ? remNext(waterRem.value) : []; });

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
/** Android extras: translated texts, and what a snooze may still remind about. */
function nativePayload() {
  const p = payload();
  const w = WATER_TEXT();
  p.rules = p.rules.map(r => (r.water ? { ...r, ...w } : r));
  p.labels = { done: tr('✓ Done'), snooze: trSlots('Snooze {c} min') };
  p.live = S.tasks.filter(t => !t.done).map(t => 'task:' + t.id);
  return p;
}
let syncTimer, retryIn = 30e3;
function scheduleSync(ms = 600) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms); }
async function syncNow() {
  const p = payload();
  if (AN) {
    try { AN.sync(JSON.stringify(nativePayload())); Rem.state = 'ok'; Rem.last = Date.now(); } catch (e) { Rem.state = 'error'; }
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
  if (Native.has) { say('Sending a test in 5 seconds…'); AN.sync(JSON.stringify({ ...nativePayload(), reminders: [...plan.value, { id: 'test:' + Date.now(), at: Date.now() + 5000, ch: 'tasks', title: '🔔 Orbit test', body: 'Notifications work!', go: 'alerts' }] })); return; }
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
// Android switches to newly downloaded screens by reloading: save first, then come back to the same place
// open editors register a function returning their unsaved form, so it survives the reload
