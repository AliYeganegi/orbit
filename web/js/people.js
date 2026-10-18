/* People: account, connections, chat, daily question, live socket and background checks. */
/* ================= people: connections, chat, daily question ================= */
// The one part of Orbit that can't live only on this phone: accounts, messages and answers are kept on
// the Orbit server (push/src/social.js) so both people see them. The login key never leaves this phone.
const SOC_KEY = 'orbit.social';
const REL = Object.fromEntries(OrbitQuestions.TYPES.map(t => [t.id, t]));
const Soc = reactive({
  acct: (() => { try { return JSON.parse(localStorage.getItem(SOC_KEY)) || null; } catch (e) { return null; } })(), // { handle, token, seen }
  me: null, chats: {}, open: null, online: false,
});
const saveSoc = () => { try { Soc.acct ? localStorage.setItem(SOC_KEY, JSON.stringify(Soc.acct)) : localStorage.removeItem(SOC_KEY); } catch (e) {} };
const socPairs = computed(() => (Soc.me ? Soc.me.pairs : []));
const pairOf = id => socPairs.value.find(p => p.id === id);
const whoName = w => (w && (w.name || '@' + w.handle)) || '';
/** A day's question in this phone's language (the server sends English plus the question's id). */
function qText(d, w) {
  const fa = FA && d && (d.qfa || (d.qid && OrbitQuestions.faById(d.qid)));
  if (!fa) return d ? d.q : '';
  const first = (w && w.name ? w.name.trim().split(/\s+/)[0] : '') || (w ? '@' + w.handle : '');
  return fa.replace(/\{them\}/g, first);
}
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
/** What needs this person's attention: requests, questions waiting for an answer, unread messages. */
const socTodo = computed(() => {
  if (!Soc.me) return { reqs: 0, questions: [], unread: 0, total: 0 };
  const reqs = Object.keys(Soc.me.inReq).length;
  const questions = socPairs.value.filter(p => p.today && !p.today.mine && p.today.day === p.todayKey);
  const proposals = socPairs.value.filter(p => (p.proposal && p.proposal.by !== Soc.me.handle) || (p.timeProposal && p.timeProposal.by !== Soc.me.handle)).length;
  const unread = socPairs.value.reduce((n, p) => n + (p.unread || 0), 0);
  return { reqs, questions, unread, proposals, total: reqs + questions.length + unread + proposals };
});

async function api(path, body, method) {
  const headers = { 'Content-Type': 'application/json' };
  if (Soc.acct) headers.Authorization = 'Bearer ' + Soc.acct.token;
  const res = await fetch(PUSH_URL + '/s' + path, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong'); e.status = res.status; throw e; }
  return data;
}
const netErr = e => (e && e.status ? e.message : 'Couldn\'t reach Orbit. Check your connection');

/** Tells the Android shell who is signed in, so its background check can fetch new messages. */
function socNative() {
  try { if (AN && AN.socialAuth) AN.socialAuth(Soc.acct ? PUSH_URL : '', Soc.acct ? Soc.acct.token : '', Soc.acct ? Soc.acct.seen || 0 : 0); } catch (e) {}
}
function socSeen(seq) {
  if (!Soc.acct || !(seq > (Soc.acct.seen || 0))) return;
  Soc.acct.seen = seq; saveSoc();
  try { if (AN && AN.socialSeen) AN.socialSeen(seq); } catch (e) {}
}
async function socStart(acct) {
  Soc.acct = { ...acct, seen: 0 }; saveSoc();
  await refreshMe();
  socNative(); socConnect(); socPushSync();
}
/* the People list and recent chats are kept on the phone, so they show instantly and refresh in the background */
const CHAT_KEY = 'orbit.chatcache';
function loadChatCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CHAT_KEY));
    if (c && Soc.acct && c.handle === Soc.acct.handle) { Soc.me = c.me || null; Soc.chats = c.chats || {}; }
  } catch (e) {}
}
function saveChatCache() {
  try {
    if (!Soc.acct) { localStorage.removeItem(CHAT_KEY); return; }
    const chats = {};
    for (const [k, c] of Object.entries(Soc.chats)) {
      if (!c || !c.messages) continue;
      const messages = c.messages.filter(m => m.s).slice(-60).map(({ _photo, ...m }) => (m.media && m.media.local ? { ...m, media: { ...m.media, local: undefined } } : m));
      chats[k] = { ...c, messages, days: (c.days || []).slice(0, 30) };
    }
    localStorage.setItem(CHAT_KEY, JSON.stringify({ handle: Soc.acct.handle, me: Soc.me, chats }));
  } catch (e) {}
}
watch(() => [S.settings.notify.chat, S.settings.notify.question], ([chat, question]) => {
  if (Soc.acct) api('/me', { notify: { chat: chat !== false, question: question !== false } }).catch(() => {});
});
let chatSaveT;
watch(() => [Soc.me, Soc.chats], () => { clearTimeout(chatSaveT); chatSaveT = setTimeout(saveChatCache, 800); }, { deep: true });

function socSignOut(msg) {
  try { sock && sock.close(); } catch (e) {}
  Soc.acct = null; Soc.me = null; Soc.chats = {}; Soc.open = null; saveSoc(); socNative();
  try { localStorage.removeItem(CHAT_KEY); caches.delete(PHOTO_CACHE); } catch (e) {}
  if (nav.screen === 'pair') nav.screen = 'people';
  if (msg) say(msg);
}
async function refreshMe() {
  if (!Soc.acct) return;
  try {
    const me = await api('/me');
    Soc.me = me;
    if (me.seq > (Soc.acct.seen || 0)) socSeen(me.seq); // the app is looking at everything now
  } catch (e) { if (e.status === 401) socSignOut('You were signed out of People'); }
}
function mergeSummary(st) {
  if (!Soc.me) return;
  const { messages, days, ...sum } = st;
  const i = Soc.me.pairs.findIndex(p => p.id === st.id);
  if (i >= 0) Soc.me.pairs[i] = sum; else Soc.me.pairs.push(sum);
}
async function loadPair(id) {
  try {
    const st = await api('/p/' + id + '/state');
    const old = Soc.chats[id];
    if (old) st.messages.push(...old.messages.filter(m => !m.s)); // keep messages that are still sending
    Soc.chats[id] = st; mergeSummary(st);
    return st;
  } catch (e) {
    if (e.status === 404) { delete Soc.chats[id]; refreshMe(); if (Soc.open === id && nav.screen === 'pair') { nav.screen = 'people'; say('This connection has ended'); } }
    else say(netErr(e));
    return null;
  }
}
let readTimer;
function markRead(id) {
  const c = Soc.chats[id], p = pairOf(id);
  if (p) p.unread = 0;
  const last = c && [...c.messages].reverse().find(m => m.s && !m.pending);
  if (!last) return;
  clearTimeout(readTimer);
  readTimer = setTimeout(() => api('/p/' + id + '/read', { seq: last.s }).catch(() => {}), 400);
}
const mediaLabel = m => (m && m.media ? (m.media.kind === 'file' ? '📎 ' + m.media.name : '📷 Photo') : '');
async function sendMsg(id, text, reply, photo, file) {
  const c = Soc.chats[id];
  if (!c || (!text.trim() && !photo && !file)) return;
  const cid = uid(), re = reply && reply.s ? { re: reply.s, rq: { by: reply.by, text: clip(reply.text || mediaLabel(reply) || '📷 Photo', 140) } } : {};
  if (file) {
    c.messages.push({ by: Soc.acct.handle, text: '', at: Date.now(), cid, pending: true, ...re, media: { kind: 'file', name: file.name, size: file.size, type: file.type }, _file: file });
    try {
      const res = await fetch(PUSH_URL + '/s/p/' + id + '/upload?name=' + encodeURIComponent(file.name), { method: 'POST', headers: { Authorization: 'Bearer ' + Soc.acct.token, 'Content-Type': file.type || 'application/octet-stream' }, body: file.blob });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(d.error || 'The file didn\'t upload'); e.status = res.status; throw e; }
      const m = await api('/p/' + id + '/send', { text: '', cid, re: re.re, media: { fid: d.fid } });
      const i = c.messages.findIndex(x => x.cid === cid && !x.s);
      if (c.messages.some(x => x.s === m.s)) { if (i >= 0) c.messages.splice(i, 1); } else if (i >= 0) c.messages.splice(i, 1, m); else c.messages.push(m);
      const p = pairOf(id); if (p) p.last = m;
    } catch (e) { const x = c.messages.find(x => x.cid === cid && !x.s); if (x) { x.pending = false; x.failed = true; } say(netErr(e)); }
    return;
  }
  const local = photo ? URL.createObjectURL(photo.blob) : null;
  c.messages.push({ by: Soc.acct.handle, text: text.trim(), at: Date.now(), cid, pending: true, ...re,
    ...(photo ? { media: { local, width: photo.width, height: photo.height }, _photo: photo } : {}) });
  try {
    let media;
    if (photo) {
      const res = await fetch(PUSH_URL + '/s/p/' + id + '/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + Soc.acct.token, 'Content-Type': 'image/jpeg' }, body: photo.blob });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(d.error || 'The photo didn\'t upload'); e.status = res.status; throw e; }
      media = { fid: d.fid, width: photo.width, height: photo.height };
      Photos[d.fid] = local; // no need to download what we just sent
      keepPhoto(d.fid, photo.blob);
    }
    const m = await api('/p/' + id + '/send', { text: text.trim(), cid, re: re.re, media });
    const i = c.messages.findIndex(x => x.cid === cid && !x.s);
    if (c.messages.some(x => x.s === m.s)) { if (i >= 0) c.messages.splice(i, 1); } // the live event got here first
    else if (i >= 0) c.messages.splice(i, 1, m); else c.messages.push(m);
    const p = pairOf(id); if (p) p.last = m;
  } catch (e) {
    const x = c.messages.find(x => x.cid === cid && !x.s);
    if (x) { x.pending = false; x.failed = true; }
    say(netErr(e));
  }
}
function retryMsg(id, m) {
  const c = Soc.chats[id], i = c.messages.indexOf(m);
  if (i >= 0) c.messages.splice(i, 1);
  sendMsg(id, m.text, m.re ? { s: m.re, ...m.rq } : null, m._photo, m._file);
}

/* photos: resized on the phone before upload; loaded with the login key, since only the two members may see them */
const Photos = reactive({}); // fid -> object URL | 'loading' | 'error'
const PHOTO_CACHE = 'orbit-photos';
const photoKey = fid => 'https://orbit.photos/' + fid; // just a name in the phone's cache, never fetched
async function photoCache() { try { return await caches.open(PHOTO_CACHE); } catch (e) { return null; } }
async function keepPhoto(fid, blob) { const c = await photoCache(); if (c) c.put(photoKey(fid), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })).catch(() => {}); }
async function forgetPhoto(fid) { const c = await photoCache(); if (c) c.delete(photoKey(fid)).catch(() => {}); }
async function loadPhoto(pid, fid) {
  if (Photos[fid]) return;
  Photos[fid] = 'loading';
  try {
    const c = await photoCache(), hit = c && await c.match(photoKey(fid));
    let blob = hit ? await hit.blob() : null;
    if (!blob) {
      const res = await fetch(PUSH_URL + '/s/p/' + pid + '/file/' + fid, { headers: { Authorization: 'Bearer ' + Soc.acct.token } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      blob = await res.blob();
      keepPhoto(fid, blob);
    }
    Photos[fid] = URL.createObjectURL(blob);
  } catch (e) { Photos[fid] = 'error'; }
}
const canPhoto = !AN || !!AN.pickPhoto; // Android needs app 1.12 for the photo picker
const canFile = !AN || !!AN.pickFile;   // and 1.16 for files
const fileSize = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
const fileIcon = (name, type) => { const x = String(name).toLowerCase(); return /\.(pdf)$/.test(x) ? '📕' : /\.(docx?|odt|txt|rtf)$/.test(x) ? '📝' : /\.(xlsx?|csv)$/.test(x) ? '📊' : /\.(zip|rar|7z)$/.test(x) ? '🗜️' : /^audio|\.(mp3|m4a|ogg|wav)$/.test(type + x) ? '🎵' : /^video|\.(mp4|mov|mkv)$/.test(type + x) ? '🎬' : /^image/.test(type) ? '🖼️' : '📄'; };
/** Lets the person pick any file from the phone (the browser's picker; Android uploads natively, see sendFileNative). */
function pickAnyFile() {
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = () => { const f = inp.files[0]; inp.remove(); res(f ? { blob: f, name: f.name, size: f.size, type: f.type || 'application/octet-stream' } : null); };
    inp.click();
  });
}
/** Android: the file is picked and uploaded by the app itself, then sent as a message. */
let fileWait = null;
window.orbitFile = r => { if (fileWait) fileWait(r); };
function sendFileNative(id) {
  const c = Soc.chats[id], cid = uid();
  fileWait = async r => {
    if (!r) { fileWait = null; return; }
    if (r.stage === 'picked') { c.messages.push({ by: Soc.acct.handle, text: '', at: Date.now(), cid, pending: true, media: { kind: 'file', name: r.name, size: r.size, type: r.type } }); return; }
    fileWait = null;
    const i = c.messages.findIndex(x => x.cid === cid && !x.s);
    if (r.error) { if (i >= 0) c.messages.splice(i, 1); say(r.error); return; }
    try {
      const m = await api('/p/' + id + '/send', { text: '', cid, media: { fid: r.fid } });
      const j = c.messages.findIndex(x => x.cid === cid && !x.s);
      if (c.messages.some(x => x.s === m.s)) { if (j >= 0) c.messages.splice(j, 1); } else if (j >= 0) c.messages.splice(j, 1, m); else c.messages.push(m);
      const p = pairOf(id); if (p) p.last = m;
    } catch (e) { const j = c.messages.findIndex(x => x.cid === cid && !x.s); if (j >= 0) c.messages.splice(j, 1); say(netErr(e)); }
  };
  AN.pickFile(PUSH_URL + '/s/p/' + id + '/upload', Soc.acct.token);
}
/* saving a photo or file to the phone */
window.orbitSaved = msg => say(msg.replace(/^!/, ''));
async function saveMedia(id, m) {
  const f = m.media, isFile = f.kind === 'file';
  const name = isFile ? f.name : 'orbit-' + f.fid.slice(0, 8) + '.jpg', mime = isFile ? (f.type || 'application/octet-stream') : 'image/jpeg';
  if (AN && AN.saveFile) { say('Saving…'); AN.saveFile(PUSH_URL + '/s/p/' + id + '/file/' + f.fid, Soc.acct.token, name, mime); return; }
  try {
    let blob;
    const c = !isFile && await photoCache(), hit = c && await c.match(photoKey(f.fid));
    if (hit) blob = await hit.blob();
    else { const res = await fetch(PUSH_URL + '/s/p/' + id + '/file/' + f.fid, { headers: { Authorization: 'Bearer ' + Soc.acct.token } }); if (!res.ok) throw new Error(); blob = await res.blob(); }
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }).catch(() => {}); return; } // iPhone: "Save Image" / "Save to Files"
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { say('Couldn\'t save it'); }
}
let photoWait = null;
window.orbitPhoto = r => { const f = photoWait; photoWait = null; if (f) f(r); };
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file); // applies the photo's EXIF rotation
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return { blob: await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82)), width: w, height: h };
}
/** Lets the person pick a photo: Android's system picker (resized natively), or the browser's file picker. */
function pickPhoto() {
  if (AN && AN.pickPhoto) {
    return new Promise(res => { photoWait = res; AN.pickPhoto(); }).then(r => {
      if (!r) return null;
      if (r.error) { say('Couldn\'t open that photo'); return null; }
      const bin = atob(r.data), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return { blob: new Blob([u8], { type: 'image/jpeg' }), width: r.width, height: r.height };
    });
  }
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files[0]; inp.remove();
      if (!f) return res(null);
      try { res(await shrinkPhoto(f)); } catch (e) { say('Couldn\'t open that photo'); res(null); }
    };
    inp.click();
  });
}
/** Edits your own message; the change shows right away and is undone if the server says no. */
async function editMsg(id, m, text) {
  const before = { text: m.text, edited: m.edited };
  m.text = text.trim(); m.edited = Date.now();
  try { await api('/p/' + id + '/edit', { s: m.s, text: m.text }); }
  catch (e) { Object.assign(m, before); say(netErr(e)); }
}
/** Deletes your own message for both of you. */
async function deleteMsg(id, m) {
  const c = Soc.chats[id], i = c.messages.indexOf(m);
  if (i < 0) return;
  c.messages.splice(i, 1);
  const p = pairOf(id);
  if (p && p.last && p.last.s === m.s) p.last = [...c.messages].reverse().find(x => x.s && !x.deleted) || null;
  try { await api('/p/' + id + '/delete', { s: m.s }); if (m.media && m.media.fid) forgetPhoto(m.media.fid); }
  catch (e) { c.messages.splice(Math.min(i, c.messages.length), 0, m); say(netErr(e)); }
}
const REACTS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
/** Toggles your reaction on a message (tapping the same emoji again removes it). */
async function reactMsg(id, m, emoji) {
  const me = Soc.acct.handle, before = m.rx ? { ...m.rx } : null;
  const next = { ...(m.rx || {}) };
  if (next[me] === emoji) delete next[me]; else next[me] = emoji;
  m.rx = Object.keys(next).length ? next : null;
  Native.vibrate(10);
  try { await api('/p/' + id + '/react', { s: m.s, emoji: next[me] || '' }); }
  catch (e) { m.rx = before; say(netErr(e)); }
}

/* live updates while the app is open */
let sock = null, sockRetry, sockPing;
function socConnect() {
  if (!Soc.acct || sock || document.hidden) return;
  let s;
  try { s = new WebSocket(PUSH_URL.replace(/^http/, 'ws') + '/s/ws?t=' + encodeURIComponent(Soc.acct.token)); } catch (e) { return; }
  sock = s;
  s.onopen = () => { Soc.online = true; sockPing = setInterval(() => { if (s.readyState === 1) s.send('ping'); }, 25e3); refreshMe(); if (Soc.open && Soc.chats[Soc.open]) loadPair(Soc.open); };
  s.onmessage = e => { try { const d = JSON.parse(e.data); if (d.t === 'ev') onSocEvent(d.ev); } catch (err) {} };
  s.onclose = () => {
    clearInterval(sockPing); Soc.online = false;
    if (sock === s) sock = null;
    clearTimeout(sockRetry);
    if (Soc.acct && !document.hidden) sockRetry = setTimeout(socConnect, 5000);
  };
}
function onSocEvent(ev) {
  socSeen(ev.seq);
  const p = ev.pair ? pairOf(ev.pair) : null, c = ev.pair ? Soc.chats[ev.pair] : null;
  const viewing = nav.screen === 'pair' && Soc.open === ev.pair && !document.hidden;
  if (ev.t === 'msg') {
    if (c && !c.messages.some(m => m.s === ev.m.s)) {
      const i = c.messages.findIndex(m => ev.m.cid && m.cid === ev.m.cid && !m.s);
      if (i >= 0) c.messages.splice(i, 1, ev.m); else c.messages.push(ev.m);
    }
    if (ev.m.by !== Soc.acct.handle) { // replying means they've read everything before it
      if (p) p.theirRead = Math.max(p.theirRead || 0, ev.m.s);
      if (c) c.theirRead = Math.max(c.theirRead || 0, ev.m.s);
    }
    if (p) {
      p.last = ev.m;
      if (ev.m.by !== Soc.acct.handle) { if (viewing) markRead(ev.pair); else p.unread = (p.unread || 0) + 1; }
    }
    if (ev.n && !viewing) { say(ev.n.title + ': ' + clip(ev.n.body, 60)); Native.vibrate(20); }
    return;
  }
  if (ev.t === 'read') { if (p) p.theirRead = ev.upto; if (c) c.theirRead = ev.upto; return; }
  if (ev.t === 'edit' || ev.t === 'del') {
    const i = c ? c.messages.findIndex(x => x.s === (ev.m ? ev.m.s : ev.s)) : -1;
    if (ev.t === 'del') {
      if (i >= 0) { const m = c.messages[i]; if (m.media && m.media.fid) forgetPhoto(m.media.fid); c.messages.splice(i, 1); }
      if (p && p.last && p.last.s === ev.s) p.last = c ? [...c.messages].reverse().find(m => m.s && !m.deleted) || null : null;
      return;
    }
    if (i >= 0) c.messages.splice(i, 1, { ...ev.m, rx: c.messages[i].rx });
    if (p && p.last && p.last.s === ev.m.s) p.last = ev.m;
    return;
  }
  if (ev.t === 'react') {
    const m = c && c.messages.find(x => x.s === ev.s);
    if (m) m.rx = ev.rx;
    if (ev.n && !viewing) say(ev.n.title + ': ' + clip(ev.n.body.replace(/^To: /, ''), 50));
    return;
  }
  if (ev.t === 'gone') {
    delete Soc.chats[ev.pair];
    if (viewing) { nav.screen = 'people'; say('This connection has ended'); }
    refreshMe(); return;
  }
  if (ev.n && !viewing) say(ev.n.title);
  refreshMe();
  if (c) loadPair(ev.pair);
}
function socResume() {
  if (!Soc.acct) return;
  refreshMe();
  if (Soc.open && Soc.chats[Soc.open]) loadPair(Soc.open);
  socConnect();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(sockRetry); try { sock && sock.close(); } catch (e) {} } // closed app = push, not socket
  else socResume();
});

/** iPhone: the same Web Push subscription that delivers reminders also delivers messages. */
async function socPushSync() {
  if (!Soc.acct || Native.has || !PUSH_SUPPORTED || Notification.permission !== 'granted') return;
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await api('/me', { sub: sub.toJSON(), tz: TZ }); if (Soc.me) Soc.me.push = true; }
  } catch (e) {}
}
