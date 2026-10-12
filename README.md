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
