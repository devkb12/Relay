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
| P0 | **Two real Discord accounts complete one cycle** | **BLOCKED: needs bot token + test server** |
| P0 | Deployed Railway API/bot, Vercel proxy, live OAuth round trip | Not started (needs accounts/authorization) |
| P0 | Live model call | Not started (needs verified model id + authorization for paid calls) |
| P1 | Question-pack authoring, Google Calendar, more concepts, push updates | Deferred |

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

## Next executable step

1. Rithik: create a Discord application + bot in the Developer Portal, invite it to a private test
   server (scopes `bot applications.commands`), put `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` in `.env`.
2. Run API + bot locally (docs/DEMO_RUNBOOK.md) and complete one cycle with two accounts.
   Record the result here. Then deploy to Railway per docs/DEPLOYMENT.md.
