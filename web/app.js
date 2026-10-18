/* Orbit — everything in one place */
const APP_VERSION = '1.21'; // single source of truth: android/build.sh reads this for the APK versionName

/* ================= app shell ================= */
function storeExport() {
  if (Store.corrupt) {
    let raw = ''; try { raw = localStorage.getItem(Store.corrupt) || ''; } catch (e) {}
    if (raw) return Native.shareFile('orbit-unreadable-data-' + R.today + '.txt', 'text/plain', raw);
  }
  Native.shareFile('orbit-backup-' + R.today + '.json', 'application/json', makeBackup(MODULES.map(m => m.id)));
}
function storeDismiss() {
  if (Store.readonly && !confirm('Start fresh? Orbit will save new data over the unreadable copy. Export it first if you want to keep it.')) return;
  Store.readonly = false; Store.corrupt = ''; saveNow();
}
const App = {
  setup() {
    const kb = ref(false);
    const typing = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['date', 'time'].includes(el.type)));
    addEventListener('focusin', e => { kb.value = typing(e.target); });
    addEventListener('focusout', () => setTimeout(() => { kb.value = typing(document.activeElement); }, 50));
    // keep bottom sheets above the iOS keyboard
    const vv = window.visualViewport;
    if (vv) {
      const fit = () => {
        const st = document.documentElement.style;
        st.setProperty('--vvh', vv.height + 'px'); st.setProperty('--vvt', vv.offsetTop + 'px');
        // the part of the layout covered by the keyboard (iPhone); 0 where the page itself shrinks (Android)
        st.setProperty('--kbb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px');
      };
      vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
    }
    const tabs = [
      { id: 'today', n: 'house', l: 'Today', c: 'var(--c-tasks)' },
      { id: 'tasks', n: 'list-checks', l: 'Tasks', c: 'var(--c-tasks)' },
      { id: 'habits', n: 'flame', l: 'Habits', c: 'var(--c-habits)' },
      { id: 'money', n: 'wallet', l: 'Money', c: 'var(--c-money)' },
      { id: 'more', n: 'layout-grid', l: 'More', c: 'var(--c-count)' },
    ];
    const views = {
      today: TodayView, tasks: TasksView, habits: HabitsView, money: MoneyView, more: MoreView,
      notes: NotesView, focus: FocusView, water: WaterView, mood: MoodView, countdowns: CountdownsView, cycle: CycleView, settings: SettingsView, alerts: NotificationsView, reports: ReportsView, reminders: RemindersView, people: PeopleView, pair: PairView,
      timeline: TimelineView, review: ReviewView,
    };
    const current = computed(() => nav.screen || nav.tab);
    function tab(id) {
      Native.vibrate(6);
      if (nav.tab === id && !nav.screen) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      nav.tab = id; nav.screen = null;
    }
    const toTop = () => window.scrollTo(0, 0);
    return { kb, tabs, views, current, tab, toTop };
  },
  template: `<div :class="{kb}">
    <div v-if="Store.error || Store.corrupt" class="store-banner" role="alert">
      <Ic n="circle-alert" :s="18"/>
      <div class="grow">
        <b>{{ Store.corrupt ? 'Orbit couldn\\'t read your saved data' : 'Orbit can\\'t save your changes' }}</b>
        <span>{{ Store.corrupt ? (Store.readonly ? 'Saving is paused so nothing is overwritten. Export the old data to keep it.' : 'A copy of it was kept. You can export it, or restore a backup.') : 'This phone\\'s storage for Orbit is full. Export a backup now so nothing is lost.' }}</span>
      </div>
      <button class="btn sm" @click="storeExport">Export</button>
      <button v-if="Store.corrupt" class="btn sm" @click="storeDismiss" :aria-label="Store.readonly ? 'Start fresh' : 'Dismiss'">{{ Store.readonly ? 'Start fresh' : 'OK' }}</button>
    </div>
    <Onboarding v-if="!S.settings.onboarded"/>
    <template v-else>
      <Transition name="view" mode="out-in" @before-enter="toTop"><component :is="views[current]" :key="current === 'pair' ? 'pair:' + Soc.open : current"/></Transition>
      <nav class="tabbar">
        <button v-for="t in tabs" :key="t.id" :class="{on: nav.tab === t.id}" :style="{'--acc': t.c}" @click="tab(t.id)">
          <span class="pill"><Ic :n="t.n" :s="21" :w="nav.tab === t.id ? 2.3 : 2"/><i v-if="t.id === 'more' && socTodo.total" class="tab-dot"></i></span>{{ t.l }}</button>
      </nav>
      <TaskSheet/><TxSheet/><AccountsSheet/><BudgetSheet/><RemSheet/><PickerSheet/><CaptureSheet/>
    </template>
    <Transition name="toast"><div v-if="toast.msg" class="toast" :key="toast.id"><span>{{ toast.msg }}</span><button v-if="toast.undo" @click="doUndo"><Ic n="undo-2" :s="15" style="display:inline;vertical-align:-2px"/> Undo</button></div></Transition>
  </div>`,
};

const app = createApp(App);
Object.assign(app.config.globalProperties, {
  Store, storeExport, storeDismiss, APP_VERSION, S, R, nav, ui, toast, Timer, Native, IOS, STANDALONE, MOODS, Rem, PUSH_SUPPORTED, remPossible, BEFORE, enablePush, disablePush, testNotify, askAndroidNotify, MODES, JM, WDL, CAT, justDone,
  pickTime, pickDate, go, say, doUndo, scheduleSync, hm, isToday, everyLabel, keyOf, fmt, short, words, mmss, rel, ago, jLabel, jFull, gLabel, gFull, parseKey, addDays,
  setLang, tr, FA, qText, Soc, REL, whoName, Upd, installUpdate, dismissUpdate, AN,
  txIcon, acctName, remSummary, newReminder, REM_TEMPLATES, whenShort, clog, setClog, PHASES, catOf, catsFor, categorize, dismissTx, smsEnable, smsDisable, Sms, CATS_IN, WK, jFull, toggleTask, delTask, prioC, taskPassed, habitDue, toggleHabit, streak, addWater, setMood, togglePeriodDay,
});
// computed refs on globalProperties are not auto-unwrapped, so expose them as live getters
const live = { dueToday, updAvail, socTodo, socPairs, waterRem, totalBalance, cycStats, pendingTx, topCats, focusStreak, waterToday, focusToday, spentThisMonth, curJ, cyc, cdSorted, plan, waterNext, remReady };
for (const [k, c] of Object.entries(live)) Object.defineProperty(app.config.globalProperties, k, { get: () => c.value });
app.component('Ic', Ic).component('Ring', Ring).component('Check', Check).component('Sheet', Sheet).component('Swipe', Swipe)
  .component('Head', Head).component('Stepper', Stepper).component('Toggle', Toggle).component('DatePick', DatePick)
  .component('Empty', Empty).component('Bars', Bars).component('CycleDaySheet', CycleDaySheet).component('Donut', Donut).component('TaskSheet', TaskSheet).component('TxSheet', TxSheet).component('AccountsSheet', AccountsSheet).component('BudgetSheet', BudgetSheet).component('RemSheet', RemSheet).component('Onboarding', Onboarding).component('RelPick', RelPick)
  .component('EmojiPick', EmojiPick).component('PickerSheet', PickerSheet).component('TimeChip', TimeChip).component('DateChip', DateChip)
  .component('CaptureSheet', CaptureSheet).component('TodaySections', TodaySections);
app.mount('#app');
// tell Android this version of the screens started fine (a version that never gets here is rolled back)
try { if (AN && AN.bootOk) setTimeout(() => AN.bootOk(), 1500); } catch (e) {}

if (!Native.has) {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.go) window.orbitGo(e.data.go); });
  }
  const go = new URLSearchParams(location.search).get('go');
  if (go && S.settings.onboarded) { window.orbitGo(go); history.replaceState(null, '', location.pathname); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && PUSH_SUPPORTED) { Rem.perm = Notification.permission; if (Rem.push.token) scheduleSync(0); } });
  // ask the browser not to evict saved data
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  watchEffect(() => { const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = isDark.value ? '#0b0c10' : '#f3f4f8'; });
}
