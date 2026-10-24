# Research and design rationale

Reviewed on 2026-10-24. Public documentation can change. These sources support specific design
choices; they do not establish that RELAY improves grades, that its design is globally unique,
or that it will win the hackathon. No live competition-gallery audit was completed.

## 1. Track requirements

Official challenge: https://hackathon.cubbie.ai/
Official rules: https://raw.githubusercontent.com/imaginix-inc/cubbie-hackathon-kit/main/skills/cubbie-hackathon/references/rules.md

Track 3 asks for a useful/playful/surprising campus group-chat assistant and permits Discord and
external frameworks. Track 1 must be submitted first. Track 3 requires a GitHub repository;
website and video are optional. Exact deadlines come from live settings, not this document.
The published page does not supply a complete current Track 3 scoring rubric.

## 2. Related products: what is NOT novel

Quizlet Live: https://quizlet.com/us/features/live
Kahoot study: https://kahoot.com/kahoot-study/

These official pages describe collaborative review and AI-supported study. Uploading notes,
generating quizzes, adding points, or running team questions is therefore not an adequate novelty
claim. RELAY's proposed differentiation is the complete peer-first, source-grounded, independently
rechecked conversation, including question challenges and permission-based later practice.
That combination still needs a broader competitive review and real student validation.

## 3. Educational evidence, with limits

Smith et al. (2009), "Why peer discussion improves student performance on in-class concept
questions": https://europepmc.org/article/MED/19119232

This study used a different question on the same concept after peer discussion. It motivates
RELAY's independent fresh-application check. The study context does not prove this prototype's
learning effectiveness. Repeating a near-identical question may measure copying or recognition.

Karpicke and Roediger (2008), "The critical importance of retrieval for learning":
https://pubmed.ncbi.nlm.nih.gov/18276894/

The reported vocabulary experiment supports testing delayed retrieval rather than relying on
immediate confidence. RELAY's default 24-hour reminder is a product choice, not a universally
optimal interval established by this study. Sending a reminder is not evidence of retention.

## 4. Discord implementation

Interactions: https://docs.discord.com/developers/interactions/receiving-and-responding
Rate limits: https://docs.discord.com/developers/topics/rate-limits

Use slash commands, modals, and private/ephemeral responses. Acknowledge an interaction within
three seconds before model work. Interaction tokens expire after 15 minutes; a next-day check
must use a normal bot message, not a saved follow-up token. Respect retry_after on rate limits.
A private response is still processed by the service; it is not anonymous to the backend.

## 5. Scheduling and Google Calendar

Free/busy: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
Event insertion: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
OAuth web server flow: https://developers.google.com/identity/protocols/oauth2/web-server

The MVP uses manual intervals and downloadable ICS after all approvals. Google integration is
not implemented. A future version should use each student's consent, narrow scopes, and server-side
token protection. Free/busy avoids requesting event titles; unavailable/error calendars are unknown,
not free. Event creation is a separate permission and invitations are not proof of acceptance.

## 6. AI model choices

Gemini model catalog: https://ai.google.dev/gemini-api/docs/models
Structured output: https://ai.google.dev/gemini-api/docs/generate-content/structured-output
Claude model overview: https://platform.claude.com/docs/en/models/overview
Amazon Bedrock structured output: https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html
NVIDIA hosted API quickstart: https://docs.api.nvidia.com/nim/docs/api-quickstart
Anthropic workflow design: https://www.anthropic.com/research/building-effective-agents

The implemented OPTIONAL adapter uses Google's generateContent API and structured JSON output.
The handoff now requires an explicit account-verified model identifier; no fixed model is assumed. It has been transport-mocked, not called with a live key. Access, latency, cost,
provider data handling, and quality require your own account test. A configurable provider is more
important than an untested claim that one model is best. Bedrock/NVIDIA/Claude alternatives are
researched options, not adapters implemented in this kit.

Valid JSON and an exact supporting quotation do not prove semantic correctness. Keep reviewed
answer keys, small task scope, no model tools, a human challenge/review path, and a curated fallback.
Uploaded content must be treated as untrusted data, not instructions. No local model training,
GPU setup, or complex autonomous framework is necessary for the MVP.

## 7. n8n

Webhook: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/
Schedule Trigger: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/
HTTP Request: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/
Error handling: https://docs.n8n.io/build/flow-logic/handle-errors-gracefully.md

Use a published schedule with the correct timezone and authenticated HTTP calls. Test and production
webhook URLs are distinct when webhooks are used. This kit deliberately uses scheduled polling of a
backend job outbox, rather than holding sensitive answer data inside long-running workflows.
Exports need importing, credential configuration, version checks, and live testing in your instance.

## 8. Interface and accessibility

Motion accessibility: https://motion.dev/docs/react-accessibility
WCAG animation from interactions:
https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html

Honor reduced-motion preferences. The supplied UI uses CSS rather than Motion/React to reduce
setup work. Keyboard focus, text labels, private-result separation, and reduced motion are included;
this is not a complete accessibility audit or certification.

## What remains an inference or product hypothesis

- Students will prefer short peer-first sessions to a normal chatbot.
- Scheduling plus learning will improve return usage.
- Source challenges will improve trust in practice.
- A fresh-question result generalizes to another topic or a real exam.
- The design is more competitive than every other current hackathon entry.

Test these with actual users and disclose the limits. Do not turn prototype fixtures or synthetic
browser results into claimed student outcomes.
