/* Habits screen. */
const HabitsView = {
  setup() {
    const sheet = ref(false);
    const d = reactive({ name: '', emoji: '💧', color: HABIT_COLORS[0], days: [] });
    const REPEAT = [{ l: 'Every day', v: [] }, { l: 'Sat–Wed', v: [6, 0, 1, 2, 3] }, { l: '3 days', v: [6, 1, 3] }, { l: 'Weekend', v: [4, 5] }];
    const sameRepeat = v => (v.length ? v.length === d.days.length && v.every(x => d.days.includes(x)) : !d.days.length || d.days.length === 7);
    function toggleRepeatDay(v) { const a = d.days.length ? d.days : [...ALL_DAYS]; const i = a.indexOf(v); i >= 0 ? a.splice(i, 1) : a.push(v); d.days = a.length === 7 ? [] : [...a]; Native.vibrate(6); }
    const editing = ref(null);
    const week = computed(() => Array.from({ length: 7 }, (_, i) => { const k = addDays(R.today, i - 6); return { k, l: WD[parseKey(k).getDay()][0] }; }));
    const done = computed(() => dueToday.value.filter(h => h.log[R.today]).length);
    function openNew() { editing.value = null; Object.assign(d, { name: '', emoji: HABIT_EMOJI[Math.floor(Math.random() * 8)], color: HABIT_COLORS[S.habits.length % HABIT_COLORS.length], days: [] }); sheet.value = true; }
    function openEdit(h) { editing.value = h; Object.assign(d, { name: h.name, emoji: h.emoji, color: h.color, days: [...(h.days || [])] }); sheet.value = true; }
    function save() {
      if (!d.name.trim()) return;
      const days = d.days.length === 7 ? [] : [...d.days].sort();
      if (editing.value) Object.assign(editing.value, { name: d.name.trim(), emoji: d.emoji, color: d.color, days });
      else S.habits.push({ id: uid(), name: d.name.trim(), emoji: d.emoji, color: d.color, days, log: {}, created: Date.now() });
      sheet.value = false;
    }
    function removeHabit(h) {
      const i = S.habits.indexOf(h);
      if (i < 0) return;
      S.habits.splice(i, 1);
      say('"' + h.name + '" deleted', () => S.habits.splice(i, 0, h));
    }
    function remove() { const h = editing.value; sheet.value = false; removeHabit(h); }
    const managing = ref(false);
    function move(h, dir) {
      const i = S.habits.indexOf(h), j = i + dir;
      if (j < 0 || j >= S.habits.length) return;
      S.habits.splice(i, 1); S.habits.splice(j, 0, h); Native.vibrate(6);
    }
    const ideas = computed(() => HABIT_IDEAS.filter(x => !S.habits.some(h => h.name.toLowerCase() === x.name.toLowerCase())).slice(0, 12));
    function useIdea(x) { Object.assign(d, x); Native.vibrate(6); }
    const heat = computed(() => {
      const t = R.today, start = addDays(t, -satIdx(t) - 7 * 17);
      return Array.from({ length: 126 }, (_, i) => { const k = addDays(start, i); return { k, fut: k > t }; });
    });
    const stats = computed(() => {
      const h = editing.value; if (!h) return null;
      let n30 = 0, due30 = 0;
      for (let i = 0; i < 30; i++) { const k = addDays(R.today, -i); if (habitDue(h, k)) { due30++; if (h.log[k]) n30++; } }
      return { cur: streak(h), best: bestStreak(h), rate: due30 ? Math.min(100, Math.round(n30 / due30 * 100)) : 0, total: Object.keys(h.log).length };
    });
    return { REPEAT, sameRepeat, toggleRepeatDay, DAY_DOTS, habitDue, habitDays, dueToday, sheet, d, editing, week, done, openNew, openEdit, save, remove, removeHabit, managing, move, ideas, useIdea, heat, stats, HABIT_COLORS, HABIT_EMOJI };
  },
  template: `<div class="view" style="--acc:var(--c-habits)">
    <header class="top"><div class="grow"><h1>Habits</h1>
      <div class="sub" v-if="S.habits.length"><b>{{ done }} of {{ dueToday.length }}</b> done today{{ dueToday.length && done === dueToday.length ? ' · perfect day 🔥' : '' }}</div>
      <div class="sub" v-else>Small steps, every day</div></div>
      <button v-if="S.habits.length" class="chip" :class="{on: managing}" style="margin-top:6px" @click="managing = !managing">{{ managing ? 'Done' : 'Edit' }}</button></header>
    <template v-if="S.habits.length">
      <TransitionGroup v-if="managing" name="list" tag="div" class="stack rel">
        <div v-for="(h, i) in S.habits" :key="h.id" class="card habit manage" :style="{'--c': h.color}">
          <div class="h-top">
            <button class="del" @click="removeHabit(h)" :aria-label="'Delete ' + h.name"><Ic n="minus" :s="18" :w="3"/></button>
            <div class="em" style="width:42px;height:42px;font-size:22px">{{ h.emoji }}</div>
            <div class="grow tap" @click="openEdit(h)"><div class="nm" translate="no">{{ h.name }}</div><div class="st">Tap to rename or change icon</div></div>
            <button class="icon-btn plain" :disabled="i === 0" @click="move(h, -1)" aria-label="Move up"><Ic n="chevron-up" :s="18"/></button>
            <button class="icon-btn plain" :disabled="i === S.habits.length - 1" @click="move(h, 1)" aria-label="Move down"><Ic n="chevron-down" :s="18"/></button>
          </div>
        </div>
      </TransitionGroup>
      <TransitionGroup v-else name="list" tag="div" class="stack rel">
        <Swipe v-for="h in S.habits" :key="h.id" @remove="removeHabit(h)" @tap="openEdit(h)">
        <div class="card habit" :style="{'--c': h.color}">
          <div class="h-top">
            <div class="em">{{ h.emoji }}</div>
            <div class="grow" style="flex:1;min-width:0"><div class="nm" translate="no">{{ h.name }}</div>
              <div class="st" :class="{hot: streak(h) >= 3}"><template v-if="streak(h)"><Ic n="flame" :s="14"/>{{ streak(h) }} {{ h.days && h.days.length ? 'in a row' : 'day streak' }}</template><template v-else>{{ habitDue(h, R.today) ? 'Start your streak today' : 'Rest day' }}</template><span v-if="h.days && h.days.length"> · {{ habitDays(h) }}</span></div></div>
            <button class="h-check" :class="{on: h.log[R.today]}" @click.stop="toggleHabit(h, R.today)" aria-label="Done today"><Ic n="check" :s="22" :w="2.8"/></button>
          </div>
          <div class="h-week">
            <button v-for="w in week" :key="w.k" class="h-day" :class="{on: h.log[w.k], today: w.k === R.today, rest: !habitDue(h, w.k)}" @click.stop="toggleHabit(h, w.k)"><small>{{ w.l }}</small><i></i></button>
          </div>
        </div>
        </Swipe>
      </TransitionGroup>
      <p class="foot-hint">{{ managing ? 'Delete with − · reorder with the arrows' : 'Tap a habit to edit · swipe left to delete · Edit to reorder' }}</p>
    </template>
    <Empty v-else e="🌱" t="Build your first habit" s="Track daily wins and watch your streaks grow.">
      <button class="btn primary" @click="openNew"><Ic n="plus" :s="18"/>New habit</button></Empty>
    <button class="fab" @click="openNew" aria-label="New habit"><Ic n="plus" :s="26" :w="2.4"/></button>

    <Sheet :open="sheet" :title="editing ? 'Edit habit' : 'New habit'" @close="sheet = false">
      <div style="--acc:var(--c-habits)">
        <template v-if="editing && stats">
          <div class="stat-row">
            <div class="stat"><b>{{ stats.cur }}🔥</b><span>Current streak</span></div>
            <div class="stat"><b>{{ stats.best }}</b><span>Best streak</span></div>
            <div class="stat"><b>{{ stats.rate }}%</b><span>Last 30 days</span></div>
          </div>
          <span class="flabel">Last 18 weeks · {{ stats.total }} check-ins</span>
          <div class="heat" :style="{'--c': d.color}"><i v-for="c in heat" :key="c.k" :class="{on: editing.log[c.k], fut: c.fut}"></i></div>
        </template>
        <template v-if="!editing && ideas.length">
          <span class="flabel" style="margin-top:4px">Ideas</span>
          <div class="chips scroll" style="margin:0 -20px;padding:2px 20px"><button v-for="x in ideas" :key="x.name" class="chip" :class="{on: d.name === x.name}" @click="useIdea(x)">{{ x.emoji }} {{ x.name }}</button></div>
        </template>
        <span class="flabel">Name</span>
        <input class="field" v-model="d.name" placeholder="Or write your own, e.g. Read 10 pages" enterkeyhint="done">
        <span class="flabel">Repeat</span>
        <div class="chips" style="margin-bottom:10px"><button v-for="r in REPEAT" :key="r.l" class="chip" :class="{on: sameRepeat(r.v)}" @click="d.days = [...r.v]">{{ r.l }}</button></div>
        <div class="day-dots"><button v-for="x in DAY_DOTS" :key="x.v" :class="{on: !d.days.length || d.days.includes(x.v)}" @click="toggleRepeatDay(x.v)">{{ x.l }}</button></div>
        <div class="muted" style="font-size:12.5px;margin:6px 2px 0">{{ d.days.length ? 'Only on these days. Streaks skip the others.' : 'Every day' }}</div>
        <span class="flabel">Icon</span>
        <EmojiPick v-model="d.emoji" :list="HABIT_EMOJI"/>
        <span class="flabel">Color</span>
        <div class="swatches"><button v-for="c in HABIT_COLORS" :key="c" :style="{'--c': c}" :class="{on: d.color === c}" @click="d.color = c"></button></div>
        <div class="btn-row">
          <button v-if="editing" class="btn danger icon-only" @click="remove"><Ic n="trash-2"/></button>
          <button class="btn primary" :disabled="!d.name.trim()" @click="save">{{ editing ? 'Save' : 'Create habit' }}</button>
        </div>
      </div>
    </Sheet>
  </div>`,
};
