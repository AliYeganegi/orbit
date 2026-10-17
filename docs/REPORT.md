# Orbit upgrade: final report

Scope: the "Orbit app upgrade" brief (audit, phases 1–3, phase 4 documented). Audit: `docs/AUDIT.md`. Changes:
`CHANGELOG.md`. Server API: `docs/API.md`. Phase 4 designs: `docs/PHASE4.md`.

Everything is committed locally on `main` (7 commits ahead of `origin/main`). **Nothing has been pushed or deployed.**

## Status

### Implemented and tested automatically (browser or server tests, run on this machine)

| Area | What | Test |
|---|---|---|
| Data safety | type-checked loading, corrupt data kept, save-failure warning, validated restore with preview/partial/undo, undoable erase, notes autosave, editor resume | `tests/data.cjs` (9) |
| Money | SMS parser (ids/dates never amounts, refunds, failed payments, ads, OTP), de-duplication, confident-only balances, manual balance protected, drafts excluded, refunds, transfers, search, validation, CSV | `tests/finance.cjs` (8), `tests/sms.regress.cjs` (37 samples), `tests/sms.test.cjs` |
| Dates | DST-safe rules, late focus sessions, Feb 29 / 30 Esfand countdowns | `tests/dates.cjs`, `push` crypto test (DST) |
| People server | rate limits, blocking, cooldowns, logout/rotate, real deletion, pagination, reserved handles, admin token | `push` `npm test` (43 checks incl. `security.test.mjs`) |
| New features | quick capture (EN/FA), top 3, wrap-up, Today sections, timeline, weekly review, habit patterns, reflections in backups | `tests/features.cjs` |
| People UI | block from chat, unblock, sign out other phones | `tests/people-safety.cjs`, `tests/people.cjs` (local worker) |
| Persian | new screens fully translated (checked by scanning visible text) | `tests/features.cjs` step 8, `tests/native.cjs` |
| App ↔ Android contract | bootOk, translated notification texts, live task ids, file share, file picker results | `tests/native.cjs` (stand-in `window.Android`) |
| Every screen | renders, no errors | `tests/smoke.cjs`, `tests/templates.cjs` (46 templates) |

Last run: all of the above passed (`ALL GOOD` / exit 0).

### Implemented, compiled, not tested on a phone

No phone was connected, and the Java code can't run off-device. The APK compiles (`android/build.sh`, versionCode 27),
but none of this has run on Android yet:

- Downloaded-screen rollback after two failed starts, update lock split, failure back-off, older-manifest rejection.
- WebView crash recovery (`onRenderProcessGone`).
- Scheduler: per-item errors, rules first, 300-alarm cap, clock-change clamp, snooze cleanup, queued water taps,
  translated notification texts/buttons.
- SMS: OTP never queued, phone clock timestamp.
- Adaptive People checks (90 s / 5 min / 15 min), no polling while open, 1 MB response cap.
- `shareFile` (backup/CSV as real files via the content provider), `pickText`, `notifDiag`, `openBatterySettings`.
- Android backup rules (`res/xml/backup_rules.xml`, `data_extraction_rules.xml`).
- The new bank SMS parser on the real inbox. The earlier parser read 145/147 Pasargad and 8/11 Saderat messages; the new
  one passes the 37 regression samples but hasn't been run on the phone's inbox.

### Planned (documented, not built)

Shared memories, insights, calendar, voice capture: `docs/PHASE4.md`.

### Blocked

- **Android release.** The published APKs are signed with certificate `a309d322…bec0`; this machine only has
  `~/.android/orbit.keystore` (`ee8e3ad9…7451`). Installing the APK built here over the installed app requires
  uninstalling it, which **erases all app data**. I did not install it. The original keystore (from the machine that
  built 1.19) is needed.
- **Android screen updates.** `tools/release.mjs` signs `web/update/manifest.json` with `~/.config/orbit/update-key.pem`,
  which is missing here. Without it, installed Android apps can't receive the new screens.
- **Deploys** need your go-ahead (see "Next steps").

## Open findings from the audit

| ID | Finding | Status |
|---|---|---|
| S5 | Mood can only be logged for today | not done |
| A-M2 | No origin check on the Android bridge, no CSP | not done. Top-level navigation is already pinned to the app's own host; a per-call origin check needs `WebViewCompat` (androidx), which the Gradle-free build doesn't include. |
| A-M3 | Pill, cycle tips and daily-question alarms are lists that run out if the app isn't opened for 2–4 weeks | not done (would become repeating rules like water) |
| A-L | Reminders missed while the phone was off are dropped | not done |
| L1/L2 | Built-up strings and RTL on older screens | partly. Everything new is translated and right-to-left; some older screens still use `text-align:left` and English fragments. |

## Known limitations

- Android may delay reminders and message checks (Doze, maker battery savers). The app now shows what's limiting them,
  but it can't guarantee exact delivery.
- People chat is stored on the Orbit server and is **not** end-to-end encrypted. Reminder texts sent to the iPhone push
  server are encrypted on the phone.
- Quick capture understands simple phrases only (amounts with k/هزار/میلیون, today/tomorrow/tonight, a time). Anything
  else becomes a task or note, and you can change the type before saving.
- Weekly review uses the last 7 days ending today, not calendar weeks.
- Older APKs (1.19/1.20) that receive the new screens keep the old native code: backup sharing there still uses the
  previous text share (with clipboard) until the new APK is installed.

## Build

```sh
cd android && VERSION_CODE=27 ./build.sh        # needs JDK 17, Android SDK platform 34 + build-tools 34.0.0
# install only with the original keystore: KEYSTORE=/path/to/original/orbit.keystore VERSION_CODE=27 ./build.sh
```

`APP_VERSION` is still `1.20` and `web/sw.js` is still `orbit-v19`; bump both when releasing.

## Next steps (need you)

1. Provide the original Android keystore and `~/.config/orbit/update-key.pem` (or decide to start a new signing key,
   which means every Android user exports a backup, uninstalls, installs and restores).
2. Bump `APP_VERSION` (1.21) and `VERSION` in `web/sw.js`, run `node tools/release.mjs`, then `git push` to deploy the
   iPhone/web version.
3. `cd push && npx wrangler deploy` for the People server changes. They work with installed apps, so the order of steps 2
   and 3 doesn't matter.
4. Build a 1.21 APK with the original key, attach it to a GitHub release, and announce it with `tools/release.mjs --apk …`.
5. On the phone: check the new SMS parser against the real inbox, the reminders/water notifications in Persian, and the
   Notifications → Reliability check.
