/* Timeline and weekly review screens. */
const TimelineView = {
  setup() {
    const day = ref(nav.arg && /^\d{4}-\d\d-\d\d$/.test(nav.arg) ? nav.arg : R.today);
    const tl = computed(() => { R.min; return dayTimeline(day.value); });
    const step = n => { const k = addDays(day.value, n); if (k <= R.today) day.value = k; Native.vibrate(6); };
    return { day, tl, step };
  },
  template: `<div class="view" style="--acc:var(--c-tasks)">
    <Head title="Timeline" sub="Everything from one day, in order"/>
    <div class="day-nav card">
      <button class="icon-btn plain" @click="step(-1)" aria-label="Previous day"><Ic :n="FA ? 'chevron-right' : 'chevron-left'" :s="20"/></button>
      <div class="grow" style="text-align:center"><b>{{ isToday(parseKey(day).getTime()) ? 'Today' : gFull(day) }}</b><div class="muted" style="font-size:13px">{{ jFull(day) }}</div></div>
      <button class="icon-btn plain" :disabled="day >= R.today" @click="step(1)" aria-label="Next day"><Ic :n="FA ? 'chevron-left' : 'chevron-right'" :s="20"/></button>
    </div>
    <div v-if="tl.untimed.length" class="card">
      <div class="sec" style="margin-bottom:6px"><h3>During the day</h3></div>
      <div v-for="(x, i) in tl.untimed" :key="'u' + i" class="tl-row"><span class="e">{{ x.e }}</span>
        <div class="grow"><div class="t" :translate="x.mine ? 'no' : null">{{ x.t }}</div><div class="s" :translate="x.mineS ? 'no' : null">{{ x.s }}</div></div></div>
    </div>
    <div v-if="tl.timed.length" class="card tl">
      <div v-for="(x, i) in tl.timed" :key="'t' + i" class="tl-row timed"><span class="when">{{ hm(x.at) }}</span><span class="e">{{ x.e }}</span>
        <div class="grow"><div class="t" :translate="x.mine ? 'no' : null">{{ x.t }}</div><div class="s" :translate="x.mineS ? 'no' : null">{{ x.s }}</div></div></div>
    </div>
    <div v-if="!tl.total" class="card muted" style="text-align:center;padding:28px 18px">Nothing logged on this day.</div>
    <p class="fine" style="margin:10px 4px"><span>{{ S.settings.review.cycle ? 'Includes cycle days.' : 'Cycle entries are not shown here.' }}</span> <span v-if="!S.settings.review.money">Money is hidden.</span> <span>Change this in Weekly review.</span></p>
  </div>`,
};

/** Seven days summarised, with a few honest patterns and room for your own notes. */
const ReviewView = {
  setup() {
    const back = ref(0); // weeks back from now
    const end = computed(() => addDays(R.today, -7 * back.value));
    const w = computed(() => weekStats(end.value));
    const prev = computed(() => weekStats(addDays(end.value, -7)));
    const ins = computed(() => habitInsights(end.value));
    const rec = computed(() => S.reviews[w.value.start] || {});
    const field = k => ({ get: () => rec.value[k] || '', set: v => { const r = S.reviews[w.value.start] || (S.reviews[w.value.start] = {}); r[k] = v; r.at = Date.now(); } });
    const good = computed(field('good')), change = computed(field('change')), next = computed(field('next'));
    const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
    const pctTxt = v => (v == null ? '–' : Math.round(v * 100) + '%');
    const vsPrev = (a, b) => (a > b ? (a - b) + ' more than the week before' : a < b ? (b - a) + ' fewer than the week before' : 'Same as the week before');
    const DAYS_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
    // a whole sentence, so the Persian can have its own word order
    const weekLine = computed(() => {
      const i = ins.value; if (!i.best) return '';
      const d = FA ? DAYS_FA : WEEKDAY_NAMES, a = pctTxt(i.best.pct), z = pctTxt(i.worst.pct);
      return FA ? 'بیشترین پایبندی‌ات به عادت‌ها ' + d[i.best.i] + ' است (' + a + ') و کمترینش ' + d[i.worst.i] + ' (' + z + ').'
        : 'You keep habits best on ' + d[i.best.i] + ' (' + a + ') and least on ' + d[i.worst.i] + ' (' + z + ').';
    });
    return { back, end, w, prev, ins, good, change, next, delta, pctTxt, vsPrev, weekLine, WEEKDAY_NAMES };
  },
  template: `<div class="view" style="--acc:var(--c-habits)">
    <Head title="Weekly review" sub="The last 7 days, at a glance"/>
    <div class="day-nav card">
      <button class="icon-btn plain" @click="back++" aria-label="Earlier week"><Ic :n="FA ? 'chevron-right' : 'chevron-left'" :s="20"/></button>
      <div class="grow" style="text-align:center"><b>{{ back ? gLabel(w.start) + ' – ' + gLabel(w.end) : 'This week' }}</b><div class="muted" style="font-size:13px">{{ jLabel(w.start) }} – {{ jLabel(w.end) }}</div></div>
      <button class="icon-btn plain" :disabled="!back" @click="back--" aria-label="Later week"><Ic :n="FA ? 'chevron-left' : 'chevron-right'" :s="20"/></button>
    </div>

    <div class="review-grid">
      <div class="card stat"><div class="k">Tasks done</div><div class="v">{{ w.tasksDone }}</div><div class="d" v-if="prev.tasksDone || w.tasksDone">{{ vsPrev(w.tasksDone, prev.tasksDone) }}</div></div>
      <div class="card stat"><div class="k">Habits kept</div><div class="v">{{ pctTxt(w.habitPct) }}</div><div class="d" v-if="prev.habitPct != null && w.habitPct != null">was {{ pctTxt(prev.habitPct) }}</div></div>
      <div class="card stat"><div class="k">Focus</div><div class="v">{{ w.focusMin }} <small>min</small></div><div class="d">{{ w.focusN }} session{{ w.focusN === 1 ? '' : 's' }}</div></div>
      <div class="card stat"><div class="k">Water</div><div class="v">{{ w.waterAvg.toFixed(1) }} <small>a day</small></div><div class="d">goal met {{ w.goalDays }} of 7 days</div></div>
      <div class="card stat"><div class="k">Mood</div><div class="v">{{ w.moodAvg ? MOODS[Math.round(w.moodAvg) - 1].e : '–' }}</div><div class="d">{{ w.moodN ? 'logged ' + w.moodN + ' of 7 days' : 'not logged' }}</div></div>
      <div v-if="w.money" class="card stat"><div class="k">Spent</div><div class="v">{{ short(w.money.spent) }} <small>T</small></div><div class="d" translate="no" v-if="w.money.top">{{ w.money.top.cat.e }} {{ tr(w.money.top.cat.l) }} {{ short(w.money.top.v) }}</div></div>
      <div v-if="w.cycle" class="card stat"><div class="k">Period days</div><div class="v">{{ w.cycle.periodDays }}</div><div class="d">estimates only</div></div>
    </div>
    <div v-if="w.stillOpen" class="card muted" style="font-size:14px">{{ w.stillOpen }} task{{ w.stillOpen > 1 ? 's are' : ' is' }} still open from this week or earlier.</div>
    <div v-if="w.money && w.money.review" class="card muted" style="font-size:14px">{{ w.money.review }} bank SMS draft{{ w.money.review > 1 ? 's' : '' }} still to review in Money.</div>

    <div class="card" v-if="w.habits.length">
      <div class="sec" style="margin-bottom:6px"><h3><Ic n="flame" :s="16" style="color:var(--c-habits)"/>Habits this week</h3></div>
      <div v-for="x in w.habits" :key="x.h.id" class="hab-row"><span class="e">{{ x.h.emoji }}</span><span class="grow" translate="no">{{ x.h.name }}</span>
        <span class="bar" style="width:80px"><i :style="{width: (x.pct * 100) + '%', background: x.h.color}"></i></span><span class="n">{{ x.done }}/{{ x.due }}</span></div>
    </div>

    <div class="card" v-if="S.habits.length">
      <div class="sec" style="margin-bottom:6px"><h3><Ic n="lightbulb" :s="16" style="color:var(--c-mood)"/>Patterns from the last 4 weeks</h3></div>
      <div class="wk-bars" role="img" :aria-label="'Habit completion by weekday'">
        <div v-for="d in ins.week" :key="d.i" class="wk-bar"><span class="col"><i :style="{height: ((d.pct || 0) * 100) + '%'}"></i></span><small>{{ WK[d.i] }}</small></div>
      </div>
      <p v-if="weekLine" class="ins" translate="no">{{ weekLine }}</p>
      <p v-for="x in ins.strong" :key="'s' + x.h.id" class="ins">💪 <span translate="no">{{ x.h.emoji }} {{ x.h.name }}</span> · <span>{{ pctTxt(x.pct) }} of days</span><template v-if="x.streak > 2"> · <span>{{ x.streak }}-day streak</span></template></p>
      <p v-for="x in ins.slipping" :key="'w' + x.h.id" class="ins">🌱 <span translate="no">{{ x.h.emoji }} {{ x.h.name }}</span> · <span>{{ pctTxt(x.pct) }} of days</span> · <span>Maybe fewer days a week would fit better?</span></p>
      <p v-if="!ins.best && !ins.strong.length && !ins.slipping.length" class="ins muted">Keep logging for a couple of weeks and patterns will show up here.</p>
    </div>

    <div class="card">
      <div class="sec" style="margin-bottom:6px"><h3><Ic n="pencil" :s="16"/>Your notes</h3></div>
      <span class="flabel">What went well?</span><textarea class="field" v-model="good" rows="2" translate="no"></textarea>
      <span class="flabel">What would you change?</span><textarea class="field" v-model="change" rows="2" translate="no"></textarea>
      <span class="flabel">One focus for next week</span><input class="field" v-model="next" translate="no" enterkeyhint="done">
      <p class="fine" style="margin-top:8px">Saved on this phone with your other data, and included in backups.</p>
    </div>

    <div class="label">Include</div>
    <div class="settings-group">
      <div class="list-row"><span class="bubble" style="--c:var(--c-money)"><Ic n="wallet" :s="18"/></span><div class="grow"><div class="t">Money</div><div class="s">Spending in the review and timeline</div></div><Toggle v-model="S.settings.review.money"/></div>
      <div class="list-row"><span class="bubble" style="--c:var(--c-cycle)"><Ic n="flower-2" :s="18"/></span><div class="grow"><div class="t">Cycle</div><div class="s">Off unless you turn it on</div></div><Toggle v-model="S.settings.review.cycle"/></div>
    </div>
    <button class="btn block" style="margin-top:14px" @click="go('timeline')"><Ic n="clock" :s="17"/>Open today's timeline</button>
  </div>`,
};
