/* Today: sections, quick capture and the Today screen. */
/* ================= views ================= */
const TODAY_SECTIONS = [
  { id: 'wrap', l: 'Evening wrap-up & weekly review', n: 'moon-star' },
  { id: 'people', l: 'People', n: 'users' },
  { id: 'upcoming', l: 'Coming up', n: 'clock' },
  { id: 'tasks', l: 'Today\'s tasks', n: 'circle-check' },
  { id: 'habits', l: 'Habits', n: 'flame' },
  { id: 'tiles', l: 'Water, mood, focus & money', n: 'layout-grid' },
  { id: 'extras', l: 'Cycle & countdown', n: 'hourglass' },
  { id: 'recent', l: 'Recently', n: 'activity' },
  { id: 'pinned', l: 'Pinned notes', n: 'pin' },
];
const TodaySections = {
  setup() {
    const st = S.settings.today;
    const rows = computed(() => {
      const ids = TODAY_SECTIONS.map(x => x.id);
      const order = [...st.order.filter(id => ids.includes(id)), ...ids.filter(id => !st.order.includes(id))];
      return order.map(id => TODAY_SECTIONS.find(x => x.id === id));
    });
    function move(i, d) {
      const ids = rows.value.map(x => x.id), j = i + d;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]]; st.order = ids; Native.vibrate(6);
    }
    const shown = id => st.hide.indexOf(id) < 0;
    function toggle(id) { const i = st.hide.indexOf(id); if (i >= 0) st.hide.splice(i, 1); else st.hide.push(id); }
    function reset() { st.order = []; st.hide = []; }
    return { rows, move, shown, toggle, reset };
  },
  template: `<div class="settings-group flat">
    <div v-for="(x, i) in rows" :key="x.id" class="list-row">
      <span class="bubble" style="--c:var(--c-tasks)"><Ic :n="x.n" :s="17"/></span>
      <div class="grow"><div class="t">{{ x.l }}</div></div>
      <button class="icon-btn plain" :disabled="i === 0" @click="move(i, -1)" :aria-label="'Move up: ' + x.l"><Ic n="chevron-up" :s="18"/></button>
      <button class="icon-btn plain" :disabled="i === rows.length - 1" @click="move(i, 1)" :aria-label="'Move down: ' + x.l"><Ic n="chevron-down" :s="18"/></button>
      <Toggle :model-value="shown(x.id)" @update:model-value="toggle(x.id)"/>
    </div>
  </div>
  <button class="link-btn" style="margin-top:10px" @click="reset">Reset to default</button>`,
};

const CAPTURE_KINDS = [
  { id: 'task', l: 'Task', n: 'circle-check', c: 'var(--c-tasks)' },
  { id: 'note', l: 'Note', n: 'notebook-pen', c: 'var(--c-notes)' },
  { id: 'out', l: 'Expense', n: 'arrow-up-right', c: 'var(--c-money)' },
  { id: 'in', l: 'Income', n: 'arrow-down-left', c: 'var(--c-money)' },
  { id: 'reminder', l: 'Reminder', n: 'bell', c: 'var(--c-mood)' },
];
/** One box for anything: typed text is sorted into the right place, and you can change where it goes before saving. */
const CaptureSheet = {
  setup() {
    const text = ref(''), kind = ref('task'), picked = ref(false);
    watch(() => ui.capture, v => { if (v) { text.value = (v.draft && v.draft.text) || ''; picked.value = !!(v.draft && v.draft.kind); kind.value = (v.draft && v.draft.kind) || 'task'; } });
    Drafts.capture = () => (ui.capture && text.value.trim() ? { d: { text: text.value, kind: picked.value ? kind.value : '' } } : null);
    const g = computed(() => guessCapture(text.value, R.min));
    watch(() => g.value.kind, k => { if (!picked.value) kind.value = k; }, { immediate: true });
    function pick(k) { kind.value = k; picked.value = true; Native.vibrate(6); }
    // what will happen, before it happens
    const plan = computed(() => {
      const x = g.value, k = kind.value, title = x.title || text.value.trim();
      if (!text.value.trim()) return '';
      if (k === 'task') return 'Task' + (x.due ? ' · ' + rel(x.due) : '') + (x.time ? ' · ' + x.time : '');
      if (k === 'note') return 'Note';
      if (k === 'out' || k === 'in') return (k === 'in' ? 'Income' : 'Expense') + (x.amount ? ' · ' + fmt(x.amount) + ' T' : '') + ' · pick a category next';
      const when = remWhen(x);
      return 'Reminder · ' + rel(when.date) + ' · ' + when.time;
    });
    function remWhen(x) {
      const now = new Date(R.now);
      let date = x.due || R.today, time = x.time;
      if (!time) { const soon = new Date(now.getTime() + 3600e3); time = pad(soon.getHours()) + ':00'; if (soon.getDate() !== now.getDate()) date = addDays(date, 1); }
      if (date === R.today && time <= hm(now.getTime())) date = addDays(date, 1); // that time already passed today
      return { date, time };
    }
    function save() {
      const raw = text.value.trim(); if (!raw) return;
      const x = g.value, k = kind.value, title = (x.title || raw).slice(0, 200);
      if (k === 'task') {
        const t = addTask(title, x.due || (x.time ? R.today : null)); if (x.time) t.time = x.time;
        say('Task added' + (x.due ? ' · ' + rel(x.due) : ''), () => { const i = S.tasks.indexOf(t); if (i >= 0) S.tasks.splice(i, 1); });
      } else if (k === 'note') {
        const lines = raw.split('\n'), first = lines[0].trim();
        const n = { id: uid(), title: lines.length > 1 && first.length <= 60 ? first : '', body: lines.length > 1 && first.length <= 60 ? lines.slice(1).join('\n').trim() : raw, color: '', pinned: false, updated: Date.now() };
        S.notes.unshift(n);
        say('Note saved', () => { const i = S.notes.indexOf(S.notes.find(y => y.id === n.id)); if (i >= 0) S.notes.splice(i, 1); });
      } else if (k === 'out' || k === 'in') {
        ui.capture = null; text.value = '';
        ui.tx = { draft: { type: k, amount: x.amount || 0, note: x.amount ? title : '', date: x.due && x.due <= R.today ? x.due : R.today } };
        return;
      } else {
        const w = remWhen(x);
        const r = { ...newReminder(), kind: 'once', title, emoji: '⏰', date: w.date, time: w.time };
        S.reminders.push(r);
        if (Native.has) Native.askNotify();
        say('Reminder set · ' + rel(w.date) + ' ' + w.time, () => { const i = S.reminders.indexOf(S.reminders.find(y => y.id === r.id)); if (i >= 0) S.reminders.splice(i, 1); });
      }
      Native.vibrate(12);
      ui.capture = null; text.value = '';
    }
    return { text, kind, pick, plan, save, KINDS: CAPTURE_KINDS };
  },
  template: `<Sheet :open="!!ui.capture" title="Quick capture" @close="ui.capture = null">
    <textarea class="field capture-in" v-model="text" placeholder="Buy milk tomorrow · lunch 120k · remind me to call mom at 18" rows="3" enterkeyhint="done" @keydown.enter.exact.prevent="save" autofocus></textarea>
    <div class="chips capture-kinds" role="radiogroup" aria-label="Save as">
      <button v-for="k in KINDS" :key="k.id" class="chip" :class="{on: kind === k.id}" :style="{'--c': k.c}" role="radio" :aria-checked="kind === k.id" @click="pick(k.id)"><Ic :n="k.n" :s="15"/>{{ k.l }}</button>
    </div>
    <div v-if="plan" class="capture-plan" aria-live="polite"><Ic n="sparkles" :s="15"/><span>{{ plan }}</span></div>
    <p class="fine" style="margin-top:6px">Sorted on this phone. Nothing you type is sent anywhere.</p>
    <button class="btn primary block" style="margin-top:14px" :disabled="!text.trim()" @click="save">{{ kind === 'out' || kind === 'in' ? 'Continue' : 'Save' }}</button>
  </Sheet>`,
};

/** A day at a glance: everything you did, in order. */
const TodayView = {
  setup() {
    const q = ref('');
    const hour = computed(() => new Date(R.min).getHours());
    const greet = computed(() => { const h = hour.value; return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night'; });
    const greetE = computed(() => { const h = hour.value; return h < 5 || h >= 22 ? '🌙' : h < 12 ? '☀️' : h < 17 ? '👋' : '🌆'; });
    const rel = computed(() => S.tasks.filter(t => t.due && (t.done ? t.doneDay === R.today && t.due <= R.today : t.due <= R.today)));
    const tTotal = computed(() => rel.value.length);
    const tDone = computed(() => rel.value.filter(t => t.done).length);
    const hTotal = computed(() => dueToday.value.length);
    const hDone = computed(() => dueToday.value.filter(h => h.log[R.today]).length);
    const pct = computed(() => { const tot = tTotal.value + hTotal.value; return tot ? (tDone.value + hDone.value) / tot : 0; });
    const hero = computed(() => {
      const tot = tTotal.value + hTotal.value, p = pct.value, left = tot - tDone.value - hDone.value;
      if (!tot) return ['A blank canvas', 'Add a task or habit to get rolling'];
      if (p === 0) return ['Let\'s get started', tot + ' thing' + (tot > 1 ? 's' : '') + ' on your plate today'];
      if (p < 0.5) return ['Good start', 'Keep the momentum going'];
      if (p < 1) return ['Almost there', left + ' left. You\'ve got this'];
      return ['All done! 🎉', 'Enjoy the rest of your day'];
    });
    const list = computed(() => {
      const open = rel.value.filter(t => !t.done).sort((a, b) => (b.priority - a.priority) || ((a.time || '99') < (b.time || '99') ? -1 : 1));
      const done = rel.value.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);
      return [...open, ...done].slice(0, 6);
    });
    const openCount = computed(() => rel.value.filter(t => !t.done).length);
    // up to three things that matter most today
    const top = computed(() => S.tasks.filter(t => t.top === R.today && (!t.done || t.doneDay === R.today)));
    const rest = computed(() => list.value.filter(t => t.top !== R.today));
    function star(t) {
      if (t.top === R.today) { t.top = null; Native.vibrate(6); return; }
      if (top.value.filter(x => !x.done).length >= 3) { say('You already have 3 top tasks. Unstar one first'); return; }
      t.top = R.today; Native.vibrate(10);
    }
    // sections can be hidden and reordered (Customize)
    const sections = computed(() => {
      const st = S.settings.today, ids = TODAY_SECTIONS.map(x => x.id);
      const order = [...st.order.filter(id => ids.includes(id)), ...ids.filter(id => !st.order.includes(id))];
      return order.filter(id => !st.hide.includes(id));
    });
    const custom = ref(false);
    // evening wrap-up: what's left, and how the day felt
    const wrapOpen = computed(() => rel.value.filter(t => !t.done && t.due <= R.today));
    const showWrap = computed(() => hour.value >= 19 && S.settings.wrap !== R.today && (wrapOpen.value.length > 0 || !S.mood[R.today]));
    function toTomorrow(t) { t.due = addDays(R.today, 1); if (t.top === R.today) t.top = null; Native.vibrate(8); }
    function allTomorrow() {
      const moved = wrapOpen.value.map(t => [t, t.due, t.top]);
      moved.forEach(([t]) => toTomorrow(t));
      say(moved.length + ' moved to tomorrow', () => moved.forEach(([t, due, tp]) => { t.due = due; t.top = tp; }));
    }
    function wrapDone() { S.settings.wrap = R.today; say('Good night 🌙'); }
    // a nudge to look back at the week, on its last day (Friday), if not done yet
    const reviewNudge = computed(() => new Date(R.min).getDay() === 5 && !S.reviews[addDays(R.today, -6)]);
    function addQuick() { if (!q.value.trim()) return; addTask(q.value, R.today); q.value = ''; }
    const mood = computed(() => S.mood[R.today]);
    const nextCd = computed(() => cdSorted.value.find(x => x.days >= 0));
    const pinned = computed(() => S.notes.filter(n => n.pinned).slice(0, 2));
    const showCyc = computed(() => cyc.value.has && S.settings.cycle.showToday);
    const both = computed(() => showCyc.value && nextCd.value);
    const updBanner = computed(() => updAvail.value && updAvail.value.code !== Upd.dismissed);
    // the next day and a half at a glance, from every part of the app
    const atOf = (k, hhmm) => { const d = parseKey(k); const [h, m] = (hhmm || '09:00').split(':'); d.setHours(+h, +m, 0, 0); return d.getTime(); };
    const whenLabel = at => (isToday(at) ? hm(at) : whenShort(at));
    const upcoming = computed(() => {
      const now = Math.max(R.min, Date.now() - 60e3), end = now + 36 * 3600e3, out = [];
      for (const t of S.tasks) if (!t.done && t.due && t.time) { const at = atOf(t.due, t.time); if (at >= now && at <= end) out.push({ at, i: t.remind ? 'bell' : 'circle-check', c: 'var(--c-tasks)', t: t.title, s: 'Task', go: () => { ui.task = { ref: t }; } }); }
      for (const r of S.reminders) if (r.on !== false) { const at = remNext(r)[0]; if (at && at <= end) out.push({ at, i: 'bell', c: r.color || 'var(--c-mood)', t: (r.emoji ? r.emoji + ' ' : '') + r.title, s: 'Reminder', go: () => go('reminders') }); }
      for (const p of socPairs.value) {
        if (!p.type) continue;
        if (p.today && p.today.day === p.todayKey && !p.today.mine) { out.push({ at: now, i: 'heart', c: 'var(--c-people)', t: 'Today\'s question with ' + whoName(p.with), s: 'Waiting for your answer', go: () => go('pair:' + p.id), now: true }); continue; }
        const at = OrbitSchedule.ruleTimes({ kind: 'daily', times: [p.time], days: ALL_DAYS }, now, p.tz, 1)[0];
        if (at && at <= end) out.push({ at, i: 'heart', c: 'var(--c-people)', t: 'Daily question with ' + whoName(p.with), s: 'People', go: () => go('pair:' + p.id) });
      }
      const c = cyc.value;
      if (c.has && S.settings.cycle.showToday && c.toNext >= 0 && c.toNext <= 2) out.push({ at: atOf(c.next, '09:00'), i: 'droplet', c: 'var(--c-cycle)', t: c.toNext === 0 ? 'Period expected today' : 'Period expected in ' + c.toNext + ' day' + (c.toNext > 1 ? 's' : ''), s: 'Cycle', go: () => go('cycle'), day: true });
      for (const x of cdSorted.value) if (x.days >= 0 && x.days <= 1) out.push({ at: atOf(x.k, '00:00'), i: 'hourglass', c: 'var(--c-count)', t: (x.c.emoji || '') + ' ' + x.c.title, s: x.days ? 'Tomorrow' : 'Today', go: () => go('countdowns'), day: true });
      return out.sort((a, b) => a.at - b.at).slice(0, 6);
    });
    const recent = computed(() => {
      const since = R.min - 24 * 3600e3, out = [];
      for (const t of S.tasks) if (t.done && t.doneAt > since) out.push({ at: t.doneAt, e: '✅', t: t.title, mine: true });
      for (const x of S.money) if (x.created > since && !x.pending) out.push({ at: x.created, e: catOf(x.cat).e, t: (x.type === 'in' ? '+' : '−') + fmt(x.amount) + ' T', n: x.note || '', l: x.note ? '' : catOf(x.cat).l });
      for (const p of socPairs.value) if (p.last && p.last.by !== (Soc.acct && Soc.acct.handle) && p.last.at > since && !p.last.deleted) out.push({ at: p.last.at, e: p.with.emoji || '💬', t: whoName(p.with) + ': ' + clip(p.last.text || '📷 Photo', 50), mine: true, go: () => go('pair:' + p.id) });
      const hd = S.habits.filter(h => h.log[R.today]);
      if (hd.length) out.push({ at: R.min - 1, e: '🔥', t: hd.length + ' habit' + (hd.length > 1 ? 's' : '') + ' done today: ' + hd.map(h => h.emoji).join(' ') });
      return out.sort((a, b) => b.at - a.at).slice(0, 5);
    });
    return { q, greet, greetE, tTotal, tDone, hTotal, hDone, pct, hero, list, openCount, addQuick, mood, nextCd, pinned, both, showCyc, updBanner, upcoming, recent, whenLabel,
      top, rest, star, sections, custom, wrapOpen, showWrap, toTomorrow, allTomorrow, wrapDone, reviewNudge };
  },
  template: `<div class="view" style="--acc:var(--c-tasks)">
    <header class="top">
      <div class="grow">
        <div class="sub" style="margin:0 0 6px">{{ gFull(R.today) }} · <b>{{ jFull(R.today) }}</b></div>
        <h1>{{ greet }}<template v-if="S.settings.name">,<br>{{ S.settings.name }}</template> {{ greetE }}</h1>
      </div>
      <button class="icon-btn" @click="ui.capture = {}" aria-label="Quick capture"><Ic n="plus" :w="2.4"/></button>
      <button class="icon-btn" @click="go('settings')" aria-label="Settings"><Ic n="settings"/></button>
    </header>

    <div class="hero tap" @click="nav.tab = 'tasks'">
      <Ring :v="pct" :size="92" :sw="9" c="#fff"><div class="pct">{{ Math.round(pct * 100) }}%</div></Ring>
      <div style="flex:1;min-width:0">
        <h2>{{ hero[0] }}</h2><div class="hl">{{ hero[1] }}</div>
        <div class="stats"><span><Ic n="circle-check" :s="14"/>{{ tDone }}/{{ tTotal }} tasks</span><span><Ic n="flame" :s="14"/>{{ hDone }}/{{ hTotal }} habits</span></div>
      </div>
    </div>

    <div v-if="updBanner" class="card upd-card">
      <span class="bubble" style="--c:var(--c-tasks)"><Ic n="download" :s="18"/></span>
      <div class="grow"><b>Orbit {{ updAvail.name }} is available</b><div class="muted" style="font-size:13px">A quick install, your data stays</div></div>
      <button class="btn sm primary" :disabled="Upd.state === 'downloading'" @click="installUpdate">{{ Upd.state === 'downloading' ? 'Downloading…' : 'Install' }}</button>
      <button class="icon-btn plain" @click="dismissUpdate" aria-label="Later"><Ic n="x" :s="17"/></button>
    </div>

    <template v-for="sec in sections" :key="sec">
    <div v-if="sec === 'wrap' && showWrap" class="card wrap-card">
      <div class="sec" style="margin-bottom:6px"><h3><Ic n="moon-star" :s="16" style="color:var(--c-count)"/>Wrap up your day</h3><button class="link" @click="go('timeline')">Timeline <Ic n="chevron-right" :s="16"/></button></div>
      <template v-if="wrapOpen.length">
        <div class="muted" style="font-size:14px;margin-bottom:4px">{{ wrapOpen.length }} still open. Move what can wait to tomorrow.</div>
        <div v-for="t in wrapOpen.slice(0, 4)" :key="'w' + t.id" class="mini-task">
          <Check :on="!!justDone[t.id]" c="var(--c-tasks)" @toggle="toggleTask(t)"/><span class="t" translate="no">{{ t.title }}</span>
          <button class="btn sm" @click="toTomorrow(t)">Tomorrow</button></div>
        <button v-if="wrapOpen.length > 1" class="btn sm" style="margin-top:8px" @click="allTomorrow">Move all to tomorrow</button>
      </template>
      <template v-if="!S.mood[R.today]"><div class="muted" style="font-size:14px;margin:10px 0 4px">How did today feel?</div>
        <div class="moods-mini"><button v-for="m in MOODS" :key="m.v" @click="setMood(m.v)" :aria-label="m.l">{{ m.e }}</button></div></template>
      <button class="btn primary block" style="margin-top:12px" @click="wrapDone">Done for today</button>
    </div>
    <div v-if="sec === 'wrap' && reviewNudge && !showWrap" class="card tap review-nudge" @click="go('review')">
      <span class="bubble" style="--c:var(--c-habits)"><Ic n="chart-column" :s="18"/></span>
      <div class="grow"><b>Your week in review</b><div class="muted" style="font-size:13px">Tasks, habits, focus and a few patterns from the last 7 days</div></div><Ic n="chevron-right" :s="18" class="muted"/>
    </div>
    <div v-if="sec === 'people' && (socTodo.total)" class="card people-card tap" style="margin-top:14px" @click="socTodo.questions.length === 1 && !socTodo.unread && !socTodo.reqs ? go('pair:' + socTodo.questions[0].id) : go('people')">
      <div class="sec" style="margin-bottom:8px"><h3><Ic n="users" :s="16" style="color:var(--c-people)"/>People</h3><span class="link">Open <Ic n="chevron-right" :s="16"/></span></div>
      <div v-for="x in socTodo.questions.slice(0, 2)" :key="x.id" class="pq"><b>💬 {{ whoName(x.with) }}</b><span translate="no">{{ qText(x.today, x.with) }}</span></div>
      <div v-if="socTodo.unread" class="muted" style="font-size:14px;margin-top:4px">{{ socTodo.unread }} new message{{ socTodo.unread > 1 ? 's' : '' }}</div>
      <div v-if="socTodo.reqs" class="muted" style="font-size:14px;margin-top:4px">{{ socTodo.reqs }} connection request{{ socTodo.reqs > 1 ? 's' : '' }}</div>
      <div v-if="socTodo.proposals" class="muted" style="font-size:14px;margin-top:4px">A request is waiting for you. Tap to answer</div>
    </div>

    <div v-if="sec === 'upcoming' && (upcoming.length)" class="card" style="margin-top:14px">
      <div class="sec" style="margin-bottom:4px"><h3><Ic n="clock" :s="16"/>Coming up</h3></div>
      <button v-for="u in upcoming" :key="u.t + u.at" class="agenda-row" @click="u.go()">
        <span class="bubble" :style="{'--c': u.c}"><Ic :n="u.i" :s="16"/></span>
        <div class="grow"><div class="t">{{ u.t }}</div><div class="s">{{ u.s }}</div></div>
        <span class="when" :class="{now: u.now}">{{ u.now ? 'Now' : u.day ? (isToday(u.at) ? 'Today' : 'Tomorrow') : whenLabel(u.at) }}</span>
      </button>
    </div>

    <div v-if="sec === 'tasks'" class="card" style="margin-top:14px">
      <div class="sec"><h3>Today's tasks <span class="badge" v-if="openCount">{{ openCount }}</span></h3>
        <button class="link" @click="nav.tab = 'tasks'">All tasks <Ic n="chevron-right" :s="16"/></button></div>
      <div v-if="top.length" class="top3">
        <div class="top3-h"><Ic n="star" :s="14"/>Top {{ top.length }} for today</div>
        <div v-for="t in top" :key="'top' + t.id" class="mini-task" :class="{done: t.done || justDone[t.id]}" @click="ui.task = {ref: t}">
          <Check :on="t.done || !!justDone[t.id]" c="var(--c-mood)" @toggle="toggleTask(t)"/>
          <span class="t" translate="no">{{ t.title }}</span>
          <button class="star on" @click.stop="star(t)" aria-label="Remove from top 3"><Ic n="star" :s="16"/></button>
        </div>
      </div>
      <TransitionGroup name="list" tag="div" class="rel">
        <div v-for="t in rest" :key="t.id" class="mini-task" :class="{done: t.done || justDone[t.id]}" @click="ui.task = {ref: t}">
          <Check :on="t.done || !!justDone[t.id]" :c="prioC(t.priority) === 'var(--muted)' ? 'var(--c-tasks)' : prioC(t.priority)" @toggle="toggleTask(t)"/>
          <span class="t" translate="no">{{ t.title }}</span>
          <span v-if="!t.done && t.due < R.today" class="badge" style="color:var(--c-danger);background:color-mix(in srgb,var(--c-danger) 14%,transparent)">Late</span>
          <span v-else-if="t.time && !t.done" class="muted" style="font-size:12.5px;font-weight:650">{{ t.time }}</span>
          <button v-if="!t.done" class="star" @click.stop="star(t)" aria-label="Add to top 3"><Ic n="star" :s="16"/></button>
        </div>
      </TransitionGroup>
      <div v-if="!list.length" class="muted" style="padding:4px 0 12px;font-size:14px">Nothing due today. Add something below ✨</div>
      <div class="quick"><span class="plus"><Ic n="plus" :s="14" :w="2.6"/></span>
        <input v-model="q" placeholder="Add a task for today" @keydown.enter="addQuick" enterkeyhint="done"></div>
    </div>

    <div v-if="sec === 'habits'" class="card">
      <div class="sec"><h3>Habits</h3><button class="link" @click="nav.tab = 'habits'">{{ hDone }}/{{ hTotal }} done <Ic n="chevron-right" :s="16"/></button></div>
      <div class="hchips" v-if="dueToday.length">
        <button v-for="h in dueToday" :key="h.id" class="hchip" :class="{on: h.log[R.today]}" :style="{'--c': h.color}" @click="toggleHabit(h, R.today)">
          <span class="ok"><Ic n="check" :s="11" :w="3.5"/></span><span class="e">{{ h.emoji }}</span><div class="n" translate="no">{{ h.name }}</div>
        </button>
      </div>
      <div v-else-if="S.habits.length" class="muted" style="font-size:14px;padding:2px 0 4px">No habits scheduled for today. Enjoy the rest 🌿</div>
      <button v-else class="btn block" @click="nav.tab = 'habits'"><Ic n="plus" :s="18"/>Add your first habit</button>
    </div>

    <div v-if="sec === 'tiles'" class="grid2">
      <div class="card tile tap" style="--c:var(--c-water)" @click="go('water')">
        <div class="tt"><span class="bubble sm"><Ic n="droplet" :s="16"/></span>Water</div>
        <div class="big">{{ waterToday }}<small>/ {{ S.settings.waterGoal }}</small></div>
        <div class="cap">{{ fmt(waterToday * S.settings.glassMl) }} ml</div>
        <div class="bar" style="margin-right:48px"><i :style="{width: Math.min(100, waterToday / S.settings.waterGoal * 100) + '%'}"></i></div>
        <button class="add" @click.stop="addWater(1)" aria-label="Add glass"><Ic n="plus" :s="20" :w="2.6"/></button>
      </div>
      <div class="card tile tap" style="--c:var(--c-mood)" @click="go('mood')">
        <div class="tt"><span class="bubble sm"><Ic n="smile" :s="16"/></span>Mood</div>
        <template v-if="mood"><div class="big" style="font-size:36px">{{ MOODS[mood.v - 1].e }}</div><div class="cap">Feeling {{ MOODS[mood.v - 1].l.toLowerCase() }}</div></template>
        <template v-else><div class="cap" style="margin-top:14px">How's today going?</div>
          <div class="moods-mini"><button v-for="m in MOODS" :key="m.v" @click.stop="setMood(m.v)">{{ m.e }}</button></div></template>
      </div>
      <div class="card tile tap" style="--c:var(--c-focus)" @click="go('focus')">
        <div class="tt"><span class="bubble sm"><Ic n="timer" :s="16"/></span>Focus</div>
        <template v-if="S.timer.running || Timer.left() < Timer.total()">
          <div class="big">{{ mmss(Timer.left()) }}</div><div class="cap">{{ MODES[S.timer.mode].l }}{{ S.timer.running ? '' : ' · paused' }}</div></template>
        <template v-else><div class="big">{{ focusToday.min }}<small>min</small></div><div class="cap">{{ focusToday.n }} session{{ focusToday.n === 1 ? '' : 's' }} today</div></template>
        <button class="add" @click.stop="Timer.toggle()" :aria-label="S.timer.running ? 'Pause' : 'Start'"><Ic :n="S.timer.running ? 'pause' : 'play'" :s="18" :w="2.4"/></button>
      </div>
      <div class="card tile tap" style="--c:var(--c-money)" @click="nav.tab = 'money'">
        <div class="tt"><span class="bubble sm"><Ic n="wallet" :s="16"/></span>Money</div>
        <div class="big">{{ short(spentThisMonth) }}<small>T</small></div>
        <div class="cap"><span>Spent in</span> <span>{{ JM[curJ.m - 1] }}</span></div>
        <div class="bar" v-if="S.settings.budget" style="margin-right:48px"><i :style="{width: Math.min(100, spentThisMonth / S.settings.budget * 100) + '%', background: spentThisMonth > S.settings.budget ? 'var(--c-danger)' : ''}"></i></div>
        <button class="add" @click.stop="ui.tx = {}" aria-label="Add expense"><Ic n="plus" :s="20" :w="2.6"/></button>
      </div>
    </div>

    <div v-if="sec === 'extras' && (showCyc || nextCd)" class="grid2">
      <div v-if="showCyc" class="card tile tap cycle-card" style="--c:var(--c-cycle)" :style="{gridColumn: both ? '' : '1 / -1'}" @click="go('cycle')">
        <div class="tt"><span class="bubble sm"><Ic n="flower-2" :s="16"/></span>{{ S.settings.cycle.name || 'Cycle' }}</div>
        <div class="big">Day {{ cyc.day }}</div>
        <div class="cap" :style="{color: cyc.pc, fontWeight: 700}">{{ cyc.phase }}</div>
        <div class="cap">{{ cyc.toNext > 0 ? 'Period in ' + cyc.toNext + 'd' : cyc.toNext === 0 ? 'Period due today' : 'Late by ' + -cyc.toNext + 'd' }}</div>
      </div>
      <div v-if="nextCd" class="card tile tap" style="--c:var(--c-count)" :style="{gridColumn: both ? '' : '1 / -1'}" @click="go('countdowns')">
        <div class="tt"><span class="bubble sm"><Ic n="hourglass" :s="16"/></span>Countdown</div>
        <div class="big">{{ nextCd.days === 0 ? 'Today!' : nextCd.days }}<small v-if="nextCd.days">day{{ nextCd.days === 1 ? '' : 's' }}</small></div>
        <div class="cap ellipsis">{{ nextCd.c.emoji }} {{ nextCd.c.title }}</div>
      </div>
    </div>

    <div v-if="sec === 'recent' && (recent.length)" class="card">
      <div class="sec" style="margin-bottom:6px"><h3><Ic n="activity" :s="16"/>Recently</h3></div>
      <div v-for="x in recent" :key="x.t + x.at" class="recent-row" :class="{tap: x.go}" @click="x.go && x.go()"><span class="e">{{ x.e }}</span><span class="grow"><span :translate="x.mine ? 'no' : null">{{ x.t }}</span><template v-if="x.l"> · <span>{{ x.l }}</span></template><template v-if="x.n"> · <span translate="no">{{ x.n }}</span></template></span><span class="muted">{{ ago(x.at) }}</span></div>
    </div>

    <div v-if="sec === 'pinned' && (pinned.length)" class="card">
      <div class="sec"><h3><Ic n="pin" :s="16" style="color:var(--c-notes)"/>Pinned notes</h3><button class="link" @click="go('notes')">Notes <Ic n="chevron-right" :s="16"/></button></div>
      <div v-for="n in pinned" :key="n.id" class="list-row tap" @click="go('notes')">
        <div class="grow"><div class="t" translate="no">{{ n.title || 'Untitled' }}</div><div class="s ellipsis" translate="no">{{ n.body }}</div></div>
      </div>
    </div>
    </template>
    <button class="link-btn today-custom" @click="custom = true"><Ic n="layout-grid" :s="15"/>Customize Today</button>
    <Sheet :open="custom" title="Customize Today" @close="custom = false">
      <p class="muted" style="font-size:14px;margin-bottom:10px">Choose what Today shows, and in which order.</p>
      <TodaySections/>
    </Sheet>
  </div>`,
};
