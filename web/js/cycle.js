/* Cycle tracker: logging, predictions (estimates only), stats and guidance. */
/* ---------- cycle tracker: logging, stats, guidance ---------- */
const FLOWS = FA ? [{ v: 0, l: 'هیچ' }, { v: 1, l: 'لکه‌بینی', d: 1 }, { v: 2, l: 'کم', d: 1 }, { v: 3, l: 'متوسط', d: 2 }, { v: 4, l: 'زیاد', d: 3 }]
  : [{ v: 0, l: 'None' }, { v: 1, l: 'Spotting', d: 1 }, { v: 2, l: 'Light', d: 1 }, { v: 3, l: 'Medium', d: 2 }, { v: 4, l: 'Heavy', d: 3 }];
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
  const TIPS = FA && OrbitTips.fa ? OrbitTips.fa : OrbitTips;
  const sp = TIPS.special[mode];
  let pool = null;
  if (!offset) {
    if (info.day === 1) pool = sp.day1;
    else if (info.day === 2 && info.phase === 'period') pool = sp.day2;
    else if (k === info.ov) pool = sp.ovulation;
    else if (info.toNext === 1) pool = sp.beforePeriod;
  }
  if (pool) return { text: pool[strHash(k) % pool.length], phase: info.phase, day: info.day };
  pool = TIPS[mode][info.phase] || TIPS[mode].luteal;
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
