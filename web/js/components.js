/* Shared building blocks: icons, sheets, swipe rows, toggles, date/time pickers. */
/* ================= base components ================= */
const Ic = {
  props: { n: String, s: { default: 20 }, w: { default: 2 } },
  computed: { p() { return ICONS[this.n] || ''; } },
  template: '<svg class="ic" :width="s" :height="s" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="w" stroke-linecap="round" stroke-linejoin="round" v-html="p"></svg>',
};

const Ring = {
  props: { v: Number, size: { default: 64 }, sw: { default: 7 }, c: String },
  computed: {
    r() { return (this.size - this.sw) / 2; },
    C() { return 2 * Math.PI * this.r; },
    off() { return this.C * (1 - clamp(this.v || 0, 0, 1)); },
  },
  template: `<div class="ring" :style="{width:size+'px',height:size+'px'}">
    <svg :width="size" :height="size" :viewBox="'0 0 '+size+' '+size">
      <circle :cx="size/2" :cy="size/2" :r="r" fill="none" :stroke-width="sw" class="ring-track"/>
      <circle :cx="size/2" :cy="size/2" :r="r" fill="none" :stroke="c" :stroke-width="sw" stroke-linecap="round"
        :stroke-dasharray="C" :stroke-dashoffset="off" :stroke-opacity="v>0.001?1:0" class="ring-bar" :transform="'rotate(-90 '+size/2+' '+size/2+')'"/>
    </svg>
    <div class="ring-in"><slot/></div>
  </div>`,
};

const Check = {
  props: { on: Boolean, c: String },
  emits: ['toggle'],
  template: '<button class="chk" :class="{on}" :style="{\'--c\': c}" @click.stop="$emit(\'toggle\')" @pointerdown.stop><Ic n="check" :s="14" :w="3.2"/></button>',
};

const Sheet = {
  props: { open: Boolean, title: String, full: Boolean, top: Boolean },
  emits: ['close'],
  setup(props, { emit }) {
    const close = () => emit('close');
    watch(() => props.open, o => (o ? pushBack(close) : popBack(close)), { immediate: true });
    onBeforeUnmount(() => popBack(close));
    const dy = ref(0); let sy = null;
    const down = e => { sy = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); };
    const move = e => { if (sy !== null) dy.value = Math.max(0, e.clientY - sy); };
    const up = () => { if (dy.value > 100) close(); sy = null; dy.value = 0; };
    return { close, dy, down, move, up };
  },
  template: `<Teleport to="body"><Transition name="sheet" :duration="340">
    <div v-if="open" class="sheet-wrap" :class="{top}" @click.self="close">
      <div class="sheet" :class="{full}" :style="dy ? {transform:'translateY('+dy+'px)', transition:'none'} : null">
        <div class="grab" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"><span></span></div>
        <div class="sheet-head" v-if="title || $slots.head"><h3>{{ title }}</h3><slot name="head"/></div>
        <div class="sheet-body"><slot/></div>
      </div>
    </div></Transition></Teleport>`,
};

const Swipe = {
  emits: ['remove', 'tap'],
  setup(_, { emit }) {
    const x = ref(0), dragging = ref(false);
    let sx = 0, sy = 0, active = false, lock = null, moved = false;
    const down = e => { sx = e.clientX; sy = e.clientY; active = true; lock = null; moved = false; };
    const move = e => {
      if (!active) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (lock === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (lock === 'x') { moved = true; dragging.value = true; x.value = Math.min(0, dx); }
    };
    const up = () => {
      if (!active) return;
      active = false; dragging.value = false;
      if (x.value < -100) { x.value = -600; Native.vibrate(15); setTimeout(() => emit('remove'), 200); }
      else x.value = 0;
    };
    const click = () => { if (!moved) emit('tap'); };
    return { x, dragging, down, move, up, click };
  },
  template: `<div class="swipe"><div class="swipe-bg" :style="{opacity: x < -4 ? 1 : 0}"><Ic n="trash-2"/></div>
    <div class="swipe-fg" :style="{transform:'translateX('+x+'px)', transition: dragging ? 'none' : ''}"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @click="click"><slot/></div></div>`,
};

const Head = {
  props: { title: String, sub: String },
  template: `<header class="top sm">
    <button class="icon-btn" @click="nav.screen = null" aria-label="Back"><Ic n="chevron-left" :s="22"/></button>
    <div class="grow"><h1>{{ title }}</h1><div class="sub" v-if="sub" style="margin-top:2px">{{ sub }}</div></div>
    <slot/>
  </header>`,
};

const Stepper = {
  props: { modelValue: Number, min: Number, max: Number, step: { default: 1 }, unit: String },
  emits: ['update:modelValue'],
  methods: { set(d) { this.$emit('update:modelValue', clamp(this.modelValue + d * this.step, this.min, this.max)); Native.vibrate(6); } },
  template: `<div class="stepper"><button @click="set(-1)" :disabled="modelValue<=min"><Ic n="minus" :s="18"/></button>
    <b>{{ modelValue }}<small v-if="unit"> {{ unit }}</small></b>
    <button @click="set(1)" :disabled="modelValue>=max"><Ic n="plus" :s="18"/></button></div>`,
};

const Toggle = {
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  template: '<button type="button" class="toggle" role="switch" :aria-checked="modelValue ? \'true\' : \'false\'" :class="{on: modelValue}" @click="$emit(\'update:modelValue\', !modelValue); Native.vibrate(8)"></button>',
};

/* Date chooser: quick chips + native picker */
const DatePick = {
  props: { modelValue: String, none: { default: true }, past: Boolean },
  emits: ['update:modelValue'],
  computed: {
    opts() {
      const t = R.today;
      const o = this.past
        ? [{ l: 'Today', k: t }, { l: 'Yesterday', k: addDays(t, -1) }]
        : [{ l: 'Today', k: t }, { l: 'Tomorrow', k: addDays(t, 1) }, { l: 'Next week', k: addDays(t, 7) }];
      return this.none ? [{ l: 'No date', k: null }, ...o] : o;
    },
    custom() { return this.modelValue && !this.opts.some(o => o.k === this.modelValue); },
  },
  methods: {
    set(k) { this.$emit('update:modelValue', k || null); Native.vibrate(6); },
    // reminders and tasks look ahead (no "Yesterday"); money entries look back
    async pickOther() { const v = await pickDate(this.modelValue, this.past ? { max: R.today } : { min: R.today }); if (v) this.set(v); },
  },
  template: `<div>
    <div class="chips">
      <button v-for="o in opts" :key="o.l" class="chip" :class="{on: modelValue === o.k}" @click="set(o.k)">{{ o.l }}</button>
      <button class="chip" :class="{on: custom}" @click="pickOther"><Ic n="calendar" :s="15"/>{{ custom ? gLabel(modelValue) : 'Pick date' }}</button>
    </div>
    <div v-if="modelValue" class="muted" style="font-size:13px;margin:8px 4px 0;font-weight:550">{{ gFull(modelValue) }} · {{ jFull(modelValue) }}</div>
  </div>`,
};

/* ---------- date & time pickers: our own, so they look and work the same on every phone ---------- */
const Pick = reactive({ kind: '', value: '', min: '', max: '', title: '', done: null });
// a sensible starting time: the first full hour at least half an hour away (at 16:59 that's 18:00, not 17:00)
const roundTime = () => { const d = new Date(Date.now() + 30 * 60e3); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return pad(d.getHours()) + ':00'; };
function pickTime(value, title) { return new Promise(done => Object.assign(Pick, { kind: 'time', value: value || roundTime(), min: '', max: '', title: title || 'Time', done })); }
function pickDate(value, o = {}) { return new Promise(done => Object.assign(Pick, { kind: 'date', value: value || R.today, min: o.min || '', max: o.max || '', title: o.title || 'Date', done })); }

const PickerSheet = {
  setup() {
    const v = ref(''), view = ref({ y: 0, m: 0 });
    watch(() => Pick.kind, k => {
      if (!k) return;
      v.value = Pick.value;
      if (k === 'date') { const d = parseKey(Pick.value); view.value = { y: d.getFullYear(), m: d.getMonth() }; }
    });
    function close(result) { const f = Pick.done; Pick.kind = ''; Pick.done = null; if (f) f(result || null); }
    // time
    const hh = computed(() => +(v.value || '09:00').split(':')[0]), mm = computed(() => +(v.value || '09:00').split(':')[1]);
    const setT = (h, m) => { v.value = pad((h + 24) % 24) + ':' + pad((m + 60) % 60); Native.vibrate(5); };
    const nudge = d => { const t = (hh.value * 60 + mm.value + d + 1440) % 1440; setT(Math.floor(t / 60), t % 60); };
    const QUICK = [{ l: 'Morning', t: '08:00' }, { l: 'Noon', t: '12:00' }, { l: 'Afternoon', t: '15:00' }, { l: 'Evening', t: '18:00' }, { l: 'Night', t: '21:00' }];
    // date
    const ok = k => (!Pick.min || k >= Pick.min) && (!Pick.max || k <= Pick.max);
    const shift = n => { let { y, m } = view.value; m += n; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } view.value = { y, m }; };
    const cells = computed(() => {
      const { y, m } = view.value, first = keyOf(new Date(y, m, 1)), start = addDays(first, -satIdx(first));
      const arr = Array.from({ length: 42 }, (_, i) => { const k = addDays(start, i); return { k, d: parseKey(k).getDate(), j: jal(k).d, out: parseKey(k).getMonth() !== m }; });
      return arr[35].out ? arr.slice(0, 35) : arr;
    });
    const jRange = computed(() => { const { y, m } = view.value, a = jal(keyOf(new Date(y, m, 1))), b = jal(keyOf(new Date(y, m + 1, 0))); return JM[a.m - 1] + ' – ' + JM[b.m - 1] + ' ' + b.y; });
    const quickDays = computed(() => [{ l: 'Today', k: R.today }, { l: 'Tomorrow', k: addDays(R.today, 1) }, { l: 'In a week', k: addDays(R.today, 7) }, { l: 'Yesterday', k: addDays(R.today, -1) }].filter(x => ok(x.k)));
    function choose(k) { if (!ok(k)) return; v.value = k; const d = parseKey(k); view.value = { y: d.getFullYear(), m: d.getMonth() }; Native.vibrate(5); }
    return { Pick, v, close, hh, mm, setT, nudge, QUICK, cells, jRange, shift, view, ok, choose, quickDays, MONTHS, WK };
  },
  template: `<Sheet :open="!!Pick.kind" :title="Pick.title" top @close="close()">
    <div class="picker">
      <template v-if="Pick.kind === 'time'">
        <div class="tp-big"><button @click="nudge(-1)" aria-label="One minute earlier"><Ic n="minus" :s="18"/></button><b>{{ v }}</b><button @click="nudge(1)" aria-label="One minute later"><Ic n="plus" :s="18"/></button></div>
        <div class="chips" style="justify-content:center"><button v-for="q in QUICK" :key="q.t" class="chip" :class="{on: v === q.t}" @click="v = q.t">{{ q.l }} · {{ q.t }}</button></div>
        <span class="flabel">Hour</span>
        <div class="tp-grid"><button v-for="h in 24" :key="h" :class="{on: hh === h - 1}" @click="setT(h - 1, mm)">{{ String(h - 1).padStart(2, '0') }}</button></div>
        <span class="flabel">Minute</span>
        <div class="tp-grid"><button v-for="m in 12" :key="m" :class="{on: mm === (m - 1) * 5, near: mm !== (m - 1) * 5 && Math.floor(mm / 5) === m - 1}" @click="setT(hh, (m - 1) * 5)">:{{ String((m - 1) * 5).padStart(2, '0') }}</button></div>
      </template>
      <template v-else-if="Pick.kind === 'date'">
        <div class="chips" style="margin-bottom:12px"><button v-for="q in quickDays" :key="q.l" class="chip" :class="{on: v === q.k}" @click="choose(q.k)">{{ q.l }}</button></div>
        <div class="cal-head">
          <button class="icon-btn plain" @click="shift(-1)" aria-label="Previous month"><Ic n="chevron-left"/></button>
          <div style="text-align:center"><b>{{ MONTHS[view.m] }} {{ view.y }}</b><small>{{ jRange }}</small></div>
          <button class="icon-btn plain" @click="shift(1)" aria-label="Next month"><Ic n="chevron-right"/></button>
        </div>
        <div class="cal dp-cal">
          <div v-for="w in WK" :key="w" class="wd">{{ w }}</div>
          <button v-for="c in cells" :key="c.k" :data-k="c.k" :class="{out: c.out, td: c.k === R.today, sel: c.k === v, off: !ok(c.k)}" :disabled="c.out || !ok(c.k)" @click="choose(c.k)">{{ c.d }}<small>{{ c.j }}</small></button>
        </div>
        <div class="muted" style="text-align:center;font-size:13.5px;font-weight:600;margin-top:10px">{{ gFull(v) }} · {{ jFull(v) }}</div>
      </template>
      <div class="btn-row"><button class="btn" @click="close()">Cancel</button><button class="btn primary" @click="close(v)">Done</button></div>
    </div>
  </Sheet>`,
};

/** A chip showing a time; tapping it opens the time picker. */
const TimeChip = {
  props: { modelValue: String, icon: { default: 'clock' }, placeholder: { default: 'Set time' }, title: String },
  emits: ['update:modelValue'],
  methods: { async open() { const t = await pickTime(this.modelValue, this.title); if (t) this.$emit('update:modelValue', t); } },
  template: `<button type="button" class="chip time-chip" :class="{on: modelValue}" @click="open"><Ic :n="icon" :s="15"/>{{ modelValue || placeholder }}</button>`,
};
/** A date as a chip (or a full-width field); tapping it opens the calendar. */
const DateChip = {
  props: { modelValue: String, min: String, max: String, placeholder: { default: 'Pick date' }, field: Boolean, title: String },
  emits: ['update:modelValue'],
  methods: { async open() { const d = await pickDate(this.modelValue, { min: this.min, max: this.max, title: this.title }); if (d) this.$emit('update:modelValue', d); } },
  template: `<button v-if="field" type="button" class="field row date-field" @click="open"><Ic n="calendar" :s="18" class="muted"/><span class="grow">{{ modelValue ? gFull(modelValue) : placeholder }}</span><span class="muted" style="font-size:13px">{{ modelValue ? jFull(modelValue) : '' }}</span></button>
    <button v-else type="button" class="chip" :class="{on: modelValue}" @click="open"><Ic n="calendar" :s="15"/>{{ modelValue ? gLabel(modelValue) + ' · ' + jLabel(modelValue) : placeholder }}</button>`,
};

/** Preset emoji plus "type your own": any emoji from the keyboard works. */
const EmojiPick = {
  props: { modelValue: String, list: Array, chips: Boolean },
  emits: ['update:modelValue', 'picked'],
  setup(props, { emit }) {
    const typed = ref('');
    const shown = computed(() => (props.modelValue && !props.list.includes(props.modelValue) ? [props.modelValue, ...props.list] : props.list));
    const pick = e => { emit('update:modelValue', e); emit('picked', e); Native.vibrate(6); };
    watch(typed, v => {
      const e = v.trim() && firstEmoji(v);
      if (e && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(e)) { pick(e); typed.value = ''; }
    });
    return { typed, shown, pick };
  },
  template: `<div>
    <div v-if="chips" class="chips" style="justify-content:center"><button v-for="e in shown" :key="e" class="chip av-pick" :class="{on: modelValue === e}" @click="pick(e)">{{ e }}</button></div>
    <div v-else class="emoji-grid"><button v-for="e in shown" :key="e" :class="{on: modelValue === e}" @click="pick(e)">{{ e }}</button></div>
    <label class="field row emoji-own"><Ic n="smile" :s="17" class="muted"/><input class="grow" v-model="typed" placeholder="Type any emoji from your keyboard" enterkeyhint="done"></label>
  </div>`,
};

const Empty = {
  props: { e: String, t: String, s: String },
  template: '<div class="empty"><span class="em">{{ e }}</span><b>{{ t }}</b><span>{{ s }}</span><div v-if="$slots.default" style="margin-top:16px"><slot/></div></div>',
};
