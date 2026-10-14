# Orbit

Your whole day in one place: tasks, habits, money, notes, focus timer, water, mood, countdowns, a cycle tracker and People
(chat plus a shared daily question). English UI with Shamsi (Jalali) dates and Toman. Everything except People is fully
offline and stays on the device.

- **iPhone / web:** https://aliyeganegi.github.io/orbit/ → open in Safari → Share → *Add to Home Screen*
- **Android:** native APK (WebView shell with notifications and haptics)

## Layout

| Path | What |
|---|---|
| `web/` | The app UI (Vue 3, no bundler) plus PWA manifest, service worker and icons. Deployed to GitHub Pages on push. |
| `android/` | Android shell: `src/` Java (WebView + JS bridge), `res/` icon and theme, `build.sh` Gradle-free build. |

## People: connections, chat, daily question

Everyone picks an ID (`@handle`); others search that exact ID to send a connection request. Connected people chat, and
choose together what they are to each other (friends, best friends, dating, engaged, married, family): one proposes, the
other accepts. From then on both get one question a day from `web/questions.js` (pools per relationship type, light
questions first, deeper ones later, no repeats). Each answers privately and only sees the other's answer after sending
their own. The first question arrives as soon as the type is agreed; after that, every day at the pair's chosen time.

- **Server:** `push/src/social.js`, in the same Worker. One Durable Object per user (profile, requests, event log, live
  WebSocket, Web Push) and one per pair (messages, type, questions, and the alarm that asks the daily question).
  The app keeps only a login key (`orbit.social` in localStorage); People → settings can copy it to sign in on another phone.
- **Live:** while the app is open, events arrive over a WebSocket (`/s/ws`).
- **iPhone:** the reminder Web Push subscription is reused, so messages and questions arrive as push.
- **Android:** the daily question is an exact local alarm (it's part of the reminder plan); messages, requests and
  answers come from `SocialPoll`, a background job that checks the server about every 15 minutes.

## Android build

Needs JDK 17 and Android SDK `platforms;android-34` + `build-tools;34.0.0`.

```sh
cd android
VERSION_CODE=3 VERSION_NAME=1.2 ./build.sh
adb install -r build/Orbit.apk
```

Keep the signing key (`~/.android/orbit.keystore`); a different key forces an uninstall, which erases app data.

## Updating the iPhone version

Edit `web/`, bump `VERSION` in `web/sw.js`, push to `main`. Installed iPhones pick up the update after the app is reopened.

## Reminders & notifications

One reminder plan is derived from app data (task reminders, water rule, focus timer, cycle alerts) and handed to the platform's deliverer:

- **Android:** `android/src/me/ali/orbit/Scheduler.java` diffs the plan against what's armed and uses exact `AlarmManager` alarms. Water is a rule (only the next slot is armed, the following one is computed when it fires). Notification channels per type, action buttons (+1 glass, Done, Snooze 10 min), re-armed after reboot / time change / update.
- **iPhone (PWA):** `push/` is a Cloudflare Worker with one Durable Object per device holding the subscription, the one-shot reminders and the water rule; a storage alarm fires at the exact due time and sends Web Push (VAPID + aes128gcm). Reminder texts are AES-GCM encrypted on the phone and decrypted by `web/sw.js`, so the server only knows *when*.
- `web/schedule.js` is the single water-rule implementation shared by the app, service worker and server.

```sh
cd push && npm install && npm test   # crypto, scheduling, delivery and People end-to-end tests (local wrangler)
npx wrangler deploy                  # needs VAPID_PRIVATE_JWK secret: npx wrangler secret put VAPID_PRIVATE_JWK
```

UI smoke test (every screen and sheet): `node tests/smoke.cjs http://127.0.0.1:8766/` with `web/` served locally.
People UI test (two phones, signup to chat): `node tests/people.cjs http://127.0.0.1:8766/ http://127.0.0.1:8797` with the
worker running locally (`npx wrangler dev --port 8797`, `ALLOWED_ORIGINS=http://127.0.0.1:8766` in `push/.dev.vars`).
