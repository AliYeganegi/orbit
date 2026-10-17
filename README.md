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
  answers come from `SocialPoll`, which checks the server about every 90 seconds after People was used or a message
  arrived, every 5 minutes for the next hour, then every 15 minutes (Android may delay any of these; nothing is
  fetched while the app is open).
- **Safety:** blocking, sign out other phones (new login key), rate limits. Server API changes: `docs/API.md`.

## Android build

Needs JDK 17 and Android SDK `platforms;android-34` + `build-tools;34.0.0`.

```sh
cd android
VERSION_CODE=3 VERSION_NAME=1.2 ./build.sh
adb install -r build/Orbit.apk
```

Keep the signing key (`~/.android/orbit.keystore`); a different key forces an uninstall, which erases app data.

### Android updates without reinstalling

From 1.11 the Android app updates itself like the iPhone version:

- **Screens (almost every change):** after editing `web/`, run `node tools/release.mjs` and push. The app downloads
  the new files in the background (only the ones that changed), checks each against the signed manifest, and uses them
  from the next launch. App data is untouched.
- **New APK (native changes: Java, permissions, manifest):** build it with a higher `VERSION_CODE`, attach it to a
  GitHub release, then announce it:
  `node tools/release.mjs --apk android/build/Orbit.apk --code 22 --name 1.12 --url https://github.com/AliYeganegi/orbit/releases/download/v1.12/Orbit-1.12.apk`.
  The app shows "Orbit 1.12 is available"; one tap downloads it, checks its hash and opens Android's installer.
- If new screens need new native features, pass `--min-native <versionCode>`: older APKs keep their screens until updated.

Updates are only accepted when `web/update/manifest.json` is signed with `~/.config/orbit/update-key.pem` (P-256,
public half in `WebUpdate.java`). Keep that key private and backed up; without it no update can reach the app.

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

## Tests

Serve `web/` locally (`cd web && python3 -m http.server 8766 --bind 127.0.0.1`), then with Playwright available
(`PW=$(npm root -g)/@playwright/mcp/node_modules` or a local `playwright` install) and Chrome at `/usr/bin/google-chrome`
(or `CHROME=`):

| Test | Covers |
|---|---|
| `node tests/templates.cjs` | every screen's template compiles (catches quoting bugs that blank a screen) |
| `node tests/smoke.cjs` | every screen and sheet opens without errors |
| `node tests/data.cjs` | corrupt/wrong-typed storage, backup validation, partial restore + undo, quota errors, autosave, draft resume |
| `node tests/finance.cjs` | SMS de-duplication, balances, refunds, transfers, editor validation, search, CSV |
| `node tests/dates.cjs` | focus sessions that ended while closed, Feb 29 / 30 Esfand countdowns |
| `node tests/native.cjs` | Android bridge contract with a stand-in `window.Android` (EN + FA) |
| `node tests/features.cjs` | quick capture, top 3, wrap-up, Today sections, timeline, weekly review, Persian coverage |
| `node tests/sms.test.cjs`, `node tests/sms.regress.cjs` | bank SMS parser (no browser needed) |
| `node tests/people.cjs`, `node tests/people-safety.cjs` | People UI against a local worker (below) |

`docs/AUDIT.md` is the audit, `CHANGELOG.md` the changes, `docs/REPORT.md` what is tested and what isn't,
`docs/PHASE4.md` designs for later features.

People UI test (two phones, signup to chat): `node tests/people.cjs http://127.0.0.1:8766/ http://127.0.0.1:8797` with the
worker running locally (`npx wrangler dev --port 8797`, `ALLOWED_ORIGINS=http://127.0.0.1:8766` in `push/.dev.vars`).
