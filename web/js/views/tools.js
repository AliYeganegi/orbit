/* More, notes, focus, water, mood and countdown screens. */
const MoreView = {
  setup() {
    const apps = computed(() => {
      const m = S.mood[R.today], nx = cdSorted.value.find(x => x.days >= 0), c = cyc.value;
      return [
        { id: 'reminders', n: 'bell', l: 'Reminders', c: 'var(--c-mood)', s: (() => { const n = S.reminders.filter(r => r.on !== false).length; return n ? n + ' active' : 'Set your own nudges'; })() },
        { id: 'notes', n: 'notebook-pen', l: 'Notes', c: 'var(--c-notes)', s: S.notes.length + ' note' + (S.notes.length === 1 ? '' : 's') },
        { id: 'focus', n: 'timer', l: 'Focus', c: 'var(--c-focus)', s: S.timer.running ? mmss(Timer.left()) + ' left' : focusToday.value.min + ' min today' },
        { id: 'water', n: 'droplet', l: 'Water', c: 'var(--c-water)', s: waterToday.value + ' / ' + S.settings.waterGoal + ' glasses' },
        { id: 'mood', n: 'smile', l: 'Mood', c: 'var(--c-mood)', s: m ? MOODS[m.v - 1].e + ' ' + MOODS[m.v - 1].l : 'Not logged today' },
        { id: 'countdowns', n: 'hourglass', l: 'Countdowns', c: 'var(--c-count)', s: nx ? (nx.days ? nx.days + ' days to ' + nx.c.title : nx.c.title + ' is today!') : 'Nothing planned' },
        { id: 'cycle', n: 'flower-2', l: 'Cycle', c: 'var(--c-cycle)', s: c.has ? 'Day ' + c.day + ' · ' + c.phase : 'Set up tracking' },
        { id: 'timeline', n: 'clock', l: 'Timeline', c: 'var(--c-tasks)', s: (() => { const n = dayTimeline(R.today).total; return n ? n + ' thing' + (n === 1 ? '' : 's') + ' today' : 'Your day, in order'; })() },
        { id: 'review', n: 'chart-column', l: 'Weekly review', c: 'var(--c-habits)', s: S.reviews[addDays(R.today, -6)] ? 'Reviewed this week' : 'The last 7 days' },
        { id: 'people', n: 'users', l: 'People', c: 'var(--c-people)', dot: socTodo.value.total, s: (() => {
          const t = socTodo.value;
          if (!Soc.acct) return 'Daily questions & chat';
          if (t.questions.length) return 'Today\'s question is waiting';
          if (t.unread) return t.unread + ' new message' + (t.unread > 1 ? 's' : '');
          if (t.reqs) return t.reqs + ' request' + (t.reqs > 1 ? 's' : '');
          return socPairs.value.length + ' connection' + (socPairs.value.length === 1 ? '' : 's');
        })() },
      ];
    });
    return { apps };
  },
  template: `<div class="view">
    <header class="top"><div class="grow"><h1>More</h1><div class="sub">All your tools</div></div></header>
    <div class="apps">
      <button v-for="a in apps" :key="a.id" class="app-tile tap" :style="{'--c': a.c}" @click="go(a.id)">
        <div class="ico"><Ic :n="a.n" :s="22" :w="2.2"/><i v-if="a.dot" class="tab-dot"></i></div><b>{{ a.l }}</b><small>{{ a.s }}</small></button>
    </div>
    <div class="label" style="margin-top:26px">App</div>
    <div class="settings-group">
      <button class="list-row row-btn" @click="go('settings')">
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
    // save while typing, so an app reload, crash or update never loses a half-written note
    function commit() {
      const has = d.title.trim() || d.body.trim();
      if (!has) return;
      if (!cur.value) { cur.value = { id: uid(), ...d, updated: Date.now() }; S.notes.unshift(cur.value); cur.value = S.notes[0]; return; }
      if (cur.value.title !== d.title || cur.value.body !== d.body || cur.value.color !== d.color || cur.value.pinned !== d.pinned) Object.assign(cur.value, { ...d, updated: Date.now() });
    }
    let commitT;
    watch(d, () => { if (open.value) { clearTimeout(commitT); commitT = setTimeout(commit, 400); } });
    onBeforeUnmount(() => { clearTimeout(commitT); if (open.value) commit(); });
    function close() {
      clearTimeout(commitT);
      const has = d.title.trim() || d.body.trim();
      if (!has && cur.value) { const i = S.notes.indexOf(cur.value); if (i >= 0) S.notes.splice(i, 1); }
      else commit();
      open.value = false;
    }
    function remove() {
      clearTimeout(commitT);
      const n = cur.value; open.value = false;
      if (!n) return;
      const i = S.notes.indexOf(n); if (i < 0) return;
      S.notes.splice(i, 1);
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
        <h4 v-if="n.title" translate="no">{{ n.title }}</h4><p v-if="n.body" translate="no">{{ n.body }}</p><small>{{ ago(n.updated) }}</small></button></div></template>
    <template v-if="others.length"><div class="label" v-if="pinned.length">Others</div>
      <div class="masonry"><button v-for="n in others" :key="n.id" class="note tap" :style="{'--nc': nc(n.color)}" @click="edit(n)">
        <h4 v-if="n.title" translate="no">{{ n.title }}</h4><p v-if="n.body" translate="no">{{ n.body }}</p><small>{{ ago(n.updated) }}</small></button></div></template>
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
        <div v-if="openTasks.length" class="settings-group flat">
          <button v-for="t in openTasks" :key="t.id" class="list-row row-btn" @click="setLabel('task:' + t.id)">
            <span class="bubble" style="--c:var(--c-tasks)"><Ic n="circle-check" :s="17"/></span><div class="grow"><div class="t" translate="no">{{ t.title }}</div><div class="s" v-if="t.due">{{ rel(t.due) }}</div></div>
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
    <div class="settings-group"><button class="list-row row-btn" @click="ui.rem = waterRem ? {ref: waterRem} : {tpl: REM_TEMPLATES[0]}">
      <span class="bubble" style="--c:var(--c-water)"><Ic n="bell" :s="18"/></span>
      <div class="grow"><div class="t">{{ waterRem && waterRem.on !== false ? remSummary(waterRem) : 'Water reminders are off' }}</div>
        <div class="s">{{ waterRem && waterRem.on !== false ? (waterNext.length ? 'Next at ' + hm(waterNext[0]) + (isToday(waterNext[0]) ? '' : ' ' + rel(keyOf(new Date(waterNext[0]))).toLowerCase()) : 'No upcoming reminders') : 'Get a nudge to drink through the day' }}</div></div>
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
    // a live countdown to the start of the day, like the reminders
    const tick = ref(Date.now());
    const tickT = setInterval(() => { tick.value = Date.now(); }, 1000);
    onBeforeUnmount(() => clearInterval(tickT));
    const startOf = k => parseKey(k).getTime();
    return { tick, timeLeft, startOf, open, editing, d, edit, save, remove, hero, rest, CD_EMOJI };
  },
  template: `<div class="view" style="--acc:var(--c-count)">
    <Head title="Countdowns" sub="Birthdays, trips, deadlines"/>
    <div v-if="hero" class="card cd-hero tap" @click="edit(hero.c)">
      <div class="e">{{ hero.c.emoji }}</div>
      <div class="num">{{ hero.days === 0 ? '🎉' : hero.days }}</div>
      <div class="u">{{ hero.days === 0 ? 'It\\'s today!' : 'day' + (hero.days === 1 ? '' : 's') + ' to go' }}</div>
      <div v-if="hero.days > 0" class="cd-left" translate="no">⏳ {{ timeLeft(startOf(hero.k), tick) }}</div>
      <div class="t">{{ hero.c.title }}</div>
      <div class="u" style="font-size:13px">{{ gFull(hero.k) }} · {{ jFull(hero.k) }}</div>
    </div>
    <div class="stack" style="margin-top:12px">
      <div v-for="x in rest" :key="x.c.id" class="card cd tap" :class="{soon: x.days >= 0 && x.days <= 7, past: x.days < 0}" @click="edit(x.c)">
        <div class="e">{{ x.c.emoji }}</div>
        <div class="n"><b translate="no">{{ x.c.title }}</b><small>{{ gLabel(x.k) }} · {{ jLabel(x.k) }}{{ x.c.repeat !== 'none' ? ' · yearly' : '' }}</small>
          <small v-if="x.days > 0" class="left" translate="no">⏳ {{ timeLeft(startOf(x.k), tick) }}</small></div>
        <div class="d"><b>{{ Math.abs(x.days) }}</b><small>{{ x.days < 0 ? 'days ago' : 'days' }}</small></div>
      </div>
    </div>
    <Empty v-if="!S.countdowns.length" e="⏳" t="Something to look forward to" s="Add birthdays, trips or deadlines and count down the days."/>
    <button class="fab" @click="edit(null)" aria-label="New countdown"><Ic n="plus" :s="26" :w="2.4"/></button>
    <Sheet :open="open" :title="editing ? 'Edit countdown' : 'New countdown'" @close="open = false">
      <div style="--acc:var(--c-count)">
        <input class="field" v-model="d.title" placeholder="e.g. Sara's birthday" enterkeyhint="done">
        <span class="flabel">Icon</span>
        <EmojiPick v-model="d.emoji" :list="CD_EMOJI"/>
        <span class="flabel">Date</span>
        <DateChip field v-model="d.date" placeholder="Pick a date" title="Date"/>
        <span class="flabel">Repeat</span>
        <div class="seg"><button :class="{on: d.repeat === 'none'}" @click="d.repeat = 'none'">Once</button><button :class="{on: d.repeat === 'greg'}" @click="d.repeat = 'greg'">Yearly</button><button :class="{on: d.repeat === 'jal'}" @click="d.repeat = 'jal'">Yearly (Shamsi)</button></div>
        <div class="btn-row">
          <button v-if="editing" class="btn danger icon-only" @click="remove"><Ic n="trash-2"/></button>
          <button class="btn primary" :disabled="!d.title.trim() || !d.date" @click="save">{{ editing ? 'Save' : 'Add countdown' }}</button>
        </div>
      </div>
    </Sheet>
  </div>`,
};
