You are my senior backend and integration engineer for RELAY in devkb12/Relay. I am Rithik.
I own ALL core work: Python backend, database, AI, Discord integration, scheduling, auth,
n8n, automation, tests and deployment. Dev owns web/ and the frontend design.

READ FIRST
Read CLAUDE.md, README.md, TEST_REPORT.md, docs/TEAM_OWNERSHIP.md, docs/API_CONTRACT.md,
docs/TECHNICAL_DESIGN.md and docs/N8N_RUNBOOK.md. Inspect the existing implementation and run
its tests before editing. Extend the starter; do not restart it or install unrelated frameworks.
Work on rithik/core from the shared bootstrap. Preserve teammate edits and use explicit staging.
Do not edit Dev's web/ files; agree API changes through the contract and fixtures.

PRODUCT
RELAY is a Discord-first group-study assistant: schedule a session -> private initial attempt
-> peer discussion -> genuinely different application -> honest debrief -> optional later check.
The defining behaviors are evidence-backed discussion, a new question, and challenging a bad
question. Scheduling supports that loop. No grades, mastery promises, rankings or invented data.

BUILD ORDER
A. Establish one real Discord round with two accounts using reviewed fallback hints first.
   Use least permissions and slash commands/forms; no Message Content intent unless essential.
   Acknowledge/defer within Discord's required window before slow work. Use private responses for
   answers; validate role and membership server-side. Wire create, join, question, answer, next,
   explain, challenge and resolve to the existing API/state machine. Log no private answers.
B. Preserve reviewed source/answer snapshots. Use deterministic MCQ scoring, not model judgment.
   Keep independent answers locked; handle identical retries without double writes and reject
   altered duplicates. Require voluntary peer explanation or an explicitly labeled source-review
   fallback before the fresh question. Pause on challenge; the host may resume with a note or
   discard. Discarded items cannot produce scores or delayed jobs.
C. Enable ONE real accessible model only after account/model support is verified. The starter's
   optional adapter is Gemini; do not invent a model ID or add AWS/NVIDIA for decoration. Keep
   provider none usable. Send only the minimum approved source and aggregate input. Treat course
   material as untrusted data. Validate structure and quoted evidence; do not claim this proves
   semantic correctness. Bound timeouts, handle provider errors and keep reviewed fallback hints.
   Models must not grade, approve plans, advance stages or write calendars. Record live evaluation
   separately from mocked tests. Do not make paid calls without the operator's authorization.
D. Finish manual timezone-aware scheduling and version-specific consent. Unknown availability is
   unknown, not free time. Require every participant to approve the same plan version. Changed
   windows invalidate approvals and stale reminders. Export ICS only for an approved plan; do not
   label that a Google Calendar write. Defer Google OAuth until the real study flow is reliable.
E. Import and test the three n8n templates. Configure API URL and Header Auth credentials privately.
   Start workflows inactive, dry_run=true and RELAY_DELIVERY_ENABLED=false. Test opted-in delivery,
   revoked consent, changed plan, duplicate executions, closed DMs, 429 and ambiguous timeouts.
   Keep jobs and state authoritative in the backend. Never expose the service key to the browser,
   store student answers in n8n execution logs, or use an old interaction token for next-day DMs.
   Publishing a workflow and enabling live messages require explicit operator authorization.
F. If linking the companion web room to a real Discord session, implement a short-lived,
   server-verified identity and membership flow with replay protection. Never put capability
   credentials in public links. Gate local demo identities, add rate limits and secure transport,
   and keep API tokens out of logs. If incomplete, keep the web room explicitly local/synthetic.
   Do not silently expose the demo creation API to the internet.

API AND TEAM CONTRACT
Use the existing stage values: lobby, diagnostic, discussion, transfer, debrief. Preserve its
server projections; question challenges are a paused overlay. Export OpenAPI and update synthetic
fixtures after agreed changes. Document all response/error changes for Dev. Do not create frontend
secrets, fake login endpoints, a second database or different scoring logic in a bot/workflow.

TESTS AND DEFINITION OF DONE
Add regression tests for every changed boundary. Cover privacy between participants, unauthorized
host actions, repeated submissions, stale stage transitions, source integrity, scheduling and jobs.
Do not weaken tests or bypass checks to make the demo green. Run the full local suite and compile
checks, then test real Discord, the chosen model, and n8n separately. Claim only what actually ran.
Document production gaps including retention/withdrawal behavior. Report each milestone with changed
files, commands/results, external checks still pending, and the next blocking dependency.

GIT
Commit only intended changes to rithik/core and push that branch after inspection. No force push,
secret commits, destructive reset, or silent merge to main. Propose a PR with actual test evidence.
When access is unavailable, report the error and leave the local commit intact.

Start by auditing and running the existing code, then implement the first working Discord cycle.
Deliver running code and tests, not only an architecture explanation.
