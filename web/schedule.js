/*
 * Water reminder rule expansion, shared by the app (preview), the service worker
 * and the push server so all three agree on when the next reminder is due.
 *
 * rule = { on, every (minutes), start 'HH:MM', end 'HH:MM', days [0-6, Sunday = 0],
 *          stopAtGoal, goalDay 'YYYY-MM-DD' | null }
 */
(function (g) {
  const pad = n => String(n).padStart(2, '0');
  const fmtCache = {};
  function fmt(tz) {
    return fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
    }));
  }
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /** Wall-clock parts of an instant in a time zone. */
  function localParts(ms, tz) {
    const p = {};
    for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: WD[p.weekday] };
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

  /** Next `count` reminder instants strictly after `from`. */
  function waterTimes(rule, from, tz, count) {
    const out = [];
    if (!rule || !rule.on || !(rule.every >= 15)) return out;
    const s = toMin(rule.start), e = toMin(rule.end);
    for (let i = 0; i < 9 && out.length < count; i++) {
      const p = localParts(from + i * 864e5, tz);
      if (rule.days && !rule.days.includes(p.wd)) continue;
      if (rule.stopAtGoal && rule.goalDay === dayKey(p)) continue;
      for (let t = s; t <= e && out.length < count; t += rule.every) {
        const at = zonedToUtc(p.y, p.m, p.d, Math.floor(t / 60), t % 60, tz);
        if (at > from && !out.includes(at)) out.push(at);
      }
    }
    return out;
  }
  const nextWater = (rule, from, tz) => waterTimes(rule, from, tz, 1)[0] || null;
  /** How many reminders the rule produces on one full day. */
  const perDay = rule => (rule && rule.every >= 15 ? Math.floor((toMin(rule.end) - toMin(rule.start)) / rule.every) + 1 : 0);

  g.OrbitSchedule = { localParts, zonedToUtc, waterTimes, nextWater, perDay, dayKey };
})(typeof self !== 'undefined' ? self : globalThis);
