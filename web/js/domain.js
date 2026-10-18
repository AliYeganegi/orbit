/* Everyday logic: tasks, habits, water, mood, focus timer, money rules and bank SMS import. */
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
/** The task's time (not the reminder) has gone by today or earlier. */
function taskPassed(t) { if (!t.due || !t.time) return false; R.min; const d = parseKey(t.due); const [h, m] = t.time.split(':'); d.setHours(+h, +m, 0, 0); return d.getTime() < Date.now(); }

/* a habit may be for every day (no `days`) or for chosen weekdays, e.g. exercise on Sat, Mon and Wed */
const habitDue = (h, k) => !h.days || !h.days.length || h.days.includes(parseKey(k).getDay());
const dueToday = computed(() => S.habits.filter(h => habitDue(h, R.today)));
function habitDays(h) {
  if (!h.days || !h.days.length || h.days.length === 7) return 'Every day';
  return daysLabel(h.days);
}
function toggleHabit(h, k) {
  if (h.log[k]) delete h.log[k];
  else {
    h.log[k] = true;
    Native.vibrate(14);
    const due = dueToday.value;
    if (k === R.today && due.length > 1 && due.every(x => x.log[R.today])) say('Every habit done today. Legend! 🔥');
  }
}
/** In a row: only the days a habit is scheduled for count, so a rest day never breaks a streak. */
function streak(h) {
  let k = R.today, n = 0;
  if (!h.log[k]) k = addDays(k, -1); // today isn't over yet
  for (let i = 0; i < 3660; i++, k = addDays(k, -1)) {
    if (h.log[k]) n++;
    else if (habitDue(h, k)) break;
    if (h.created && k < keyOf(new Date(h.created)) && !h.log[k]) break;
  }
  return n;
}
function bestStreak(h) {
  const keys = Object.keys(h.log).sort();
  if (!keys.length) return 0;
  let best = 0, cur = 0;
  for (let k = keys[0]; k <= R.today; k = addDays(k, 1)) {
    if (h.log[k]) { cur++; best = Math.max(best, cur); } else if (habitDue(h, k) && k < R.today) cur = 0;
  }
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
  log(min, day = R.today) {
    const l = S.focusLog[day] || (S.focusLog[day] = { min: 0, n: 0, s: [] });
    if (!l.s) l.s = [];
    l.min += min;
    return l;
  },
  finish(auto) {
    const t = S.timer, f = S.settings.focus;
    // if the app was closed when the time ran out, count the session at the moment it ended, quietly
    const endedAt = auto && t.endAt ? Math.min(Date.now(), t.endAt) : Date.now();
    const late = auto && Date.now() - endedAt > 60e3;
    if (t.mode === 'work') {
      const mins = auto ? Math.round(this.total() / 60) : Math.floor(this.elapsed() / 60);
      if (mins > 0) {
        const l = this.log(mins, keyOf(new Date(endedAt)));
        if (auto) l.n++;
        l.s.push({ at: endedAt, min: mins, label: t.label || '', done: !!auto });
      }
      if (auto) t.count++;
      t.mode = auto && t.count % f.rounds === 0 ? 'long' : 'short';
    } else t.mode = 'work';
    t.running = false; t.total = this.len(); t.left = t.total;
    wake.off();
    if (late) { say((t.mode === 'work' ? 'Your break' : 'Your focus session') + ' ended at ' + hm(endedAt)); return; }
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
  const m = Math.floor(R.now / 60e3) * 60e3;
  if (m !== R.min) R.min = m;
  const k = keyOf(new Date());
  if (k !== R.today) R.today = k;
  if (S.timer.running && R.now >= S.timer.endAt) Timer.finish(true);
}, 1000);

/* money */
const curJ = computed(() => jal(R.today));
function monthTx(y, m) { return S.money.filter(t => { const j = jal(t.date); return j.y === y && j.m === m; }); }
const spentThisMonth = computed(() => sumSpend(monthTx(curJ.value.y, curJ.value.m)));

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

/* money rules, in one place, used by Money, Today and Reports:
 * spending = confirmed expenses minus refunds; income excludes refunds; transfers between own accounts are neither;
 * SMS drafts waiting for review are shown separately and only count once confirmed */
const TRANSFER = { id: 'transfer', l: 'Transfer', e: '🔁', c: '#64748b' };
const counted = t => !t.pending;
const spendOf = t => (!counted(t) ? 0 : t.type === 'out' ? t.amount : t.type === 'in' && t.refund ? -t.amount : 0);
const incomeOf = t => (counted(t) && t.type === 'in' && !t.refund ? t.amount : 0);
const sumSpend = list => list.reduce((s, t) => s + spendOf(t), 0);
const sumIncome = list => list.reduce((s, t) => s + incomeOf(t), 0);
function spendByCat(list) { const m = {}; for (const t of list) { const v = spendOf(t); if (v) m[t.cat] = (m[t.cat] || 0) + v; } return m; }
const txIcon = t => (t.type === 'transfer' ? TRANSFER : catOf(t.cat));
const acctName = id => { const a = S.accounts.find(x => x.id === id); return a ? a.name : '?'; };

/* accounts: the balance is the user's (or the bank's) number; the app only applies transactions after it */
// when a transaction happened, for deciding whether a balance snapshot already includes it
function txAt(t) {
  if (t.time) { const d = parseKey(t.date); const [h, m] = t.time.split(':'); d.setHours(+h, +m, 0, 0); return d.getTime(); }
  if (t.created && keyOf(new Date(t.created)) === t.date) return t.created;
  return parseKey(t.date).getTime() + 12 * 3600e3;
}
function acctBalance(a) {
  let b = a.balance || 0;
  for (const t of S.money) {
    if (txAt(t) <= (a.at || 0)) continue;
    if (t.type === 'transfer') { if (t.acct === a.id) b -= t.amount; if (t.acct2 === a.id) b += t.amount; }
    else if (t.acct === a.id) b += t.type === 'in' ? t.amount : -t.amount;
  }
  return b;
}
const totalBalance = computed(() => S.accounts.reduce((s, a) => s + acctBalance(a), 0));
/** The account a bank SMS belongs to. Never guesses: no bank name → none; one bank, several accounts, no number → none. */
function acctFor(bank, card) {
  if (!bank) return null;
  const tail = (card || '').replace(/\D/g, '').slice(-4);
  const same = S.accounts.filter(x => x.bank === bank);
  let a = tail ? same.find(x => (x.tail || '') === tail) : same.length === 1 ? same[0] : null;
  if (!a && tail && same.length === 1 && !same[0].tail) { a = same[0]; a.tail = tail; } // first SMS without a number, then one with it
  if (!a && (tail || !same.length)) { a = { id: uid(), name: bank + (tail ? ' ••' + tail : ''), bank, tail, balance: 0, at: 0, src: 'sms' }; S.accounts.push(a); }
  return a || null;
}

/* bank SMS → draft transactions (Android) */
const Sms = reactive({ granted: false, blocked: false, busy: false });
function smsRefresh() {
  if (!AN || !AN.smsStatus) return;
  try { const st = JSON.parse(AN.smsStatus()); Sms.granted = st.granted; Sms.blocked = st.blocked; } catch (e) {}
}
/** A bank's balance from an SMS: applied automatically unless the person set this account's balance themselves
 *  and the numbers disagree, in which case it's offered as a suggestion instead of silently overwriting it. */
function applySmsBalance(a, bal, at) {
  if (!a || bal == null || at < (a.at || 0)) return;
  if (a.src === 'user' && Math.abs(acctBalance(a) - bal) >= 1) { a.suggest = { v: bal, at }; return; }
  a.balance = bal; a.at = at; if (a.src !== 'user') a.src = 'sms'; delete a.suggest;
}
function smsImport(list) {
  const seen = new Set(S.smsSeen), added = [];
  for (const m of list) {
    // the same message can arrive twice (live receiver and inbox scan use different clocks, or the operator resends)
    const bh = OrbitSms.bodyHash(m.body), legacy = OrbitSms.hash(m.sender, m.ts, m.body);
    if (seen.has(bh) || seen.has(legacy)) continue;
    seen.add(bh);
    const p = OrbitSms.parse(m.body, { sender: m.sender, unit: S.settings.sms.unit });
    if (!p || !p.amount) continue;
    const d = new Date(m.ts);
    const a = acctFor(p.bank, p.card);
    // the bank's "مانده" already includes this transaction; only a confident reading may move a balance
    if (p.confident) applySmsBalance(a, p.balance, m.ts);
    const tx = { id: uid(), type: p.type, amount: p.amount, cat: '', note: '', date: keyOf(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
      created: m.ts, pending: true, src: 'sms', bank: p.bank, card: p.card, balance: p.balance, sms: bh, acct: a ? a.id : '',
      refund: !!p.refund, uncertain: !p.confident, why: p.reasons };
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
  S.money.forEach(t => { if (t.cat && (t.type === 'out' || t.refund)) n[t.cat] = (n[t.cat] || 0) + 1; });
  const ranked = Object.keys(n).filter(id => catOf(id) !== UNCAT).sort((a, b) => n[b] - n[a]);
  for (const c of catsFor('out')) if (!ranked.includes(c.id)) ranked.push(c.id);
  return ranked.slice(0, 5).map(catOf);
});
function categorize(t, cat) {
  const prev = { cat: t.cat, pending: t.pending };
  t.cat = cat; t.pending = false;
  Native.vibrate(10);
  say('Added to ' + catOf(cat).l, () => Object.assign(t, prev));
}
function dismissTx(t) {
  const i = S.money.indexOf(t); if (i < 0) return;
  S.money.splice(i, 1);
  say('Removed', () => S.money.splice(i, 0, t));
}

/* countdowns */
function cdTarget(c) {
  const t = R.today;
  if (c.repeat === 'greg') {
    const d = parseKey(c.date); const ty = parseKey(t).getFullYear();
    for (let y = ty; y <= ty + 1; y++) {
      let dt = new Date(y, d.getMonth(), d.getDate());
      if (dt.getMonth() !== d.getMonth()) dt = new Date(y, d.getMonth() + 1, 0); // Feb 29 → Feb 28 in common years
      const k = keyOf(dt);
      if (k >= t) return k;
    }
  }
  if (c.repeat === 'jal') {
    const j = jal(c.date);
    for (let i = 0; i < 370; i++) {
      const k = addDays(t, i), jj = jal(k);
      // 30 Esfand only exists in leap years: other years it's the last day of Esfand
      if (jj.m === j.m && (jj.d === j.d || (jj.d < j.d && jal(addDays(k, 1)).m !== j.m))) return k;
    }
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
