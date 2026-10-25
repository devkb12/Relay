# RELAY Next.js frontend plan

Working plan for `web/` on `dev/uiux`. The build is the deliverable; this file keeps the map honest.

## Verified starting point (2026-10-24)

- `origin/main` = 48d71dc. `web/` holds only the legacy `index.html`, `app.js`, `style.css`.
- No Next.js code anywhere; no `dev/uiux` on origin before this branch.
- The backend on main is newer than the brief assumed: Discord OAuth (`/auth/discord/login`,
  `/auth/discord/callback`, `/auth/me`, `/auth/logout`), cookie sessions + CSRF, `/api/me/sessions`,
  `/presentation`, `/review`, `/leave`, `/cancel-plan`, `nonresponders`, `accept_shorter`.
- Production (`RELAY_ENV=production`) refuses synthetic create/join (403) and bearer tokens (401).
- No backend is deployed; the Vercel projects named in older notes were deleted.

## Route map

| Route | Kind | Purpose |
|---|---|---|
| `/` | Server | Landing: hero, the Track (client island), rules, refusals, Discord commands, FAQ |
| `/demo` | Client | Synthetic session from committed fixtures; writes say "Demo only. Nothing was sent." |
| `/room` | Client | Connection status; local test identities (create/join) or Discord sign-in + my sessions |
| `/room/[sessionId]` | Client | The study room (working card per stage, evidence, challenge hold, host controls) |
| `/room/[sessionId]/schedule` | Client | Availability, target length, plan card, approvals, .ics, reminder consent |
| `/room/[sessionId]/debrief` | Client | Group observations, private feedback, topics to retry, follow-up |
| `/room/[sessionId]/present` | Client | Projector view from `GET /presentation` only |
| `/api/[...path]`, `/auth/[...path]`, `/health` | Route handlers | Same-origin proxy to `RELAY_API_BASE_URL` (allowlist; never `/internal`) |

## Data modes (header chip on every screen)

1. **Synthetic** — `/demo` and the landing Track. Fixtures copied into `web/src/fixtures`
   (`npm run sync-fixtures`; a test fails on drift).
2. **Local test identities** — backend `/auth/me` reports `demo_mode: true`. Bearer tokens in
   sessionStorage; identity switcher labeled "Local test identities: not real accounts."
3. **Connected** — `demo_mode: false`. Discord sign-in via full-page `/auth/discord/login`, HttpOnly
   cookie, CSRF token in memory, sessions from `/api/me/sessions`. If login is unavailable the room
   says "Sessions start in Discord."
4. **Not connected** — proxy returns 503 `Backend not connected`; live screens point to `/demo`.

## Component inventory

Shell (`AppShell`, `Rail`, `StationStrip`, `ActionBar`, `ModeChip`), `Track` (stations, nodes,
baton), `Roster`, `FacilitatorNote`, `EvidencePanel` (Sheet), `ChallengeHold`, `HostControls`,
stage cards (`LobbyCard`, `AttemptCard`, `DiscussionCard`, `DebriefSummary`), `ScheduleView`,
`DebriefView`, `PresentationView`, `StateView` + illustrations, UI primitives (dialog, sheet,
radio group, tabs, tooltip, sonner toaster) in shadcn style on `radix-ui`.

## Tokens

Defined once in `src/app/globals.css` (`@theme`) and `src/lib/motion.ts`. Colors, radii (20/12/full),
4px spacing scale, fonts (Newsreader / Atkinson Hyperlegible Next / JetBrains Mono via next/font),
motion durations (120 press, 200 cards/drawers, 400 stage handoff) and eases (enter
`cubic-bezier(0.2,0,0,1)`, exit `cubic-bezier(0.4,0,1,1)`).

## Carried forward from the legacy UI

Private answers never leave the member view; revision-keyed refresh (`revision:identity`), single
in-flight poll; 409 → refetch and explain; buttons disabled while pending; presentation hides private
panels; source shown in a dismissible panel; all server text rendered as text; drafts survive
re-renders; tokens only in sessionStorage.

## API gaps (requested in API_REQUESTS.md, never faked)

No presence signal; no per-person approval list; proposal options only in the host's propose
response and the first is auto-selected; no plan history; no list of who lacks availability; no
group availability view; `web/` not in CI; FastAPI mounts all of `web/` at `/static`.
