# n8n workflows: useful, small, and permission-aware

## Why three small workflows

n8n handles scheduled work; the backend holds the authoritative facts. A workflow should not
maintain a second copy of answers, decide that someone mastered a concept, or create calendar
writes from untrusted model output. Small graphs are deliberate, not a lack of sophistication.

## 01 - Approved-session reminders

Schedule Trigger (every minute)
  -> authenticated HTTP POST /internal/automation/tick
     body: {"kind":"reminder","dry_run":false}
  -> backend claims due jobs, rechecks consent and current approved proposal, sends a private DM,
     records the provider message ID or a clear failure state.

Changing a proposed time invalidates the old reminders. Public messages should not contain
individual schedules. A reminder only exists after all participants approve the current time
and the recipient opts into notifications.

## 02 - Delayed practice

Schedule Trigger (every minute)
  -> authenticated HTTP POST /internal/automation/tick
     body: {"kind":"retention","dry_run":false}
  -> backend finds due opt-in practice checks, rechecks consent, sends one neutral private prompt.

The question and its answer stay in the backend. n8n does not need private responses, names,
source text, or answer keys. A sent message is not a completed test. The student still answers
through /relay question. The included due time is 24 hours; do not present an immediate demo
jump as a real delayed-learning measurement.

## 03 - Privacy-minimized error handler

Error Trigger -> Code node retaining only workflow name/execution ID
  -> authenticated POST /internal/automation/error

Assign this workflow under the two scheduled workflows' error-workflow setting. It records
operational identifiers, not raw answers, credentials, or provider error bodies. To alert Rithik,
add a separate private administrative channel only after reviewing what the alert contains.
Do not post exceptions into the student group.

## Import and configure

1. Import each JSON through n8n's workflow import function.
2. Replace `https://relay-api.example.invalid` with your actual HTTPS backend address.
   n8n Cloud cannot reach your laptop's localhost. Use a deployed API or an approved tunnel
   and keep the internal header credential required.
3. Create HTTP Header Auth: name X-Relay-Key, value matching RELAY_SERVICE_KEY.
4. Select that credential on every HTTP node. No credential values are embedded in the exports.
5. Check each node version against your installed n8n release and execute it manually first.
6. Set workflow timezone to America/Phoenix and publish the scheduled workflows.
7. Leave RELAY_DELIVERY_ENABLED=false for a dry run; inspect the returned due-job counts.
8. Connect the bot token and explicitly enable delivery only after permission and cancellation tests.
9. Verify an actual consented message, a revoked-consent case, and a stale-schedule case.

The exports disable saving successful and failed execution payloads. Check your n8n instance's
settings, infrastructure logs, credentials handling, and organizational policies as well. This
setting is not a guarantee that all external systems discard their logs.

## Delivery semantics

Jobs have stable unique IDs. Known 429 responses use the provider's retry_after value.
A timeout after a message POST can mean the message was accepted; the job becomes UNKNOWN
and is held for inspection instead of being blindly retried. An expired in-flight lease also
becomes UNKNOWN. This sacrifices automatic delivery in ambiguous cases to reduce duplicate spam.
Do not claim mathematically exactly-once delivery across two systems.

Consent is checked immediately before delivery, but revocation cannot retract a message already
accepted by Discord. A closed DM is a failed delivery, not proof the student received a reminder.

## Additional workflow only after the MVP

A draft question-pack workflow could be: authorized note -> source-span extraction -> model draft
-> deterministic structural checks -> human review -> approved pack registry. It is not included
as a live JSON graph because the starter intentionally does not implement the required upload and
review endpoints. Do not point an imported workflow at imaginary endpoints and call it complete.
