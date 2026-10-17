# Changelog

## 1.21

### Moving to the new Android app
The key that signed Android versions up to 1.20 was lost, and Android only updates an app signed with the same key.
1.21 is therefore a new app (`me.ali.orbitapp`) that installs next to the old one: export a backup in the old app,
restore it in the new one, then uninstall the old app. Screen updates are now signed with a new update key, so the
old app stays on 1.20.

Not deployed yet: the iPhone/web version updates when `main` is pushed, the People server when `push/` is deployed,
and the Android APK needs the original signing key (see "Release blockers" in `docs/REPORT.md`).

### Data safety
- Saved data is checked field by field when the app starts, so one bad value can't stop it from opening. Data from a
  newer version is kept. If the saved data can't be read at all, it is kept as `orbit.v1.corrupt.<time>`, a warning is
  shown, and Orbit never writes over it without asking.
- Failed saves (phone storage full) show a warning with an Export button.
- Backups: choose which parts to include; the file records the schema and app version; shared as a real `.json` file
  (no clipboard).
- Restore: the file must be an Orbit backup, you see what's inside before anything changes, only the included parts are
  replaced, a safety copy is kept and the restore can be undone. File picker on web, iPhone and Android.
- "Erase everything" can be undone.
- Notes save while you type. Open task, money, reminder and capture editors come back with their text after an update reload.
- Android backup no longer includes captured bank SMS waiting to be read, the People login key or downloaded screens.

### Money
- Bank SMS: rewritten parser that ignores account, card, IBAN, tracking and terminal numbers, dates and times; refunds
  count as money in (marked); failed payments, balance notices, ads and one-time codes are ignored; uncertain readings
  are marked "Check this".
- The same SMS seen twice (live and inbox scan, resends, paste) is only added once.
- Balances only move from confident readings of a known bank, and a balance you set yourself is never overwritten:
  the bank's number is offered instead.
- Drafts don't count as spending until reviewed; refunds reduce their category; new Transfer type between your own
  accounts (neither spending nor income).
- Search across all months, type filters, form validation, last-used account as the default.
- CSV export: real `.csv` file that opens correctly with Persian text; spreadsheet formulas are neutralised.

### Dates and reminders
- Repeating reminders no longer skip a day across daylight-saving changes (iPhone push server and previews).
- A focus session that ended while the app was closed is logged at its real end time, with no late chime or auto-started break.
- Yearly countdowns on Feb 29 / 30 Esfand land on the last day of the month in other years.
- Android: reminders are armed one by one (one bad item can't stop the rest), repeating rules first, capped below
  Android's alarm limit; a changed phone clock can't silence a rule; snoozes for finished tasks or deleted reminders are
  dropped; water count taps from the notification aren't lost; notification texts and buttons follow the app language.

### Android
- A downloaded screen update that fails to start twice falls back to the screens inside the APK.
- Update checks never block the screen, back off after failures, and ignore older signed manifests; a second
  downloaded update now applies without a restart.
- If the WebView crashes, the app restarts its screen instead of closing.
- People message checks adapt: about every 90 seconds after you use People or a message arrives, every 5 minutes for
  the next hour, then every 15 minutes. Nothing is fetched while the app is open. Android may delay any of these.
- Bank SMS: one-time codes are never stored; the phone's clock is used so duplicates are caught.
- Missing system screens (some phones) no longer crash the app.

### New
- **Quick capture** (+ on Today): type anything; it becomes a task, note, expense/income or reminder. Works in English
  and Persian ("ناهار ۱۲۰ هزار", "جلسه فردا ساعت ۱۰"), shows what it will do, and you can change it. Sorted on the phone,
  nothing is sent anywhere.
- **Today**: top 3 tasks, choose and reorder sections, evening wrap-up (move what's left to tomorrow, log your mood),
  a weekly review reminder on Fridays.
- **Timeline**: one day in order (tasks, habits, focus, water, mood, money, notes). Cycle entries only if you turn them on.
- **Weekly review**: tasks, habits, focus, water, mood and spending compared with the week before, habit patterns by
  weekday over 4 weeks, and your own notes (saved on the phone, included in backups). Money and cycle can be switched on/off.
- **Notifications → Reliability check** (Android): shows turned-off notification kinds, exact-alarm permission and
  battery optimisation, with buttons to fix them.
- **People**: block someone (they aren't told), blocked list with unblock, "Sign out other phones" (new login key).

### People server (`push/`)
- Rate limits, connection cap, cooldown after declined requests, reserved and recently deleted handles.
- Deleting or editing a message removes the old text everywhere (both event histories, notification previews, reply quotes).
- Blocking, sign out everywhere (`/s/logout`), new login key (`/s/rotate`); the key is accepted in the URL only for the
  live socket. Details in `docs/API.md`.
- Daily question delivery is more robust; pagination no longer hides older messages after deletions.
- Admin page sends its token only to the real server.

### Persian
- All new screens translated; water notifications and Done/Snooze buttons translated on Android; some mixed strings
  ("Spent in <month>") fixed; your own text is never machine-translated.
