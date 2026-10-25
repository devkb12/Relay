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

## 2026-10-24 — Visual refresh from the logo (supersedes the "Logo" note above)

- **Logo:** the team's logo (R with graduation cap, violet → blue → cyan, gold tassel, navy wordmark)
  was converted to transparent PNGs: `web/public/brand/relay-logo.png` (full), `relay-mark.png`
  (mark only), `web/src/app/icon.png` and `apple-icon.png`. On navy surfaces the mark sits on a white
  tile so the navy cap stays visible. The draft SVG mark was removed; a line glyph remains for tiny uses.
- **Palette from the logo:** ink `#0D1B3E` (wordmark navy), canvas `#F6F7FB`, action blue `#2E54F0`,
  handoff violet `#6B35E8`, gold `#F5B12E` for atmosphere with amber `#8A5600` text on `#FFF3D6` for
  review states. All text pairs pass WCAG AA (cyan is decorative only). The violet → blue → cyan blend
  is brand atmosphere (one accent word, icons, a rail stripe), never a signal about a person.
- **Layout reference:** the landing page borrows the editorial quality of the team's Rumi page (large
  serif headline with one italic accent, product mockup with floating cards, trust row, long-form
  sections) on request, while keeping RELAY distinct: Newsreader + Atkinson Hyperlegible (not Rumi's
  Instrument Serif / Inter), RELAY's own logo and palette, no glass blur, no count-ups or rankings.
- **Motion:** hero entrance is transform-only (content is visible on the first frame, which keeps LCP
  fast); sections reveal once on scroll via a tiny IntersectionObserver (no animation library on the
  landing page); app routes settle in with a 260 ms page transition; reduced motion turns all of it off.
- **Fonts budget:** only upright Newsreader and Atkinson are preloaded; Newsreader italic (accent words)
  and JetBrains Mono load on demand. Measured on a throttled phone: landing LCP 2.3 s, CLS ≈ 0.
