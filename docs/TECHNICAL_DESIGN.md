# Technical design and explicit boundaries

## Architecture

Discord gateway adapter -> authenticated internal API -> persistent session engine
Browser room -> participant bearer token -> the SAME session engine
Session engine -> optional facilitator request -> validated output or reviewed fallback
Session engine -> durable jobs -> n8n tick -> delivery adapter

The bot performs Discord authentication; the backend trusts only authenticated internal
requests from the bot, not arbitrary browser-supplied Discord IDs. The supplied local
browser uses test identities and is not production identity verification.

## State machine

LOBBY -> DIAGNOSTIC -> DISCUSSION -> TRANSFER -> DEBRIEF

Any active learning phase can be paused for ITEM_REVIEW. A host can record a source review
and resume the original item, or discard it and suppress the result. The original question
is never silently rewritten under already-submitted answers.

A source/question pack is copied into each session with a hash. A new file or deployment
cannot change its answer key. Answer receipts are write-once per participant per phase;
identical repeats are harmless and conflicting repeats fail. Stage actions carry the
expected stage. Calendar approvals carry a proposal version. Long-running model outputs
carry the session revision and are rejected when their input snapshot is stale.

## AI roles, not autonomous authority

**Pack author (planned, not wired into the live starter):** draft concepts, question pairs,
misconception labels, and exact source references from authorized material. Output remains
DRAFT until reviewed. Never let generated questions go straight to live grading.
**Facilitator (implemented optional adapter):** generate one question that stimulates peer
reasoning using a source and aggregate patterns. No names or private rationales needed.
**Item reviewer (human, supported by code):** inspect questions and challenges. A second
model may help find errors, but agreement between models is not independent proof.

The code owns grading against reviewed objective keys, identity, consent, scheduling,
proposals, state transitions and job delivery. These are not delegated to an LLM.

## Model selection

The optional adapter uses Gemini generateContent with a model identifier that the team must
explicitly verify in its own account. Curated mode remains the default. No specific model ID,
provider latency, cost, or quality is certified by this kit's mocked tests.

Choose one accessible model. Bedrock, NVIDIA-hosted inference and Claude are alternatives,
not additional implemented adapters. Do not introduce them unless they solve a specific measured
problem. Feature support, permissions and regional access must be checked per account/model.

No custom training is justified by this prototype's tiny dataset. No embeddings/vector database
are required for three short source notes. A later multi-document version can add retrieval with
source spans and versioning. Similarity alone is not factual verification.

## Model acceptance checks

Valid schema, known source_id, exact evidence quote within the source, sensible length,
no numerical answer revealed in a discussion prompt, and no needs_review flag. The quote
check establishes provenance only; semantic correctness still needs evaluation. On failure,
show the reviewed fallback and label its mode. Do not hide a fallback as a live-model result.

## Scheduling

Each participant supplies offset-aware availability. Missing availability is unknown, not free.
The engine intersects windows for all members and proposes requested duration first, then
explicitly labeled shorter alternatives. Changing availability or roster invalidates approvals.
All current participants approve before .ics download. This export does not create a Google event.

Later Google integration: request each participant's authorization, query free/busy only for
calendars the credential can access, treat errors as unknown, and request separate event-write
permission for the organizer. Create one event only after current-version approval. Sending
an invitation does not mean it was accepted or that people attended. Store provider IDs and
reconcile uncertain outcomes rather than retrying writes blindly. Never use Dev's credential
as if it authorized access to every student's calendar.

## Persistence and hosting

SQLite is adequate for this small, single-process demonstration with a persistent disk.
The prototype uses short write transactions. A multi-instance deployment should move to
PostgreSQL and explicit row-level authorization. Do not put the database on ephemeral storage.
The Discord gateway process should remain running; it is not a normal serverless request handler.

## Deliberately absent

Production OAuth, automatic PDF parsing, streaming audio, an unbounded agent loop, vector search,
learner ability models, psychometric calibration, automatic expiration, analytics collection,
and multi-tenant administration. These are not hidden completed features.
