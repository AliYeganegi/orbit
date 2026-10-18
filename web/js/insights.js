/* Quick capture text sorting, the daily timeline, the weekly review and habit patterns. */
/* ================= quick capture ================= */
// Typed text is sorted into a task, note, expense/income or reminder on the phone itself (no AI service):
// "lunch 120k" → expense, "remind me to call mom at 18" → reminder, "buy milk tomorrow" → task.
const CAP_OUT = /\b(spent|spend|paid|pay|bought|buy for|cost|costs)\b|خرید|خریدم|خرج|پرداخت|دادم|هزینه/i;
const CAP_IN = /\b(got paid|received|earned|salary|income)\b|حقوق|دریافت|گرفتم|واریز شد/i;
const CAP_REM = /^\s*(remind me( to)?|reminder:?)\s+|یادم (بنداز|باشه)|یادآوری( کن)?:?/i;
const CAP_AMT = /(\d[\d,]*(?:\.\d+)?)\s*(k|m|t|toman|tomans|هزار|میلیون|تومن|تومان|ریال|rial)?(?![\w؀-ۿ])/i;
function guessCapture(text, now = Date.now()) {
  const raw = toEn(String(text || '')).trim();
  const out = { kind: 'task', title: raw, amount: 0, due: null, time: '', why: '' };
  if (!raw) return out;
  let t = raw;
  const cut = re => { const m = re.exec(t); if (m) t = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)); return m; };
  const today = keyOf(new Date(now));
  if (cut(/\b(tomorrow)\b|فردا/i)) out.due = addDays(today, 1);
  else if (cut(/\b(tonight)\b|امشب/i)) { out.due = today; out.time = '21:00'; }
  else if (cut(/\b(today)\b|امروز/i)) out.due = today;
  const tm = cut(/(?:\b(?:at|@)\s*|ساعت\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) || cut(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
  if (tm) {
    let h = +tm[1]; const mi = +(tm[2] || 0), ap = (tm[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    if (h < 24 && mi < 60) out.time = pad(h) + ':' + pad(mi);
  }
  const clean = x => x.replace(/\s+/g, ' ').replace(/^[\s,.:\-–]+|[\s,.:\-–]+$/g, '').trim();
  if (CAP_REM.test(t)) {
    t = t.replace(CAP_REM, ' ');
    out.kind = 'reminder'; out.title = clean(t); out.why = 'reminder';
    return out;
  }
  const am = CAP_AMT.exec(t), unit = am && (am[2] || '').toLowerCase();
  const isOut = CAP_OUT.test(t), isIn = CAP_IN.test(t);
  // a bare number is only money when a money word or a unit says so ("call 3 people" stays a task)
  if (am && (isOut || isIn || unit)) {
    let v = parseFloat(am[1].replace(/,/g, ''));
    if (unit === 'k' || unit === 'هزار') v *= 1e3;
    else if (unit === 'm' || unit === 'میلیون') v *= 1e6;
    else if (unit === 'ریال' || unit === 'rial') v /= 10;
    if (v >= 1) {
      t = t.slice(0, am.index) + ' ' + t.slice(am.index + am[0].length);
      t = t.replace(CAP_OUT, ' ').replace(CAP_IN, ' ').replace(/\b(on|for|from)\b|برای|بابت/gi, ' ');
      out.kind = isIn && !isOut ? 'in' : 'out'; out.amount = Math.round(v); out.title = clean(t); out.why = 'money';
      return out;
    }
  }
  if (/\n/.test(raw) || raw.length > 120) { out.kind = 'note'; out.title = raw; out.why = 'long'; return out; }
  out.title = clean(t) || raw;
  return out;
}

/* ================= timeline & weekly review ================= */
const keysBetween = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));
const dayOfMs = ms => keyOf(new Date(ms));
/** Everything that happened on a day, from every part of the app. Untimed items (habits, water, mood) have no `at`. */
function dayTimeline(k, opt = S.settings.review) {
  const out = [], at = (key, hhmm) => { const d = parseKey(key); const [h, m] = hhmm.split(':'); d.setHours(+h, +m, 0, 0); return d.getTime(); };
  for (const t of S.tasks) {
    if (t.done && t.doneDay === k) out.push({ at: t.doneAt, e: '✅', t: t.title, s: 'Task done', kind: 'tasks', mine: true });
    else if (t.created && dayOfMs(t.created) === k) out.push({ at: t.created, e: '📝', t: t.title, s: 'Task added', kind: 'tasks', mine: true });
  }
  for (const h of S.habits) if (h.log && h.log[k]) out.push({ e: h.emoji || '🔥', t: h.name, s: 'Habit done', kind: 'habits', mine: true });
  const f = S.focusLog[k];
  if (f && f.s) for (const x of f.s) out.push({ at: x.at, e: '⏱️', t: x.min + ' min focus', s: x.label || (x.done ? 'Session complete' : 'Stopped early'), kind: 'focus', mineS: !!x.label });
  if (S.water[k]) out.push({ e: '💧', t: S.water[k] + ' glasses of water', s: S.water[k] >= S.settings.waterGoal ? 'Goal reached' : 'Water', kind: 'water' });
  const md = S.mood[k];
  if (md && MOODS[md.v - 1]) out.push({ e: MOODS[md.v - 1].e, t: 'Feeling ' + MOODS[md.v - 1].l.toLowerCase(), s: md.note || 'Mood', kind: 'mood', mineS: !!md.note });
  if (opt.money) for (const x of S.money) {
    if (x.date !== k || x.pending) continue;
    const ts = x.time ? at(k, x.time) : x.created && dayOfMs(x.created) === k ? x.created : null;
    const sign = x.type === 'transfer' ? '' : x.type === 'in' ? '+' : '−';
    out.push({ at: ts, e: txIcon(x).e, t: sign + fmt(x.amount) + ' T', s: x.note || (x.type === 'transfer' ? acctName(x.acct) + ' → ' + acctName(x.acct2) : catOf(x.cat).l), kind: 'money', mineS: !!x.note });
  }
  for (const n of S.notes) if (n.updated && dayOfMs(n.updated) === k) out.push({ at: n.updated, e: '🗒️', t: n.title || clip(n.body, 40) || 'Note', s: 'Note', kind: 'notes', mine: true });
  if (opt.cycle) {
    if (S.cycleDays.includes(k)) out.push({ e: '🌸', t: 'Period day', s: 'Cycle', kind: 'cycle' });
    else if (S.cycleLog[k] && Object.keys(S.cycleLog[k]).length) out.push({ e: '🌸', t: 'Cycle log', s: 'Cycle', kind: 'cycle' });
  }
  const timed = out.filter(x => x.at).sort((a, b) => a.at - b.at), untimed = out.filter(x => !x.at);
  return { timed, untimed, total: out.length };
}
const WEEK_DAYS = 7;
/** The 7 days ending on `end`, summarised. */
function weekStats(end, opt = S.settings.review) {
  const start = addDays(end, -(WEEK_DAYS - 1)), days = keysBetween(start, WEEK_DAYS), inWeek = k => k >= start && k <= end;
  const tasksDone = S.tasks.filter(t => t.done && t.doneDay && inWeek(t.doneDay)).length;
  const tasksAdded = S.tasks.filter(t => t.created && inWeek(dayOfMs(t.created))).length;
  const stillOpen = S.tasks.filter(t => !t.done && t.due && t.due <= end).length;
  const habits = S.habits.map(h => {
    const due = days.filter(k => habitDue(h, k) && (!h.created || k >= dayOfMs(h.created)));
    const done = due.filter(k => h.log && h.log[k]).length;
    return { h, due: due.length, done, pct: due.length ? done / due.length : null };
  }).filter(x => x.due);
  const hDue = habits.reduce((n, x) => n + x.due, 0), hDone = habits.reduce((n, x) => n + x.done, 0);
  let focusMin = 0, focusN = 0, waterSum = 0, waterDays = 0, goalDays = 0, moodSum = 0, moodN = 0;
  for (const k of days) {
    const f = S.focusLog[k]; if (f) { focusMin += f.min || 0; focusN += f.n || 0; }
    const w = S.water[k] || 0; if (w) { waterSum += w; waterDays++; if (w >= S.settings.waterGoal) goalDays++; }
    const m = S.mood[k]; if (m && m.v) { moodSum += m.v; moodN++; }
  }
  const r = { start, end, days, tasksDone, tasksAdded, stillOpen, habits, habitPct: hDue ? hDone / hDue : null,
    focusMin, focusN, waterAvg: waterDays ? waterSum / WEEK_DAYS : 0, goalDays, moodAvg: moodN ? moodSum / moodN : null, moodN };
  if (opt.money) {
    const list = S.money.filter(x => inWeek(x.date));
    const cats = Object.entries(spendByCat(list)).sort((a, b) => b[1] - a[1]);
    r.money = { spent: sumSpend(list), income: sumIncome(list), top: cats[0] ? { cat: catOf(cats[0][0]), v: cats[0][1] } : null, review: list.filter(x => x.pending).length };
  }
  if (opt.cycle) r.cycle = { periodDays: days.filter(k => S.cycleDays.includes(k)).length };
  return r;
}
/** Habit patterns over the last 4 weeks: completion per weekday, and which habits are slipping. */
function habitInsights(end = R.today) {
  const days = keysBetween(addDays(end, -27), 28), by = Array.from({ length: 7 }, () => ({ due: 0, done: 0 }));
  const per = [];
  for (const h of S.habits) {
    let due = 0, done = 0;
    for (const k of days) {
      if (!habitDue(h, k) || (h.created && k < dayOfMs(h.created))) continue;
      const w = satIdx(k), ok = !!(h.log && h.log[k]);
      due++; by[w].due++; if (ok) { done++; by[w].done++; }
    }
    if (due >= 4) per.push({ h, pct: done / due, streak: streak(h) });
  }
  const week = by.map((x, i) => ({ i, pct: x.due ? x.done / x.due : null }));
  const known = week.filter(x => x.pct != null && by[x.i].due >= 2);
  const best = known.length > 1 ? known.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worst = known.length > 1 ? known.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  per.sort((a, b) => b.pct - a.pct);
  return { week, best: best && worst && best.pct - worst.pct >= 0.15 ? best : null, worst: best && worst && best.pct - worst.pct >= 0.15 ? worst : null,
    strong: per.filter(x => x.pct >= 0.8).slice(0, 3), slipping: per.filter(x => x.pct < 0.5).slice(-3).reverse() };
}
const WEEKDAY_NAMES = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const Drafts = {};
window.orbitBeforeReload = () => {
  saveNow(); saveChatCache();
  const drafts = {};
  for (const k of Object.keys(Drafts)) { try { const x = Drafts[k](); if (x) drafts[k] = x; } catch (e) {} }
  try { sessionStorage.setItem('orbit.resume', JSON.stringify({ tab: nav.tab, plan: nav.plan, screen: nav.screen, arg: nav.arg, open: Soc.open, drafts, at: Date.now() })); } catch (e) {}
};
try {
  const r = JSON.parse(sessionStorage.getItem('orbit.resume'));
  sessionStorage.removeItem('orbit.resume');
  if (r && Date.now() - r.at < 60e3 && S.settings.onboarded) {
    nav.tab = r.tab || 'today'; nav.plan = r.plan === 'reminders' ? 'reminders' : 'tasks'; Soc.open = r.open;
    go(r.screen === 'pair' ? 'pair:' + r.open : r.screen ? r.screen + (r.arg ? ':' + r.arg : '') : null);
    setTimeout(() => say('Orbit was updated ✨'), 600);
    // reopen whatever was being edited, with what had been typed
    const dr = r.drafts || {}, byId = (list, id) => (id ? list.find(x => x.id === id) : null);
    setTimeout(() => {
      if (dr.task) ui.task = { ref: byId(S.tasks, dr.task.refId) || undefined, draft: dr.task.d };
      else if (dr.tx) ui.tx = { ref: byId(S.money, dr.tx.refId) || undefined, draft: dr.tx.d };
      else if (dr.rem) ui.rem = { ref: byId(S.reminders, dr.rem.refId) || undefined, draft: dr.rem.d };
      else if (dr.capture) ui.capture = { draft: dr.capture.d };
    }, 400);
  }
} catch (e) {}
if (Soc.acct) {
  loadChatCache(); socNative(); refreshMe().then(socPushSync); socConnect();
  try { if (localStorage.getItem('orbit.langSent') !== LANG) api('/me', { lang: LANG }).then(() => localStorage.setItem('orbit.langSent', LANG)).catch(() => {}); } catch (e) {}
}
