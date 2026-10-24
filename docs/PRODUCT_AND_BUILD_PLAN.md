# RELAY: product decision and two-person build plan

## Final positioning

Find the time. Pass the understanding.

Scheduling gets the students into a session; the learning loop is the distinguishing
experience. Do not pitch "Calendar + quiz + AI" as an unprecedented invention. Existing
products already support group quizzes, AI study materials, and scheduling. The working
combination to demonstrate is private attempts, evidence-aware peer discussion, a new
application, and a separately timed follow-up.

## Keep / change / defer from Dev's proposal

KEEP: manual availability, a real Discord group, everyone confirming the same time,
private initial responses, peer explanations, fresh questions, and a group debrief.
CHANGE: say "checks a new application" rather than "makes sure everyone understands".
Do not let scheduling consume the critical learning demonstration. A common free window
is computed by code, not negotiated by unconstrained model text. Use 30/45/60-minute
alternatives explicitly, not silently shorten a student's session.
DEFER: multi-user Calendar OAuth, automatic exam discovery, arbitrary PDF ingestion,
unlimited live question generation, voice, custom ML training, and several model providers.

## Four distinguishing behaviors

1. **Confidence check without a public ranking.** A high-confidence wrong choice can prompt
   investigation, not a diagnosis of the learner. Do not reveal group answer distributions
   before the independent attempts are locked.
2. **Peer-first quiet period.** Invite a voluntary explanation. A learner can pass. The bot
   supplies a concise source-based hint, not a wall of answers. A source-review fallback is
   explicitly recorded when nobody volunteers; do not count that as peer teaching.
3. **Fresh application.** Change the scenario and the quantities or reasoning conditions.
   A copied wording change is insufficient. Do not reuse the first answer as the "after" test.
4. **Challenge the item.** Any participant can flag an ambiguous source or question. Pause
   scoring, inspect evidence, and discard questionable items rather than label students wrong.

A delayed practice check is a separate observation. The 24-hour default is a product choice,
not an experimentally established optimal interval for every subject. Let students disable
it and respect any exam timing or quiet-hour constraints in a later version.

## The actual two-person MVP

One Discord test server, four participants, three original concepts available, one concept per
session, reviewed MCQ keys, optional live facilitation, and one delayed follow-up. Manual
availability plus .ics is sufficient. The group discussion can be text or an in-person
conversation; a voice-transcription system is not required.

## Gates instead of optimistic hour estimates

A. /relay create + /relay join work from two real Discord accounts.
B. Independent attempts stay private; the group sees only response completion.
C. An explanation or explicit fallback unlocks a different question.
D. Item challenge can pause/discard, and final results distinguish skipped/incorrect/missing.
E. Manual schedule approval survives changed availability and stale button clicks.
F. An actual opt-in reminder is delivered once, with revocation tested beforehand.
G. Visual polish and the short demonstration are rehearsed on the exact deployment.

If a gate fails, remove the optional feature that is blocking it. Do not add OAuth while
Gate B is broken. Do not polish a landing page instead of fixing Gate C.

## Work split and integration contract

Rithik owns all core/backend work, Discord integration, AI, n8n, deployment and API contracts.
Dev owns frontend implementation, original graphics, responsive UX, transitions and UI tests.
Both work against the documented API; the Discord bot should not independently calculate scores
or write a second database. Merge when each vertical slice works. Keep one main demo branch.
Sankalp's support request should be bounded: review one session screen and the mobile drawer.
Kanha's support request should be bounded: recruit a small consenting test group and challenge
what the demo claims. Neither is a required full-time dependency for this Track 3 build.
