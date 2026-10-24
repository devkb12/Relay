# RELAY API contract (Rithik owns changes; Dev consumes)

Documentation of the code in this checkout, not a proposal. Sources of truth: `relay/api.py`
(routes, inputs), `relay/core.py::_project` (member-scoped view), `relay/api.py::presentation_view`.
`contracts/openapi.json` documents inputs; response bodies are dicts, so use
`contracts/fixtures/*.json` for real field shapes. Regenerate both with
`python -m scripts.export_contract` after any backend change, and tell Dev what changed.

## Auth and scope

| Caller | Credential | Where it is valid |
|---|---|---|
| Browser (production) | `relay_session` HttpOnly cookie from Discord OAuth (`__Host-relay_session` over HTTPS) + `X-CSRF-Token` header on every POST/DELETE | `/api/*`, `/auth/*` via the Next.js same-origin proxy |
| Browser (local demo only) | `Authorization: Bearer <participant token>` from `POST /api/sessions` / `join` | Only when `RELAY_PUBLIC_DEMO=true` **and** `RELAY_ENV` is not `production`; otherwise 401/403 |
| Discord bot, n8n | `X-Relay-Key` service key | `/internal/*` only. Server-to-server. Never proxied, never in a browser |

- Authentication is not authorization. Every session route maps the caller to a participant of
  **that** session (`discord:<verified id>`); a valid login for someone who is not a member gets 403.
  Knowing a session id grants nothing.
- Cookie-authenticated mutations also require an `Origin` in `RELAY_ALLOWED_ORIGINS` (exact match)
  when the browser sends one, plus the CSRF token from `GET /auth/me`.
- All `/api`, `/auth`, `/internal` responses carry `Cache-Control: no-store`, `Vary: Cookie, Authorization`
  and `X-Request-ID` (echoes a safe incoming `X-Request-ID`, else generated).

## Browser auth routes

| Method/path | Result |
|---|---|
| GET /auth/discord/login?return_to=/path | 302 to Discord (scope `identify`), sets short-lived state cookie. Use a full-page navigation, not fetch. `return_to` must be a relative path; anything else becomes `/`. |
| GET /auth/discord/callback | Discord redirects here (through the frontend domain). Verifies state + browser cookie + `iss`, exchanges the code, revokes Discord's access token, sets the session cookie, 302 to `RELAY_FRONTEND_URL + return_to`. Cancel/error → `/?login=cancelled`. |
| GET /auth/me | `{authenticated:false, login_available, demo_mode}` or `{authenticated:true, user:{name}, csrf_token, expires_at, demo_mode}` |
| POST /auth/logout | Requires `X-CSRF-Token`. Revokes the server session, clears the cookie. |
| GET /api/me/sessions | Sessions the signed-in Discord user belongs to: `[{id, concept, stage, is_host, created_at, paused}]` |

Sessions are created and joined in Discord (`/relay create`, `/relay join`). The browser opens them.

## Session routes (cookie+CSRF, or demo bearer)

| Method/path | Body | Result |
|---|---|---|
| GET /api/sessions/{sid} | – | private member-scoped view (below) |
| GET /api/sessions/{sid}/presentation | – | shared-screen view: no `me`, `my_answer`, `my_results`, availability, approvals-by-me |
| POST /api/sessions/{sid}/advance | `expected_stage`, `nonresponders: wait\|mark_missing` | host only. `mark_missing` records non-answerers as **missing** (never incorrect); needs ≥2 responses |
| POST /api/sessions/{sid}/answer | `question_id, choice (A-D\|SKIP), confidence, rationale?` | locked private attempt. Identical retry = same result; changed retry = 409 |
| POST /api/sessions/{sid}/explain | `text` (12-1200 chars, ≥3 words) or `source_fallback:true` (host) | shared explanation; identical retry not duplicated |
| POST /api/sessions/{sid}/facilitate | – | host, discussion only. Live model or labeled reviewed fallback; stale results rejected |
| POST /api/sessions/{sid}/availability | `windows:[{start,end}]` (offset-aware ISO), `timezone?` (IANA) | lobby only; must be future, start within 60 days; invalidates plan + approvals |
| POST /api/sessions/{sid}/propose | `durations:[60,45,30]` | host; `{options,state,notice}`; needs availability from every active member |
| POST /api/sessions/{sid}/cancel-plan | – | host; `plan_cancelled` stays visible |
| POST /api/sessions/{sid}/approve | `version`, `accept_shorter` | exact plan version; shorter alternatives need `accept_shorter:true` |
| POST /api/sessions/{sid}/consent | `enabled` | reminder + delayed-practice opt-in; off cancels pending jobs |
| POST /api/sessions/{sid}/challenge | `reason` (5-500) | any member; pauses scoring/answers/advance |
| GET /api/sessions/{sid}/review | – | host; challenged item + key + source. No classmates' reasoning |
| POST /api/sessions/{sid}/resolve | `decision: resume\|discard`, `note` (10-500), `challenge_id?` | host; stale `challenge_id` → 409. Discard suppresses scores and cancels jobs |
| POST /api/sessions/{sid}/leave | – | withdraw (not the host). Deletes your answers, reasoning, availability, pending jobs |
| GET /api/sessions/{sid}/calendar.ics | – | only after every active member approved the current version. A file, NOT a calendar write |
| DELETE /api/sessions/{sid} | – | host; deletes session, jobs and audit rows |

Local demo only: `POST /api/sessions {name, concept_id}`, `POST /api/sessions/{sid}/join {name}`.

## Private view fields

`id, concept, stage, revision, pack_hash, is_host, paused, members[], me, plan, plan_version,
approved_count, approved_by_me, plan_cancelled, needs_reproposal, schedule_confirmed, question,
my_answer, source, hint, discussion_signal, explanations[], challenge, invalidated, my_results,
group, retention_due_at, retention_note, notice`. Fields can be null; the backend withholds some
per stage.

- `stage` is exactly `lobby | diagnostic | discussion | transfer | debrief`. `paused` (=
  `challenge.pending`) is an overlay, not a stage. Use `revision` to skip re-rendering unchanged polls.
- `members[]`: `{name, state, responded, is_me, is_host}`, `state` ∈ `waiting | responded | missing |
  withdrawn | present`. Never peer answers.
- `question`: `{id, prompt, options}` only. No key, no explanation.
- `hint`: `{discussion_question, possible_misconception, mode, feedback_source, fallback_reason?,
  evidence_quote?, source_id?}`; `feedback_source` ∈ `live_model | reviewed_fallback`. Show which.
- `my_results[phase]`: `{status, choice, correct, explanation, question_id}`, `status` ∈ `correct |
  incorrect | skipped | missing | invalidated`. Show these differently; missing/skipped are not wrong.
- `group` (null below 3 paired non-skipped responders, or when discarded): `paired_responses,
  initial_correct, fresh_correct, active_participants, withdrawn, initial_outcomes, fresh_outcomes,
  warning`. Always show denominators and the warning; never call the difference a learning gain.
- `plan`: `{start, end, minutes, shorter_alternative, start_local, timezone}` (UTC + display label).
- `me`: `{name, reminders, availability, timezone, withdrawn}`. A withdrawn member gets a minimal view.

## Errors

Body: `{"detail": "...", "request_id": "..."}` (422 validation keeps FastAPI's list in `detail`).
401 not signed in / bearer disabled · 403 not a member, not host, CSRF/origin, withdrawn ·
404 session not found · 409 stale stage/plan/review, locked answer, paused, blocked transition ·
410 (bot only) control bound to an old/deleted session · 422 input · 429 rate limited · 400 other
domain rule · 503 login not configured / not ready. On 409, re-fetch and re-render; never replay
the user's changed intent automatically. Disable buttons while a request is pending.

## Internal routes (X-Relay-Key)

`POST /internal/discord` (bot; actions create, join, view, advance, answer, explain, availability,
propose, cancel_plan, approve, consent, facilitate, challenge, review, resolve, leave, delete;
`session_id` binds buttons) · `POST /internal/automation/tick {kind, dry_run}` · `GET /internal/jobs?status=`
· `POST /internal/jobs/{id}/reconcile {outcome, note}` · `POST /internal/maintenance/purge` ·
`POST /internal/automation/error` · `GET /ready` (DB + schema) · `GET /health` (liveness/config flags).

## Fixtures

`contracts/fixtures/*.json` come from the real backend with original synthetic material. No users,
tokens or credentials. Label fixture mode in the UI. Scores in fixtures are not observed outcomes.

## Not implemented

Google Calendar OAuth, question authoring/upload, push/streaming updates, multi-instance rate limits.
Request additions in `docs/design/API_REQUESTS.md`.
