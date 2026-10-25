# RELAY web (Next.js)

The companion study room, scheduler and debrief for RELAY, plus a synthetic demo for judges.
Sessions run in Discord; this app opens them. All data comes from the FastAPI backend in `../relay`.

`index.html`, `app.js` and `style.css` in this folder are the legacy UI that FastAPI still serves
locally. Leave them in place; the Next.js app lives in `src/`.

## Setup

```bash
cd web
npm install
cp .env.example .env.local   # optional; see below
npm run dev -- -H 127.0.0.1 -p 3001   # http://127.0.0.1:3001 (3000 is often taken by Docker)
```

Node 24 was used. Never put secrets in `web/`: the legacy FastAPI mount can serve this folder.

## Environment

| Variable | Where | Meaning |
|---|---|---|
| `RELAY_API_BASE_URL` | server only | Origin of a real FastAPI backend (e.g. `http://127.0.0.1:8000`, or the Tailscale Funnel URL). Read at request time by the `/api`, `/auth`, `/health` and `/connection` route handlers. Unset = "Backend not connected" and the synthetic demo still works. |
| `NEXT_PUBLIC_DISCORD_INVITE_URL` | public | A real bot invite link. The "Add RELAY to Discord" buttons appear only when set. |

## Data modes (always shown in a chip)

- **Synthetic** — `/demo` and the landing Track render `src/fixtures` (copies of `contracts/fixtures`,
  refreshed with `npm run sync-fixtures`; a test fails if they drift). Writes say "Demo only. Nothing was sent."
- **Local test identities** — the backend reports `demo_mode: true` (`RELAY_PUBLIC_DEMO=true`, not production).
  Create/join with test names; tokens live in sessionStorage only. Not real accounts.
- **Connected** — `demo_mode: false`. Sign in with Discord (full-page `/auth/discord/login`); HttpOnly cookie,
  CSRF token in memory. Sessions are created in Discord (`/relay create`) and listed from `/api/me/sessions`.
- **Not connected** — `/connection` reports no backend; live screens point to `/demo`.

## Running against a local FastAPI

From the repo root (backend venv):

```bash
RELAY_PUBLIC_DEMO=true RELAY_MODEL_PROVIDER=none RELAY_DELIVERY_ENABLED=false \
  .venv/Scripts/python.exe -m uvicorn relay.api:app --host 127.0.0.1 --port 8000
cd web && RELAY_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Open `/room`, create a session, add test participants with the identity switcher, and play every role.

## Tests

```bash
npm run lint && npm run typecheck && npm test && npm run build
npx playwright install chromium
RELAY_PYTHON=../.venv/Scripts/python.exe npm run test:e2e   # starts its own FastAPI + next start
```

- Vitest (`tests/unit`): every fixture through its schema, fixture drift, error mapping, stage labels,
  debrief rules, `.ics` header, tokens out of URLs/localStorage, proxy allowlist.
- Playwright (`tests/e2e`): full live loop with four identities (skip, challenge resume and discard, `.ics`),
  409 recovery for stage and plan, production and backend-down states, synthetic walkthrough, landing keyboard
  use, reduced motion, overflow and axe (serious/critical) at 360/390/820/1280/1920px, console errors.

## Vercel

Root directory `web`, framework Next.js, default install/build/output. Set `RELAY_API_BASE_URL` only to a
real deployed backend; until then the site runs the synthetic demo and live screens say "Backend not connected".
The proxy forwards only documented browser routes and never `/internal/*`.
