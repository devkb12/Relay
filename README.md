# RELAY - Track 3 build kit

**Find the time. Pass the understanding.**

RELAY is a Discord-first study-group assistant: coordinate a time, answer privately,
explain to peers, apply the concept to a different problem, and opt into a delayed check.
The included browser study room is a real local interface to the same backend, not a
substitute for demonstrating the required group-chat assistant.

## Updated handoff

Start with `docs/REPO_SETUP.md`. The repository target is `devkb12/Relay`.
Use `docs/prompts/00_BOOTSTRAP.md` once, then the Rithik/Dev prompts on separate branches.
The latest ownership is Rithik = all core/backend/n8n, Dev = frontend/design.
`CLAUDE.md` and `contracts/` give both assistants shared instructions and actual API fixtures.

## Read this first

This is a locally tested starter, **not a deployed hackathon entry**. It has not been
pushed to your GitHub repository, connected to your Discord server, executed in n8n,
or tested against a paid model API or Google Calendar account.

- The synthetic question pack contains original teaching examples, not ASU course material.
- Its arithmetic is unit-tested; team/educator review is still required before teaching real students.
- The browser test uses synthetic participants and an in-process FastAPI bridge. It is not a user study.
- The Discord adapter is syntax-checked but not runtime-tested here: discord.py and live credentials
  were unavailable in the build environment.
- n8n JSON files are structurally checked import templates; import and execution still need testing.
- One model adapter is supplied: Gemini generateContent. Live access and model support must be tested.
- Google OAuth and direct Calendar writes are deliberately NOT implemented. Manual windows and .ics export work.

## What is implemented

1. Persistent SQLite sessions with separate participant tokens and host permissions.
2. Immutable source/question snapshots with a content hash per session.
3. Private initial answers; duplicate attempts are idempotent and altered repeats are rejected.
4. Peer explanation or an explicitly labeled source-review fallback.
5. A different follow-up question, with results withheld until debrief.
6. A participant can challenge an item; scoring pauses. The host can resume or discard it.
7. Group results require at least three paired, non-skipped responses. No public individual ranking.
8. Deterministic shared-time matching, explicitly labeled shorter alternatives, versioned approvals.
9. .ics download only after everyone approves the current proposal. No calendar write is implied.
10. Consent-checked, durable follow-up jobs with duplicate protection and ambiguous-delivery handling.
11. A responsive study-room UI with source drawer, presentation mode, and reduced-motion support.
12. Discord slash-command integration source, a guarded optional model adapter, and three n8n templates.

## Product decisions

Scheduling is the entrance, not the differentiator. The central experience is:

`independent attempt -> peer explanation -> new application -> delayed check`

The strongest demo shows a confidently wrong shared assumption, a peer explaining the
changing percentage base, and independent responses to a new example. Do not stage a
perfect improvement and present it as measured learning. A correct immediate answer
is not durable mastery, and different questions may differ in difficulty.

## Quick start - Windows / HP

Install Python 3.11+ (the kit was tested on 3.13.5). From the extracted project folder:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn relay.api:app --reload
```

Open `http://127.0.0.1:8000`. Create a room. Add local test identities or join from a
separate browser session. Test identities are not authenticated students.

## Quick start - macOS

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
.venv/bin/python -m uvicorn relay.api:app --reload
```

Use the .venv Python path for all subsequent commands; activation is optional.

## Run checks

```bash
python -m pytest
python -m compileall -q relay
```

Replace `python` with the appropriate .venv executable on your platform. The optional
browser check additionally needs Playwright and a Chromium executable. From the repo root:

```bash
python -m scripts.browser_check
```

Set CHROMIUM_PATH to your installed browser path. The build environment used
`/usr/bin/chromium`. This optional test needs `pip install playwright` plus an installed Chromium;
it is not included in the normal runtime dependency install. The bridge exists because local browser networking was restricted.

## Connect the actual Discord bot - Rithik's core task

1. Create a Discord application and bot in the Developer Portal.
2. Invite it to a TEST server with the `bot` and `applications.commands` scopes.
3. Grant only what is needed: view the study channel, send messages, and embed links.
   Do not grant Administrator or enable Message Content intent for this command-driven MVP.
4. Put the bot token, test-server ID, and a long random internal service key in `.env`. Generate a key with `python -c "import secrets; print(secrets.token_urlsafe(48))"`; do not reuse a sample secret.
5. Run the FastAPI backend in one terminal, then the bot in another:

```bash
python -m relay.bot
```

6. Run `/relay create`, then ask the other test accounts to `/relay join`.
7. Host uses `/relay next` to begin. Each student runs `/relay question` and answers privately.
8. Host opens discussion with `/relay next`. Students use `/relay explain` voluntarily.
9. `/relay hint` runs a curated fallback unless live inference is explicitly configured.
10. `/relay next` opens a fresh problem. Everyone answers, then the host opens the debrief.
11. `/relay question` displays only that participant's feedback after debrief.

Scheduling commands: `/relay availability`, `/relay schedule`, and versioned approval buttons.
Reminder consent: `/relay reminders enabled:true` (or false to revoke).
Item integrity: `/relay challenge`, then host `/relay resolve`.

A Discord server text channel is the group surface for this adapter. Do not assume
ordinary group DMs behave like a guild-installed bot. Test with four actual accounts.

## Enable a live model - Rithik's task

Keep the core session usable without a model. The current optional adapter accepts:

```dotenv
RELAY_MODEL_PROVIDER=gemini
GEMINI_API_KEY=your-private-key
RELAY_MODEL=YOUR_VERIFIED_MODEL_ID
```

Select and verify a model ID in your own provider account before enabling inference.
This handoff does not certify access to a particular model. A valid JSON schema and a matching quote
do not prove that an interpretation is correct. The adapter can reject an output and
use the reviewed hint; its UI labels that fallback.

The model sees a source excerpt, a question, candidate misconception labels, and aggregate
option counts. It does not receive names, tokens, calendar details, or private free-text
rationales. It cannot grade attempts, move the state machine, or write calendars.

## n8n - meaningful automation, not the authoritative session state

Import the JSON files under `n8n/`. Select an HTTP Header Auth credential:

- Header name: `X-Relay-Key`
- Value: your private `RELAY_SERVICE_KEY`

The refreshed templates default to `dry_run: true` and are inactive.
Replace the example.invalid API URL with your deployed HTTPS API URL. The example URL
intentionally cannot deliver requests. Publish workflows only after testing. Set the
error workflow for both scheduled workflows. Keep `RELAY_DELIVERY_ENABLED=false` until
consent, cancellation, and DM delivery have been verified.

The backend remains authoritative: jobs are claimed atomically, permission and proposal
versions are rechecked, and timeouts with unknown delivery are held for inspection instead
of blindly resent. See `docs/N8N_RUNBOOK.md`.

## What remains before a real judged demo

- Install discord.py and test every used slash command on your test server.
- Connect the same live session to the optional browser board through authenticated access,
  or demonstrate the browser UI as a separate, explicitly labeled local prototype.
  This starter does NOT implement Discord OAuth/browser identity linking.
- Test the live model's outputs, limits, latency, and failure behavior. No model benchmark is claimed.
- Import n8n templates, select credentials, publish, and test an actual opt-in DM reminder.
- Review the teaching pack and test with consenting students, not only synthetic fixtures.
- Add an explicit participant-withdrawal/round-timeout flow for a broader pilot. Current rounds wait
  for all rostered members to answer or personally choose SKIP; a host cannot impersonate an answer.
- Add end-user authentication, rate limiting, expiration, and consent controls before opening public
  web creation to unknown users. Keep the current browser prototype private/local.

## Privacy and deployment boundaries

Participant tokens are capability credentials. Do not share them or put them in public URLs.
The local UI stores test credentials in sessionStorage. The API stores only token hashes.
The service still stores practice answers and availability in SQLite; this is not encrypted
end-to-end. Keep the file on an access-controlled volume. The host can delete a session through
DELETE /api/sessions/{id}; automatic retention cleanup is not implemented.

Aggregate suppression is not an anonymity guarantee in a four-person group. Do not expose raw
answers in the group channel, UI logs, n8n execution history, analytics, or error alerts.
Source packs and answer keys are server-side before debrief. They are integrity aids, not
anti-cheating guarantees: students can still consult other tools or inspect public demo fixtures.

Use one API process and persistent storage for the demo. An in-memory serverless database or
an ephemeral disk will lose sessions. The gateway bot needs an always-running process. Move to
managed PostgreSQL and production identity controls only after the demo works.

## Team ownership

**Rithik:** all backend/core work, learning logic, Discord, AI, permissions, scheduling, n8n, tests and deployment.
**Dev:** frontend design/implementation, original graphics, transitions, responsive behavior and UI tests.
**Sankalp (bounded support):** review typography, spacing, interaction clarity and mobile states.
**Kanha (bounded support):** recruit test students, review the demo narrative and submission.

## Files to read next

- `docs/PRODUCT_AND_BUILD_PLAN.md` - scope and differentiation
- `docs/TECHNICAL_DESIGN.md` - boundaries and data flow
- `docs/UI_SPEC.md` - visual direction and transitions
- `docs/N8N_RUNBOOK.md` - workflow setup and safety tests
- `docs/RESEARCH.md` - primary sources and what they support
- `docs/DEMO_AND_EVALUATION.md` - judge demonstration and honest measurements
- `docs/CODING_AGENT_HANDOFF.md` - concrete repository handoff for Dev and Rithik
- `TEST_REPORT.md` - exactly what ran and what did not

Copy this kit into the new Track 3 repository. Do not overwrite teammates' existing work.
Do not commit `.env`, SQLite databases, participant data, or real credentials.
