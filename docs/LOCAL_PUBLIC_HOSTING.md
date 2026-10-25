# $0 hosting: RELAY backend on the laptop, public via Tailscale Funnel

Decision (2026-10-24): no paid hosting and no payment method. Railway sign-ups were closed, so the
Railway plan is paused (docs/DEPLOYMENT.md stays valid if it reopens). Dev hosts the Next.js app on
Vercel's free Hobby plan. FastAPI, the Discord bot and SQLite run on Rithik's HP laptop.

**Limitation: RELAY works only while the laptop is on, awake, online, and the launcher is running.**
Tailscale Funnel is in beta and has non-configurable bandwidth limits; fine for a hackathon demo,
not for a pilot.

## Layout

```
browser ─https─> Vercel (Next.js) ─rewrite /api,/auth─> https://<laptop>.<tailnet>.ts.net (Funnel)
                                                              │ TLS ends on the laptop
                                                              ▼
Discord ─gateway─> bot ──http──> 127.0.0.1:8000 private API ──┐
                                 127.0.0.1:8787 public API  ──┴─> SQLite in %LOCALAPPDATA%\RELAY\
```

| Listener | Port | Exposed | Has `/internal/*` |
|---|---|---|---|
| public API | 127.0.0.1:8787 | via Funnel only | **no** (routes not registered) |
| private API | 127.0.0.1:8000 | never | yes (bot, local n8n) |

Security posture on the public listener (each verified in a local rehearsal, see below):
`RELAY_ENV=production`; synthetic demo create/join 403; bearer tokens 401; `/internal/*` 404 even
with the key; `/docs`, `/redoc`, `/openapi.json` 404; Discord OAuth with `__Host-` Secure HttpOnly
cookies, CSRF header and exact origin allowlist; object-level membership on every session route.
The database and env file live outside the repo and outside OneDrive (sync can corrupt a live SQLite file).

## One-time setup (all free)

1. **Install Tailscale** (admin PowerShell): `winget install --id Tailscale.Tailscale -e`
   Then open Tailscale from the Start menu and sign in (free Personal plan; Google/GitHub/Microsoft).
2. In the Tailscale admin console (https://login.tailscale.com/admin/dns): enable **MagicDNS** and
   **HTTPS Certificates**. The first `tailscale funnel` run may also ask you to approve the Funnel
   node attribute through a link; approve it.
3. Get your stable name: `tailscale status --self` → note `<laptop>.<tailnet>.ts.net`.
4. **Write the production env file** (outside the repo; copies the bot token and guild id from `.env`,
   generates a NEW service key; prints no values):
   ```powershell
   .\.venv\Scripts\python.exe -m relay.local_host init --env-file "$env:LOCALAPPDATA\RELAY\relay.env" --public-url https://<laptop>.<tailnet>.ts.net
   ```
5. **Discord login** (Developer Portal → your app → OAuth2):
   - Redirects → add `https://<laptop>.<tailnet>.ts.net/auth/discord/callback` (backend-only testing).
     Later also add `https://relay-two-lovat.vercel.app/auth/discord/callback` for Dev's site.
   - The **Client ID** (public, same as the application id) is filled in by `init` automatically.
   - Reset/copy the **Client Secret** and store it hidden:
     ```powershell
     .\.venv\Scripts\python.exe scripts\set_env_secret.py DISCORD_CLIENT_SECRET --env-file "$env:LOCALAPPDATA\RELAY\relay.env"
     ```
6. Check without starting anything: `.\.venv\Scripts\python.exe -m relay.local_host check --env-file "$env:LOCALAPPDATA\RELAY\relay.env"`

## Every time you demo

```powershell
# 1. Stop any dev API/bot first (only one bot per token).
.\.venv\Scripts\python.exe -m relay.local_host start --env-file "$env:LOCALAPPDATA\RELAY\relay.env"
# 2. In a second terminal: publish ONLY the public listener.
tailscale funnel --bg http://127.0.0.1:8787
tailscale funnel status
# 3. Afterwards: turn Funnel off, then Ctrl+C the launcher.
tailscale funnel reset
```

The launcher refuses to start if 8787 or 8000 already answer on 127.0.0.1 or ::1 (on this laptop
Docker/Keycloak and WSL hold 8080, which is why the public port is 8787). Never point Funnel at 8000.

## Switching browser login to Dev's Vercel site

When Dev's rewrites are deployed with `RELAY_API_ORIGIN=https://<laptop>.<tailnet>.ts.net`, change
three lines in the env file and restart the launcher:

```
RELAY_FRONTEND_URL=https://relay-two-lovat.vercel.app
RELAY_OAUTH_REDIRECT_URI=https://relay-two-lovat.vercel.app/auth/discord/callback
RELAY_ALLOWED_ORIGINS=https://relay-two-lovat.vercel.app
```

If Vercel cannot proxy reliably to the laptop, or the laptop cannot stay on, fall back to a
read-only Vercel demo built from `contracts/fixtures/` (synthetic data, labeled as such).

## What has been verified (2026-10-24, local rehearsal, no Funnel yet)

`relay.local_host init/check/start --no-bot` with a throwaway production env:
public `/ready` 200; public `/internal/discord` and `/internal/automation/tick` 404 with a valid key;
public `/docs` and `/openapi.json` 404; demo create 403; bearer 401; `/auth/me` signed out;
login 503 while the client secret is unset; private tick 200 with key / 403 without; bot-route
create on private; that session returns 401 on the public listener without login; both listeners
bound to 127.0.0.1 only. Automated: tests/test_local_host.py.

NOT verified yet: Tailscale install/Funnel, Discord OAuth round trip, Vercel → Funnel proxying,
a Discord session through the launcher.
