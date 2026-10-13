// Orbit service worker: offline cache + push notifications.
// Bump VERSION whenever any app file changes so installed phones pick up the update.
const VERSION = 'orbit-v5';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'vue.js', 'icons.js', 'schedule.js', 'sms.js', 'inter.woff2', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cache first so the app opens instantly offline; refresh the cache in the background.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

/* ---------- push ---------- */
// The server only relays an encrypted blob; the text is opened here with the key the app stored.
function idbGet(key) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('orbit', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const q = r.result.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    };
  });
}
const b64dec = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function unseal(c) {
  const key = await idbGet('key');
  const raw = b64dec(c);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

async function show(msg) {
  let title = 'Orbit', body = '', go = '';
  if (msg.k === 'water') {
    const w = await idbGet('water').catch(() => null);
    const count = w && w.day === today() ? w.count : 0, goal = w ? w.goal : 8;
    title = '💧 Time for some water';
    body = count >= goal ? 'Goal reached today 🎉 Keep sipping if you like' : count ? count + ' of ' + goal + ' glasses so far today' : 'No water logged yet today';
    go = 'water';
  } else if (msg.k === 'test') {
    title = '🔔 Orbit test'; body = 'Notifications work!'; go = 'alerts';
  } else if (msg.c) {
    try { ({ title, body, go } = await unseal(msg.c)); } catch (e) { title = 'Orbit reminder'; body = 'Open Orbit to see it'; }
  }
  return self.registration.showNotification(title, {
    body, tag: msg.id || 'orbit', renotify: true, icon: 'icon-192.png', badge: 'icon-192.png',
    data: { go }, timestamp: msg.at || Date.now(),
  });
}

self.addEventListener('push', e => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(show(msg)); // iOS requires a visible notification for every push
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const go = (e.notification.data && e.notification.data.go) || '';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { c.postMessage({ go }); if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./' + (go ? '?go=' + go : ''));
  })());
});
