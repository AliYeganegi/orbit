/* Tasks screen. */
const TasksView = {
  setup() {
    const f = ref('today');
    const q = ref('');
    const open = computed(() => S.tasks.filter(t => !t.done));
    const sortT = (a, b) => (b.priority - a.priority) || ((a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0) || a.created - b.created;
    const counts = computed(() => {
      const t = R.today, o = open.value;
      return { today: o.filter(x => x.due && x.due <= t).length, upcoming: o.filter(x => x.due && x.due > t).length, all: o.length, done: S.tasks.length - o.length };
    });
    const groups = computed(() => {
      const t = R.today, o = open.value, g = [], fv = f.value;
      const add = (id, title, items, cls) => { if (items.length) g.push({ id, title, items: items.sort(sortT), cls }); };
      if (fv === 'today' || fv === 'all') {
        add('late', 'Overdue', o.filter(x => x.due && x.due < t), 'red');
        add('today', 'Today · ' + jLabel(t), o.filter(x => x.due === t));
      }
      if (fv === 'upcoming' || fv === 'all') {
        const by = {};
        o.filter(x => x.due && x.due > t).forEach(x => (by[x.due] = by[x.due] || []).push(x));
        Object.keys(by).sort().forEach(k => add(k, rel(k) + ' · ' + jLabel(k), by[k]));
      }
      if (fv === 'all') add('none', 'Someday', o.filter(x => !x.due));
      if (fv === 'today') add('donet', 'Completed today', S.tasks.filter(x => x.done && x.doneDay === t), 'done');
      if (fv === 'done') {
        const by = {};
        S.tasks.filter(x => x.done).forEach(x => (by[x.doneDay || ''] = by[x.doneDay || ''] || []).push(x));
        Object.keys(by).sort().reverse().forEach(k => g.push({ id: 'd' + k, title: k ? rel(k) : 'Earlier', items: by[k].sort((a, b) => b.doneAt - a.doneAt) }));
      }
      return g;
    });
    function addQuick() {
      if (!q.value.trim()) return;
      addTask(q.value, f.value === 'today' ? R.today : f.value === 'upcoming' ? addDays(R.today, 1) : null);
      q.value = '';
    }
    function clearDone() {
      const removed = S.tasks.filter(t => t.done);
      if (!removed.length) return;
      const keep = S.tasks.filter(t => !t.done);
      S.tasks.splice(0, S.tasks.length, ...keep);
      say(removed.length + ' completed task' + (removed.length > 1 ? 's' : '') + ' cleared', () => S.tasks.push(...removed));
    }
    const empty = computed(() => ({
      today: ['🌤️', 'All clear for today', 'Add a task above or enjoy the free time.'],
      upcoming: ['🗓️', 'Nothing upcoming', 'Plan ahead by giving tasks a future date.'],
      all: ['✨', 'No open tasks', 'Your list is empty. Nice!'],
      done: ['🏁', 'Nothing completed yet', 'Finished tasks will show up here.'],
    })[f.value]);
    const quickPh = computed(() => ({ today: 'Add a task for today', upcoming: 'Add a task for tomorrow', all: 'Add a task', done: 'Add a task' })[f.value]);
    return { f, q, counts, groups, addQuick, clearDone, empty, quickPh };
  },
  template: `<div class="view" style="--acc:var(--c-tasks)">
    <header class="top"><div class="grow"><h1>Tasks</h1><div class="sub"><b>{{ counts.today }}</b> due today · <b>{{ counts.all }}</b> open</div></div>
      <button v-if="f === 'done' && counts.done" class="icon-btn" @click="clearDone" aria-label="Clear completed"><Ic n="trash-2" :s="19"/></button></header>
    <div class="quickbar">
      <input v-model="q" :placeholder="quickPh" @keydown.enter="addQuick" enterkeyhint="done">
      <button class="go" :disabled="!q.trim()" @click="addQuick" aria-label="Add"><Ic n="plus" :s="20" :w="2.6"/></button>
    </div>
    <div class="seg" style="margin-top:12px">
      <button v-for="k in ['today','upcoming','all','done']" :key="k" :class="{on: f === k}" @click="f = k">
        {{ k[0].toUpperCase() + k.slice(1) }}<span class="badge" v-if="counts[k] && k !== 'done'">{{ counts[k] }}</span></button>
    </div>
    <Transition name="fade" mode="out-in">
      <div :key="f">
        <template v-if="groups.length">
          <div v-for="g in groups" :key="g.id">
            <div class="group-h" :class="g.cls">{{ g.title }} <span class="badge" style="height:19px;font-size:11px">{{ g.items.length }}</span></div>
            <TransitionGroup name="list" tag="div" class="tlist rel">
              <Swipe v-for="t in g.items" :key="t.id" @remove="delTask(t)" @tap="ui.task = {ref: t}">
                <div class="task" :class="{done: t.done || justDone[t.id]}">
                  <Check :on="t.done || !!justDone[t.id]" :c="prioC(t.priority) === 'var(--muted)' ? 'var(--c-tasks)' : prioC(t.priority)" @toggle="toggleTask(t)"/>
                  <div class="main"><div class="tt" translate="no">{{ t.title }}</div>
                    <div class="meta" v-if="(t.due && f !== 'today') || t.time || t.notes || (t.due && t.due < R.today && !t.done)">
                      <span v-if="t.due && (f !== 'today' || t.due < R.today)" :class="{late: !t.done && t.due < R.today}"><Ic n="calendar" :s="13"/>{{ rel(t.due) }}</span>
                      <span v-if="t.time" :class="{passed: !t.done && taskPassed(t)}"><Ic :n="t.remind ? 'bell' : 'clock'" :s="13"/>{{ t.time }}{{ !t.done && taskPassed(t) ? ' · passed' : '' }}</span>
                      <span v-if="t.notes"><Ic n="notebook-pen" :s="13"/>Note</span>
                    </div>
                  </div>
                  <Ic v-if="t.priority" n="flag" :s="16" :style="{color: prioC(t.priority)}"/>
                </div>
              </Swipe>
            </TransitionGroup>
          </div>
          <p class="muted" style="text-align:center;font-size:12.5px;margin-top:22px">Swipe left to delete · tap to edit</p>
        </template>
        <Empty v-else :e="empty[0]" :t="empty[1]" :s="empty[2]"/>
      </div>
    </Transition>
    <button class="fab" @click="ui.task = {preset: {due: f === 'today' ? R.today : f === 'upcoming' ? addDays(R.today, 1) : null}}" aria-label="New task"><Ic n="plus" :s="26" :w="2.4"/></button>
  </div>`,
};
