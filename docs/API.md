# People API changes (push/src/social.js)

Base URL: `https://orbit-push.aliyeganegi.workers.dev/s`. All endpoints except `/signup` need
`Authorization: Bearer <handle>:<secret>`. Responses are JSON; errors are `{ "error": "<message for people>" }`.

The changes are backward compatible with installed apps: the app already sends the key in the header everywhere
except the WebSocket, which still accepts `?t=`.

## Authentication

| Change | Detail |
|---|---|
| Key in URL | `?t=<key>` is accepted **only** for `GET /s/ws`. Elsewhere it is ignored (401 without a header). |
| `POST /s/logout` | Body `{}`. Replaces the secret with a random one nobody has: every phone is signed out. `{ ok: true }` |
| `POST /s/rotate` | Body `{}`. New secret; returns `{ handle, token }`. Other phones using the old key get 401. |

## Blocking

| Endpoint | Body | Result |
|---|---|---|
| `GET /s/blocks` | – | `{ blocks: [handle…] }` |
| `POST /s/block` | `{ handle }` | Ends any connection (both sides' chat is removed), cancels requests both ways. `{ ok: true }` |
| `POST /s/unblock` | `{ handle }` | `{ ok: true }` |

A blocked person: `GET /s/find?h=<you>` returns 404; `POST /s/connect` returns `{ pending: true }` but nothing reaches you
(they aren't told). You can't send a request to someone you blocked (409 "Unblock them first").

## Limits

| Action | Limit | Response |
|---|---|---|
| Signup | 5 per hour per IP (hashed); `SIGNUP_PER_HOUR` env overrides, for tests | 429 |
| Search (`/find`) | 60 per minute | 429 |
| Connection requests | 20 per day | 429 |
| Re-asking after a decline or cancel | wait 1 day | 429 "You asked recently…" |
| Connections + pending requests | 50 | 409 |
| Messages (`/send`) | 60 per minute | 429 |
| React, edit, delete, answer | 120 per minute | 429 |
| Uploads | 100 per day; size checked from `Content-Length` before reading | 429 / 413 |
| Request bodies | size checked before parsing | 400 |

## Handles

- Reserved: `orbit, admin, support, root, system, help, official, orbitapp` (409).
- A deleted handle can't be registered by someone else for 30 days (409 "That ID is taken").
- Names, emoji and file names have bidirectional control characters removed.

## Messages

- `GET /s/p/<pair>/state` and `GET /s/p/<pair>/messages?before=<s>` return full pages of live messages; deleted ones
  don't shorten a page.
- Delete/edit: the old text is removed from both members' event histories (`/s/events`), notification previews and
  reply quotes (`rq.text` becomes `""` with `rq.gone: true` for deleted originals).
- Uploads: a file can be attached to one message only (another message with the same file → 409). Sending the same
  `cid` again returns the original message (safe retry). Uploads never attached to a message are deleted after an hour.
- Leaving a conversation removes it from your event history.

## Errors

Unexpected failures return 500 `{ error: "Something went wrong on the server. Please try again" }` and are logged as
`E_SERVER <error name> <path>` (pair ids masked, no message content). Malformed JSON or oversize bodies return 400.

## Tests

`cd push && npm test` runs crypto (incl. DST), flow, social, admin and `security.test.mjs` (11 scenarios) against a
local `wrangler dev`. `tests/people-safety.cjs` checks block/unblock and "Sign out other phones" from the app.
