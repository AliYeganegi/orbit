/* Reminder editor and reminders screen. */
const RemSheet = {
  setup() {
    const d = reactive(newReminder());
    const picking = ref(false), emojiOpen = ref(false), need = ref('');
    const isEdit = computed(() => ui.rem && ui.rem.ref);
    watch(() => ui.rem, v => {
      if (!v) return;
      need.value = ''; emojiOpen.value = false;
      if (v.ref) { Object.assign(d, newReminder(), JSON.parse(JSON.stringify(v.ref)), v.draft || {}); picking.value = false; }
      else if (v.tpl) { Object.assign(d, newReminder(v.tpl)); picking.value = false; }
      else if (v.draft) { Object.assign(d, newReminder(), v.draft); picking.value = false; }
      else picking.value = true;
    });
    Drafts.rem = () => (ui.rem && !picking.value ? { refId: ui.rem.ref && ui.rem.ref.id, d: JSON.parse(JSON.stringify(d)) } : null);
    const templates = computed(() => REM_TEMPLATES.filter(t => !(t.water && S.reminders.some(r => r.water))));
    function useTpl(t) { Object.assign(d, newReminder(t)); picking.value = false; Native.vibrate(6); }
    const EVERY = [15, 20, 30, 45, 60, 90, 120, 180, 240];
    const KINDS = [{ id: 'once', l: 'Once' }, { id: 'daily', l: 'Daily' }, { id: 'interval', l: 'Every…' }, { id: 'monthly', l: 'Monthly' }];
    const toggleDay = v => { const i = d.days.indexOf(v); i >= 0 ? d.days.splice(i, 1) : d.days.push(v); Native.vibrate(6); };
    const sameDays = a => a.length === d.days.length && a.every(x => d.days.includes(x));
    function addTime() { const last = d.times[d.times.length - 1] || '08:00'; const [h, m] = last.split(':').map(Number); d.times.push(pad((h + 3) % 24) + ':' + pad(m)); }
    const preview = computed(() => OrbitSchedule.ruleTimes(remRule(d), Date.now(), TZ, 3));
    const problem = computed(() => {
      if (d.kind === 'interval' && d.end <= d.start) return 'The end time needs to be after the start time';
      if ((d.kind === 'daily' || d.kind === 'interval') && !d.days.length) return 'Pick at least one day';
      if (d.kind === 'daily' && !d.times.length) return 'Add at least one time';
      if (!preview.value.length) return d.kind === 'once' ? 'That time has already passed' : 'This schedule never fires. Check the dates and times';
      return '';
    });
    function save() {
      if (!d.title.trim()) { need.value = 'title'; Native.vibrate(30); return; }
      if (problem.value) { need.value = 'schedule'; Native.vibrate(30); return; }
      const rec = JSON.parse(JSON.stringify(d));
      rec.title = rec.title.trim(); rec.on = true;
      if (rec.kind === 'daily') rec.times = [...new Set(rec.times)].sort();
      if (isEdit.value) Object.assign(ui.rem.ref, rec); else S.reminders.push(rec);
      if (Native.has) Native.askNotify();
      say((isEdit.value ? 'Saved' : 'Reminder added') + ' · next ' + whenShort(preview.value[0]));
      ui.rem = null;
    }
    function remove() {
      const r = ui.rem.ref, i = S.reminders.indexOf(r);
      S.reminders.splice(i, 1); ui.rem = null;
      say('"' + r.title + '" deleted', () => S.reminders.splice(i, 0, r));
    }
    watch(() => d.title, () => { if (need.value === 'title') need.value = ''; });
    return { d, picking, emojiOpen, need, isEdit, templates, useTpl, EVERY, KINDS, toggleDay, sameDays, addTime, preview, problem, save, remove, DAY_DOTS, DAY_PRESETS, REM_EMOJI, HABIT_COLORS, everyLabel, whenShort };
  },
  template: `<Sheet :open="!!ui.rem" :title="picking ? 'New reminder' : isEdit ? 'Edit reminder' : 'New reminder'" full @close="ui.rem = null">
    <div style="--acc:var(--c-mood)">
      <template v-if="picking">
        <p class="muted" style="font-size:13.5px;margin:-2px 2px 14px">Start from an idea, or make your own.</p>
        <div class="tpl-grid">
          <button v-for="t in templates" :key="t.title" class="tpl tap" :style="{'--c': t.color}" @click="useTpl(t)">
            <span class="e">{{ t.emoji }}</span><b translate="no">{{ t.title }}</b><small>{{ t.custom ? 'Any time, any repeat' : remSummary(newReminder(t)) }}</small></button>
        </div>
      </template>
      <template v-else>
        <div class="rem-head">
          <button class="rem-emoji" :style="{'--c': d.color}" @click="emojiOpen = !emojiOpen" aria-label="Choose icon">{{ d.emoji }}</button>
          <input class="field-title" v-model="d.title" placeholder="Reminder name" enterkeyhint="done" :class="{bad: need === 'title'}">
        </div>
        <div v-if="need === 'title'" class="hint warn" style="margin-top:8px"><span class="grow">Give the reminder a name</span></div>
        <Transition name="fade"><div v-if="emojiOpen" style="margin-top:12px">
          <EmojiPick v-model="d.emoji" :list="REM_EMOJI" @picked="emojiOpen = false"/>
          <div class="swatches" style="margin-top:12px"><button v-for="c in HABIT_COLORS" :key="c" :style="{'--c': c}" :class="{on: d.color === c}" @click="d.color = c"></button></div>
        </div></Transition>
        <textarea class="field" v-model="d.note" :placeholder="d.water ? 'Details (optional). The notification shows your progress.' : 'Details shown in the notification (optional)'" style="min-height:64px;margin-top:12px"></textarea>

        <span class="flabel">Repeat</span>
        <div class="seg"><button v-for="k in KINDS" :key="k.id" :class="{on: d.kind === k.id}" @click="d.kind = k.id; Native.vibrate(6)">{{ k.l }}</button></div>

        <template v-if="d.kind === 'once'">
          <span class="flabel">Date & time</span>
          <DatePick v-model="d.date" :none="false"/>
          <div class="row" style="margin-top:10px"><TimeChip v-model="d.time" title="Reminder time"/></div>
        </template>

        <template v-if="d.kind === 'daily'">
          <span class="flabel">At</span>
          <div class="chips">
            <span v-for="(t, i) in d.times" :key="i" class="chip on time-chip">
              <button style="display:flex;align-items:center;gap:6px" @click="pickTime(t, 'Reminder time').then(v => { if (v) d.times[i] = v; })"><Ic n="clock" :s="15"/>{{ t }}</button>
              <button v-if="d.times.length > 1" @click="d.times.splice(i, 1)" aria-label="Remove time" style="margin-left:2px;display:grid"><Ic n="x" :s="13"/></button>
            </span>
            <button class="chip" @click="addTime"><Ic n="plus" :s="14"/>Add time</button>
          </div>
        </template>

        <template v-if="d.kind === 'interval'">
          <span class="flabel">Every</span>
          <div class="chips"><button v-for="m in EVERY" :key="m" class="chip" :class="{on: d.every === m}" @click="d.every = m">{{ everyLabel(m) }}</button></div>
          <span class="flabel">Between</span>
          <div class="row" style="gap:10px">
            <TimeChip v-model="d.start" icon="sun" title="From"/>
            <span class="muted">to</span>
            <TimeChip v-model="d.end" icon="moon" title="Until"/>
          </div>
          <div v-if="d.water" class="list-row" style="border:0;padding:14px 2px 0"><div class="grow"><div class="t">Pause after daily goal</div><div class="s">Stop for the day once you've had {{ S.settings.waterGoal }} glasses</div></div><Toggle v-model="d.stopAtGoal"/></div>
        </template>

        <template v-if="d.kind === 'daily' || d.kind === 'interval'">
          <span class="flabel">On</span>
          <div class="chips" style="margin-bottom:10px"><button v-for="p in DAY_PRESETS" :key="p.l" class="chip" :class="{on: sameDays(p.v)}" @click="d.days = [...p.v]">{{ p.l }}</button></div>
          <div class="day-dots"><button v-for="x in DAY_DOTS" :key="x.v" :class="{on: d.days.includes(x.v)}" @click="toggleDay(x.v)">{{ x.l }}</button></div>
        </template>

        <template v-if="d.kind === 'monthly'">
          <span class="flabel">Calendar</span>
          <div class="seg"><button :class="{on: d.cal === 'jal'}" @click="d.cal = 'jal'">Shamsi</button><button :class="{on: d.cal === 'greg'}" @click="d.cal = 'greg'">Gregorian</button></div>
          <div class="settings-group" style="box-shadow:none;margin-top:12px">
            <div class="list-row"><div class="grow"><div class="t">Day of the month</div><div class="s" v-if="d.dom > 28">Falls on the last day in shorter months</div></div><Stepper v-model="d.dom" :min="1" :max="31"/></div>
            <div class="list-row"><div class="grow"><div class="t">Time</div></div><TimeChip v-model="d.time" title="Reminder time"/></div>
          </div>
        </template>

        <template v-if="d.kind !== 'once'">
          <div class="list-row" style="border:0;padding:16px 2px 4px"><div class="grow"><div class="t">End date</div><div class="s">{{ d.until ? 'Last reminder on ' + gFull(d.until) : 'Keeps going until you turn it off' }}</div></div>
            <Toggle :model-value="!!d.until" @update:model-value="v => d.until = v ? addDays(R.today, 30) : ''"/></div>
          <DateChip v-if="d.until" v-model="d.until" :min="R.today" title="Last reminder on" style="margin-top:6px"/>
        </template>

        <div class="preview" :class="{bad: problem}">
          <template v-if="problem"><Ic n="circle-alert" :s="17"/><span>{{ problem }}</span></template>
          <template v-else><Ic n="bell" :s="17"/><span>Next: <b>{{ preview.map(whenShort).join(' · ') }}</b></span></template>
        </div>

        <div class="btn-row">
          <button v-if="isEdit" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove" aria-label="Delete reminder"><Ic n="trash-2"/></button>
          <button class="btn primary" @click="save">{{ isEdit ? 'Save' : 'Add reminder' }}</button>
        </div>
      </template>
    </div>
  </Sheet>`,
};

/** Time left until `at`, as months/days/hours/minutes/seconds, largest unit first. */
function timeLeft(at, now) {
  let s = Math.max(0, Math.floor((at - now) / 1000));
  const parts = [], U = FA ? ['ماه', 'روز', 'ساعت', 'دقیقه', 'ثانیه'] : ['mo', 'd', 'h', 'm', 's'];
  const mo = Math.floor(s / 2629800); s -= mo * 2629800; // average month
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  [mo, d, h, m, s].forEach((v, i) => { if (v || parts.length || i >= 3) parts.push(FA ? v + ' ' + U[i] : (i >= 2 && parts.length ? pad(v) : v) + U[i]); });
  return parts.join(' ');
}

const RemindersView = {
  setup() {
    const tick = ref(Date.now()); // the countdowns move every second while this screen is open
    const tickT = setInterval(() => { tick.value = Date.now(); }, 1000);
    onBeforeUnmount(() => clearInterval(tickT));
    // a reminder whose time has passed isn't "done": it just went off. Keep those apart from what's coming.
    const wentOff = r => { if (r.kind !== 'once' || !r.date || !r.time) return 0; const d = parseKey(r.date); const [h, m] = r.time.split(':'); d.setHours(+h, +m, 0, 0); return d.getTime(); };
    const all = computed(() => { R.min; return S.reminders.map(r => { const next = r.on === false ? [] : remNext(r); return { r, next: next[0] || null, past: r.on !== false && !next.length, at: wentOff(r) }; }); });
    const groups = computed(() => [
      { id: 'up', l: '', items: all.value.filter(x => x.r.on !== false && !x.past).sort((a, b) => a.next - b.next) },
      { id: 'paused', l: 'Paused', items: all.value.filter(x => x.r.on === false) },
      { id: 'past', l: 'Past', items: all.value.filter(x => x.past).sort((a, b) => b.at - a.at) },
    ].filter(g => g.items.length));
    function again(x) { ui.rem = { ref: x.r }; }
    const active = computed(() => S.reminders.filter(r => r.on !== false).length);
    function toggle(r, v) { r.on = v; Native.vibrate(8); if (v && Native.has) Native.askNotify(); say(v ? 'Reminder on' : 'Paused. Turn it back on any time'); }
    function remove(r) { const i = S.reminders.indexOf(r); S.reminders.splice(i, 1); say('"' + r.title + '" deleted', () => S.reminders.splice(i, 0, r)); }
    return { tick, timeLeft, groups, again, active, toggle, remove, whenShort };
  },
  template: `<div class="view" style="--acc:var(--c-mood)">
    <Head title="Reminders" :sub="active ? active + ' active' : 'Nudges you set yourself'"/>
    <button v-if="!remReady && S.reminders.length" class="card hint-card tap" @click="go('alerts')">
      <Ic n="bell" :s="18"/><span class="grow">Notifications aren't on for this phone yet. Tap to set them up.</span><Ic n="chevron-right" :s="18"/></button>
    <template v-if="S.reminders.length">
      <template v-for="g in groups" :key="g.id">
        <div v-if="g.l" class="label">{{ g.l }}</div>
        <TransitionGroup name="list" tag="div" class="tlist rel">
          <Swipe v-for="x in g.items" :key="x.r.id" @remove="remove(x.r)" @tap="ui.rem = {ref: x.r}">
            <div class="rem" :class="{off: x.r.on === false, past: x.past}" :style="{'--c': x.r.color}">
              <span class="e">{{ x.r.emoji }}</span>
              <div class="grow">
                <div class="t" translate="no">{{ x.r.title }}</div>
                <div class="s">{{ remSummary(x.r) }}</div>
                <div class="n" v-if="x.r.on === false">Paused</div>
                <div class="n" v-else-if="x.past">{{ x.at ? 'Was ' + whenShort(x.at) : 'Its last time has passed' }}</div>
                <div class="n on" v-else>Next {{ whenShort(x.next) }}</div>
                <div v-if="x.next && x.r.on !== false && !x.past" class="left" translate="no">⏳ {{ timeLeft(x.next, tick) }}</div>
              </div>
              <button v-if="x.past" class="btn sm" @click.stop="again(x)" @pointerdown.stop>Set again</button>
              <Toggle v-else :model-value="x.r.on !== false" @update:model-value="v => toggle(x.r, v)" @click.stop @pointerdown.stop/>
            </div>
          </Swipe>
        </TransitionGroup>
      </template>
      <p class="muted" style="text-align:center;font-size:12.5px;margin-top:18px">Tap to edit · switch to pause · swipe left to delete</p>
    </template>
    <Empty v-else e="⏰" t="No reminders yet" s="Water, medicine, stretching, bills… set a nudge for anything.">
      <button class="btn primary" @click="ui.rem = {}"><Ic n="plus" :s="18"/>New reminder</button></Empty>
    <button class="fab" @click="ui.rem = {}" aria-label="New reminder"><Ic n="plus" :s="26" :w="2.4"/></button>
  </div>`,
};
