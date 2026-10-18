/* Cycle screens. */
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
        <span class="flabel" style="text-align:start">What's the goal?</span>
        <div class="goal-pick"><button v-for="x in GOALS" :key="x.id" :class="{on: cs.goal === x.id}" @click="cs.goal = x.id"><span>{{ x.e }}</span><b>{{ x.l }}</b></button></div>
        <span class="flabel" style="text-align:start">Name (optional)</span>
        <input class="field" v-model="cs.name" placeholder="Leave empty if it's your own cycle" enterkeyhint="done">
        <span class="flabel" style="text-align:start">Start from</span>
        <div class="seg"><button :class="{on: startMode === 'last'}" @click="startMode = 'last'">Last period</button><button :class="{on: startMode === 'next'}" @click="startMode = 'next'">Next period</button></div>
        <template v-if="startMode === 'last'">
          <span class="flabel" style="text-align:start">Last period started</span>
          <DateChip field v-model="startDate" :max="R.today" title="Last period started"/>
        </template>
        <template v-else>
          <span class="flabel" style="text-align:start">Next period expected</span>
          <DateChip field v-model="nextDate" :min="R.today" :max="addDays(R.today, cs.len)" title="Next period expected"/>
          <div class="list-row" style="text-align:start;padding:14px 2px 0;border:0"><div class="grow"><div class="t">Usual cycle length</div><div class="s">Used to estimate where you are now</div></div><Stepper v-model="cs.len" :min="20" :max="45" unit="d"/></div>
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
            <DateChip v-model="cs.expected" :min="R.today" :max="addDays(R.today, cs.len)" title="Next period expected"/></div>
        </div>
        <div class="label">Reminders</div>
        <div class="settings-group flat">
          <div class="list-row"><div class="grow"><div class="t">Period coming</div><div class="s">2 days before and on the expected day</div></div><Toggle v-model="cs.notify"/></div>
          <div class="list-row"><div class="grow"><div class="t">Fertile window & ovulation</div><div class="s">When the fertile window starts and on ovulation day</div></div><Toggle v-model="cs.fertileNotify"/></div>
          <div class="list-row"><div class="grow"><div class="t">Daily tip</div><div class="s">{{ cs.tip.on ? 'A new suggestion every day at ' + cs.tip.time : 'A kind, phase-based suggestion each day' }}</div></div><Toggle v-model="cs.tip.on"/></div>
          <div v-if="cs.tip.on" class="list-row"><div class="grow"><div class="t">Tip time</div></div><TimeChip v-model="cs.tip.time" title="Tip time"/></div>
          <div class="list-row"><div class="grow"><div class="t">Daily pill reminder</div><div class="s">{{ cs.pill.on ? 'Every day at ' + cs.pill.time : 'Off' }}</div></div><Toggle v-model="cs.pill.on"/></div>
          <div v-if="cs.pill.on" class="list-row"><div class="grow"><div class="t">Pill time</div></div><TimeChip v-model="cs.pill.time" title="Pill time"/></div>
        </div>
        <div class="label">Privacy</div>
        <div class="settings-group flat">
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
  if (p.timeProposal && p.timeProposal.by !== me) return { t: '⏰ ' + nm + ' wants the daily question at ' + p.timeProposal.time, hot: true };
  if (!p.type) return { t: p.proposal ? 'Waiting for ' + nm + ' to accept' : 'Choose what you are to each other', hot: !p.proposal };
  if (p.today && p.today.day === p.todayKey && !p.today.mine) return { t: '💬 Today\'s question is waiting' + (p.today.theyAnswered ? ' · ' + nm + ' answered' : ''), hot: true };
  if (p.today && p.today.day === p.todayKey && !p.today.theirs) return { t: 'You answered · waiting for ' + nm };
  if (p.last && !p.last.deleted) return { t: (p.last.by === me ? 'You: ' : '') + clip(p.last.text || mediaLabel(p.last) || '📷 Photo', 60) };
  return { t: 'Say hi 👋' };
}
