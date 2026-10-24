# Next.js ↔ FastAPI handoff (for Dev)

Rithik owns everything on the FastAPI side. This file is the exact contract the Next.js app needs.
Nothing here was tested through a deployed Vercel domain yet: items marked **VERIFY** must be
checked on the real domains before anyone claims browser login works.

## 1. Proxy: same origin, server-side destination

Browser code calls relative paths only (`/api/...`, `/auth/...`). Next.js rewrites them to Railway:

```js
// next.config.js (or .mjs) - RELAY_API_ORIGIN is a server-only Vercel env var, e.g.
// https://relay-api-production.up.railway.app  (NOT NEXT_PUBLIC_*)
module.exports = {
  async rewrites() {
    const api = process.env.RELAY_API_ORIGIN;
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/auth/:path*', destination: `${api}/auth/:path*` },
      { source: '/health', destination: `${api}/health` },
    ];
  },
};
```

- **Never** add a rewrite for `/internal/*`. Never put `RELAY_SERVICE_KEY`, bot tokens or model keys
  in Vercel env vars or any `NEXT_PUBLIC_*` variable.
- Do not add Next.js API routes that re-implement scoring, stages, or session state.
- **VERIFY** on Vercel: the rewrite forwards `Cookie`, `Origin`, `X-CSRF-Token` request headers and
  passes back `Set-Cookie` and `302 Location` unchanged.

## 2. Login flow

1. "Sign in with Discord" is a normal link (full page navigation):
   `<a href={`/auth/discord/login?return_to=${encodeURIComponent('/room/' + id)}`}>`.
   `return_to` must be a path starting with `/`; anything else is replaced with `/`.
2. Discord redirects to `https://<frontend>/auth/discord/callback`, which the rewrite sends to FastAPI.
   FastAPI sets the session cookie and redirects to `RELAY_FRONTEND_URL + return_to`.
3. `?login=cancelled` on `/` means the user cancelled or Discord returned an error. Show a calm retry.
4. On load call `GET /auth/me`:
   - `authenticated:false, login_available:false` → server login not configured; show "unavailable",
     never a fake signed-in state.
   - `authenticated:true` → keep `csrf_token` **in memory** (React state/context). Not localStorage.
5. Logout: `POST /auth/logout` with `X-CSRF-Token`, then clear local state.

Backend config that must match (Rithik sets on Railway):

| Setting | Value |
|---|---|
| Discord Developer Portal → OAuth2 → Redirects | `https://<frontend-domain>/auth/discord/callback` (exact) |
| `RELAY_OAUTH_REDIRECT_URI` | same exact URL |
| `RELAY_FRONTEND_URL` | `https://<frontend-domain>` |
| `RELAY_ALLOWED_ORIGINS` | `https://<frontend-domain>` (comma-separate extra exact origins; no wildcards) |

Vercel preview URLs are different origins: they will not log in unless explicitly added. Use the
production domain (or one stable preview alias) for demos.

## 3. Requests

```ts
async function relay(path: string, init: RequestInit = {}, csrf?: string) {
  const unsafe = init.method && init.method !== 'GET';
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(unsafe && csrf ? { 'X-CSRF-Token': csrf } : {}), ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.detail ?? 'Request failed'), { status: res.status, requestId: body.request_id });
  return body;
}
```

- Fetch session data from **client components** (or pass the incoming cookie explicitly from a server
  component with `cache: 'no-store'`). Never statically render or cache `/api/*` responses.
- Polling: `GET /api/sessions/{sid}` every 3-5 s while the tab is visible; skip re-render when
  `revision` is unchanged; back off on 429 and network errors. No push channel exists yet.
- Do not announce every poll to screen readers; announce only stage changes and your own results.

## 4. Status handling

| Status | UI |
|---|---|
| 401 | Signed out or session expired → "Sign in with Discord" |
| 403 | Not a member / not host / CSRF or origin rejected → explain; for CSRF re-fetch `/auth/me` once |
| 404 | Session deleted or wrong link |
| 409 | Stale: re-fetch the view and re-render. Do not resend the user's changed intent |
| 422 / 400 | Show `detail` next to the input |
| 429 | Wait and retry later |
| 503 | Login not configured or backend not ready |

## 5. What to render (see docs/API_CONTRACT.md and contracts/fixtures/)

- Stages: `lobby, diagnostic, discussion, transfer, debrief`; `paused` is an overlay.
- Primary action per stage, and who can do it: host advances (`advance` with `expected_stage` =
  current stage; offer "close round, record missing" as a separate explicit button).
- `hint.feedback_source` tells you live model vs reviewed fallback; label it.
- `my_results[*].status`: correct / incorrect / skipped / missing / invalidated — five distinct styles.
- `group` can be null; say why (fewer than three paired responses) instead of drawing a chart.
- Shared screens use `GET /api/sessions/{sid}/presentation`, never the private view.
- Render all model, peer and source text as text (no `dangerouslySetInnerHTML`).
- Sessions are created/joined in Discord. The browser list comes from `GET /api/me/sessions`.

## 6. Local development

- `uvicorn relay.api:app --reload --host 127.0.0.1 --port 8000`, Next dev server on `localhost:3000`
  with `RELAY_API_ORIGIN=http://127.0.0.1:8000`.
- Local OAuth: register `http://localhost:3000/auth/discord/callback` in the Discord portal and set
  `RELAY_OAUTH_REDIRECT_URI` / `RELAY_FRONTEND_URL` / `RELAY_ALLOWED_ORIGINS` to `http://localhost:3000`.
  Cookies are non-Secure locally (`relay_session`); production forces Secure `__Host-relay_session`.
- Without OAuth you can still build every screen from `contracts/fixtures/*.json` (label "fixture mode").
- The legacy static demo (bearer tokens, identity switcher) works only with `RELAY_PUBLIC_DEMO=true`
  locally. Production refuses it.

## 7. Integration checklist (fill in with real results)

- [ ] Vercel `RELAY_API_ORIGIN` set (server-only); rewrites deployed; no `/internal` rewrite
- [ ] Login round trip on the production domain; cookie is `__Host-relay_session`, HttpOnly, Secure
- [ ] `/auth/me` shows signed-in; logout works; a second browser stays signed out
- [ ] Member opens their session; a non-member Discord account gets 403
- [ ] A POST without CSRF is rejected (403); with it succeeds
- [ ] Private view vs presentation view show different data
- [ ] No `/api` response cached by Vercel (check `cache-control: no-store` reaches the browser)
