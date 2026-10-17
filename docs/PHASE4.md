# Phase 4: designed, not built

These ideas are written down so they can be built later without redoing the thinking. None of them is in the app.
Each one has to follow the same rules as the rest of Orbit: data stays on the phone unless a person chooses to share
it, no paid or external AI services, and nothing is called encrypted unless it really is.

## Shared memories (People)

Two connected people keep a private shared album of moments: a photo or a short text with a date, added from a chat
message ("Save to memories") or directly.

- **Server:** a `memories` list in the existing Pair Durable Object: `{ id, by, at, day, text, fid?, from? }`. Same
  limits as messages (size, rate, one upload per item), same scrubbing on delete. Endpoints:
  `GET /s/p/<pair>/memories?before=`, `POST /s/p/<pair>/memories` `{ text, fid?, day?, from? }`,
  `POST /s/p/<pair>/memories/delete` `{ id }` (either person can remove what they added; both can remove anything only
  if both agree, decided later).
- **App:** a "Memories" tab in the pair screen; "On this day" card on Today when a memory is 1 year old (opt-in).
- **Privacy:** stored on the Orbit server like chat today, which is **not** end-to-end encrypted. Say so in the UI.
  True end-to-end encryption needs key exchange between the two phones (e.g. X25519 per device, keys confirmed by both
  people) and a plan for new phones; that is a separate project.
- **Blocking/leaving** deletes the album for both, like the chat.

## Insights

Built on `weekStats` and `habitInsights` (already in the app), computed on the phone:

- Sleep-free correlations only from what's logged: mood vs focus minutes, mood vs water, habit completion vs weekday.
  Show only when there are at least 3 weeks of data and the difference is large (≥ 15 points); word them as
  "on days you…, you tended to…", never as cause.
- Spending: month vs average of the previous 3 months per category; unusual single expenses (> 3× the category median).
- Cycle data is excluded unless the person turns it on in Weekly review; predictions are labelled as estimates and
  never presented as contraception.

## Calendar

- A month view over existing data: task due dates, reminders (from `OrbitSchedule.ruleTimes`), countdowns, period
  estimates (opt-in), with Shamsi and Gregorian dates.
- Reading the phone calendar on Android (`READ_CALENDAR`) is possible but adds a sensitive permission; only as an
  explicit opt-in, read-only, never uploaded. iPhone PWAs can't read the calendar; offer `.ics` export instead.
- `.ics` export of tasks with dates and reminders (a file the person shares), no server sync.

## Voice

- Android: the system speech recogniser (`RecognizerIntent`) fills the Quick capture box; the text then goes through
  the same local `guessCapture`. Some phones send audio to the recogniser's provider (often Google), so the UI must say
  "Uses your phone's speech recognition" and it must be opt-in.
- iPhone PWA: the Web Speech API isn't available in standalone PWAs; dictation from the keyboard already works in the box.
- No custom server-side speech recognition (cost and privacy).

## Effort (rough)

| Item | Size |
|---|---|
| Shared memories (server + app + tests) | 3–4 days |
| Insights | 2 days |
| Calendar view + .ics export | 2–3 days |
| Voice capture (Android) | 1 day |
