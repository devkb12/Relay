# Actual starter API: Rithik owns changes; Dev consumes it

This is documentation of the included code, not a proposed future API. Source of truth:
relay/api.py for requests and relay/core.py::_project for member-scoped responses.
contracts/openapi.json documents request inputs. Some response schemas are generic because the
starter returns dicts; use contracts/fixtures/ and the projection code for actual response fields.
Generate again with `python -m scripts.export_contract` after an agreed backend change.

## Auth and scope
- Same-origin browser UI is served by FastAPI at /; assets are /static/.
- Local create/join require RELAY_PUBLIC_DEMO=true. They are synthetic test identity endpoints,
  not Discord login. Set false on any untrusted deployment and implement identity first.
  With RELAY_ENV=production they always return 403, regardless of RELAY_PUBLIC_DEMO.
- Participant calls use Authorization: Bearer <participant-token>. Do not share tokens or put
  them in public URLs. A host token is still subject to server-side role checks.
- /internal/* requires X-Relay-Key. It is server-to-server only, never a browser credential.
- The prototype UI and Discord sessions are not automatically identity-linked.

## Browser-facing routes
| Method/path | Body | Result |
|---|---|---|
| GET /health | none | configured flags; not proof a model/provider call succeeds |
| GET /api/concepts | none | id/title choices only |
| POST /api/sessions | name, concept_id | session_id, token, member_id; local demo only |
| POST /api/sessions/{sid}/join | name | personal capability credentials; local demo only |
| GET /api/sessions/{sid} | none | member-scoped session view |
| POST /api/sessions/{sid}/advance | expected_stage | host-only stage transition |
| POST /api/sessions/{sid}/answer | question_id, choice, confidence, optional rationale | updated private view |
| POST /api/sessions/{sid}/explain | text, source_fallback | shared voluntary explanation; fallback host-only |
| POST /api/sessions/{sid}/facilitate | none | bounded hint or labeled fallback; host-only discussion |
| POST /api/sessions/{sid}/availability | windows: [{start,end}] | updated view; offset-aware ISO strings |
| POST /api/sessions/{sid}/propose | durations: [60,45,30] | {options,state,notice}; host-only |
| POST /api/sessions/{sid}/approve | version | approval for that plan version |
| POST /api/sessions/{sid}/consent | enabled | reminder preference and jobs updated |
| POST /api/sessions/{sid}/challenge | reason | paused-review state |
| POST /api/sessions/{sid}/resolve | decision: resume/discard, note | host-reviewed resolution |
| GET /api/sessions/{sid}/calendar.ics | none | text/calendar after all approve; NOT a calendar write |
| DELETE /api/sessions/{sid} | none | host removes local session/jobs |

## State projection
stage is exactly lobby, diagnostic, discussion, transfer or debrief. Map friendly UI labels to
those values; do not send invented stage names. revision supports stale-state awareness.
challenge.pending pauses scoring/progression without adding a stage. invalidated marks a discarded item.

Relevant fields: id, concept, stage, revision, pack_hash, is_host, members, me, plan, plan_version,
approved_count, approved_by_me, schedule_confirmed, question, my_answer, source, hint, explanations,
challenge, invalidated, my_results, group, notice. Fields can be null. The backend deliberately
withholds some fields at some stages. members carries name/responded/is_me, NOT peer answers.

Never expose private my_results on a public shared screen. A presentation toggle is display
behavior, not authorization. Group metrics are suppressed for fewer than three paired responders;
a small aggregate is not an anonymity guarantee. Do not fabricate a chart when group is null.

## Errors / behavior
401: missing or invalid bearer format. 403: role, credential, or demo restriction.
404: missing session. 409: changed stage, stale plan, locked answer, or blocked transition.
422: input validation. 400: other explicit domain errors. Error bodies include detail, which may
be a validation list. On 409 re-fetch the current view; do not force a local state transition.
Disable repeated submission while pending, but server idempotency is authoritative.

## Synthetic UI fixtures
contracts/fixtures/*.json were generated from the backend using original test material. They
contain no live users or credentials. Label them as fixture mode whenever used as the UI source.
The full scores in a fixture are not observed student outcomes. Do not use them in a pitch as data.

## Deferred endpoints
There are no Google OAuth, arbitrary course uploads, real browser/Discord linking, or participant
withdrawal endpoints yet. Add requests to docs/design/API_REQUESTS.md, not fictional calls.
