/* Notifications screen. */
const NotificationsView = {
  setup() {
    // Android has no Web Push: show when the phone last checked the server for messages
    const pollLine = computed(() => {
      R.now; if (!AN || !AN.socialStatus) return '';
      let st = {}; try { st = JSON.parse(AN.socialStatus()); } catch (e) {}
      const pace = 'About every 2 minutes after you use People, then every 5–15 minutes. Android may delay checks to save battery';
      if (!st.last) return pace + ' · not checked yet';
      return pace + ' · last check ' + ago(st.last) + (st.result && st.result !== 'ok' && st.result !== 'checking' ? ' (' + st.result + ')' : '');
    });
    // what could stop reminders from arriving on time (Android only)
    const diag = ref(null);
    const CH = { tasks: 'Task reminders', water: 'Water reminders', reminders: 'Personal reminders', focus: 'Focus timer', cycle: 'Cycle', social: 'People' };
    function readDiag() { try { if (AN && AN.notifDiag) diag.value = JSON.parse(AN.notifDiag()); } catch (e) {} }
    readDiag();
    const resume = () => { if (!document.hidden) readDiag(); };
    document.addEventListener('visibilitychange', resume);
    onBeforeUnmount(() => document.removeEventListener('visibilitychange', resume));
    const problems = computed(() => {
      const d = diag.value; if (!d) return [];
      const out = [];
      if (d.channelsOff && d.channelsOff.length) {
        const names = d.channelsOff.map(c => tr(CH[c] || c)).join(FA ? '، ' : ', ');
        out.push({ id: 'ch', t: 'Some kinds are turned off', s: FA ? names + ' نمایش داده نمی‌شن' : names + ' won\'t show', fix: 'Open settings', go: () => AN.openNotifSettings() });
      }
      if (d.exact === false) out.push({ id: 'exact', t: 'Reminders may be a few minutes late', s: 'Android hasn\'t allowed Orbit to use exact alarms', fix: 'Open settings', go: () => AN.openAppSettings() });
      if (d.batteryFree === false) out.push({ id: 'bat', t: 'Battery saving can delay reminders', s: 'Set Orbit to "Unrestricted" or "Don\'t optimise" so alarms and message checks aren\'t held back', fix: 'Battery settings', go: () => (AN.openBatterySettings ? AN.openBatterySettings() : AN.openAppSettings()) });
      return out;
    });
    const ICONS = { tasks: ['circle-check', 'var(--c-tasks)'], water: ['droplet', 'var(--c-water)'], focus: ['timer', 'var(--c-focus)'], cycle: ['flower-2', 'var(--c-cycle)'], reminders: ['bell', 'var(--c-mood)'], social: ['heart', 'var(--c-people)'] };
    // any kind of notification without its own icon gets the bell (an unknown kind used to break this screen)
    const ICON = new Proxy(ICONS, { get: (t, k) => t[k] || ['bell', 'var(--muted)'] });
    const upcoming = computed(() => {
      R.min;
      const rem = S.reminders.filter(r => r.on !== false).flatMap(r => remNext(r).map(at => ({ id: r.id + at, at, ch: r.water ? 'water' : 'reminders', title: r.emoji + ' ' + r.title })));
      return [...plan.value, ...rem].sort((a, b) => a.at - b.at).slice(0, 6);
    });
    const whenLabel = ms => (isToday(ms) ? 'Today' : rel(keyOf(new Date(ms)))) + ' · ' + hm(ms);
    const status = computed(() => {
      if (Native.has) return Rem.androidOn ? 'on' : 'blocked';
      if (!PUSH_SUPPORTED) return IOS && !STANDALONE ? 'install' : 'unsupported';
      if (Rem.perm === 'denied') return 'denied';
      if (!Rem.push.token) return 'off';
      return Rem.state === 'error' ? 'error' : 'on';
    });
    return { pollLine, upcoming, whenLabel, status, ICON, everyLabel, hm, diag, problems };
  },
  template: `<div class="view" style="--acc:var(--c-tasks)">
    <Head title="Notifications" :sub="Native.has ? 'Delivered by this phone, even offline' : 'Delivered by Orbit\\'s push server'"/>

    <div class="card status-card" :class="status">
      <template v-if="status === 'on'">
        <div class="row"><span class="bubble" style="--c:var(--c-habits)"><Ic n="bell" :s="19"/></span>
          <div class="grow"><b>Notifications are on</b><div class="s">{{ Native.has ? 'Exact alarms, even when Orbit is closed' : (Rem.last ? 'Synced ' + ago(Rem.last).toLowerCase() : 'Connected') }}</div></div></div>
        <div class="btn-row" style="margin-top:14px"><button class="btn sm" :disabled="Rem.busy" @click="testNotify"><Ic n="sparkles" :s="16"/>Send a test</button>
          <button v-if="!Native.has" class="btn sm" :disabled="Rem.busy" @click="disablePush">Turn off</button></div>
      </template>
      <template v-else-if="status === 'blocked'">
        <div class="row"><span class="bubble" style="--c:var(--c-focus)"><Ic n="bell" :s="19"/></span>
          <div class="grow"><b>Notifications are blocked</b><div class="s">Allow them so reminders can reach you</div></div></div>
        <button class="btn primary block" style="margin-top:14px" @click="askAndroidNotify">Allow notifications</button>
      </template>
      <template v-else-if="status === 'off'">
        <div class="row"><span class="bubble" style="--c:var(--c-tasks)"><Ic n="bell" :s="19"/></span>
          <div class="grow"><b>Turn on notifications</b><div class="s">Get task, water, focus and cycle reminders on this iPhone</div></div></div>
        <button class="btn primary block" style="margin-top:14px" :disabled="Rem.busy" @click="enablePush">{{ Rem.busy ? 'Connecting…' : 'Turn on notifications' }}</button>
        <p class="fine">🔒 Reminder texts are encrypted on this phone. The server only knows when to ping you, never what about.</p>
      </template>
      <template v-else-if="status === 'error'">
        <div class="row"><span class="bubble" style="--c:var(--c-mood)"><Ic n="rotate-ccw" :s="19"/></span>
          <div class="grow"><b>Can't reach the reminder server</b><div class="s">Reminders you already set will still arrive. Changes will sync when you're back online.</div></div></div>
        <button class="btn sm" style="margin-top:14px" @click="scheduleSync(0)">Retry now</button>
      </template>
      <template v-else-if="status === 'denied'">
        <div class="row"><span class="bubble" style="--c:var(--c-focus)"><Ic n="bell" :s="19"/></span>
          <div class="grow"><b>Notifications are blocked</b><div class="s">Open iPhone Settings → Notifications → Orbit and turn on Allow Notifications</div></div></div>
      </template>
      <template v-else-if="status === 'install'">
        <div class="row"><span class="bubble" style="--c:var(--c-water)"><Ic n="download" :s="19"/></span>
          <div class="grow"><b>Add Orbit to your Home Screen first</b><div class="s">iPhone only allows notifications for installed apps. In Safari tap Share, then Add to Home Screen, then open Orbit from there.</div></div></div>
      </template>
      <template v-else>
        <div class="row"><span class="bubble" style="--c:var(--muted)"><Ic n="bell" :s="19"/></span>
          <div class="grow"><b>Not available here</b><div class="s">This browser can't receive notifications. Use Safari on iPhone (installed to Home Screen) or the Android app.</div></div></div>
      </template>
    </div>

    <template v-if="diag && status === 'on'">
      <div class="label">Reliability check</div>
      <div class="settings-group">
        <div v-for="x in problems" :key="x.id" class="list-row diag-row">
          <span class="bubble" style="--c:var(--c-mood)"><Ic n="circle-alert" :s="18"/></span>
          <div class="grow"><div class="t">{{ x.t }}</div><div class="s">{{ x.s }}</div></div>
          <button class="btn sm" @click="x.go()">{{ x.fix }}</button>
        </div>
        <div v-if="!problems.length" class="list-row"><span class="bubble" style="--c:var(--c-habits)"><Ic n="check" :s="18"/></span>
          <div class="grow"><div class="t">Nothing is holding reminders back</div><div class="s">Exact alarms are allowed and every kind is turned on</div></div></div>
      </div>
      <p class="fine" style="margin:8px 4px 0">Phones from some makers still pause apps in the background. If a reminder arrives late, check the battery settings for Orbit.</p>
    </template>

    <div class="label">Personal reminders</div>
    <div class="settings-group">
      <button class="list-row row-btn" @click="go('reminders')">
        <span class="bubble" style="--c:var(--c-mood)"><Ic n="bell" :s="18"/></span>
        <div class="grow"><div class="t">Reminders</div><div class="s">{{ S.reminders.length ? S.reminders.filter(r => r.on !== false).length + ' active · water, medicine, anything you set' : 'Water, medicine, stretching, bills…' }}</div></div>
        <Ic n="chevron-right" :s="18" class="muted"/></button>
    </div>

    <div class="label">Other reminders</div>
    <div class="settings-group">
      <div class="list-row"><span class="bubble" style="--c:var(--c-tasks)"><Ic n="circle-check" :s="18"/></span>
        <div class="grow"><div class="t">Task reminders</div><div class="s">At the time you set on each task</div></div><Toggle v-model="S.settings.notify.tasks"/></div>
      <div class="list-row"><span class="bubble" style="--c:var(--c-focus)"><Ic n="timer" :s="18"/></span>
        <div class="grow"><div class="t">Focus timer</div><div class="s">When a session or break ends</div></div><Toggle v-model="S.settings.notify.focus"/></div>
      <div class="list-row"><span class="bubble" style="--c:var(--c-cycle)"><Ic n="flower-2" :s="18"/></span>
        <div class="grow"><div class="t">Cycle</div><div class="s">{{ cyc.has ? '2 days before and on the expected day' : 'Set up the cycle tracker first' }}</div></div><Toggle v-model="S.settings.cycle.notify"/></div>
    </div>

    <div class="label">People</div>
    <div class="settings-group">
      <div class="list-row"><span class="bubble" style="--c:var(--c-people)"><Ic n="messages-square" :s="18"/></span>
        <div class="grow"><div class="t">Messages</div><div class="s">New messages, reactions and connection requests</div></div><Toggle v-model="S.settings.notify.chat"/></div>
      <div class="list-row"><span class="bubble" style="--c:var(--c-people)"><Ic n="heart" :s="18"/></span>
        <div class="grow"><div class="t">Daily question</div><div class="s">When a new question arrives and when the other person answers</div></div><Toggle v-model="S.settings.notify.question"/></div>
      <div v-if="!Soc.acct" class="list-row"><div class="grow s muted">Create your ID in People to use these</div></div>
      <div v-if="Soc.acct && pollLine" class="list-row"><div class="grow"><div class="t">Checking for messages</div><div class="s">{{ pollLine }}</div></div></div>
    </div>

    <div class="label">Coming up</div>
    <div class="settings-group">
      <div v-for="u in upcoming" :key="u.id" class="list-row">
        <span class="bubble" :style="{'--c': ICON[u.ch][1]}"><Ic :n="ICON[u.ch][0]" :s="17"/></span>
        <div class="grow" style="min-width:0"><div class="t ellipsis">{{ u.title.replace(/^\\W+\\s/, '') }}</div><div class="s">{{ whenLabel(u.at) }}</div></div>
      </div>
      <div v-if="!upcoming.length" class="list-row"><div class="grow muted" style="font-size:14px">Nothing scheduled. Add a reminder to a task or turn on water reminders.</div></div>
    </div>
  </div>`,
};
