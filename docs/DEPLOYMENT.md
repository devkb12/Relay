# RELAY deployment (Railway API + bot, Vercel Next.js, n8n)

Status: configuration prepared and checked locally (real uvicorn process, production mode, explicit
migration, restart persistence, PostgreSQL 16 in Docker, n8n 2.44.6 in Docker). **Nothing has been
deployed.** Fill in "Verified" with real results; local checks are not deployment checks.

| Piece | Host | Owner |
|---|---|---|
| FastAPI `relay.api:app` | Railway service `api` | Rithik |
| Discord gateway bot `python -m relay.bot` | Railway service `bot` | Rithik |
| Database | Railway PostgreSQL (recommended) or SQLite on a volume (1 replica) | Rithik |
| n8n reminders / delayed practice / purge / errors | existing n8n instance | Rithik |
| Next.js study room (`web/`) | Vercel, proxies `/api` and `/auth` to Railway | Dev |

The bot and n8n never open the database; they call `/internal/*` with `X-Relay-Key`. One store.

## Railway: service `api`

- Source: `devkb12/Relay`, branch `main` (deploy reviewed, merged code only).
- Pre-deploy command: `python -m relay.migrate` (explicit migration; production refuses to boot on an
  outdated schema).
- Start command: `uvicorn relay.api:app --host 0.0.0.0 --port $PORT --timeout-graceful-shutdown 20`
  Railway terminates TLS at its proxy. Do **not** add `--forwarded-allow-ips '*'`: trusting arbitrary
  `X-Forwarded-*` headers would let clients spoof their address. RELAY builds redirect URLs from
  configuration, so it does not need proxy headers.
- Healthcheck path: `/ready` (DB reachable and schema current). `/health` is liveness only.
- Replicas: **1** with SQLite. PostgreSQL allows more, but rate limits are per process (see limits).
- Restart policy: on failure.
- Python 3.12 from `.python-version`; dependencies from `requirements.txt`.

Database, pick one:
- **PostgreSQL (recommended for the shared deployment):** add Railway PostgreSQL and set
  `RELAY_DB=${{Postgres.DATABASE_URL}}` (or rely on `DATABASE_URL`). Tested against PostgreSQL 16
  locally (`tests/test_postgres.py`), not yet against Railway's instance.
- **SQLite:** attach a volume at `/data`, set `RELAY_DB=/data/relay.sqlite3`, keep 1 replica.
  Never run SQLite on ephemeral disk.

Variables:

| Variable | Value |
|---|---|
| `RELAY_ENV` | `production` |
| `RELAY_DB` | see above |
| `RELAY_SERVICE_KEY` | new random 32+ chars, generated privately; never the local one |
| `RELAY_PUBLIC_DEMO` | `false` (production refuses to start if `true`) |
| `RELAY_SERVE_WEB` | `false` (Vercel serves the frontend) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord application OAuth2 credentials |
| `RELAY_OAUTH_REDIRECT_URI` | `https://<frontend-domain>/auth/discord/callback` |
| `RELAY_FRONTEND_URL` | `https://<frontend-domain>` |
| `RELAY_ALLOWED_ORIGINS` | `https://<frontend-domain>` |
| `RELAY_MODEL_PROVIDER` | `none` until a model id is verified and paid calls are authorized |
| `RELAY_DELIVERY_ENABLED` | `false` until consent/cancellation/delivery tests pass |
| `DISCORD_BOT_TOKEN` | only needed on `api` when delivery is enabled (DMs sent by the tick) |
| `RELAY_RETENTION_DAYS` | e.g. `30` |

Production startup refuses: short service key, `RELAY_PUBLIC_DEMO=true`, non-HTTPS OAuth settings,
outdated schema.

## Railway: service `bot`

- Same repo/branch. No public domain, no healthcheck, no volume. Restart on failure.
- Start command: `python -m relay.bot`
- Variables: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` (test server, fast command sync),
  `RELAY_SERVICE_KEY` (same as api, e.g. `${{api.RELAY_SERVICE_KEY}}`; confirm reference syntax in the
  dashboard), `RELAY_BASE_URL=https://<api-public-domain>`.
- Bot needs only the `applications.commands` + `bot` scopes and permission to send messages/embeds
  in the study channel. Intents: `guilds` only. No Message Content intent.

## Vercel (Dev)

See `docs/NEXTJS_BACKEND_HANDOFF.md`. Summary: server-only `RELAY_API_ORIGIN=https://<api-public-domain>`,
rewrites for `/api/*`, `/auth/*`, `/health`; no `/internal/*`; no secrets in Vercel.

## n8n

See `docs/N8N_RUNBOOK.md`. HTTP nodes point at `https://<api-public-domain>`; Header Auth credential
`X-Relay-Key`. Start inactive/dry-run.

## Why no railway.json

Railway's Config as Code (`railway.json`/`railway.toml`) is deprecated and stops being read on
2026-12-01; its replacement (`.railway/railway.ts` + `railway config apply`) can come later.
Configure the services in the dashboard as above.

## Limits (documented, not hidden)

- Rate limits are in-process (per replica): login/callback 20/min per client address as seen by
  the app, facilitation 6/min per session, bot 30/min per Discord user. Not distributed enforcement.
- The bot's status-card message ids live in bot memory; after a bot restart it posts a fresh card.
  Buttons keep working after restarts (dynamic custom ids bound to session id).
- Backups/logs on Railway are outside RELAY's purge; deletion is database-row deletion.

## Verification checklist (fill in with real results)

1. `GET https://<api>/ready` → `{"ready": true}`; `/health` flags show model/delivery off.
2. `POST https://<api>/api/sessions` → 403. `POST https://<api>/internal/discord` without key → 403/422.
3. Bot logs `RELAY connected as ...`; slash commands appear in the test server.
4. Two Discord accounts complete create → join → answer → explain → fresh answer → debrief.
5. Redeploy `api`; `/relay status` still shows the session.
6. Through the Vercel domain: login, `/auth/me`, member vs non-member access, CSRF rejection.

## Verified

Nothing on Railway/Vercel yet. Local evidence: see docs/BACKEND_PROGRESS.md.
