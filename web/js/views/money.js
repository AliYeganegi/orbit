/* Money and reports screens. */
const MoneyView = {
  setup() {
    const ym = ref({ y: curJ.value.y, m: curJ.value.m });
    const shift = n => { let { y, m } = ym.value; m += n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } ym.value = { y, m }; };
    const isCur = computed(() => ym.value.y === curJ.value.y && ym.value.m === curJ.value.m);
    const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created);
    const txs = computed(() => monthTx(ym.value.y, ym.value.m).sort(byDate));
    const spent = computed(() => sumSpend(txs.value));
    const income = computed(() => sumIncome(txs.value));
    const unreviewed = computed(() => txs.value.filter(t => t.pending && t.type === 'out').reduce((s, t) => s + t.amount, 0));
    const cats = computed(() => {
      const m = spendByCat(txs.value);
      return Object.entries(m).filter(([, v]) => v > 0).map(([id, v]) => ({ ...catOf(id), id, v, n: txs.value.filter(t => t.cat === id && counted(t)).length, p: spent.value ? v / spent.value : 0 })).sort((a, b) => b.v - a.v);
    });
    // search looks through every month; the filter chips narrow the list
    const q = ref(''), kind = ref('all');
    const KINDS = [{ id: 'all', l: 'All' }, { id: 'out', l: 'Expenses' }, { id: 'in', l: 'Income' }, { id: 'transfer', l: 'Transfers' }, { id: 'review', l: 'To review' }];
    const matchKind = t => kind.value === 'all' || (kind.value === 'review' ? t.pending : kind.value === 'in' ? t.type === 'in' : t.type === kind.value);
    const matchQ = t => {
      const x = toEn(q.value).trim().toLowerCase(); if (!x) return true;
      const digits = x.replace(/[,\s]/g, '');
      return [t.note, txIcon(t).l, t.bank, t.type === 'transfer' ? acctName(t.acct) + ' ' + acctName(t.acct2) : acctName(t.acct)].some(v => (v || '').toLowerCase().includes(x))
        || (/^\d{3,}$/.test(digits) && String(t.amount).includes(digits));
    };
    const searching = computed(() => !!q.value.trim());
    const shown = computed(() => (searching.value ? [...S.money].sort(byDate) : txs.value).filter(t => matchKind(t) && matchQ(t)));
    const days = computed(() => {
      const by = {};
      shown.value.forEach(t => (by[t.date] = by[t.date] || []).push(t));
      return Object.keys(by).sort().reverse().map(k => ({ k, items: by[k], out: sumSpend(by[k]) }));
    });
    const budget = computed(() => S.settings.budget);
    function del(t) { const i = S.money.indexOf(t); if (i < 0) return; S.money.splice(i, 1); say('Transaction deleted', () => S.money.splice(i, 0, t)); }
    const showAll = ref(false);
    const review = computed(() => (showAll.value ? pendingTx.value : pendingTx.value.slice(0, 3)));
    const smsOffer = computed(() => Native.has && !S.settings.sms.on && !S.settings.sms.dismissed);
    return { ym, shift, isCur, spent, income, unreviewed, cats, days, budget, del, showAll, review, smsOffer, q, kind, KINDS, searching, shown };
  },
  template: `<div class="view" style="--acc:var(--c-money)">
    <header class="top"><div class="grow"><h1>Money</h1><div class="sub">Spending in Toman</div></div>
      <button class="icon-btn" @click="go('reports')" aria-label="Reports"><Ic n="chart-pie" :s="19"/></button></header>

    <div v-if="smsOffer" class="card sms-offer">
      <div class="row" style="align-items:flex-start"><span class="bubble" style="--c:var(--c-money)"><Ic n="message-square-text" :s="19"/></span>
        <div class="grow"><b>Add transactions from bank SMS</b><div class="s">Orbit can read your bank's SMS and create the transaction for you. You just pick a category. Messages are read on this phone only and never uploaded.</div></div></div>
      <div class="btn-row" style="margin-top:14px"><button class="btn sm" @click="S.settings.sms.dismissed = true">Not now</button><button class="btn sm primary" :disabled="Sms.busy" @click="smsEnable">Allow SMS access</button></div>
    </div>

    <div v-if="pendingTx.length" class="card review">
      <div class="sec"><h3><Ic n="inbox" :s="17"/>To review <span class="badge">{{ pendingTx.length }}</span></h3><span class="muted" style="font-size:12.5px;font-weight:600">from bank SMS</span></div>
      <TransitionGroup name="list" tag="div" class="rel">
        <div v-for="t in review" :key="t.id" class="rv">
          <div class="rv-top tap" @click="ui.tx = {ref: t}">
            <div class="grow"><b :class="{in: t.type === 'in'}">{{ t.type === 'in' ? '+' : '−' }}{{ fmt(t.amount) }} <small>T</small></b>
              <span v-if="t.refund" class="badge rv-tag">Refund</span><span v-if="t.uncertain" class="badge rv-tag warn" :title="(t.why || []).join(', ')">Check this</span>
              <div class="s">{{ t.bank || 'Bank' }}{{ t.card ? ' ••' + t.card.replace(/\D/g, '').slice(-4) : '' }} · {{ rel(t.date) }} {{ t.time }}</div></div>
            <button class="icon-btn plain" @click.stop="dismissTx(t)" aria-label="Not a real transaction"><Ic n="x" :s="17"/></button>
          </div>
          <div class="chips scroll" style="margin:8px -16px 0;padding:2px 16px">
            <template v-if="t.type === 'out' || t.refund"><button v-for="c in topCats" :key="c.id" class="chip" @click="categorize(t, c.id)">{{ c.e }} {{ c.l }}</button></template>
            <template v-else><button v-for="c in catsFor('in')" :key="c.id" class="chip" @click="categorize(t, c.id)">{{ c.e }} {{ c.l }}</button></template>
            <button class="chip" @click="ui.tx = {ref: t}">More…</button>
          </div>
        </div>
      </TransitionGroup>
      <button v-if="pendingTx.length > 3" class="link-btn" @click="showAll = !showAll">{{ showAll ? 'Show less' : 'Show all ' + pendingTx.length }}</button>
    </div>

    <div class="month-nav">
      <button @click="shift(-1)" aria-label="Previous month"><Ic n="chevron-left"/></button>
      <div style="text-align:center"><b>{{ JM[ym.m - 1] }} {{ ym.y }}</b><div class="muted" style="font-size:12px;font-weight:600">{{ isCur ? 'This month' : '' }}</div></div>
      <button @click="shift(1)" :style="{visibility: isCur ? 'hidden' : ''}" aria-label="Next month"><Ic n="chevron-right"/></button>
    </div>
    <div class="card money-hero">
      <div class="k">Spent</div>
      <div class="amt">{{ fmt(spent) }}<small>T</small></div>
      <div v-if="unreviewed" class="unrev">+ {{ short(unreviewed) }} waiting for review</div>
      <button v-if="budget" class="budget-line" @click="ui.budget = true">
        <div class="bar"><i :style="{width: Math.min(100, spent / budget * 100) + '%', background: spent > budget ? '#ffd1d1' : ''}"></i></div>
        <div class="bl">{{ spent > budget ? short(spent - budget) + ' over budget' : short(budget - spent) + ' left of ' + short(budget) + ' budget' }}<Ic n="pencil" :s="12"/></div>
      </button>
      <button v-else class="budget-line" @click="ui.budget = true"><div class="bl"><Ic n="target" :s="13"/>Set a monthly budget</div></button>
      <div class="split">
        <div><small><Ic n="trending-up" :s="13"/>Income</small><b>{{ short(income) }}</b></div>
        <button class="split-btn" @click="ui.accounts = S.accounts.length ? true : 'new'">
          <small><Ic n="wallet" :s="13"/>{{ S.accounts.length ? 'Balance' : 'Net this month' }}<Ic n="pencil" :s="11" style="margin-left:auto;opacity:.8"/></small>
          <b v-if="S.accounts.length">{{ totalBalance < 0 ? '−' : '' }}{{ short(Math.abs(totalBalance)) }}</b>
          <b v-else>{{ income - spent < 0 ? '−' : '' }}{{ short(Math.abs(income - spent)) }}</b>
          <span v-if="!S.accounts.length" class="set">Set your balance</span>
        </button>
      </div>
    </div>
    <div class="card" v-if="cats.length">
      <div class="sec"><h3>Where it went</h3></div>
      <div class="stack-bar"><i v-for="c in cats" :key="c.id" :style="{flex: c.v, background: c.c}"></i></div>
      <div v-for="c in cats.slice(0, 6)" :key="c.id" class="cat-row">
        <div class="e">{{ c.e }}</div>
        <div class="n">{{ c.l }}<small>{{ c.n }} transaction{{ c.n > 1 ? 's' : '' }}</small></div>
        <div class="v">{{ short(c.v) }}<small>{{ Math.round(c.p * 100) }}%</small></div>
      </div>
    </div>
    <div class="search" style="margin-top:4px"><Ic n="search" :s="18"/><input v-model="q" placeholder="Search notes, categories, amounts"><button v-if="q" @click="q=''" aria-label="Clear search"><Ic n="x" :s="16"/></button></div>
    <div class="chips scroll" style="margin-top:-4px;margin-bottom:6px"><button v-for="k in KINDS" :key="k.id" class="chip" :class="{on: kind === k.id}" @click="kind = k.id">{{ k.l }}</button></div>
    <div v-if="searching" class="muted" style="font-size:12.5px;margin:2px 4px 6px">{{ shown.length }} found in all months</div>
    <template v-if="days.length">
      <div v-for="g in days" :key="g.k">
        <div class="tx-day"><span>{{ rel(g.k) }} · {{ jLabel(g.k) }}</span><span v-if="g.out">−{{ short(g.out) }}</span></div>
        <TransitionGroup name="list" tag="div" class="tlist rel">
          <Swipe v-for="t in g.items" :key="t.id" @remove="del(t)" @tap="ui.tx = {ref: t}">
            <div class="tx" :class="{pend: t.pending}"><div class="e">{{ txIcon(t).e }}</div>
              <div class="n">{{ t.type === 'transfer' ? acctName(t.acct) + ' → ' + acctName(t.acct2) : txIcon(t).l }}<span v-if="t.refund" class="badge rv-tag">Refund</span><span v-if="t.pending" class="badge rv-tag warn">To review</span>
                <small v-if="t.note || t.bank">{{ t.note || t.bank + (t.time ? ' · ' + t.time : '') }}</small></div>
              <div class="v" :class="{in: t.type === 'in', tr: t.type === 'transfer'}">{{ t.type === 'transfer' ? '' : t.type === 'in' ? '+' : '−' }}{{ fmt(t.amount) }}</div></div>
          </Swipe>
        </TransitionGroup>
      </div>
    </template>
    <p v-if="days.length" class="muted" style="text-align:center;font-size:12.5px;margin-top:18px">Tap a transaction to edit it · swipe left to delete</p>
    <Empty v-else-if="searching || kind !== 'all'" e="🔎" t="Nothing matches" s="Try another word, or clear the filter."/>
    <Empty v-else e="💸" t="No transactions yet" :s="'Nothing logged for ' + JM[ym.m - 1] + '. Tap + to add one.'"/>
    <button class="fab" @click="ui.tx = {}" aria-label="New transaction"><Ic n="plus" :s="26" :w="2.4"/></button>
  </div>`,
};

/* ---------- charts ---------- */
const Bars = {
  props: { items: Array, h: { default: 130 }, c: { default: 'var(--c-money)' }, avg: Number, fmtv: Function },
  computed: { max() { return Math.max(1, ...this.items.map(i => Math.max(i.v || 0, i.v2 || 0)), this.avg || 0); } },
  template: `<div class="bars" :style="{height: h + 'px'}">
    <div v-if="avg" class="bars-avg" :style="{bottom: (avg / max * (h - 34) + 20) + 'px'}"><span>avg {{ fmtv ? fmtv(avg) : avg }}</span></div>
    <div v-for="(it, i) in items" :key="i" class="bar-col" :class="{hl: it.hl}">
      <span class="bv">{{ it.v && it.show ? (fmtv ? fmtv(it.v) : it.v) : '' }}</span>
      <div class="bar-pair">
        <i v-if="it.v2 != null" class="b2" :style="{height: (it.v2 / max * (h - 34)) + 'px'}"></i>
        <i :style="{height: Math.max(it.v ? 3 : 0, it.v / max * (h - 34)) + 'px', background: it.c || c}"></i>
      </div>
      <small>{{ it.l }}</small>
    </div>
  </div>`,
};
const Donut = {
  props: { parts: Array, size: { default: 150 }, sw: { default: 20 } },
  computed: {
    r() { return (this.size - this.sw) / 2; },
    C() { return 2 * Math.PI * this.r; },
    segs() {
      const tot = this.parts.reduce((s, p) => s + p.v, 0) || 1; let acc = 0;
      return this.parts.map(p => { const len = p.v / tot * this.C; const seg = { c: p.c, len: Math.max(0, len - 2), off: -acc }; acc += len; return seg; });
    },
  },
  template: `<div class="ring" :style="{width: size + 'px', height: size + 'px'}">
    <svg :width="size" :height="size" :viewBox="'0 0 ' + size + ' ' + size" :style="{transform: 'rotate(-90deg)'}">
      <circle :cx="size/2" :cy="size/2" :r="r" fill="none" :stroke-width="sw" class="ring-track"/>
      <circle v-for="(s, i) in segs" :key="i" :cx="size/2" :cy="size/2" :r="r" fill="none" :stroke="s.c" :stroke-width="sw"
        :stroke-dasharray="s.len + ' ' + C" :stroke-dashoffset="s.off" class="ring-bar"/>
    </svg>
    <div class="ring-in"><slot/></div>
  </div>`,
};

const ReportsView = {
  setup() {
    const mode = ref('month');
    const ym = ref({ y: curJ.value.y, m: curJ.value.m });
    const shift = n => { ym.value = mode.value === 'month' ? jShift(ym.value.y, ym.value.m, n) : { y: ym.value.y + n, m: ym.value.m }; };
    const isCur = computed(() => (mode.value === 'month' ? ym.value.y === curJ.value.y && ym.value.m === curJ.value.m : ym.value.y === curJ.value.y));
    const inPeriod = (t, y, m) => { const j = jal(t.date); return j.y === y && (mode.value === 'year' || j.m === m); };
    const txs = computed(() => S.money.filter(t => inPeriod(t, ym.value.y, ym.value.m)));
    const prevYm = computed(() => (mode.value === 'month' ? jShift(ym.value.y, ym.value.m, -1) : { y: ym.value.y - 1, m: 1 }));
    const prevTx = computed(() => S.money.filter(t => inPeriod(t, prevYm.value.y, prevYm.value.m)));
    // confirmed expenses; refunds are netted in by sumSpend/spendByCat, transfers and unreviewed drafts are left out
    const out = computed(() => txs.value.filter(t => counted(t) && t.type === 'out'));
    const spent = computed(() => sumSpend(txs.value));
    const income = computed(() => sumIncome(txs.value));
    const prevSpent = computed(() => sumSpend(prevTx.value));
    const change = computed(() => (prevSpent.value ? (spent.value - prevSpent.value) / prevSpent.value : null));
    const keys = computed(() => (mode.value === 'month' ? jMonthKeys(ym.value.y, ym.value.m) : null));
    const daysElapsed = computed(() => {
      if (mode.value === 'month') { const k = keys.value; if (!isCur.value) return k.length; return Math.max(1, k.indexOf(R.today) + 1); }
      const first = jToKey(ym.value.y, 1, 1);
      return isCur.value ? diffDays(first, R.today) + 1 : diffDays(first, jToKey(ym.value.y + 1, 1, 1));
    });
    const perDay = computed(() => spent.value / daysElapsed.value);
    const savedRate = computed(() => (income.value ? (income.value - spent.value) / income.value : null));

    // budget pace (current month only)
    const pace = computed(() => {
      const b = S.settings.budget;
      if (mode.value !== 'month' || !b || !isCur.value) return null;
      const total = keys.value.length, proj = perDay.value * total;
      return { b, proj, over: proj - b, safe: Math.max(0, (b - spent.value) / Math.max(1, total - daysElapsed.value + 1)), pct: spent.value / b, timePct: daysElapsed.value / total };
    });

    const trend = computed(() => {
      if (mode.value === 'month') {
        return keys.value.map((k, i) => {
          const v = Math.max(0, sumSpend(txs.value.filter(t => t.date === k)));
          return { l: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '', v, hl: k === R.today };
        });
      }
      return Array.from({ length: 12 }, (_, i) => {
        const v = Math.max(0, sumSpend(txs.value.filter(t => jal(t.date).m === i + 1)));
        return { l: JM[i].slice(0, 3), v, hl: isCur.value && i + 1 === curJ.value.m, show: true };
      });
    });
    const months6 = computed(() => Array.from({ length: 6 }, (_, i) => {
      const { y, m } = jShift(ym.value.y, mode.value === 'month' ? ym.value.m : 12, i - 5);
      const list = S.money.filter(t => { const j = jal(t.date); return j.y === y && j.m === m; });
      return { l: JM[m - 1].slice(0, 3), v: Math.max(0, sumSpend(list)), v2: sumIncome(list), hl: y === ym.value.y && m === ym.value.m };
    }));

    const cats = computed(() => {
      const cur = spendByCat(txs.value), prev = spendByCat(prevTx.value);
      return Object.entries(cur).filter(([, v]) => v > 0).map(([id, v]) => ({ ...catOf(id), id, v, p: spent.value ? v / spent.value : 0, n: out.value.filter(t => t.cat === id).length,
        ch: prev[id] ? (v - prev[id]) / prev[id] : null })).sort((a, b) => b.v - a.v);
    });
    const weekday = computed(() => {
      const order = [6, 0, 1, 2, 3, 4, 5], tot = {}, cnt = {};
      // average per weekday: total spent on that weekday / how many of those weekdays passed in the period
      const ks = mode.value === 'month' ? keys.value.slice(0, daysElapsed.value) : Array.from({ length: daysElapsed.value }, (_, i) => addDays(jToKey(ym.value.y, 1, 1), i));
      ks.forEach(k => { const w = parseKey(k).getDay(); cnt[w] = (cnt[w] || 0) + 1; });
      out.value.forEach(t => { const w = parseKey(t.date).getDay(); tot[w] = (tot[w] || 0) + t.amount; });
      const items = order.map(w => ({ l: WK[order.indexOf(w)], v: cnt[w] ? (tot[w] || 0) / cnt[w] : 0 }));
      const top = items.reduce((a, b) => (b.v > a.v ? b : a), items[0]);
      items.forEach(i => { i.hl = i === top && i.v > 0; });
      return items;
    });
    const timeOfDay = computed(() => {
      const slots = [{ l: 'Morning', e: '🌅', r: [5, 12] }, { l: 'Afternoon', e: '☀️', r: [12, 17] }, { l: 'Evening', e: '🌆', r: [17, 22] }, { l: 'Night', e: '🌙', r: [22, 29] }];
      const v = [0, 0, 0, 0]; let known = 0;
      out.value.forEach(t => {
        let h = null;
        if (t.time) h = +t.time.split(':')[0];
        else if (t.created && keyOf(new Date(t.created)) === t.date) h = new Date(t.created).getHours();
        if (h == null) return;
        known += t.amount;
        const hh = h < 5 ? h + 24 : h;
        const i = slots.findIndex(s => hh >= s.r[0] && hh < s.r[1]); if (i >= 0) v[i] += t.amount;
      });
      return { slots: slots.map((s, i) => ({ ...s, v: v[i], p: known ? v[i] / known : 0 })), known };
    });
    const top = computed(() => [...out.value].sort((a, b) => b.amount - a.amount).slice(0, 5));
    const places = computed(() => {
      const g = {};
      out.value.forEach(t => {
        const n = (t.note || '').trim(); if (!n) return;
        const k = n.toLowerCase();
        (g[k] = g[k] || { name: n, n: 0, v: 0, cat: t.cat }).n++; g[k].v += t.amount;
      });
      return Object.values(g).sort((a, b) => b.v - a.v).slice(0, 5);
    });
    const insights = computed(() => {
      const list = [];
      if (change.value != null && Math.abs(change.value) >= 0.1) list.push({ e: change.value > 0 ? '📈' : '📉', t: 'You spent ' + Math.round(Math.abs(change.value) * 100) + '% ' + (change.value > 0 ? 'more' : 'less') + ' than ' + (mode.value === 'month' ? JM[prevYm.value.m - 1] : prevYm.value.y) });
      const up = cats.value.filter(c => c.ch != null && c.ch > 0.25 && c.v > spent.value * 0.08).sort((a, b) => b.ch - a.ch)[0];
      if (up) list.push({ e: up.e, t: up.l + ' is up ' + Math.round(up.ch * 100) + '% compared with last ' + (mode.value === 'month' ? 'month' : 'year') });
      if (cats.value[0] && cats.value[0].p > 0.35) list.push({ e: cats.value[0].e, t: cats.value[0].l + ' takes ' + Math.round(cats.value[0].p * 100) + '% of your spending' });
      const wd = weekday.value.find(w => w.hl);
      if (wd && out.value.length >= 8) list.push({ e: '📅', t: 'You spend the most on ' + WDL[[6, 0, 1, 2, 3, 4, 5][weekday.value.indexOf(wd)]] + 's' });
      if (savedRate.value != null && income.value) list.push({ e: savedRate.value >= 0 ? '💰' : '⚠️', t: savedRate.value >= 0 ? 'You kept ' + Math.round(savedRate.value * 100) + '% of your income' : 'You spent ' + short(spent.value - income.value) + ' more than you earned' });
      if (pendingTx.value.length) list.push({ e: '❔', t: pendingTx.value.length + ' transaction' + (pendingTx.value.length > 1 ? 's' : '') + ' still need a category' });
      return list;
    });
    function exportCsv() {
      const rows = [['Date', 'Shamsi date', 'Time', 'Type', 'Amount (Toman)', 'Category', 'Account', 'Note', 'Bank', 'Status']];
      const typeOf = t => (t.type === 'transfer' ? 'Transfer' : t.refund ? 'Refund' : t.type === 'in' ? 'Income' : 'Expense');
      [...txs.value].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach(t => rows.push([t.date, jFull(t.date), t.time || '', typeOf(t), t.amount, txIcon(t).l,
        t.type === 'transfer' ? acctName(t.acct) + ' → ' + acctName(t.acct2) : t.acct ? acctName(t.acct) : '', t.note || '', t.bank || '', t.pending ? 'To review' : '']));
      // text that a spreadsheet would run as a formula (=, +, -, @) is prefixed with ' so it stays text
      const cell = v => { let x = String(v); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(x)) x = "'" + x; return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
      const csv = '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n'); // BOM so Excel shows Persian correctly
      Native.shareFile('orbit-money-' + (mode.value === 'month' ? ym.value.y + '-' + pad(ym.value.m) : ym.value.y) + '.csv', 'text/csv', csv);
    }
    const pct = v => (v >= 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%';
    return { mode, ym, shift, isCur, spent, income, change, perDay, savedRate, pace, trend, months6, cats, weekday, timeOfDay, top, places, insights, exportCsv, pct, out, prevYm, daysElapsed };
  },
  template: `<div class="view" style="--acc:var(--c-money)">
    <Head title="Reports" sub="Where your money goes"><button class="icon-btn" @click="exportCsv" aria-label="Export CSV"><Ic n="upload" :s="18"/></button></Head>
    <div class="seg"><button :class="{on: mode === 'month'}" @click="mode = 'month'">Month</button><button :class="{on: mode === 'year'}" @click="mode = 'year'">Year</button></div>
    <div class="month-nav" style="margin-top:12px">
      <button @click="shift(-1)" aria-label="Previous"><Ic n="chevron-left"/></button>
      <div style="text-align:center"><b>{{ mode === 'month' ? JM[ym.m - 1] + ' ' + ym.y : ym.y }}</b><div class="muted" style="font-size:12px;font-weight:600">{{ isCur ? (mode === 'month' ? 'This month' : 'This year') : '' }}</div></div>
      <button @click="shift(1)" :style="{visibility: isCur ? 'hidden' : ''}" aria-label="Next"><Ic n="chevron-right"/></button>
    </div>

    <div class="kpis">
      <div class="kpi"><small>Spent</small><b>{{ short(spent) }}</b><span v-if="change != null" :class="change > 0 ? 'up' : 'down'">{{ pct(change) }} vs {{ mode === 'month' ? JM[prevYm.m - 1].slice(0, 3) : prevYm.y }}</span><span v-else class="muted">no earlier data</span></div>
      <div class="kpi"><small>Income</small><b>{{ short(income) }}</b><span class="muted">{{ savedRate != null ? (savedRate >= 0 ? 'kept ' + Math.round(savedRate * 100) + '%' : 'overspent') : '—' }}</span></div>
      <div class="kpi"><small>Per day</small><b>{{ short(perDay) }}</b><span class="muted">{{ daysElapsed }} days</span></div>
      <div class="kpi"><small>Transactions</small><b>{{ out.length }}</b><span class="muted">avg {{ short(out.length ? spent / out.length : 0) }}</span></div>
    </div>

    <div v-if="pace" class="card pace" :class="{bad: pace.over > 0}">
      <div class="sec"><h3><Ic n="target" :s="17"/>Budget pace</h3><span class="muted" style="font-size:13px;font-weight:600">{{ short(pace.b) }} budget</span></div>
      <div class="pace-bar"><i :style="{width: Math.min(100, pace.pct * 100) + '%'}"></i><em :style="{left: Math.min(100, pace.timePct * 100) + '%'}"></em></div>
      <p>{{ pace.over > 0 ? 'At this pace you\\'ll spend about ' + short(pace.proj) + ', which is ' + short(pace.over) + ' over budget.' : 'On track. You\\'ll end around ' + short(pace.proj) + '.' }} To stay within budget, spend up to <b>{{ short(pace.safe) }}</b> a day for the rest of the month.</p>
    </div>

    <div v-if="insights.length" class="card">
      <div class="sec"><h3><Ic n="lightbulb" :s="17"/>Insights</h3></div>
      <div v-for="(x, i) in insights" :key="i" class="insight"><span>{{ x.e }}</span>{{ x.t }}</div>
    </div>

    <template v-if="out.length">
      <div class="card">
        <div class="sec"><h3>{{ mode === 'month' ? 'Daily spending' : 'Monthly spending' }}</h3></div>
        <Bars :items="trend" :avg="mode === 'month' ? perDay : spent / Math.max(1, trend.filter(t => t.v).length)" :fmtv="short"/>
      </div>

      <div class="card">
        <div class="sec"><h3>By category</h3><span class="muted" style="font-size:13px;font-weight:600">{{ cats.length }} categories</span></div>
        <div class="donut-row">
          <Donut :parts="cats.map(c => ({v: c.v, c: c.c}))"><div><b style="font-size:17px">{{ short(spent) }}</b><div class="muted" style="font-size:11px;font-weight:600">spent</div></div></Donut>
          <div class="legend-list"><div v-for="c in cats.slice(0, 5)" :key="c.id"><i :style="{background: c.c}"></i>{{ c.l }}<b>{{ Math.round(c.p * 100) }}%</b></div></div>
        </div>
        <div v-for="c in cats" :key="c.id" class="cat-row">
          <div class="e">{{ c.e }}</div>
          <div class="n">{{ c.l }}<small>{{ c.n }} transaction{{ c.n > 1 ? 's' : '' }}<template v-if="c.ch != null"> · <span :class="c.ch > 0 ? 'up' : 'down'">{{ pct(c.ch) }}</span></template></small></div>
          <div class="v">{{ short(c.v) }}<small>{{ Math.round(c.p * 100) }}%</small></div>
        </div>
      </div>

      <div class="card">
        <div class="sec"><h3>Last 6 months</h3><span class="legend-inline"><i style="background:var(--c-money)"></i>Spent <i style="background:color-mix(in srgb, var(--c-habits) 55%, transparent)"></i>Income</span></div>
        <Bars :items="months6.map(m => ({...m, show: true}))" :fmtv="short"/>
      </div>

      <div class="grid2">
        <div class="card"><div class="sec"><h3 style="font-size:15px">By weekday</h3></div><Bars :items="weekday" :h="110" c="color-mix(in srgb, var(--c-money) 45%, transparent)"/><div class="muted" style="font-size:11.5px;margin-top:6px">Average spent per day</div></div>
        <div class="card"><div class="sec"><h3 style="font-size:15px">Time of day</h3></div>
          <div v-for="sl in timeOfDay.slots" :key="sl.l" class="tod"><span>{{ sl.e }}</span><div class="grow"><div class="tl">{{ sl.l }}</div><div class="bar" style="margin:4px 0 0;height:6px;--c:var(--c-money)"><i :style="{width: (sl.p * 100) + '%'}"></i></div></div><b>{{ Math.round(sl.p * 100) }}%</b></div>
          <div v-if="!timeOfDay.known" class="muted" style="font-size:11.5px">Needs transaction times</div>
        </div>
      </div>

      <div class="card">
        <div class="sec"><h3>Biggest expenses</h3></div>
        <div v-for="t in top" :key="t.id" class="cat-row tap" @click="ui.tx = {ref: t}">
          <div class="e">{{ catOf(t.cat).e }}</div>
          <div class="n">{{ t.note || catOf(t.cat).l }}<small>{{ rel(t.date) }} · {{ jLabel(t.date) }}{{ t.bank ? ' · ' + t.bank : '' }}</small></div>
          <div class="v">{{ fmt(t.amount) }}</div>
        </div>
      </div>

      <div v-if="places.length" class="card">
        <div class="sec"><h3><Ic n="store" :s="17"/>Where you spend most</h3></div>
        <div v-for="p in places" :key="p.name" class="cat-row">
          <div class="e">{{ catOf(p.cat).e }}</div>
          <div class="n">{{ p.name }}<small>{{ p.n }} time{{ p.n > 1 ? 's' : '' }}</small></div>
          <div class="v">{{ short(p.v) }}</div>
        </div>
      </div>
    </template>
    <Empty v-else e="📊" t="Nothing to report yet" :s="'No expenses in ' + (mode === 'month' ? JM[ym.m - 1] : ym.y) + '.'"/>
  </div>`,
};
