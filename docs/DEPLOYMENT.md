# RELAY deployment plan (Railway + Vercel)

Status: prepared and locally tested only. Nothing in this file has been deployed or verified
against a production URL yet. Update the "Verified" section with real results after each step.

| Piece | Host | Owner |
|---|---|---|
| FastAPI (`relay.api:app`) + SQLite on a volume | Railway service `api` | Rithik |
| Discord Gateway bot (`python -m relay.bot`) | Railway service `bot` | Rithik |
| n8n reminders / delayed practice | Existing n8n instance | Rithik |
| `web/` study room | Vercel | Dev |
| Optional insights dashboard | Streamlit Community Cloud | Not started; only after the core loop works |

The bot never opens the database. It calls `/internal/discord` on the API with `X-Relay-Key`, so
both services share one session store through the API. Run exactly **one** API replica: SQLite on a
volume is single-writer. Move to PostgreSQL before scaling out.

## Why no railway.json

Railway marks `railway.json`/`railway.toml` (Config as Code) deprecated; legacy files stop being read
on 2026-12-01, and one root file would apply the API healthcheck to the bot too. Railway's
replacement (`.railway/railway.ts`, applied with `railway config apply`) can be adopted later.
For now, configure both services in the dashboard as below. `.python-version` pins Python 3.12.

## Railway: service `api`

- Source: GitHub `devkb12/Relay`, branch `main` (deploy only reviewed, merged code).
- Start command: `uvicorn relay.api:app --host 0.0.0.0 --port $PORT`
- Healthcheck path: `/health`
- Replicas: 1. Restart policy: on failure.
- Volume: mount at `/data`.
- Networking: generate a public domain (needed by Vercel rewrites and n8n Cloud).
- Variables:

| Variable | Value |
|---|---|
| `RELAY_ENV` | `production` (forces public demo creation off; refuses to boot with a short key) |
| `RELAY_DB` | `/data/relay.sqlite3` |
| `RELAY_SERVICE_KEY` | New random value, 32+ chars. Generate privately; never reuse the local one. |
| `RELAY_PUBLIC_DEMO` | `false` (ignored in production, set anyway for clarity) |
| `RELAY_MODEL_PROVIDER` | `none` until a model is verified and paid calls are authorized |
| `RELAY_DELIVERY_ENABLED` | `false` until consent/cancellation/delivery tests pass |
| `DISCORD_BOT_TOKEN` | Only needed when delivery is enabled (API sends DMs for n8n ticks) |

## Railway: service `bot`

- Same repo and branch. No public domain, no healthcheck, no volume.
- Start command: `python -m relay.bot`
- Restart policy: on failure.
- Variables:

| Variable | Value |
|---|---|
| `DISCORD_BOT_TOKEN` | From the Discord Developer Portal |
| `DISCORD_GUILD_ID` | Test server ID (fast guild-scoped command sync) |
| `RELAY_SERVICE_KEY` | Same value as `api`. A Railway reference variable such as `${{api.RELAY_SERVICE_KEY}}` avoids copying it; confirm the syntax in the dashboard. |
| `RELAY_BASE_URL` | `https://<api public domain>` (private networking is an optional later change) |

Bot intents: `guilds` only; no Message Content intent.

## Vercel: `web/` (Dev)

Dev owns this; Rithik does not edit `web/`. Notes from the backend side:

- Project root directory: `web`. No build step (static HTML/CSS/JS).
- `web/index.html` currently references `/static/style.css` and `/static/app.js` (FastAPI's mount).
  On Vercel those files are served from `/`, so either change the paths or add a rewrite.
- `app.js` calls relative `/api/...` and `/health`. A `web/vercel.json` can proxy them to Railway,
  which keeps the browser same-origin (no CORS change needed on the API):

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<api public domain>/api/:path*" },
    { "source": "/health", "destination": "https://<api public domain>/health" },
    { "source": "/static/:path*", "destination": "/:path*" }
  ]
}
```

- Never proxy `/internal/*` and never put `RELAY_SERVICE_KEY` or bot tokens in Vercel.
- **Production consequence:** with `RELAY_ENV=production`, browser create/join return 403
  ("Public demo creation is disabled; join through Discord."). The web room cannot start sessions
  against the production API until server-verified Discord identity linking exists. The UI must show
  that state honestly. For a clickable public demo, either use fixture mode in the frontend or point
  a separate Vercel preview at a separate Railway environment (`RELAY_ENV=local`,
  `RELAY_PUBLIC_DEMO=true`, its own volume, no bot token, synthetic data only). Decide as a team.

## Verification checklist (fill in with real results)

1. `GET https://<api>/health` returns `{"ok": true, "live_model": false, "delivery_enabled": false}`.
2. `POST https://<api>/api/sessions` returns 403 in production.
3. `POST https://<api>/internal/discord` without `X-Relay-Key` returns 403.
4. Bot logs `RELAY connected as ...`; `/relay create` and `/relay join` work from two accounts.
5. Redeploy `api`, then `/relay status` still shows the same session (volume persistence).
   Local equivalent: `tests/test_api.py::test_sessions_survive_api_restart`.
6. Vercel URL loads, `/health` through the rewrite returns the same JSON, no console errors.

## Verified

Nothing yet. Local only: full pytest suite, compileall, `node --check web/app.js`.
