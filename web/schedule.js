/*
 * Reminder rule expansion, shared by the app (previews), and the push server, so they agree on
 * when the next reminder is due. Android implements the same rules natively in Scheduler.java.
 *
 * rule = {
 *   kind: 'once' | 'daily' | 'interval' | 'monthly',
 *   date 'YYYY-MM-DD' (once), time 'HH:MM' (once, monthly), times ['HH:MM'] (daily),
 *   every minutes, start 'HH:MM', end 'HH:MM' (interval), days [0-6, Sunday = 0] (daily, interval),
 *   dom 1-31 + cal 'greg' | 'jal' (monthly), until 'YYYY-MM-DD' | '' (last day, inclusive),
 *   stopAtGoal + goalDay 'YYYY-MM-DD' (water: skip the rest of a day once the goal is reached)
 * }
 * A rule without `kind` is the legacy water rule ({ on, every, start, end, days, ... }).
 */
(function (g) {
  const pad = n => String(n).padStart(2, '0');
  const fmtCache = {};
  function fmt(tz, cal) {
    const key = tz + (cal || '');
    return fmtCache[key] || (fmtCache[key] = new Intl.DateTimeFormat(cal ? 'en-US-u-ca-' + cal + '-nu-latn' : 'en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
    }));
  }
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /** Wall-clock parts of an instant in a time zone (optionally in the Persian calendar). */
  function localParts(ms, tz, cal) {
    const p = {};
    for (const x of fmt(tz, cal).formatToParts(new Date(ms))) p[x.type] = x.value;
    return { y: parseInt(p.year, 10), m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: WD[p.weekday] };
  }
  const offsetAt = (ms, tz) => {
    const p = localParts(ms, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  };
  /** Instant for a wall-clock time in a time zone. */
  function zonedToUtc(y, m, d, h, mi, tz) {
    const guess = Date.UTC(y, m - 1, d, h, mi);
    let at = guess - offsetAt(guess, tz);
    const off2 = offsetAt(at, tz);
    if (guess - off2 !== at) at = guess - off2;
    return at;
  }
  const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
  const dayKey = p => p.y + '-' + pad(p.m) + '-' + pad(p.d);
  const isHHMM = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

  /** Next `count` instants strictly after `from`. */
  function ruleTimes(rule, from, tz, count) {
    const out = [];
    if (!rule || rule.on === false) return out;
    const kind = rule.kind || 'interval';
    const push = at => { if (at > from && !out.includes(at)) out.push(at); };
    const ok = p => (!rule.until || dayKey(p) <= rule.until);

    if (kind === 'once') {
      if (!rule.date || !isHHMM(rule.time)) return out;
      const [y, m, d] = rule.date.split('-').map(Number), t = toMin(rule.time);
      push(zonedToUtc(y, m, d, Math.floor(t / 60), t % 60, tz));
      return out.slice(0, count);
    }
    const horizon = kind === 'monthly' ? 400 : 9;
    // step through calendar days in the rule's time zone (not 24-hour blocks, which skip a day across DST changes)
    const f0 = localParts(from, tz);
    const day = i => {
      const u = new Date(Date.UTC(f0.y, f0.m - 1, f0.d + i));
      return { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate(), wd: u.getUTCDay() };
    };
    const noon = q => zonedToUtc(q.y, q.m, q.d, 12, 0, tz);
    for (let i = 0; i < horizon && out.length < count; i++) {
      const p = day(i);
      if (!ok(p)) break;
      let slots = [];
      if (kind === 'interval') {
        if (!(rule.every >= 15) || !isHHMM(rule.start) || !isHHMM(rule.end)) return out;
        if (rule.days && !rule.days.includes(p.wd)) continue;
        if (rule.stopAtGoal && rule.goalDay === dayKey(p)) continue;
        for (let t = toMin(rule.start); t <= toMin(rule.end); t += rule.every) slots.push(t);
      } else if (kind === 'daily') {
        if (rule.days && !rule.days.includes(p.wd)) continue;
        slots = (rule.times || []).filter(isHHMM).map(toMin).sort((a, b) => a - b);
      } else if (kind === 'monthly') {
        if (!isHHMM(rule.time) || !(rule.dom >= 1)) return out;
        const cp = rule.cal === 'jal' ? localParts(noon(p), tz, 'persian') : p;
        // a day-of-month the month doesn't have (31st in a 30-day month) falls on its last day
        const nextDay = rule.cal === 'jal' ? localParts(noon(day(i + 1)), tz, 'persian') : day(i + 1);
        const isLast = nextDay.m !== cp.m;
        if (!(cp.d === rule.dom || (isLast && cp.d < rule.dom))) continue;
        slots = [toMin(rule.time)];
      }
      for (const t of slots) { if (out.length >= count) break; push(zonedToUtc(p.y, p.m, p.d, Math.floor(t / 60), t % 60, tz)); }
    }
    return out.sort((a, b) => a - b).slice(0, count);
  }
  const nextAt = (rule, from, tz) => ruleTimes(rule, from, tz, 1)[0] || null;
  /** How many times a day the rule fires (interval/daily). */
  function perDay(rule) {
    if (!rule) return 0;
    if ((rule.kind || 'interval') === 'interval') return rule.every >= 15 && isHHMM(rule.start) && isHHMM(rule.end) ? Math.floor((toMin(rule.end) - toMin(rule.start)) / rule.every) + 1 : 0;
    if (rule.kind === 'daily') return (rule.times || []).filter(isHHMM).length;
    return 0;
  }
  // legacy names used by older code
  const waterTimes = ruleTimes, nextWater = nextAt;

  g.OrbitSchedule = { localParts, zonedToUtc, ruleTimes, nextAt, perDay, dayKey, isHHMM, waterTimes, nextWater };
})(typeof self !== 'undefined' ? self : globalThis);
