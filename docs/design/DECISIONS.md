# Frontend decisions

## 2026-10-24 — Frontend-only migration to Next.js

CLAUDE.md and docs/UI_SPEC.md said not to migrate to React/Next.js. The team chose a
frontend-only Next.js migration for the companion web app. Backend, state machine and scoring
stay in FastAPI; the web app holds no second state engine. The legacy `web/index.html`,
`web/app.js`, `web/style.css` stay in place because FastAPI serves them and CI runs
`node --check web/app.js`. Rithik is asked (API_REQUESTS.md) to update CLAUDE.md/UI_SPEC.md.

## Stack (versions pinned at start)

Next.js 16.4.3 (App Router, `web/src/app`), React 19.3.1, TypeScript 5.9.3 strict (TS 7 skipped:
native compiler, Next's build relies on the JS API), Tailwind CSS 4.3.3, `radix-ui` 1.8.1 primitives
in shadcn style, Lucide, Motion 14.6 (`motion/react`), Zod 4.6, Vitest 5, Playwright 1.64,
ESLint 10 with eslint-config-next 16.4.3.

## Proxy shape

Route handlers (not `next.config` rewrites) so the backend origin is read at request time from the
server-only `RELAY_API_BASE_URL`, unreachable backends become a designed 503, and only documented
browser routes are forwarded. Forwarded request headers: Authorization (local demo), Cookie,
Content-Type, X-CSRF-Token, Origin, X-Request-ID. Returned: status, body, Content-Type,
Content-Disposition, Cache-Control, Location (redirects are not followed), every Set-Cookie.

## Motion exception

The stage handoff on the track runs ~400 ms, above UI_SPEC's 150–220 ms. It happens at most four
times per session and carries the main state change, so it is allowed; everything else stays in
120–220 ms. Reduced motion turns every move into an instant swap with the same labels.

## Logo

`web/public/brand/relay_education_logo.png` was not in the repo when the build started; the shell
uses a plain "RELAY" wordmark until it is added. The simplified R-with-cap SVG for favicon and
loading mark is a draft awaiting approval; the PNG wins once present.
