# Orbit

Your whole day in one place: tasks, habits, money, notes, focus timer, water, mood, countdowns and a cycle tracker.
English UI with Shamsi (Jalali) dates and Toman. Fully offline; all data stays on the device.

- **iPhone / web:** https://aliyeganegi.github.io/orbit/ → open in Safari → Share → *Add to Home Screen*
- **Android:** native APK (WebView shell with notifications and haptics)

## Layout

| Path | What |
|---|---|
| `web/` | The app UI (Vue 3, no bundler) plus PWA manifest, service worker and icons. Deployed to GitHub Pages on push. |
| `android/` | Android shell: `src/` Java (WebView + JS bridge), `res/` icon and theme, `build.sh` Gradle-free build. |

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
cd push && npm install && npm test   # crypto, scheduling and end-to-end delivery tests (local wrangler)
npx wrangler deploy                  # needs VAPID_PRIVATE_JWK secret: npx wrangler secret put VAPID_PRIVATE_JWK
```

UI smoke test (every screen and sheet): `node tests/smoke.cjs http://127.0.0.1:8766/` with `web/` served locally.
