# Orbit source audit — v1.20 (2026-10-17)

Audit of the actual repository (`github.com/AliYeganegi/orbit`, commit `a316da8`, app version 1.20), done before any
architectural change. Findings were checked by reading the code end to end and, where marked **verified**, by running
code (node scripts, the existing test suites, a local Worker). **Suspected** means the code path suggests the problem but
it was not reproduced.

## 1. What the app is

| Part | Technology | Where |
|---|---|---|
| UI and all local features | Vue 3.5 global build, no bundler; templates compiled at runtime from JS template literals | `web/app.js` (~4,700 lines), `web/app.css`, `web/i18n.js` (English/Persian), `web/schedule.js`, `web/sms.js`, `web/tips.js`, `web/questions.js` |
| Android app | Gradle-free WebView shell (Java, no AndroidX), JS bridge `window.Android` | `android/` (`build.sh`, `MainActivity`, `Scheduler`, `AlarmReceiver`, `BootReceiver`, `Sms`/`SmsReceiver`, `SocialPoll`, `WebUpdate`, `Files`, `UpdateProvider`) |
| iPhone app | The same `web/` as a PWA (service worker `web/sw.js`), hosted on GitHub Pages | `web/`, `.github/workflows/pages.yml` |
| Server | One Cloudflare Worker: Web Push reminder delivery (Durable Object per device), People (user + pair Durable Objects, WebSocket), admin API | `push/src/{index,social,admin,webpush}.js` |
| Admin panel | Static page talking to the admin API | `web/admin/index.html` |
| Self-update (Android) | Signed manifest (`web/update/manifest.json` + `.sig`, P-256) lists hashed web files and the latest APK | `tools/release.mjs`, `WebUpdate.java` |

**State:** one reactive object `S`, saved to `localStorage['orbit.v1']` (200 ms debounce). Migrations are flag-based
one-offs at the top of `app.js`. Reminders are a derived "plan" handed to Android `AlarmManager` (one-shot items +
repeating rules) or, on iPhone, sent to the Worker (texts AES-GCM sealed on the phone).

**What leaves the device:** People data (profile, messages, photos, files, answers — stored in plain text on the
Worker); reminder *times* (texts sealed) for iPhone push. Finance, SMS, cycle, health and other local data never leave
the device (verified: no fetch of that data, no logging). Android `allowBackup="true"` does include them in Google
backup (see A-M1).

## 2. Baseline (before changes)

| Check | Result |
|---|---|
| `tests/sms.test.cjs` | pass |
| `push` crypto + delivery + reminder rules (`npm test` part 1–2) | pass |
| `push` People end-to-end (14 checks) | pass |
| `push` admin (7 checks) | pass after adding a local `ADMIN_TOKEN` to `push/.dev.vars` (missing on this machine) |
| `tests/smoke.cjs` (every screen and sheet) | pass |
| `tests/people.cjs` (two phones, 16 checks) | pass when given a photo fixture; it assumed `/tmp/orbit-test-photo.png` exists |
| Android build (`android/build.sh`) | builds (332 KB, versionName 1.20) |
| All 38 Vue templates compile | pass |

### Release blocker found during baseline

- The published APKs (v1.12…v1.19 on GitHub Releases) are signed with certificate
  `a309d322…bec0`. This machine's `~/.android/orbit.keystore` produces `ee8e3ad9…7451`. **An APK built here cannot be
  installed over the installed app without uninstalling it, which erases all local data.**
- The update-signing key `~/.config/orbit/update-key.pem` is not on this machine, so Android cannot receive new screens
  through the self-updater from here either.
- Both keys live wherever versions 1.9–1.20 were built. Until they are available here, Android releases are blocked;
  web changes still reach the iPhone PWA through GitHub Pages.

## 3. Findings

Severity: **C** critical, **H** high, **M** medium, **L** low. Status column is updated as work lands (see section 6).

### Data safety (web)

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| D1 | H | Restore accepts any JSON (`{}`, `[]`, `"x"`, wrong app) and replaces every collection with empty defaults, reports "Backup restored ✅", no preview, no undo | verified (node) — `hydrate()` fills missing keys so the only check always passes |
| D2 | H | `hydrate()` has no type checks: e.g. `habits:null` or `reminders:"x"` is saved, then crashes Today or the 1.8 migration on every launch (app never mounts) | verified (node) |
| D3 | M | Corrupt `orbit.v1` → silently replaced by defaults, and the migrations save over it 200 ms later; no raw copy kept | verified (read) |
| D4 | M | Save failures (quota shared with chat cache) are swallowed; user keeps working and loses everything since the last good save | verified (read) |
| D5 | M | Android reload after a downloaded update loses open editors (notes are only written on close; task/money/reminder drafts too) | verified (read) |
| D6 | M | Android backup goes through an Intent extra (crash risk above ~1 MB) and is also copied to the clipboard (finance/health data visible to keyboards) | privacy verified, crash suspected |
| D7 | L | "Erase everything" leaves People token, chat/photo caches, wake lock; resets `lang` without re-rendering | verified (read) |
| D8 | L | Export says `v:1` but there is no schema version or migration on import; unknown newer keys are dropped | verified (read) |

### Finance and bank SMS

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| F1 | C | Parser takes account / tracking / terminal / cheque numbers or the year as the amount (e.g. "واریز به حساب 4567891234 مبلغ 2,000,000" → 45,678,912 T) | verified, 7 samples |
| F2 | H | Refunds and reversals (برگشت, عودت, لغو خرید, اصلاحیه, وصول) parsed as expenses | verified |
| F3 | H | Failed / declined / blocked payments (ناموفق, رد شد, مسدود, موجودی کافی نیست) parsed as spending | verified |
| F4 | H | One SMS can create two transactions: live receiver uses the SMS-centre clock, inbox scan the phone clock, hash buckets by minute; pasted SMS never hashed | verified |
| F5 | H | A parse with no bank name matches the user's manually created account (`acctFor('', '')`) and overwrites its balance | verified (trace) |
| F6 | M | No confidence signal: every parse becomes a draft and every balance overwrites the account | verified |
| F7 | M | Bank ads/loan reminders from bank senders accepted; real messages dropped by over-broad filters (merchant "پویا", "رمزارز", installment payments mentioning سررسید); 24-digit IBAN drops the whole SMS | verified |
| F8 | M | Unreviewed (pending) SMS drafts — including false positives — count in Spent, budget and reports | verified |
| F9 | M | No transfer type: moving money between own accounts counts as spending and income | verified |
| F10 | M | CSV export: no formula-injection guard, no BOM (Persian garbled in Excel), shared under "Orbit backup" json name | verified |
| F11 | L | Manual entries default to the first (often an SMS bank) account; no search/filter of transactions | verified |
| F12 | M | `allowBackup="true"` puts transactions and the raw SMS queue (incl. OTP bodies) into Google backup | verified |

### Scheduling, focus and dates

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| S1 | L | `schedule.js` steps 24-hour blocks, so a DST day is skipped (affects iPhone push server and previews; Android Java is correct; Tehran has no DST) | verified (Europe/Berlin) |
| S2 | L-M | Focus session that ended while the app was closed is logged at reopen time (wrong day, breaks streak), chimes late, auto-break starts late | verified (read) |
| S3 | L | Countdown yearly on Esfand 30 never matches in common years; Feb 29 → Mar 1 | verified (node) |
| S4 | L | Today recomputes reminder times every second (monthly rules loop 400 days of Intl calls) | verified (benchmark) |
| S5 | L | Mood can only be logged for today; past days not editable | verified |
| — | ok | Day keys across DST in 5 time zones, habit streaks, all migrations idempotent | verified |

### Android native

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| A-H1 | H | `WebUpdate` holds one class lock for the whole download; asset loading and `onResume` wait on it → blank screen on cold start / ANR on resume when GitHub is slow or blocked | verified (trace) |
| A-H2 | H | No `onRenderProcessGone`; no last-known-good for downloaded web builds → a bad build can crash-loop | verified |
| A-H3 | H | `SocialPoll` wakes the phone every 90 s with exact alarms + network (~960 wake-ups/day), concurrently with a 15-min job (possible double notifications) | verified |
| A-M1 | M | `allowBackup="true"`, no extraction rules: bearer token, SMS queue and all WebView storage go to Google backup | verified |
| A-M2 | M | Bridge has no origin check and the page has no CSP (only exploitable through XSS; none found) | verified |
| A-M3 | M | Pill (30 d), cycle tips (14 d), daily question (7 d) are one-shot lists; they silently stop if the app isn't opened | verified |
| A-M4 | M | Clock jumps can silence rules (`sent` not capped); `restore()` only catches JSONException (500-alarm limit / bad dates could crash BootReceiver) | verified/suspected |
| A-M5 | M | `share()` puts the whole backup into an Intent extra + clipboard; `startActivity` without try/catch | see D6 |
| A-L | L | Snoozes outlive deleted tasks; native water count can be overwritten by a stale sync; missed reminders while off are dropped; startActivity calls without try/catch; `VERSION_CODE` defaults to 1 | verified/suspected |
| — | ok | Update signature verification, hash checks, no downgrade, PendingIntent codes, SMS receiver permission, exact-alarm permission setup | verified |

### People and server

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| P-H1 | H | Admin page reads `?api=` and auto-sends the admin token there → one link steals the admin token | verified |
| P-H2 | H | No rate limits; signup, requests, messages, uploads unbounded; unsent uploads never cleaned and count toward the 400 MB pair quota | verified (code path) |
| P-M1 | M | "Delete for both" leaves message text in both members' event logs (`/s/events?since=0`) and in reply quotes; edits keep the original | verified |
| P-M2 | M | Keys never expire, no server-side sign-out/rotation; `?t=` accepted on every endpoint | verified |
| P-M3 | M | Connect/cancel loop spams pushes; no block list or cooldown | verified |
| P-M4 | M | `ask()` race (answer overwritten, double question) | suspected |
| P-M5 | M | Pair alarm only reschedules after a successful `ask()` → daily questions can stop for good | suspected |
| P-L | L | Deleted messages shrink pages so older history becomes unreachable; deleted handle immediately re-registrable; bodies read before size checks; bidi characters in filenames; admin edit resets language; 5xx reported as 400 | verified/suspected |
| — | ok | No IDOR on pairs; answers hidden until both answer; uploads sniffed and served safely; push host allowlist; hashed keys; no XSS in chat rendering | verified |

### Localization and accessibility

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| L1 | M | Strings built from parts ("5 day streak", "Added to Food", "Late by 3d", toasts, notification bodies, Android water notification) stay English in Persian | verified (dictionary run) |
| L2 | L-M | RTL: no `[dir=rtl]`/logical CSS, inline `text-align:left`, swipe-to-delete icon hidden in RTL; mixed digit systems | verified (code) |

## 4. Feature status (v1.20)

- **Complete:** Today, Tasks (due/time/lead reminder/priority/overdue), Habits (weekday schedules, streaks, heatmap), Focus,
  Water, Countdowns, Reminders, Money (accounts, budget, categories incl. custom, reports, SMS import on Android, paste on
  iPhone), Cycle tracker, Notes, People (chat, photos, files, reactions, replies, edit/delete, daily question,
  relationship types), admin panel, Android self-update.
- **Partial:** tasks have no recurrence/subtasks/search; mood is today-only; notes have no draft persistence; backup has
  no validation/preview/file import; Persian translation misses built-up strings.
- **UI-only:** none found.

## 5. Plan

Phase 1 (stabilization): D1–D5, D7, F1–F12, S1–S4, P-H1, P-H2 (basic limits), P-M1, P-M5, P-L pagination, Android
A-H1–A-H3, A-M1, A-M4, A-M5, SMS timestamp/OTP queue. Phase 2: Today command center, finance workflows (transfers,
search, refunds), reminder diagnostics, i18n/RTL for touched screens. Phase 3: Quick Capture, Daily Timeline, Weekly
Review. Phase 4 items (shared memories, calendar, voice) are documented, not started. Android releases wait for the
signing keys (section 2).

## 6. Status

What was fixed is in `CHANGELOG.md` → "Unreleased". What is tested, untested, open or blocked is in `docs/REPORT.md`.
