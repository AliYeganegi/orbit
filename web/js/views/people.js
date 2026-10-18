/* People and chat screens. */
const PeopleView = {
  setup() {
    const f = reactive({ handle: '', name: S.settings.name || '', emoji: '🙂', key: '', keyMode: false, busy: false, err: '' });
    const handleOk = computed(() => /^@?[a-zA-Z][a-zA-Z0-9_.]{2,19}$/.test(f.handle.trim()));
    async function signup() {
      f.busy = true; f.err = '';
      try { await socStart(await api('/signup', { handle: f.handle.trim(), name: f.name.trim(), emoji: f.emoji, tz: TZ, lang: LANG })); say('Welcome! Your ID is @' + Soc.acct.handle); Native.askNotify(); }
      catch (e) { f.err = netErr(e); } finally { f.busy = false; }
    }
    async function signin() {
      const key = f.key.trim(), m = /^([a-z][a-z0-9_.]{2,19}):[A-Za-z0-9_-]{40,64}$/.exec(key);
      if (!m) { f.err = 'That doesn\'t look like an Orbit login key'; return; }
      f.busy = true; f.err = '';
      try {
        Soc.acct = { handle: m[1], token: key, seen: 0 };
        await api('/me');
        await socStart({ handle: m[1], token: key });
        say('Signed in as @' + m[1]);
      } catch (e) { Soc.acct = null; saveSoc(); f.err = e.status === 401 ? 'That key doesn\'t work anymore' : netErr(e); } finally { f.busy = false; }
    }

    const q = ref(''), found = ref(null), searching = ref(false), missing = ref('');
    async function find() {
      const h = q.value.trim().replace(/^@/, '').toLowerCase();
      if (!h) return;
      searching.value = true; found.value = null; missing.value = '';
      try { found.value = await api('/find?h=' + encodeURIComponent(h)); }
      catch (e) { missing.value = e.status === 404 ? 'No one has the ID @' + h : netErr(e); } finally { searching.value = false; }
    }
    const busyH = ref('');
    async function act(path, h, msg) {
      busyH.value = h;
      try {
        const r = await api(path, path === '/connect' || path === '/cancel' ? { to: h } : { from: h });
        await refreshMe();
        if (found.value && found.value.handle === h) found.value = null, q.value = '';
        if (r.pair) { say('You\'re connected 🎉'); Soc.open = r.pair.id; nav.screen = 'pair'; } else if (msg) say(msg);
        Native.vibrate(15);
      } catch (e) { say(netErr(e)); } finally { busyH.value = ''; }
    }
    const inReqs = computed(() => (Soc.me ? Object.entries(Soc.me.inReq).map(([h, p]) => ({ ...p, handle: h })) : []));
    const outReqs = computed(() => (Soc.me ? Object.entries(Soc.me.outReq).map(([h, p]) => ({ ...p, handle: h })) : []));
    const list = computed(() => [...socPairs.value].map(p => ({ p, line: pairLine(p) }))
      .sort((a, b) => (b.line.hot + (b.p.unread > 0)) - (a.line.hot + (a.p.unread > 0)) || ((b.p.last || {}).at || 0) - ((a.p.last || {}).at || 0)));
    function open(p) { Soc.open = p.id; nav.screen = 'pair'; }

    const menu = ref(false), del = ref(false), prof = reactive({ name: '', emoji: '' }), blocks = ref([]);
    watch(menu, o => {
      if (o && Soc.me) { prof.name = Soc.me.name; prof.emoji = Soc.me.emoji; }
      if (o) api('/blocks').then(r => { blocks.value = r.blocks || []; }).catch(() => {});
    });
    async function unblock(h) {
      try { await api('/unblock', { handle: h }); blocks.value = blocks.value.filter(x => x !== h); say('@' + h + ' · ' + tr('Unblocked')); } catch (e) { say(netErr(e)); }
    }
    // a new login key: every other phone signed in with the old one is signed out, this one stays in
    const rotateAsk = ref(false);
    async function rotateKey() {
      try {
        const r = await api('/rotate', {});
        Soc.acct = { ...Soc.acct, token: r.token }; saveSoc(); socNative();
        try { sock && sock.close(); } catch (e) {}
        socConnect();
        rotateAsk.value = false; say('Other phones were signed out. Your new login key is ready to copy');
      } catch (e) { say(netErr(e)); }
    }
    async function blockReq(h) {
      try { await api('/block', { handle: h }); await refreshMe(); say('@' + h + ' · ' + tr('Blocked. They won\'t be told')); } catch (e) { say(netErr(e)); }
    }
    async function saveProfile() {
      try { await api('/me', { name: prof.name.trim(), emoji: prof.emoji }); await refreshMe(); menu.value = false; say('Profile updated'); } catch (e) { say(netErr(e)); }
    }
    async function deleteAccount() {
      try { await api('/me', null, 'DELETE'); del.value = false; menu.value = false; socSignOut('Your Orbit ID and conversations were deleted'); } catch (e) { say(netErr(e)); }
    }
    const notifOff = computed(() => !Native.has && !(PUSH_SUPPORTED && Rem.perm === 'granted' && Soc.me && Soc.me.push));
    onMounted(() => { if (Soc.acct) refreshMe(); });
    return { f, handleOk, signup, signin, q, found, searching, missing, find, busyH, act, inReqs, outReqs, list, open, menu, del, prof, saveProfile, deleteAccount, notifOff, AVATARS, shareText, socSignOut,
      blocks, unblock, rotateAsk, rotateKey, blockReq };
  },
  template: `<div class="view" style="--acc:var(--c-people)">
    <Head title="People" sub="Daily questions & chat"><button v-if="Soc.acct" class="icon-btn" @click="menu = true" aria-label="People settings"><Ic n="settings" :s="19"/></button></Head>

    <template v-if="!Soc.acct">
      <div class="card" style="text-align:center;padding:26px 18px">
        <div style="font-size:46px">💬</div>
        <h2 style="font-size:20px;font-weight:750;margin-top:8px">Closer, one question a day</h2>
        <p class="muted" style="margin-top:6px;font-size:14.5px">Connect with your partner, friends or family. Each day you both answer the same question, and you only see their answer after sending yours.</p>
        <template v-if="!f.keyMode">
          <span class="flabel" style="text-align:left">Pick your look</span>
          <EmojiPick v-model="f.emoji" :list="AVATARS" chips/>
          <span class="flabel" style="text-align:left">Your name</span>
          <input class="field" v-model="f.name" placeholder="How friends see you" maxlength="40" enterkeyhint="next">
          <span class="flabel" style="text-align:left">Choose your ID</span>
          <label class="field row" style="text-align:left"><span class="muted" style="font-weight:700">@</span><input class="grow" v-model="f.handle" placeholder="e.g. ali.y" maxlength="21" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" @keydown.enter="handleOk && signup()" style="background:none;border:0;outline:none;font-size:16px;padding:0;min-width:0"></label>
          <div class="muted" style="font-size:12.5px;text-align:left;margin:6px 4px 0">Others find you by this ID. 3–20 letters, numbers, dots or underscores.</div>
          <div v-if="f.err" class="form-err">{{ f.err }}</div>
          <button class="btn primary block" style="margin-top:18px" :disabled="!handleOk || f.busy" @click="signup">{{ f.busy ? 'Creating…' : 'Create my ID' }}</button>
          <button class="link-btn" style="margin-top:12px" @click="f.keyMode = true; f.err = ''">Already have an ID? Sign in with your key</button>
        </template>
        <template v-else>
          <span class="flabel" style="text-align:left">Login key</span>
          <textarea class="field" v-model="f.key" placeholder="yourid:…" style="min-height:76px;font-family:monospace;font-size:13px" autocapitalize="none" spellcheck="false"></textarea>
          <div class="muted" style="font-size:12.5px;text-align:left;margin:6px 4px 0">Copy it from People → settings on your other phone.</div>
          <div v-if="f.err" class="form-err">{{ f.err }}</div>
          <button class="btn primary block" style="margin-top:18px" :disabled="!f.key.trim() || f.busy" @click="signin">{{ f.busy ? 'Signing in…' : 'Sign in' }}</button>
          <button class="link-btn" style="margin-top:12px" @click="f.keyMode = false; f.err = ''">Create a new ID instead</button>
        </template>
        <p class="muted" style="font-size:12px;margin-top:16px"><Ic n="lock" :s="12" style="vertical-align:-1px"/> Messages and answers are kept on the Orbit server so both of you can see them. Everything else in Orbit stays on this phone.</p>
      </div>
    </template>

    <template v-else-if="Soc.me">
      <div class="card me-card">
        <span class="av lg">{{ Soc.me.emoji }}</span>
        <div class="grow"><div style="font-weight:700;font-size:17px" translate="no">{{ Soc.me.name }}</div><div class="muted" style="font-size:14px;font-weight:600">@{{ Soc.me.handle }}</div></div>
        <button class="btn sm" @click="shareText('Add me on Orbit: @' + Soc.me.handle, 'ID copied')"><Ic n="copy" :s="16"/>Share ID</button>
      </div>

      <button v-if="notifOff" class="card notice tap" @click="PUSH_SUPPORTED ? enablePush() : go('alerts')">
        <Ic n="bell" :s="18"/><span class="grow">Turn on notifications to hear about new messages and your daily question</span><Ic n="chevron-right" :s="16"/></button>

      <div class="card">
        <div class="sec" style="margin-bottom:10px"><h3><Ic n="user-plus" :s="17"/>Add someone</h3></div>
        <div class="search-row">
          <label class="field row grow"><span class="muted" style="font-weight:700">@</span><input class="grow" v-model="q" placeholder="Their ID" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="search" @keydown.enter="find" style="background:none;border:0;outline:none;font-size:16px;padding:0;min-width:0"></label>
          <button class="btn primary" style="height:50px;width:56px;padding:0" :disabled="!q.trim() || searching" @click="find" aria-label="Search"><Ic n="search" :s="19"/></button>
        </div>
        <div v-if="missing" class="muted" style="font-size:14px;margin:12px 4px 0">{{ missing }}</div>
        <div v-if="found" class="list-row" style="border:0;padding-bottom:0">
          <span class="av">{{ found.emoji }}</span>
          <div class="grow"><div class="t" translate="no">{{ found.name }}</div><div class="s">@{{ found.handle }}</div></div>
          <span v-if="found.self" class="badge">That's you</span>
          <span v-else-if="found.connected" class="badge">Connected</span>
          <span v-else-if="Soc.me.outReq[found.handle]" class="badge">Requested</span>
          <button v-else class="btn sm primary" :disabled="busyH === found.handle" @click="act('/connect', found.handle, 'Request sent to ' + found.name)">{{ Soc.me.inReq[found.handle] ? 'Accept' : 'Connect' }}</button>
        </div>
      </div>

      <template v-if="inReqs.length">
        <div class="label">Requests</div>
        <div class="settings-group">
          <div v-for="r in inReqs" :key="r.handle" class="list-row">
            <span class="av">{{ r.emoji }}</span>
            <div class="grow"><div class="t" translate="no">{{ r.name }}</div><div class="s">@{{ r.handle }} wants to connect</div></div>
            <button class="icon-btn plain" :disabled="busyH === r.handle" @click="act('/decline', r.handle, 'Request declined')" aria-label="Decline"><Ic n="x" :s="19"/></button>
            <button class="btn sm primary" :disabled="busyH === r.handle" @click="act('/accept', r.handle)">Accept</button>
          </div>
        </div>
      </template>

      <div class="label">Connections</div>
      <div v-if="list.length" class="settings-group">
        <button v-for="x in list" :key="x.p.id" class="list-row" style="width:100%;text-align:left" @click="open(x.p)">
          <span class="av">{{ x.p.with.emoji || '🙂' }}</span>
          <div class="grow"><div class="t">{{ whoName(x.p.with) }} <span v-if="x.p.type" class="rel-tag">{{ REL[x.p.type].e }} {{ REL[x.p.type].l }}</span></div>
            <div class="s" :class="{hot: x.line.hot}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ x.line.t }}</div></div>
          <span v-if="x.p.unread" class="badge unread">{{ x.p.unread }}</span>
          <span v-else-if="x.line.hot" class="dot" style="background:var(--c-people)"></span>
        </button>
      </div>
      <div v-else class="card"><Empty e="🫶" t="No connections yet" s="Share your ID or search for someone's ID above."/></div>

      <template v-if="outReqs.length">
        <div class="label">Sent</div>
        <div class="settings-group">
          <div v-for="r in outReqs" :key="r.handle" class="list-row">
            <span class="av">{{ r.emoji }}</span>
            <div class="grow"><div class="t" translate="no">{{ r.name }}</div><div class="s">Waiting for @{{ r.handle }} to accept</div></div>
            <button class="btn sm" :disabled="busyH === r.handle" @click="act('/cancel', r.handle, 'Request cancelled')">Cancel</button>
          </div>
        </div>
      </template>
    </template>
    <div v-else class="card"><Empty e="⏳" t="Loading…" s="Connecting to Orbit"/></div>

    <Sheet :open="menu" title="Your profile" @close="menu = false">
      <div v-if="Soc.me" style="--acc:var(--c-people)">
        <EmojiPick v-model="prof.emoji" :list="AVATARS" chips/>
        <span class="flabel">Name</span>
        <input class="field" v-model="prof.name" maxlength="40" enterkeyhint="done">
        <button class="btn primary block" style="margin-top:14px" :disabled="!prof.name.trim()" @click="saveProfile">Save</button>
        <div class="label">Your ID on another phone</div>
        <div class="settings-group" style="box-shadow:none">
          <button class="list-row" style="width:100%;text-align:left" @click="shareText(Soc.acct.token, 'Login key copied. Keep it private')">
            <span class="bubble" style="--c:var(--c-people)"><Ic n="key-round" :s="18"/></span>
            <div class="grow"><div class="t">Copy login key</div><div class="s">Anyone with this key can read your chats. Keep it private</div></div></button>
          <button class="list-row" style="width:100%;text-align:left" @click="menu = false; socSignOut('Signed out. Use your login key to sign back in')">
            <span class="bubble" style="--c:var(--muted)"><Ic n="log-out" :s="18"/></span>
            <div class="grow"><div class="t">Sign out on this phone</div><div class="s">Copy your login key first, or you can't get back in</div></div></button>
          <button class="list-row" style="width:100%;text-align:left" @click="rotateAsk = true">
            <span class="bubble" style="--c:var(--c-mood)"><Ic n="lock" :s="18"/></span>
            <div class="grow"><div class="t">Sign out other phones</div><div class="s">Makes a new login key. Phones using the old one are signed out</div></div></button>
          <button class="list-row" style="width:100%;text-align:left" @click="del = true">
            <span class="bubble" style="--c:var(--c-danger)"><Ic n="trash-2" :s="18"/></span>
            <div class="grow"><div class="t" style="color:var(--c-danger)">Delete my ID</div><div class="s">Removes all your connections and conversations</div></div></button>
        </div>
        <div class="label">Blocked</div>
        <div class="settings-group" style="box-shadow:none">
          <div v-for="h in blocks" :key="h" class="list-row"><div class="grow"><div class="t" translate="no">@{{ h }}</div><div class="s">Can't find you or send you requests</div></div>
            <button class="btn sm" @click="unblock(h)">Unblock</button></div>
          <div v-if="!blocks.length" class="list-row"><div class="grow s muted">No one is blocked</div></div>
        </div>
      </div>
    </Sheet>
    <Sheet :open="rotateAsk" title="Sign out other phones?" @close="rotateAsk = false">
      <p class="muted">Orbit makes a new login key for you. Any other phone using your old key is signed out, and needs the new key to sign back in. This phone stays signed in.</p>
      <div class="btn-row"><button class="btn" @click="rotateAsk = false">Cancel</button><button class="btn primary" @click="rotateKey">Sign them out</button></div>
    </Sheet>
    <Sheet :open="del" title="Delete your ID?" @close="del = false">
      <p class="muted">Your connections, chats and answers will be deleted for everyone. This can't be undone.</p>
      <div class="btn-row"><button class="btn" @click="del = false">Cancel</button><button class="btn" style="background:var(--c-danger);color:#fff" @click="deleteAccount">Delete</button></div>
    </Sheet>
  </div>`,
};

/** The relationship picker: proposing a type needs the other person to accept it. */
const RelPick = {
  props: { p: Object },
  emits: ['done'],
  setup(props, { emit }) {
    const busy = ref('');
    async function pick(t) {
      busy.value = t;
      try {
        const r = await api('/p/' + props.p.id + '/type', { type: t });
        await loadPair(props.p.id);
        say(r.set ? 'You\'re now ' + REL[t].l + ' ' + REL[t].e : 'Sent. ' + whoName(props.p.with) + ' needs to accept');
        Native.vibrate(15); emit('done');
      } catch (e) { say(netErr(e)); } finally { busy.value = ''; }
    }
    return { busy, pick, TYPES: OrbitQuestions.TYPES };
  },
  template: `<div class="rel-grid">
    <button v-for="t in TYPES" :key="t.id" class="rel-btn" :class="{on: p.type === t.id, prop: p.proposal && p.proposal.type === t.id}" :disabled="!!busy" @click="pick(t.id)">
      <span>{{ t.e }}</span><b>{{ t.l }}</b></button>
  </div>`,
};

const PairView = {
  setup() {
    const id = Soc.open;
    const st = computed(() => Soc.chats[id]);
    const p = computed(() => pairOf(id) || st.value);
    const meH = computed(() => Soc.acct && Soc.acct.handle);
    const nm = computed(() => (p.value ? whoName(p.value.with) : ''));
    const tab = ref(null);
    const needsQ = c => !c.type || (c.proposal && c.proposal.by !== meH.value) || (c.timeProposal && c.timeProposal.by !== meH.value) || (c.today && c.today.day === c.todayKey && !c.today.mine);
    const cached = pairOf(id);
    if (cached) tab.value = needsQ(cached) ? 'q' : 'chat';
    if (tab.value === 'chat' && Soc.chats[id]) markRead(id);
    loadPair(id).then(c => { if (c && !tab.value) tab.value = needsQ(c) ? 'q' : 'chat'; if (c && tab.value === 'chat') markRead(id); });

    // chat
    const draft = ref(''), box = ref(null);
    const toBottom = (smooth) => nextTick(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
    // the chat sticks to its newest message (as photos load, messages arrive or the keyboard opens)
    // unless the reader has scrolled up; then a button offers the way back, counting what's new
    const atBottom = ref(true), newCount = ref(0), chatEl = ref(null);
    const nearBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 140;
    let pinUntil = Date.now() + 900; // while the screen opens (its transition scrolls to the top), stay pinned to the end
    function onScroll() {
      if (tab.value !== 'chat') return;
      if (Date.now() < pinUntil) { atBottom.value = true; return; }
      atBottom.value = nearBottom(); if (atBottom.value) newCount.value = 0;
    }
    addEventListener('scroll', onScroll, { passive: true });
    let chatRo = null;
    watch(chatEl, el => {
      if (chatRo) chatRo.disconnect();
      if (el && window.ResizeObserver) { chatRo = new ResizeObserver(() => { if (atBottom.value || Date.now() < pinUntil) window.scrollTo(0, document.documentElement.scrollHeight); }); chatRo.observe(el); }
    });
    onBeforeUnmount(() => { removeEventListener('scroll', onScroll); if (chatRo) chatRo.disconnect(); });
    function latest() { atBottom.value = true; newCount.value = 0; toBottom(true); }
    watch(() => st.value && st.value.messages.length, (n, o) => {
      if (tab.value !== 'chat' || !o || n <= o) return;
      const last = st.value.messages[n - 1];
      if (atBottom.value || (last && last.by === meH.value)) latest(); else newCount.value += n - o;
      markRead(id);
    });
    watch(tab, t => { if (t === 'chat') { atBottom.value = true; pinUntil = Date.now() + 900; toBottom(false); markRead(id); } else window.scrollTo(0, 0); });
    const sel = ref(null), replyTo = ref(null), flash = ref(null), pending = ref(null), viewer = ref(null), comp = ref(null);
    const editing = ref(null), delAsk = ref(null);
    function startEdit(m) {
      editing.value = m; replyTo.value = null; pending.value = null; sel.value = null;
      draft.value = m.text || '';
      nextTick(() => { if (box.value) { box.value.focus(); grow({ target: box.value }); } });
    }
    function cancelEdit() { editing.value = null; draft.value = ''; if (box.value) box.value.style.height = ''; }
    function askDelete(m) { sel.value = null; delAsk.value = m; }
    function confirmDelete() { const m = delAsk.value; delAsk.value = null; if (m) deleteMsg(id, m); }
    function send() {
      if (editing.value) {
        const m = editing.value, t = draft.value.trim();
        if (!t && !m.media) return;
        if (t !== m.text) editMsg(id, m, t);
        cancelEdit(); Native.vibrate(8); return;
      }
      const t = draft.value; if (!t.trim() && !pending.value) return;
      draft.value = ''; sendMsg(id, t, replyTo.value, pending.value); replyTo.value = null; pending.value = null; Native.vibrate(8);
      if (box.value) box.value.style.height = '';
    }
    const attachMenu = ref(false);
    function attach() { if (canFile) attachMenu.value = true; else attachPhoto(); }
    async function attachPhoto() {
      attachMenu.value = false;
      const ph = await pickPhoto();
      if (ph) { pending.value = { ...ph, url: URL.createObjectURL(ph.blob) }; toBottom(true); }
    }
    async function attachFile() {
      attachMenu.value = false;
      if (AN && AN.pickFile) { sendFileNative(id); return; }
      const f = await pickAnyFile();
      if (!f) return;
      if (f.size > 15e6) { say('Files can be up to 15 MB'); return; }
      sendMsg(id, '', replyTo.value, null, f); replyTo.value = null; toBottom(true);
    }
    function save(m) { sel.value = null; saveMedia(id, m); }
    const viewerMsg = ref(null);
    // tap a message for reactions and reply; long-press does the same on photos (a tap opens the photo)
    let pressT = null, pressed = false;
    function pressStart(m) {
      pressed = false; clearTimeout(pressT);
      pressT = setTimeout(() => { if (m.s && !m.deleted) { pressed = true; sel.value = m.s; Native.vibrate(15); } }, 450);
    }
    const pressEnd = () => clearTimeout(pressT);
    function tapMsg(m) {
      if (pressed) { pressed = false; return; }
      if (m.failed) return retryMsg(id, m);
      if (!m.s || m.deleted) return;
      sel.value = sel.value === m.s ? null : m.s;
    }
    const srcOf = m => (m.media ? m.media.local || (Photos[m.media.fid] && !['loading', 'error'].includes(Photos[m.media.fid]) ? Photos[m.media.fid] : null) : null);
    function openPhoto(m) {
      if (pressed) { pressed = false; return; }
      const src = srcOf(m); if (src) { viewer.value = src; viewerMsg.value = m; }
    }
    const closeViewer = () => { viewer.value = null; };
    watch(viewer, v => (v ? pushBack(closeViewer) : popBack(closeViewer)));
    watchEffect(() => { for (const m of (st.value ? st.value.messages : [])) if (m.media && m.media.fid && !m.media.local) loadPhoto(id, m.media.fid); });
    function bgTap(e) { if (sel.value != null && !e.target.closest('.msg, .msg-tools')) sel.value = null; }
    // keep the last messages visible above the box (its height changes with replies and photos)
    let ro = null;
    watch(comp, el => {
      if (ro) ro.disconnect();
      if (el && window.ResizeObserver) { ro = new ResizeObserver(() => document.documentElement.style.setProperty('--composer-h', el.offsetHeight + 'px')); ro.observe(el); }
    });
    onBeforeUnmount(() => { if (ro) ro.disconnect(); popBack(closeViewer); });
    const onFocus = () => setTimeout(() => toBottom(true), 350); // after the keyboard has opened
    function reply(m) { replyTo.value = m; sel.value = null; nextTick(() => box.value && box.value.focus()); }
    function react(m, e) { reactMsg(id, m, e); sel.value = null; }
    function copyMsg(m) { sel.value = null; try { navigator.clipboard.writeText(m.text).then(() => say('Copied')); } catch (e) {} }
    function jump(s) {
      const el = document.getElementById('msg' + s);
      if (!el) return say('That message is further back');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash.value = s; setTimeout(() => { if (flash.value === s) flash.value = null; }, 1400);
    }
    const rxList = m => Object.entries(m.rx || {}).map(([h, e]) => ({ h, e, mine: h === meH.value }));
    function grow(e) { const el = e.target; el.style.height = ''; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; }
    const rows = computed(() => {
      const out = []; let lastDay = '';
      for (const m of (st.value ? st.value.messages : [])) {
        if (m.deleted) continue;
        const k = keyOf(new Date(m.at));
        if (k !== lastDay) { out.push({ sep: rel(k) === 'Today' ? 'Today' : gFull(k), key: 'sep' + k }); lastDay = k; }
        out.push({ m, key: m.s ? 's' + m.s : 'c' + m.cid });
      }
      return out;
    });
    const older = ref(false), noMore = ref(false);
    async function loadOlder() {
      const c = st.value, first = c && c.messages.find(m => m.s);
      if (!first) return;
      older.value = true;
      try {
        const more = await api('/p/' + id + '/messages?before=' + first.s);
        if (more.length < 60) noMore.value = true;
        const fromEnd = document.documentElement.scrollHeight - window.scrollY; // keep the reader's place
        c.messages.unshift(...more.filter(m => !c.messages.some(x => x.s === m.s)));
        nextTick(() => window.scrollTo(0, document.documentElement.scrollHeight - fromEnd));
      } catch (e) { say(netErr(e)); } finally { older.value = false; }
    }

    // daily question
    const drafts = reactive({}), sending = ref('');
    async function answer(d) {
      const text = (drafts[d.day] || '').trim();
      if (!text) return;
      sending.value = d.day;
      try {
        const r = await api('/p/' + id + '/answer', { day: d.day, text });
        const days = st.value.days, i = days.findIndex(x => x.day === d.day);
        if (i >= 0) days.splice(i, 1, r.day);
        delete drafts[d.day];
        say(r.day.theirs ? 'Here\'s what ' + nm.value + ' said 💌' : 'Sent! You\'ll see ' + nm.value + '\'s answer when they reply');
        Native.vibrate(20);
        refreshMe();
      } catch (e) { say(netErr(e)); } finally { sending.value = ''; }
    }
    const today = computed(() => { const c = st.value; return c && c.days[0] && c.days[0].day === c.todayKey ? c.days[0] : null; });
    const past = computed(() => (st.value ? st.value.days.filter(d => d !== today.value) : []));
    async function decline() { try { await api('/p/' + id + '/decline', {}); await loadPair(id); } catch (e) { say(netErr(e)); } }
    async function accept() {
      const t = p.value.proposal.type;
      try { await api('/p/' + id + '/type', { type: t }); await loadPair(id); say('You\'re now ' + REL[t].l + ' ' + REL[t].e); Native.vibrate(20); } catch (e) { say(netErr(e)); }
    }
    const relOpen = ref(false), leaveAsk = ref(false), blockAsk = ref(false);
    // the time is shared: changing it asks the other person
    async function setTime(t) {
      if (p.value && t === p.value.time && !p.value.timeProposal) return;
      try { await api('/p/' + id + '/time', { time: t, tz: TZ }); await loadPair(id); say('Sent. ' + nm.value + ' needs to accept ' + t); } catch (e) { say(netErr(e)); }
    }
    async function answerTime(yes) {
      try { await api('/p/' + id + '/' + (yes ? 'timeok' : 'timeno'), {}); await loadPair(id); if (yes) say('Daily question at ' + p.value.time + ' for both of you'); } catch (e) { say(netErr(e)); }
    }
    async function block() {
      const h = p.value && p.value.with && p.value.with.handle;
      if (!h) return;
      try { await api('/block', { handle: h }); blockAsk.value = false; relOpen.value = false; delete Soc.chats[id]; await refreshMe(); nav.screen = 'people'; say('@' + h + ' · ' + tr('Blocked')); } catch (e) { say(netErr(e)); }
    }
    async function leave() {
      try { await api('/p/' + id + '/leave', {}); leaveAsk.value = false; delete Soc.chats[id]; await refreshMe(); nav.screen = 'people'; say('Connection removed'); } catch (e) { say(netErr(e)); }
    }
    const tzNote = computed(() => (p.value && p.value.tz !== TZ ? ' (' + p.value.tz + ')' : ''));
    return { answerTime, attachMenu, attachPhoto, attachFile, save, viewerMsg, canFile, fileSize, fileIcon, atBottom, newCount, chatEl, latest, editing, delAsk, startEdit, cancelEdit, askDelete, confirmDelete, pending, viewer, comp, attach, pressStart, pressEnd, srcOf, openPhoto, bgTap, onFocus, canPhoto, Photos, sel, replyTo, flash, tapMsg, reply, react, copyMsg, jump, rxList, REACTS, st, p, meH, nm, tab, draft, box, send, grow, rows, older, noMore, loadOlder, drafts, sending, answer, today, past, decline, accept, relOpen, leaveAsk, setTime, leave, tzNote, retryMsg, id, blockAsk, block };
  },
  template: `<div class="view pair-view" :class="{chatting: tab === 'chat'}" style="--acc:var(--c-people)" @click="bgTap">
    <div class="pair-bar">
    <header class="top sm">
      <button class="icon-btn" @click="nav.screen = 'people'" aria-label="Back"><Ic n="chevron-left" :s="22"/></button>
      <span v-if="p" class="av">{{ p.with.emoji || '🙂' }}</span>
      <div class="grow" v-if="p"><h1 style="font-size:20px" translate="no">{{ nm }}</h1><div class="sub" style="margin-top:1px">{{ p.type ? REL[p.type].e + ' ' + REL[p.type].l : '@' + p.with.handle }}</div></div>
      <button v-if="p" class="icon-btn" @click="relOpen = true" aria-label="Connection settings"><Ic n="settings" :s="19"/></button>
    </header>
      <div v-if="st && p" class="seg pair-tabs"><button :class="{on: tab === 'q'}" @click="tab = 'q'"><Ic n="heart" :s="15"/>Daily question<span v-if="today && !today.mine" class="dot" style="background:var(--c-people)"></span></button>
        <button :class="{on: tab === 'chat'}" @click="tab = 'chat'"><Ic n="messages-square" :s="15"/>Chat<span v-if="p.unread" class="badge">{{ p.unread }}</span></button></div>
    </div>
    <template v-if="st && p">

      <template v-if="tab === 'q'">
        <div v-if="p.timeProposal && p.timeProposal.by !== meH" class="card q-card time-req" style="margin-top:12px">
          <div style="font-size:30px">⏰</div>
          <h3>{{ nm }} wants the daily question at {{ p.timeProposal.time }}</h3>
          <p class="muted">Right now it comes at {{ p.time }}. The time is the same for both of you.</p>
          <div class="btn-row"><button class="btn" @click="answerTime(false)">Keep {{ p.time }}</button><button class="btn primary" @click="answerTime(true)">Accept {{ p.timeProposal.time }}</button></div>
        </div>
        <div v-else-if="p.timeProposal" class="hint" style="margin-top:12px"><Ic n="clock" :s="16"/><span class="grow">Waiting for {{ nm }} to accept {{ p.timeProposal.time }}</span><button class="btn sm" @click="answerTime(false)">Withdraw</button></div>
        <div v-if="p.proposal && p.proposal.by !== meH" class="card q-card" style="margin-top:12px">
          <div style="font-size:34px">{{ REL[p.proposal.type].e }}</div>
          <h3>{{ nm }} says you are {{ REL[p.proposal.type].l }}</h3>
          <p class="muted">Accept and you'll both get a question every day that fits your relationship.</p>
          <div class="btn-row"><button class="btn" @click="decline">Not now</button><button class="btn primary" @click="accept">Accept</button></div>
          <button class="link-btn" style="margin-top:10px" @click="relOpen = true">Choose something else</button>
        </div>
        <div v-else-if="!p.type" class="card q-card" style="margin-top:12px">
          <h3>What are you to each other?</h3>
          <p class="muted" v-if="!p.proposal">Pick one. When {{ nm }} accepts, your first question arrives right away, then a new one every day.</p>
          <p class="muted" v-else>Waiting for {{ nm }} to accept <b>{{ REL[p.proposal.type].l }} {{ REL[p.proposal.type].e }}</b>. You can pick something else.</p>
          <RelPick :p="p" style="margin-top:14px"/>
          <button v-if="p.proposal" class="link-btn" style="margin-top:10px" @click="decline">Withdraw</button>
        </div>

        <template v-if="p.type">
          <div v-if="today" class="card q-card today" style="margin-top:12px">
            <div class="q-head"><span>💬 Today's question</span><span class="muted">{{ p.time }}{{ tzNote }}</span></div>
            <h2 class="q-text" translate="no">{{ qText(today, p.with) }}</h2>
            <template v-if="!today.mine">
              <textarea class="field" v-model="drafts[today.day]" placeholder="Your answer…" maxlength="2000" style="margin-top:14px"></textarea>
              <div class="q-status"><Ic :n="today.theyAnswered ? 'check' : 'lock'" :s="14"/>{{ today.theyAnswered ? nm + ' has answered. Send yours to see it' : 'You\\'ll see ' + nm + '\\'s answer after you send yours' }}</div>
              <button class="btn primary block" style="margin-top:12px" :disabled="!(drafts[today.day] || '').trim() || sending === today.day" @click="answer(today)"><Ic n="send" :s="17"/>Send answer</button>
            </template>
            <div v-else class="answers">
              <div class="ans mine"><small>You</small>{{ today.mine }}</div>
              <div v-if="today.theirs" class="ans theirs"><small translate="no">{{ nm }}</small>{{ today.theirs }}</div>
              <div v-else class="ans waiting"><Ic n="hourglass" :s="15"/>Waiting for {{ nm }}'s answer</div>
            </div>
          </div>
          <div v-else class="card q-card" style="margin-top:12px">
            <h3>Next question at {{ p.time }}{{ tzNote }}</h3>
            <p class="muted">You'll both get a notification. Change the time in settings ⚙️</p>
          </div>

          <template v-if="past.length">
            <div class="label">Earlier</div>
            <div v-for="d in past" :key="d.day" class="card q-card past">
              <div class="q-head"><span>{{ rel(d.day) }}</span></div>
              <div class="q-text sm" translate="no">{{ qText(d, p.with) }}</div>
              <template v-if="!d.mine">
                <textarea class="field" v-model="drafts[d.day]" placeholder="Answer it now…" maxlength="2000" style="margin-top:10px;min-height:64px"></textarea>
                <button class="btn sm primary" style="margin-top:8px" :disabled="!(drafts[d.day] || '').trim() || sending === d.day" @click="answer(d)">Send{{ d.theyAnswered ? ' & see theirs' : '' }}</button>
              </template>
              <div v-else class="answers">
                <div class="ans mine"><small>You</small>{{ d.mine }}</div>
                <div v-if="d.theirs" class="ans theirs"><small translate="no">{{ nm }}</small>{{ d.theirs }}</div>
                <div v-else class="ans waiting">{{ nm }} hasn't answered</div>
              </div>
            </div>
          </template>
        </template>
      </template>

      <template v-else>
        <div class="chat" ref="chatEl">
          <button v-if="st.messages.length >= 60 && !noMore" class="link-btn" style="display:block;margin:6px auto" :disabled="older" @click="loadOlder">{{ older ? 'Loading…' : 'Load earlier messages' }}</button>
          <div v-if="!st.messages.length" class="muted" style="text-align:center;padding:40px 10px">Say hi to {{ nm }} 👋</div>
          <template v-for="r in rows" :key="r.key">
            <div v-if="r.sep" class="chat-sep">{{ r.sep }}</div>
            <template v-else>
            <div class="msg" :id="r.m.s ? 'msg' + r.m.s : null" :class="{me: r.m.by === meH, failed: r.m.failed, picked: sel === r.m.s, flash: flash === r.m.s, reacted: r.m.rx && !r.m.deleted, photo: r.m.media && !r.m.deleted, deleted: r.m.deleted, editing: editing === r.m}"
              @click="tapMsg(r.m)" @pointerdown="pressStart(r.m)" @pointerup="pressEnd" @pointerleave="pressEnd" @pointercancel="pressEnd" @contextmenu.prevent>
              <template v-if="r.m.deleted"><div class="txt gone"><Ic n="x" :s="13"/>Message deleted</div><div class="meta">{{ hm(r.m.at) }}</div></template>
              <template v-else>
              <div v-if="r.m.rq" class="quote" @click.stop="jump(r.m.re)"><b>{{ r.m.rq.by === meH ? 'You' : nm }}</b><span>{{ r.m.rq.text }}</span></div>
              <button v-if="r.m.media && r.m.media.kind === 'file'" class="file-card" @click.stop="r.m.pending || r.m.failed ? null : save(r.m)" :aria-label="'Save ' + r.m.media.name">
                <span class="fi">{{ fileIcon(r.m.media.name, r.m.media.type) }}</span>
                <span class="grow"><b>{{ r.m.media.name }}</b><small>{{ fileSize(r.m.media.size || 0) }}{{ r.m.pending ? ' · uploading…' : r.m.failed ? '' : ' · tap to save' }}</small></span>
                <Ic v-if="!r.m.pending && !r.m.failed" n="download" :s="18"/></button>
              <button v-else-if="r.m.media" class="pic" :style="{aspectRatio: (r.m.media.width || 4) + ' / ' + (r.m.media.height || 3)}" @click.stop="openPhoto(r.m)" aria-label="Open photo">
                <img v-if="srcOf(r.m)" :src="srcOf(r.m)" alt="" draggable="false">
                <span v-else class="pic-wait"><Ic :n="Photos[r.m.media.fid] === 'error' ? 'circle-alert' : 'image'" :s="24"/></span>
                <span v-if="r.m.pending" class="pic-up"><Ic n="clock" :s="16"/></span></button>
              <div v-if="r.m.text" class="txt" translate="no">{{ r.m.text }}</div>
              <div class="meta">{{ r.m.failed ? 'Not sent · tap to retry' : (r.m.edited ? 'edited · ' : '') + hm(r.m.at) }}
                <template v-if="r.m.by === meH && !r.m.failed"><Ic v-if="r.m.pending" n="clock" :s="12"/><Ic v-else :n="st.theirRead >= r.m.s ? 'check-check' : 'check'" :s="13" :class="{seen: st.theirRead >= r.m.s}"/></template></div>
              <div v-if="r.m.rx" class="rx" @click.stop="sel = r.m.s"><span v-for="x in rxList(r.m)" :key="x.h" :class="{mine: x.mine}">{{ x.e }}</span></div>
              </template>
            </div>
            <div v-if="sel === r.m.s" class="msg-tools" :class="{me: r.m.by === meH}">
              <button v-for="e in REACTS" :key="e" class="rx-btn" :class="{on: r.m.rx && r.m.rx[meH] === e}" @click="react(r.m, e)">{{ e }}</button>
              <span class="sep"></span>
              <button class="tool" @click="reply(r.m)" aria-label="Reply"><Ic n="reply" :s="17"/></button>
              <button v-if="r.m.text" class="tool" @click="copyMsg(r.m)" aria-label="Copy"><Ic n="copy" :s="16"/></button>
              <button v-if="r.m.media && r.m.s" class="tool" @click="save(r.m)" aria-label="Save to phone"><Ic n="download" :s="16"/></button>
              <template v-if="r.m.by === meH">
                <button class="tool" @click="startEdit(r.m)" aria-label="Edit"><Ic n="pencil" :s="16"/></button>
                <button class="tool danger" @click="askDelete(r.m)" aria-label="Delete"><Ic n="trash-2" :s="16"/></button>
              </template>
            </div>
            </template>
          </template>
        </div>
        <Transition name="fade"><button v-if="!atBottom && st.messages.length" class="jump-latest" @click="latest" aria-label="Go to the latest message">
          <Ic n="chevron-down" :s="22"/><span v-if="newCount" class="badge unread">{{ newCount }}</span></button></Transition>
        <div class="composer" ref="comp">
          <div v-if="editing" class="reply-bar"><Ic n="pencil" :s="15"/><div class="grow"><b>Editing</b><span>{{ editing.text || '📷 Photo caption' }}</span></div>
            <button @pointerdown.prevent @mousedown.prevent @click="cancelEdit" aria-label="Cancel editing"><Ic n="x" :s="16"/></button></div>
          <div v-if="replyTo" class="reply-bar"><Ic n="reply" :s="15"/><div class="grow"><b>{{ replyTo.by === meH ? 'You' : nm }}</b><span>{{ replyTo.text || '📷 Photo' }}</span></div>
            <button @pointerdown.prevent @mousedown.prevent @click="replyTo = null" aria-label="Cancel reply"><Ic n="x" :s="16"/></button></div>
          <div v-if="pending" class="attach-bar"><img :src="pending.url" alt=""><span class="grow">Photo ready · add a caption or send</span>
            <button @pointerdown.prevent @mousedown.prevent @click="pending = null" aria-label="Remove photo"><Ic n="x" :s="16"/></button></div>
          <button v-if="(canPhoto || canFile) && !editing" class="attach" @pointerdown.prevent @mousedown.prevent @click="attach" aria-label="Attach a photo or file"><Ic :n="canFile ? 'paperclip' : 'image'" :s="21"/></button>
          <textarea ref="box" v-model="draft" rows="1" :placeholder="pending ? 'Add a caption…' : 'Message'" maxlength="2000" @input="grow" @focus="onFocus" @keydown.enter.exact="!IOS && !Native.has && ($event.preventDefault(), send())"></textarea>
          <button class="send" :disabled="editing ? !draft.trim() && !editing.media : !draft.trim() && !pending" @pointerdown.prevent @mousedown.prevent @click="send" :aria-label="editing ? 'Save' : 'Send'"><Ic :n="editing ? 'check' : 'send'" :s="19"/></button>
        </div>
        <Teleport to="body"><Transition name="fade"><div v-if="viewer" class="viewer" @click="viewer = null"><img :src="viewer" alt=""><button class="close" aria-label="Close"><Ic n="x" :s="22"/></button>
          <button v-if="viewerMsg && viewerMsg.s" class="save" @click.stop="save(viewerMsg)"><Ic n="download" :s="19"/>Save</button></div></Transition></Teleport>
      </template>
    </template>
    <div v-else class="card" style="margin-top:12px"><Empty e="⏳" t="Loading…" s=""/></div>

    <Sheet :open="relOpen" title="Connection" @close="relOpen = false">
      <div v-if="p" style="--acc:var(--c-people)">
        <span class="flabel" style="margin-top:2px">What are you to each other?</span>
        <RelPick :p="p" @done="relOpen = false"/>
        <div class="muted" style="font-size:12.5px;margin:8px 2px 0">{{ p.proposal ? (p.proposal.by === meH ? 'Waiting for ' + nm + ' to accept ' + REL[p.proposal.type].l : nm + ' suggested ' + REL[p.proposal.type].l) : 'Changes need ' + nm + ' to accept.' }}</div>
        <div class="settings-group" style="box-shadow:none;margin-top:16px">
          <div class="list-row"><div class="grow"><div class="t">Daily question time</div><div class="s">{{ p.timeProposal ? (p.timeProposal.by === meH ? 'Waiting for ' + nm + ' to accept ' + p.timeProposal.time : nm + ' asked for ' + p.timeProposal.time) : 'The same for both of you. Changes need ' + nm + ' to accept' }}{{ tzNote }}</div></div>
            <TimeChip :model-value="p.time" @update:model-value="setTime" title="Daily question time"/></div>
        </div>
        <button class="btn danger block" style="margin-top:18px" @click="leaveAsk = true">Remove {{ nm }}</button>
        <button class="link-btn" style="margin-top:10px;color:var(--c-danger)" @click="blockAsk = true"><span>Block</span> <span translate="no">{{ nm }}</span></button>
      </div>
    </Sheet>
    <Sheet :open="attachMenu" title="Send" @close="attachMenu = false">
      <div class="attach-menu">
        <button @click="attachPhoto"><span class="bubble" style="--c:var(--c-people)"><Ic n="image" :s="20"/></span><b>Photo</b><small>From your gallery</small></button>
        <button @click="attachFile"><span class="bubble" style="--c:var(--c-tasks)"><Ic n="paperclip" :s="20"/></span><b>File</b><small>Any file up to 15 MB</small></button>
      </div>
    </Sheet>
    <Sheet :open="!!delAsk" title="Delete message?" @close="delAsk = null">
      <p class="muted">It will be removed for both of you{{ delAsk && delAsk.media ? ', photo included' : '' }}.</p>
      <div class="btn-row"><button class="btn" @click="delAsk = null">Cancel</button><button class="btn" style="background:var(--c-danger);color:#fff" @click="confirmDelete">Delete</button></div>
    </Sheet>
    <Sheet :open="blockAsk" title="Block this person?" @close="blockAsk = false">
      <p class="muted">Your connection and chat end for both of you. They can't find you or send you requests, and they aren't told. You can unblock them in People settings.</p>
      <div class="btn-row"><button class="btn" @click="blockAsk = false">Cancel</button><button class="btn" style="background:var(--c-danger);color:#fff" @click="block">Block</button></div>
    </Sheet>
    <Sheet :open="leaveAsk" title="Remove connection?" @close="leaveAsk = false">
      <p class="muted">Your chat and all your answers with {{ nm }} will be deleted for both of you.</p>
      <div class="btn-row"><button class="btn" @click="leaveAsk = false">Cancel</button><button class="btn" style="background:var(--c-danger);color:#fff" @click="leave">Remove</button></div>
    </Sheet>
  </div>`,
};
