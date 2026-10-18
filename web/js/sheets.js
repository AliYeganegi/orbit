/* Editors that open over any screen (task, money, accounts, budget) and onboarding. */
/* ================= global sheets ================= */
const TaskSheet = {
  setup() {
    const d = reactive({});
    const titleEl = ref(null);
    watch(() => ui.task, v => {
      if (!v) return;
      Object.assign(d, { title: '', notes: '', due: null, time: '', remind: false, before: 0, priority: 0 }, v.ref ? JSON.parse(JSON.stringify(v.ref)) : (v.preset || {}), v.draft || {});
      if (!v.ref) nextTick(() => setTimeout(() => titleEl.value && titleEl.value.focus(), 250));
    });
    Drafts.task = () => (ui.task ? { refId: ui.task.ref && ui.task.ref.id, d: JSON.parse(JSON.stringify(d)) } : null);
    const isEdit = computed(() => ui.task && ui.task.ref);
    const need = ref(false);
    watch(() => d.title, () => { need.value = false; });
    function save() {
      if (!d.title || !d.title.trim()) { need.value = true; Native.vibrate(30); titleEl.value && titleEl.value.focus(); return; }
      if (!d.due) { d.time = ''; d.remind = false; }
      if (!d.time) d.remind = false;
      let t;
      const fields = { notes: d.notes, due: d.due, time: d.time, remind: d.remind, before: d.remind ? d.before : 0, priority: d.priority };
      if (isEdit.value) { t = ui.task.ref; Object.assign(t, { title: d.title.trim(), ...fields }); }
      else { t = addTask(d.title, d.due); Object.assign(t, fields); }
      if (t.remind && Native.has) Native.askNotify();
      ui.task = null;
    }
    function remove() { const t = ui.task.ref; ui.task = null; delTask(t); }
    function setup() { ui.task = null; nav.screen = 'alerts'; }
    const past = computed(() => d.remind && d.due && d.time && taskAt(d) < Date.now());
    const prioPick = v => { d.priority = d.priority === v ? 0 : v; Native.vibrate(6); }; // optional: tap again to clear
    return { d, save, remove, isEdit, titleEl, PRIOS, setup, past, need, prioPick };
  },
  template: `<Sheet :open="!!ui.task" :title="isEdit ? 'Edit task' : 'New task'" @close="ui.task = null">
    <div style="--acc:var(--c-tasks)">
      <input ref="titleEl" class="field-title" v-model="d.title" placeholder="What needs doing?" @keydown.enter="save" enterkeyhint="done" :class="{bad: need}">
      <div v-if="need" class="hint warn" style="margin-top:6px"><span class="grow">Give the task a name first</span></div>
      <textarea class="field" v-model="d.notes" placeholder="Notes (optional)" style="min-height:70px;margin-top:6px"></textarea>
      <span class="flabel">Due</span>
      <DatePick v-model="d.due"/>
      <template v-if="d.due">
        <span class="flabel">{{ remPossible ? 'Time & reminder' : 'Time' }}</span>
        <div class="row">
          <TimeChip v-model="d.time" placeholder="Add time" title="Task time"/>
          <button v-if="d.time" class="chip" @click="d.time=''; d.remind=false" aria-label="Clear time"><Ic n="x" :s="14"/></button>
          <div class="grow"></div>
          <template v-if="d.time && remPossible"><Ic n="bell" :s="18" :class="d.remind ? '' : 'muted'" :style="{color: d.remind ? 'var(--c-tasks)' : ''}"/><Toggle v-model="d.remind"/></template>
        </div>
        <template v-if="d.time && d.remind">
          <div class="chips" style="margin-top:12px"><button v-for="b in BEFORE" :key="b.v" class="chip" :class="{on: (d.before || 0) === b.v}" @click="d.before = b.v">{{ b.l }}</button></div>
          <div v-if="!remReady" class="hint warn"><Ic n="bell" :s="16"/><span class="grow">Notifications aren't set up on this phone yet</span><button class="btn sm primary" @click="setup">Set up</button></div>
          <div v-else-if="past" class="hint"><Ic n="clock" :s="16"/><span class="grow">That time has already passed, so no reminder will be sent</span></div>
          <div v-else-if="!S.settings.notify.tasks" class="hint"><Ic n="bell" :s="16"/><span class="grow">Task reminders are turned off in Notifications</span><button class="btn sm" @click="setup">Open</button></div>
        </template>
      </template>
      <span class="flabel">Priority <span style="font-weight:500">· optional</span></span>
      <div class="prio">
        <button v-for="p in PRIOS.slice(1)" :key="p.v" :class="{on: d.priority === p.v}" :style="{'--c': p.c}" @click="prioPick(p.v)">
          <Ic n="flag" :s="15" :style="{color: p.c}"/>{{ p.l }}</button>
      </div>
      <div class="btn-row">
        <button v-if="isEdit" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove"><Ic n="trash-2"/></button>
        <button class="btn primary" @click="save">{{ isEdit ? 'Save changes' : 'Add task' }}</button>
      </div>
    </div>
  </Sheet>`,
};

const TxSheet = {
  setup() {
    const d = reactive({});
    watch(() => ui.tx, v => {
      if (!v) return;
      const lastAcct = S.accounts.some(a => a.id === S.settings.lastAcct) ? S.settings.lastAcct : '';
      Object.assign(d, { type: 'out', amount: 0, cat: 'food', note: '', date: R.today, time: '', pending: false, bank: '', card: '', balance: null, acct: lastAcct, acct2: '', refund: false, uncertain: false, why: [], sms: '', dup: false }, v.ref ? JSON.parse(JSON.stringify(v.ref)) : {}, v.draft || {});
      need.value = '';
    });
    Drafts.tx = () => (ui.tx ? { refId: ui.tx.ref && ui.tx.ref.id, d: JSON.parse(JSON.stringify(d)) } : null);
    const isEdit = computed(() => ui.tx && ui.tx.ref);
    // a refund goes back into the expense category it came from
    const cats = computed(() => catsFor(d.type === 'in' && !d.refund ? 'in' : 'out'));
    // the person's own categories, with any emoji
    const nc = reactive({ open: false, name: '', emoji: '🍕', typed: '' });
    function newCat() { Object.assign(nc, { open: true, name: '', emoji: CAT_EMOJI[Math.floor(Math.random() * CAT_EMOJI.length)], typed: '' }); }
    function addCat() {
      const name = nc.name.trim(); if (!name) return;
      const c = { id: 'c_' + uid(), l: name.slice(0, 24), e: nc.emoji || '🏷️', c: HABIT_COLORS[(S.customCats.length + 3) % HABIT_COLORS.length], type: d.type === 'in' ? 'in' : 'out' };
      S.customCats.push(c); d.cat = c.id; nc.open = false; Native.vibrate(10); say('Category "' + c.l + '" added');
    }
    function delCat(c) {
      const used = S.money.some(t => t.cat === c.id);
      if (used && !confirm('"' + c.l + '" is used by some transactions. They\'ll show as "To review". Delete it?')) return;
      S.customCats.splice(S.customCats.indexOf(c), 1); if (d.cat === c.id) d.cat = '';
    }
    const mine = computed(() => S.customCats.filter(c => (c.type || 'out') === (d.type === 'in' ? 'in' : 'out')));
    const amt = computed({
      get: () => (d.amount ? fmt(d.amount) : ''),
      set: v => { d.amount = Math.min(parseInt(toEn(v).replace(/\D/g, '') || '0', 10), 1e13); },
    });
    watch(() => [d.type, d.refund], () => { if (d.type === 'transfer') { d.cat = 'transfer'; return; } if (d.cat === 'transfer' || (d.cat && !cats.value.some(c => c.id === d.cat))) d.cat = d.pending ? '' : cats.value[0].id; });
    function bump(n) { d.amount = (d.amount || 0) + n; Native.vibrate(6); }
    async function paste() {
      const text = await readClipboard();
      const p = text && OrbitSms.parse(text, { unit: S.settings.sms.unit });
      if (!p) { say(text ? 'That doesn\'t look like a bank SMS' : 'Copy a bank SMS first, then tap paste'); return; }
      d.sms = OrbitSms.bodyHash(text); d.dup = S.smsSeen.includes(d.sms);
      d.type = p.type; d.amount = p.amount; d.refund = !!p.refund; d.uncertain = !p.confident; d.why = p.reasons;
      if (p.date && p.date.jy) { const k = jToKey(p.date.jy, p.date.jm, p.date.jd); if (k <= R.today && jal(k).m === p.date.jm) d.date = k; }
      if (p.time) d.time = p.time;
      d.bank = p.bank; d.card = p.card; d.balance = p.balance;
      if (!d.cat || !cats.value.some(c => c.id === d.cat)) d.cat = cats.value[0].id;
      Native.vibrate(12);
      say('Filled from SMS: ' + fmt(p.amount) + ' T' + (p.bank ? ' · ' + p.bank : ''));
    }
    const need = ref('');
    function save() {
      // say what's missing instead of greying out the button
      if (!d.amount) { need.value = 'amount'; Native.vibrate(30); return; }
      if (d.type === 'transfer') {
        if (!d.acct || !d.acct2) { need.value = 'accts'; Native.vibrate(30); return; }
        if (d.acct === d.acct2) { need.value = 'same'; Native.vibrate(30); return; }
      } else if (!d.cat) { need.value = 'cat'; Native.vibrate(30); document.querySelector('.sheet .cat-grid') && document.querySelector('.sheet .cat-grid').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (d.date > R.today) { need.value = 'future'; Native.vibrate(30); return; }
      const rec = { type: d.type, amount: d.amount, cat: d.type === 'transfer' ? 'transfer' : d.cat, note: d.note.trim(), date: d.date || R.today, time: d.time || '', pending: false,
        bank: d.bank || '', card: d.card || '', balance: d.balance, acct: d.acct || '', acct2: d.type === 'transfer' ? d.acct2 : '', refund: d.type === 'in' && !!d.refund, uncertain: false };
      if (isEdit.value) Object.assign(ui.tx.ref, rec);
      else S.money.unshift({ id: uid(), created: Date.now(), ...rec, sms: d.sms || '' });
      if (d.sms && !S.smsSeen.includes(d.sms)) S.smsSeen.push(d.sms);
      if (d.acct) S.settings.lastAcct = d.acct;
      say(isEdit.value ? 'Saved' : d.type === 'transfer' ? 'Transfer added' : d.refund ? 'Refund added' : (d.type === 'in' ? 'Income' : 'Expense') + ' added');
      Native.vibrate(12);
      ui.tx = null;
    }
    function remove() {
      const t = ui.tx.ref; ui.tx = null;
      const i = S.money.indexOf(t); if (i < 0) return;
      S.money.splice(i, 1);
      say('Transaction deleted', () => S.money.splice(i, 0, t));
    }
    watch(() => [d.amount, d.cat, d.acct, d.acct2, d.date], () => { need.value = ''; });
    return { d, amt, cats, save, remove, isEdit, bump, paste, need, nc, newCat, addCat, delCat, mine, CAT_EMOJI };
  },
  template: `<Sheet :open="!!ui.tx" :title="d.pending ? 'Add details' : isEdit ? 'Edit transaction' : 'New transaction'" @close="ui.tx = null">
    <div :style="{'--acc': d.type === 'in' ? 'var(--c-habits)' : 'var(--c-money)'}">
      <div v-if="d.pending || d.bank" class="hint" style="margin:0 0 14px"><Ic n="message-square-text" :s="16"/><span class="grow">From {{ d.bank ? d.bank + ' ' : '' }}SMS{{ d.time ? ' at ' + d.time : '' }}{{ d.card ? ' · ' + d.card : '' }}{{ d.balance != null ? ' · balance ' + short(d.balance) : '' }}</span></div>
      <button v-else-if="!isEdit" class="btn block sm" style="margin-bottom:14px" @click="paste"><Ic n="clipboard-paste" :s="16"/>Paste a bank SMS</button>
      <div v-if="d.dup" class="hint warn" style="margin:0 0 12px"><Ic n="circle-alert" :s="16"/><span class="grow">This SMS looks like it was already added. Check your transactions before saving it again.</span></div>
      <div v-if="d.uncertain && d.why && d.why.length" class="hint warn" style="margin:0 0 12px"><Ic n="circle-alert" :s="16"/><span class="grow">Check this one: {{ d.why.join(', ') }}. Fix anything that's wrong before saving.</span></div>
      <div class="seg"><button :class="{on: d.type==='out'}" @click="d.type='out'; d.refund = false"><Ic n="arrow-up-right" :s="16"/>Expense</button>
        <button :class="{on: d.type==='in'}" @click="d.type='in'"><Ic n="arrow-down-left" :s="16"/>Income</button>
        <button :class="{on: d.type==='transfer'}" @click="d.type='transfer'; d.refund = false"><Ic n="repeat" :s="16"/>Transfer</button></div>
      <label v-if="d.type === 'in'" class="list-row" style="border:0;padding:12px 2px 0"><div class="grow"><div class="t">This is a refund</div><div class="s">Money back for something you bought: it reduces that category's spending instead of counting as income</div></div><Toggle v-model="d.refund"/></label>
      <div class="amount-in">
        <input v-model="amt" inputmode="numeric" placeholder="0" enterkeyhint="done" @keydown.enter="$event.target.blur()">
        <div class="u">{{ d.amount ? words(d.amount) : 'Toman' }}</div>
      </div>
      <div class="chips" style="justify-content:center;margin-top:10px">
        <button class="chip" v-for="n in [50000, 100000, 500000, 1000000]" :key="n" @click="bump(n)">+{{ short(n) }}</button>
      </div>
      <div v-if="need === 'amount'" class="hint warn"><span class="grow">Enter an amount to save</span></div>
      <template v-if="d.type === 'transfer'">
        <div v-if="S.accounts.length < 2" class="hint warn"><span class="grow">Add at least two accounts (Money → Balance) to move money between them.</span><button class="btn sm" @click="ui.tx = null; ui.accounts = true">Accounts</button></div>
        <template v-else>
          <span class="flabel">From</span>
          <div class="chips"><button v-for="a in S.accounts" :key="a.id" class="chip" :class="{on: d.acct === a.id}" @click="d.acct = a.id" translate="no">{{ a.name }}</button></div>
          <span class="flabel">To</span>
          <div class="chips"><button v-for="a in S.accounts" :key="a.id" class="chip" :class="{on: d.acct2 === a.id}" :disabled="a.id === d.acct" @click="d.acct2 = a.id" translate="no">{{ a.name }}</button></div>
          <div v-if="need === 'accts' || need === 'same'" class="hint warn"><span class="grow">{{ need === 'same' ? 'Pick two different accounts' : 'Pick both accounts' }}</span></div>
          <p class="muted" style="font-size:12.5px;margin-top:8px">Transfers move money between your own accounts. They don't count as spending or income.</p>
        </template>
      </template>
      <template v-else>
      <span class="flabel">Category</span>
      <div v-if="need === 'cat'" class="hint warn" style="margin:0 0 10px"><span class="grow">Choose a category to save</span></div>
      <div class="cat-grid" :class="{shake: need === 'cat'}">
        <button v-for="c in cats" :key="c.id" :class="{on: d.cat === c.id}" @click="d.cat = c.id"><span class="e">{{ c.e }}</span>{{ c.l }}</button>
        <button class="cat-new" @click="newCat"><span class="e"><Ic n="plus" :s="20"/></span>New</button>
      </div>
      <div v-if="nc.open" class="card cat-maker">
        <div class="row" style="gap:10px"><span class="cat-e">{{ nc.emoji }}</span>
          <input class="field grow" v-model="nc.name" placeholder="Category name, e.g. Pets" maxlength="24" enterkeyhint="done" @keydown.enter="addCat"></div>
        <EmojiPick v-model="nc.emoji" :list="CAT_EMOJI" class="sm" style="margin-top:10px"/>
        <div v-if="mine.length" class="chips" style="margin-top:10px"><span class="muted" style="font-size:12.5px;align-self:center">Yours:</span>
          <span v-for="c in mine" :key="c.id" class="chip">{{ c.e }} {{ c.l }}<button @click="delCat(c)" :aria-label="'Delete ' + c.l" style="display:grid;margin-left:2px"><Ic n="x" :s="13"/></button></span></div>
        <div class="btn-row" style="margin-top:12px"><button class="btn" @click="nc.open = false">Cancel</button><button class="btn primary" :disabled="!nc.name.trim()" @click="addCat">Add category</button></div>
      </div>
      </template>
      <template v-if="S.accounts.length && d.type !== 'transfer'">
        <span class="flabel">Account</span>
        <div class="chips"><button v-for="a in S.accounts" :key="a.id" class="chip" :class="{on: d.acct === a.id}" @click="d.acct = a.id" translate="no">{{ a.name }}</button>
          <button class="chip" :class="{on: !d.acct}" @click="d.acct = ''">None</button></div>
      </template>
      <span class="flabel">Note</span>
      <input class="field" v-model="d.note" placeholder="e.g. Lunch with Sara" enterkeyhint="done">
      <span class="flabel">Date</span>
      <DatePick v-model="d.date" :none="false" past/>
      <div v-if="need === 'future'" class="hint warn"><span class="grow">The date can't be in the future</span></div>
      <div class="btn-row">
        <button v-if="isEdit" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove"><Ic n="trash-2"/></button>
        <button class="btn primary" @click="save">{{ d.pending ? 'Save' : isEdit ? 'Save changes' : (d.type === 'in' ? 'Add income' : 'Add expense') }}</button>
      </div>
    </div>
  </Sheet>`,
};

const AccountsSheet = {
  setup() {
    const edit = ref(null);
    const f = reactive({ name: '', bal: 0 });
    const balStr = computed({ get: () => (f.bal ? fmt(f.bal) : ''), set: v => { const neg = /^\s*[-−]/.test(v); const n = parseInt(toEn(v).replace(/\D/g, '') || '0', 10); f.bal = neg ? -n : n; } });
    function open(a) { edit.value = a || 'new'; Object.assign(f, a ? { name: a.name, bal: acctBalance(a) } : { name: '', bal: 0 }); }
    watch(() => ui.accounts, v => { edit.value = null; if (v === 'new') open(null); });
    function save() {
      const name = f.name.trim() || 'Account';
      if (edit.value === 'new') S.accounts.push({ id: uid(), name, bank: '', tail: '', balance: f.bal, at: Date.now(), src: 'user' });
      else Object.assign(edit.value, { name, balance: f.bal, at: Date.now(), src: 'user' });
      edit.value = null; Native.vibrate(10); say('Balance saved');
      if (ui.accounts === 'new') ui.accounts = null;
    }
    function remove() {
      const a = edit.value, i = S.accounts.indexOf(a);
      S.accounts.splice(i, 1); edit.value = null;
      say('Account removed', () => S.accounts.splice(i, 0, a));
    }
    return { edit, f, balStr, open, save, remove, acctBalance };
  },
  template: `<Sheet :open="!!ui.accounts" :title="edit ? (edit === 'new' ? 'New account' : 'Edit account') : 'Accounts'" @close="ui.accounts = null">
    <div style="--acc:var(--c-money)">
      <template v-if="!edit">
        <p class="muted" style="font-size:13.5px;margin:-2px 2px 12px">Set each balance to what your bank shows. Orbit then adds and subtracts your transactions, and bank SMS update it automatically.</p>
        <div class="settings-group" style="box-shadow:none">
          <button v-for="a in S.accounts" :key="a.id" class="list-row" style="width:100%;text-align:left" @click="open(a)">
            <span class="bubble" style="--c:var(--c-money)"><Ic n="wallet" :s="18"/></span>
            <div class="grow"><div class="t" translate="no">{{ a.name }}</div><div class="s">{{ a.at ? (a.src === 'sms' ? 'Updated from bank SMS ' : 'Set by you ') + ago(a.at).toLowerCase() : 'Tap to set the balance' }}</div>
              <div v-if="a.suggest" class="suggest" @click.stop>Bank SMS says {{ fmt(a.suggest.v) }} <button class="btn sm" @click="a.balance = a.suggest.v; a.at = a.suggest.at; delete a.suggest; say('Balance updated from the bank')">Use it</button><button class="btn sm" @click="delete a.suggest">Ignore</button></div></div>
            <b style="white-space:nowrap">{{ fmt(acctBalance(a)) }}</b><Ic n="pencil" :s="15" class="muted"/></button>
          <div v-if="!S.accounts.length" class="list-row"><div class="grow muted" style="font-size:14px">No accounts yet. Add one to track your real balance.</div></div>
        </div>
        <button class="btn block" style="margin-top:14px" @click="open(null)"><Ic n="plus" :s="17"/>Add account</button>
      </template>
      <template v-else>
        <span class="flabel" style="margin-top:4px">Name</span>
        <input class="field" v-model="f.name" placeholder="e.g. Pasargad card, Cash" enterkeyhint="next">
        <span class="flabel">Current balance</span>
        <div class="amount-in" style="padding-top:0"><input v-model="balStr" inputmode="numeric" placeholder="0" enterkeyhint="done" @keydown.enter="save"><div class="u">{{ f.bal ? words(Math.abs(f.bal)) : 'Toman, as your bank shows it right now' }}</div></div>
        <div class="btn-row">
          <button v-if="edit !== 'new'" class="btn danger" style="flex:0 0 56px;padding:0" @click="remove" aria-label="Delete account"><Ic n="trash-2"/></button>
          <button class="btn" style="flex:0 0 auto" @click="edit = null">Back</button>
          <button class="btn primary" @click="save">Save</button>
        </div>
      </template>
    </div>
  </Sheet>`,
};

const BudgetSheet = {
  setup() {
    const v = ref(0);
    watch(() => ui.budget, o => { if (o) v.value = S.settings.budget || 0; });
    const str = computed({ get: () => (v.value ? fmt(v.value) : ''), set: x => { v.value = parseInt(toEn(x).replace(/\D/g, '') || '0', 10); } });
    function save() { S.settings.budget = v.value; ui.budget = false; say(v.value ? 'Budget set to ' + short(v.value) : 'Budget removed'); }
    return { str, v, save };
  },
  template: `<Sheet :open="ui.budget" title="Monthly budget" @close="ui.budget = false">
    <div style="--acc:var(--c-money)">
      <div class="amount-in"><input v-model="str" inputmode="numeric" placeholder="0" enterkeyhint="done" @keydown.enter="save"><div class="u">{{ v ? words(v) + ' a month' : 'How much do you want to spend per month?' }}</div></div>
      <div class="chips" style="justify-content:center;margin-top:10px"><button class="chip" v-for="n in [10e6, 20e6, 30e6, 50e6]" :key="n" @click="v = n">{{ short(n) }}</button></div>
      <div class="btn-row"><button v-if="S.settings.budget" class="btn" @click="v = 0; save()">Remove</button><button class="btn primary" @click="save">Save</button></div>
    </div>
  </Sheet>`,
};

/* ================= onboarding ================= */
const Onboarding = {
  setup() {
    const name = ref('');
    const picks = ref([0, 1, 4]);
    const feats = [
      { n: 'list-checks', l: 'Tasks', c: 'var(--c-tasks)' }, { n: 'flame', l: 'Habits', c: 'var(--c-habits)' },
      { n: 'wallet', l: 'Money', c: 'var(--c-money)' }, { n: 'notebook-pen', l: 'Notes', c: 'var(--c-notes)' },
      { n: 'timer', l: 'Focus', c: 'var(--c-focus)' }, { n: 'droplet', l: 'Water', c: 'var(--c-water)' },
      { n: 'smile', l: 'Mood', c: 'var(--c-mood)' }, { n: 'hourglass', l: 'Countdowns', c: 'var(--c-count)' },
      { n: 'flower-2', l: 'Cycle', c: 'var(--c-cycle)' },
    ];
    const tog = i => { const a = picks.value; const j = a.indexOf(i); j >= 0 ? a.splice(j, 1) : a.push(i); Native.vibrate(6); };
    function finish() {
      S.settings.name = name.value.trim();
      picks.value.sort().forEach(i => S.habits.push({ id: uid(), ...HABIT_SUGGEST[i], log: {}, created: Date.now() }));
      S.settings.onboarded = true;
      Native.vibrate(20);
      Native.askNotify();
    }
    return { name, picks, tog, finish, feats, HABIT_SUGGEST };
  },
  template: `<div class="onb" style="--acc:var(--c-tasks)">
    <div v-if="IOS && !STANDALONE" class="install-tip">
      <b>Install Orbit on your iPhone</b>
      <span>Tap <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M8 11H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2"/></svg> Share, then <b>Add to Home Screen</b>. Your data stays private on this phone.</span>
    </div>
    <div class="logo"><svg width="46" height="46" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="8" fill="#fff"/><ellipse cx="24" cy="24" rx="20" ry="9" stroke="#fff" stroke-opacity=".75" stroke-width="3" transform="rotate(-25 24 24)"/><circle cx="41" cy="16" r="3.2" fill="#fff"/></svg></div>
    <h1>Your whole day,<br>in one orbit.</h1>
    <p>Tasks, habits, money, notes and more. Private, offline, and all in one place.</p>
    <div class="feat"><span v-for="f in feats" :key="f.l" :style="{'--c': f.c}"><Ic :n="f.n" :s="15"/>{{ f.l }}</span></div>
    <span class="flabel" style="margin-top:30px">What should we call you?</span>
    <input class="field" v-model="name" placeholder="Your name" enterkeyhint="done">
    <span class="flabel">Pick a few habits to start</span>
    <div class="chips">
      <button v-for="(h, i) in HABIT_SUGGEST" :key="i" class="chip" :class="{on: picks.includes(i)}" @click="tog(i)">{{ h.emoji }} {{ h.name }}</button>
    </div>
    <div class="grow"></div>
    <button class="btn primary block" style="height:56px;font-size:16px;margin-top:28px" @click="finish">Get started <Ic n="chevron-right" :s="18"/></button>
  </div>`,
};
