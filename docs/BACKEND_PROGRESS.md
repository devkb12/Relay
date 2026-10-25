# Backend progress (Rithik's core)

Last updated: 2026-10-24, branch `rithik/core`. Keep this current; another session resumes from here.

## Checklist

| Pri | Item | State |
|---|---|---|
| P0 | API starts/passes tests without `web/` or a Node build; `/health` liveness, `/ready` DB+schema | Done |
| P0 | Versioned migrations (SQLite + PostgreSQL), explicit `python -m relay.migrate`, membership index | Done |
| P0 | PostgreSQL store with row locks; tested on PostgreSQL 16 (Docker) | Done (local) |
| P0 | Discord controls bound to `session_id` + question id / plan version; stale → 410; restart-safe DynamicItems | Done (unit/API level) |
| P0 | Withdrawal, host nonresponder policy (`mark_missing`), distinct outcomes, explanation idempotency | Done |
| P0 | Challenge ids, host review packet without classmates' reasoning, stale resolution rejected | Done |
| P0 | Discord OAuth (identify), hashed opaque sessions, CSRF, exact origins, logout, expiry, membership linking | Done (mocked Discord) |
| P0 | Demo identities off by default, refused in production; production config validation | Done |
| P0 | Presentation view, `no-store`, request ids, consistent errors, rate limits (single instance) | Done |
| P0 | Atomic job claims, Retry-After, unknown-job inspection/reconcile, tick time budget, retention purge | Done |
| P0 | Scheduling: future/60-day bounds, IANA display tz, shorter-plan confirmation, visible cancellation, re-proposal on membership change | Done |
| P0 | Model: concurrency limit, 1 retry on transient errors, output budget, choice-letter leak guard, unlabeled misconceptions, sanitized telemetry, fallback reason | Done (mocked transport) |
| P0 | Real HTTP integration test (uvicorn process, production mode, restart) | Done |
| P0 | n8n: purge branch, deterministic ids; executed in n8n 2.44.6 (Docker) | Done (dry-run) |
| P0 | **Two real Discord accounts complete one cycle** | **Done live 2026-10-24** (see below) |
| P0 | Deployed Railway API/bot, Vercel proxy, live OAuth round trip | Not started (needs accounts/authorization) |
| P0 | Live model call | Not started (needs verified model id + authorization for paid calls) |
| P1 | Question-pack authoring, Google Calendar, more concepts, push updates | Deferred |

## Live Discord verification (2026-10-24, local API + bot, private test server)

Bot Relay#3368, guild-scoped command sync (1 group, 18 subcommands confirmed via Discord API).
Two real accounts (host + one member): create -> join -> private answers via the modal-select form
-> early `/relay next` correctly refused (1 not responded) -> discussion card -> peer `/relay explain`
-> fresh application -> private answers -> debrief card (group results hidden: <3 paired) ->
private results via `/relay question`. Stored state: 2/2 answers each round, 0 missing, 1 peer
explanation, distinct items, member ids are verified Discord ids, 0 jobs (no consent). Bot restarted
mid-session without losing the session. 0 tracebacks in bot/API logs. Model `none`, delivery off,
API bound to 127.0.0.1.

Fixes from the live run: bot no longer crashes on 403/50001 when not yet in the guild (syncs on
join); question prompt warns not to type answers in the channel (a tester did); results use
student-facing labels ("Initial attempt", "Fresh problem").

Second live run (after rotating the bot token and service key): create -> join -> next ->
`/relay challenge` paused the item -> host `/relay review` OK, member `/relay review` refused (403)
-> paused `/relay question` -> `/relay resolve` resume -> `/relay delete confirm:True`. The earlier
session in the same channel stayed byte-for-byte unchanged; the deleted session left no orphan
jobs, memberships or audit rows; 0 tracebacks.

Stale-button refusal: tester reported the "older or deleted session" message, but the API log shows
no button request (a stale press is logged as 410), so it is NOT confirmed live; covered by
`test_old_button_cannot_act_on_newer_session_in_same_channel`.

Not yet exercised live: schedule/approve buttons, withdrawal (`/relay leave`), `close_round`,
`/relay hint`, a logged stale-button 410.

`main` fast-forwarded to 48d71dc (2026-10-24) after these checks; rithik/core continues from there.

## Hosting decision (2026-10-24)

Railway sign-ups closed; paid hosting and payment methods not authorized. Active plan: $0 laptop
hosting (docs/LOCAL_PUBLIC_HOSTING.md). Added `relay.local_host` (init/check/start: public :8787
without /internal, private :8000 for the bot, shared SQLite in %LOCALAPPDATA%), production hides
/docs, preflight rejects SQLite in synced folders. Local rehearsal passed all boundary checks.
Found: Docker (another project's Keycloak) and WSL hold :8080 on this laptop; public port is 8787
and the launcher refuses to start on any busy loopback port.

## Checks actually run (2026-10-24, Windows, Python 3.14.3)

| Command | Result |
|---|---|
| `python -m pytest` | 130 passed, 5 skipped (PostgreSQL tests skip without a URL) |
| `RELAY_TEST_POSTGRES_URL=... python -m pytest tests/test_postgres.py` (postgres:16 in Docker) | 5 passed |
| `python -m compileall -q relay scripts tests` | OK |
| `python -m ruff check --select F,E9 relay scripts` | All checks passed |
| `node --check web/app.js` | OK (legacy UI) |
| `python scripts/n8n_local_check.py .` (n8n 2.44.6) | 4/4 trigger branches executed against local API, dry run |
| `python -m scripts.export_contract` | 33 paths, 18 fixtures regenerated |

Mocked/simulated, not live: Discord OAuth token/user endpoints, Gemini transport, Discord DM sends.

## Decisions

- Session bodies stay JSON documents (incremental evolution); added lookup columns and a
  `session_members` table instead of normalizing everything.
- OAuth exchange uses `httpx` directly against Discord's documented endpoints rather than authlib
  (authlib 1.9's httpx integration emits a deprecation warning here; the flow is three calls and is
  covered by tests). Discord access tokens are revoked immediately; only the user id is kept.
- Browser identity maps to the same HMAC participant credential the bot uses, so core
  authorization is one code path for bot and browser.
- No railway.json (deprecated by Railway, unread after 2026-12-01). Dashboard config in DEPLOYMENT.md.
- No `--forwarded-allow-ips '*'`: rate limits use the socket peer, which is not spoofable.

## Known limits

- Rate limits are per process. Bot status-card ids are in bot memory (restart posts a fresh card).
- Answer modal uses Discord modal selects (discord.py 2.7 `ui.Label`); not yet seen in a live client.
- `test_core.py` (starter) still has two unused imports; left as is.
- Withdrawal removes the member's stored data; messages already posted in Discord remain.

## Product slice (2026-10-25)

- `allowed_actions` + `waiting_on` on every private view, mirroring the mutation checks (probed per
  action/actor/step on a database copy); `receipt` on Reflect (policy receipt-v1, evidence ids, limits).
- Sample-only pack `data/sample_round.json` (never a live concept) and backend replays for the browser
  sample engine; new fixtures `participant-discussion`, `debrief-two-person`, `discarded`.
- Bot links each session's web room (`RELAY_FRONTEND_URL/room/<id>`) on the status card and create/join.
- Relative SQLite paths resolve to the repo root (one database whatever the working directory).
- Content packs: `data/packs/*` load only when reviewed; Iris (UCI, CC BY 4.0) built and **draft**.
- `scripts/check_model.py`: list the models a Gemini key can call, metadata only.

## Next executable step

Connect the deployed site (docs/LIVE_CONNECTION_DIAGNOSIS.md §5): production config with Discord OAuth,
tunnel port 8787 only, set `RELAY_API_BASE_URL` on Vercel and redeploy, then run the two-account
Discord ↔ web acceptance test (§6). After that: review the Iris pack; optionally verify a Gemini model id.
Railway stays paused ($0 constraint).
