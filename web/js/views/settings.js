/* Settings screen. */
const SettingsView = {
  setup() {
    const imp = ref(false), txt = ref(''), reset = ref(false), exp = ref(false), pick = ref(MODULES.map(m => m.id));
    const prev = ref(null), err = ref(''), undoAt = ref(restoreUndoAt());
    const budgetStr = computed({
      get: () => (S.settings.budget ? fmt(S.settings.budget) : ''),
      set: v => { S.settings.budget = parseInt(toEn(v).replace(/\D/g, '') || '0', 10); },
    });
    function exportData() {
      if (!pick.value.length) return;
      Native.shareFile('orbit-backup-' + R.today + '.json', 'application/json', makeBackup(pick.value));
      exp.value = false;
    }
    function openImport() { prev.value = null; err.value = ''; txt.value = ''; imp.value = true; }
    function check(text) { const b = readBackup(text); if (b.error) { err.value = b.error; prev.value = null; } else { err.value = ''; prev.value = b; } }
    const canPickFile = !Native.has || !!(AN && AN.pickText);
    function chooseFile() {
      if (AN && AN.pickText) {
        window.orbitPickedText = (t, e) => {
          if (e === 'large') err.value = 'This file is too large to be an Orbit backup';
          else if (e) err.value = 'That file couldn\'t be read';
          else if (t != null) check(t);
        };
        AN.pickText(); return;
      }
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json,text/plain'; inp.style.display = 'none';
      inp.onchange = () => {
        const f = inp.files && inp.files[0]; inp.remove();
        if (!f) return;
        if (f.size > MAX_BACKUP) { err.value = 'This file is too large to be an Orbit backup'; return; }
        f.text().then(check, () => { err.value = 'That file couldn\'t be read'; });
      };
      document.body.appendChild(inp); inp.click();
    }
    function doRestore() {
      const problem = applyBackup(prev.value);
      if (problem) { err.value = problem; return; }
      imp.value = false; undoAt.value = restoreUndoAt();
      say('Backup restored', () => { if (undoRestore()) { undoAt.value = 0; say('Restore undone. Your previous data is back'); } });
    }
    function undoLast() { if (undoRestore()) { undoAt.value = 0; say('Restore undone. Your previous data is back'); } else say('There\'s nothing to undo'); }
    function resetAll() {
      const d = defaults(), lang = S.settings.lang;
      try { localStorage.setItem(BEFORE_RESTORE, JSON.stringify({ at: Date.now(), state: JSON.stringify(S) })); } catch (e) {}
      Object.keys(S).forEach(k => { if (!(k in d)) delete S[k]; });
      Object.keys(d).forEach(k => { S[k] = d[k]; });
      S.settings.lang = lang;
      runMigrations(); saveNow();
      wake.off();
      try { localStorage.removeItem('orbit.chatcache'); } catch (e) {}
      reset.value = false; nav.screen = null; nav.tab = 'today'; undoAt.value = restoreUndoAt();
      say('Everything was erased', () => { if (undoRestore()) { undoAt.value = 0; say('Your data is back'); } });
    }
    const MODS = MODULES;
    const counts = computed(() => S.tasks.length + S.habits.length + S.notes.length + S.money.length + S.countdowns.length);
    return { imp, txt, reset, exp, pick, prev, err, undoAt, budgetStr, exportData, openImport, check, canPickFile, chooseFile, doRestore, undoLast, resetAll, counts, MODS };
  },
  template: `<div class="view" style="--acc:var(--c-tasks)">
    <Head title="Settings"/>
    <div class="label">Profile</div>
    <div class="settings-group"><div class="list-row"><span class="bubble" style="--c:var(--c-tasks)"><Ic n="smile" :s="18"/></span>
      <input class="grow" v-model="S.settings.name" placeholder="Your name" style="background:none;border:0;outline:none;font-size:16px;font-weight:600;padding:6px 0" enterkeyhint="done"></div></div>

    <div class="label">Language · زبان</div>
    <div class="seg" translate="no">
      <button :class="{on: S.settings.lang !== 'fa'}" @click="setLang('en')">English</button>
      <button :class="{on: S.settings.lang === 'fa'}" @click="setLang('fa')">فارسی</button>
    </div>

    <div class="label">Appearance</div>
    <div class="seg">
      <button :class="{on: S.settings.theme === 'system'}" @click="S.settings.theme = 'system'"><Ic n="sparkles" :s="16"/>Auto</button>
      <button :class="{on: S.settings.theme === 'light'}" @click="S.settings.theme = 'light'"><Ic n="sun" :s="16"/>Light</button>
      <button :class="{on: S.settings.theme === 'dark'}" @click="S.settings.theme = 'dark'"><Ic n="moon" :s="16"/>Dark</button>
    </div>

    <div class="label">Money</div>
    <div class="settings-group"><div class="list-row"><span class="bubble" style="--c:var(--c-money)"><Ic n="target" :s="18"/></span>
      <div class="grow"><div class="t">Monthly budget</div><input v-model="budgetStr" inputmode="numeric" placeholder="Not set" style="background:none;border:0;outline:none;font-size:15px;padding:4px 0 0;width:100%;color:var(--text-2)" enterkeyhint="done"></div>
      <span class="muted" style="font-weight:600">Toman</span></div>
      <div v-if="Native.has" class="list-row"><span class="bubble" style="--c:var(--c-money)"><Ic n="message-square-text" :s="18"/></span>
        <div class="grow"><div class="t">Add from bank SMS</div><div class="s">{{ S.settings.sms.on ? (Sms.granted ? 'On · read on this phone only' : 'SMS access was removed') : 'Off' }}</div></div>
        <Toggle :model-value="S.settings.sms.on && Sms.granted" @update:model-value="v => v ? smsEnable() : smsDisable()"/></div>
      <div class="list-row" style="display:block"><div class="t" style="margin-bottom:8px">My bank SMS amounts are in</div>
        <div class="seg"><button :class="{on: S.settings.sms.unit === 'rial'}" @click="S.settings.sms.unit = 'rial'">Rial (most banks)</button><button :class="{on: S.settings.sms.unit === 'toman'}" @click="S.settings.sms.unit = 'toman'">Toman</button></div>
        <div class="s" style="margin-top:6px">Used when the SMS doesn't say. Orbit stores everything in Toman.</div></div>
    </div>

    <div class="label">Notifications</div>
    <div class="settings-group"><button class="list-row" style="width:100%;text-align:left" @click="go('alerts')">
      <span class="bubble" style="--c:var(--c-focus)"><Ic n="bell" :s="18"/></span>
      <div class="grow"><div class="t">Notifications</div><div class="s">{{ remReady ? 'On · tasks, water, focus & cycle' : 'Off · tap to set up' }}</div></div>
      <span class="dot" :style="{background: remReady ? 'var(--c-habits)' : 'var(--c-focus)'}"></span><Ic n="chevron-right" :s="18" class="muted"/></button></div>

    <template v-if="Native.has && Upd.info">
      <div class="label">App updates</div>
      <div class="settings-group">
        <div class="list-row"><span class="bubble" style="--c:var(--c-tasks)"><Ic n="download" :s="18"/></span>
          <div class="grow"><div class="t">{{ updAvail ? 'Orbit ' + updAvail.name + ' is available' : 'Orbit is up to date' }}</div>
            <div class="s">App {{ Upd.info.name }} · screens {{ APP_VERSION }} (build {{ Upd.info.build }}){{ Upd.info.pendingBuild ? ' · an update is ready' : '' }}</div></div>
          <button v-if="updAvail" class="btn sm primary" :disabled="Upd.state === 'downloading'" @click="installUpdate">{{ Upd.state === 'downloading' ? 'Downloading…' : 'Install' }}</button>
          <button v-else-if="Upd.info.pendingBuild && AN.applyUpdate" class="btn sm primary" @click="AN.applyUpdate()">Restart</button>
          <button v-else class="btn sm" @click="AN.checkUpdate(); say('Checking for updates…')">Check</button></div>
      </div>
    </template>

    <div class="label">Your data</div>
    <div class="settings-group">
      <button class="list-row" style="width:100%;text-align:left" @click="exp = true"><span class="bubble" style="--c:var(--c-water)"><Ic n="upload" :s="18"/></span>
        <div class="grow"><div class="t">Export backup</div><div class="s">A file you keep somewhere safe. Choose what goes in it</div></div><Ic n="chevron-right" :s="18" class="muted"/></button>
      <button class="list-row" style="width:100%;text-align:left" @click="openImport"><span class="bubble" style="--c:var(--c-habits)"><Ic n="download" :s="18"/></span>
        <div class="grow"><div class="t">Restore backup</div><div class="s">You'll see what's in it before anything changes</div></div><Ic n="chevron-right" :s="18" class="muted"/></button>
      <button v-if="undoAt" class="list-row" style="width:100%;text-align:left" @click="undoLast"><span class="bubble" style="--c:var(--c-mood)"><Ic n="undo-2" :s="18"/></span>
        <div class="grow"><div class="t">Undo last restore or erase</div><div class="s">Bring back your data as it was {{ ago(undoAt).toLowerCase() }}</div></div></button>
      <button class="list-row" style="width:100%;text-align:left" @click="reset = true"><span class="bubble" style="--c:var(--c-danger)"><Ic n="trash-2" :s="18"/></span>
        <div class="grow"><div class="t" style="color:var(--c-danger)">Erase everything</div><div class="s">{{ counts }} items stored on this phone</div></div></button>
    </div>
    <p class="muted" style="text-align:center;font-size:12.5px;margin-top:26px">Orbit {{ APP_VERSION }} · {{ Native.has ? 'Android' : IOS ? 'iPhone' : 'Web' }} · {{ Soc.acct ? 'Everything except People stays on your device' : 'Everything stays on your device' }} 🔒</p>

    <Sheet :open="exp" title="Export backup" @close="exp = false">
      <p class="muted" style="font-size:14px;margin-bottom:12px">Choose what to include. The file contains private data (money, health), so keep it somewhere only you can open.</p>
      <div class="settings-group" style="box-shadow:none">
        <label v-for="m in MODS" :key="m.id" class="list-row" style="cursor:pointer"><div class="grow"><div class="t">{{ m.l }}</div></div>
          <input type="checkbox" class="check" :value="m.id" v-model="pick"></label>
      </div>
      <div class="btn-row"><button class="btn" @click="pick = pick.length === MODS.length ? [] : MODS.map(m => m.id)">{{ pick.length === MODS.length ? 'Select none' : 'Select all' }}</button>
        <button class="btn primary" :disabled="!pick.length" @click="exportData">Export</button></div>
    </Sheet>
    <Sheet :open="imp" title="Restore backup" @close="imp = false">
      <template v-if="!prev">
        <p class="muted" style="font-size:14px;margin-bottom:12px">Pick a backup file, or paste its text. Nothing changes until you confirm.</p>
        <button v-if="canPickFile" class="btn block" @click="chooseFile"><Ic n="download" :s="17"/>Choose backup file</button>
        <span class="flabel">{{ canPickFile ? 'Or paste the backup text' : 'Paste the backup text' }}</span>
        <textarea class="field" v-model="txt" placeholder='{"app":"orbit", ...}' style="min-height:130px;font-size:13px;font-family:monospace" translate="no"></textarea>
        <div v-if="err" class="hint warn"><Ic n="circle-alert" :s="16"/><span class="grow">{{ err }}</span></div>
        <div class="btn-row"><button class="btn primary" :disabled="!txt.trim()" @click="check(txt)">Check backup</button></div>
      </template>
      <template v-else>
        <div class="card" style="box-shadow:none">
          <div class="t" style="font-weight:700">Backup{{ prev.at ? ' from ' + gFull(keyOf(new Date(prev.at))) : '' }}</div>
          <div class="s muted" style="font-size:13px">{{ prev.ver ? 'Made with Orbit ' + prev.ver : 'Older Orbit backup' }}</div>
          <div v-for="m in MODS.filter(x => prev.mods.includes(x.id))" :key="m.id" class="row" style="margin-top:8px"><span class="grow">{{ m.l }}</span><b>{{ prev.counts[m.id] || 'empty' }}</b></div>
        </div>
        <div v-if="prev.newer" class="hint warn"><span class="grow">This backup is from a newer Orbit. Update the app first for the best result.</span></div>
        <div v-if="prev.bad.length" class="hint warn"><span class="grow">Some parts couldn't be read and will be left out: {{ prev.bad.join(', ') }}</span></div>
        <div v-if="prev.empty" class="hint warn"><span class="grow">This backup has no data in it.</span></div>
        <p class="muted" style="font-size:13.5px;margin-top:12px">The parts listed above will replace what's on this phone. Everything else stays as it is. A safety copy of your current data is kept so you can undo.</p>
        <div v-if="err" class="hint warn"><Ic n="circle-alert" :s="16"/><span class="grow">{{ err }}</span></div>
        <div class="btn-row"><button class="btn" @click="prev = null">Back</button><button class="btn danger" style="background:var(--c-danger);color:#fff" @click="doRestore">Replace with backup</button></div>
      </template>
    </Sheet>
    <Sheet :open="reset" title="Erase everything?" @close="reset = false">
      <p class="muted">All tasks, habits, notes, transactions, cycle and other logs on this phone will be deleted. Your People account and chats on the server are not affected. You can undo right after, but export a backup first if you want to be safe.</p>
      <div class="btn-row"><button class="btn" @click="reset = false; exp = true">Export first</button><button class="btn danger" style="background:var(--c-danger);color:#fff" @click="resetAll">Erase</button></div>
    </Sheet>
  </div>`,
};
