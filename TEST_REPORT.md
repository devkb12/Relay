# RELAY local test report

Run date: 2026-10-24. No remote GitHub repository was modified.

## Results actually obtained

| Check | Result | What it establishes |
|---|---|---|
| pytest | 78 passed | Local core/API behavior and mocked provider handling for the included tests. |
| Python compilation | Passed | Python source, including the bot adapter, is syntactically valid. |
| JavaScript syntax | Passed | web/app.js parses in the available Node runtime. |
| n8n export shape checks | Passed within pytest | JSON graphs have valid references and expected credential placeholders; not execution compatibility. |
| Desktop Chromium interactions | Passed | UI actions work with real FastAPI logic through an in-process test bridge. |
| Mobile 390px layout | Passed | No horizontal overflow in the captured state. |
| Reduced-motion browser setting | Exercised | UI honors the browser preference in its CSS; not a full accessibility audit. |
| Browser JavaScript errors | None captured | No page errors in the scripted scenarios. |

Current handoff run: see docs/verification/pytest-output.txt,
docs/verification/browser-test-report.json, and docs/verification/environment.json.

## Coverage examples

- Host-only transitions and participant authorization.
- Answer keys withheld before appropriate feedback, private rationale not projected to peers.
- Exact repeated answer idempotency and rejected altered duplicates.
- Explicit peer explanation or source-review fallback before a fresh question.
- Source/question snapshots remain stable when the global question bank changes.
- Question challenges pause the round; discarding an item suppresses scores and follow-ups.
- Invalid, missing, overlapping and timezone-aware schedule inputs.
- Version-specific approval and stale reminder invalidation.
- Separate reminder consent, revocation, opt-in restoration, duplicate job protection.
- Known retryable failures, blocked DMs, and ambiguous delivery held for inspection.
- Delayed questions cannot be accessed immediately by advancing a production clock.
- Optional model transport MOCKS: correct schema, missing key, wrong source, unsupported quote,
  review flag, numeric answer leakage, extra output fields, and unsafe model identifiers.

## Important testing boundary

The browser environment blocked ordinary localhost navigation. The browser test therefore loads the
actual HTML/CSS/JS offline and bridges fetch calls to FastAPI TestClient in the same process. This is
an interaction-and-application test, NOT a browser HTTP transport, reverse proxy, HTTPS, CORS, or
real-network test. The screenshot participants and outcomes are synthetic.

The model tests replace HTTP transport with fixtures. A successful mocked response is not a live
model call, an accuracy benchmark, or proof that semantic errors are prevented. The exact quotation
and output-schema checks leave interpretation errors possible.

## Not run or not implemented

- No Discord application was registered or contacted. discord.py could not be installed in the
  restricted environment; the adapter is syntax-checked only.
- No Gemini or other paid inference call was made. No model latency, cost or quality comparison ran.
- No n8n instance imported or executed the three JSON templates.
- No real calendar was connected or written. Google OAuth is not implemented.
- No live message, reminder, or next-day follow-up was delivered.
- No real student learning experiment was conducted. Do not use synthetic results as outcomes.
- Browser/Discord identity linking and production authentication are not implemented.
- No security penetration test, public-load test, or complete accessibility audit was performed.
- The participant withdrawal/timeout flow and automated data-retention cleanup remain future work.

## Before submission

Run the kit on the team's machines, exercise the actual Discord flow with consenting users,
configure and test one model, import/test n8n with delivery initially disabled, verify cancellation,
record a real demonstration, and accurately describe all remaining limits in the submission.

## Refreshed repository handoff checks (2026-10-24)

- Original baseline re-run: 70 passed before edits.
- Updated suite: 78 passed after adding seven safe-import tests and an explicit-model-ID test.
- Python compilation and web/app.js syntax check passed.
- Synthetic desktop/mobile browser checks were re-run: passed, no captured page errors.
- Full importer dry-run and apply succeeded in a disposable local Git checkout with a declared
  devkb12/Relay origin. No remote was contacted; .git stayed unchanged and .env was not imported.
- API input schemas and synthetic state fixtures were generated from the included backend.
- n8n JSON parses and now starts inactive/dry-run. It was not executed in n8n.
- CI configuration is included but has not run on GitHub.
- Rithik owns ALL backend/core/Discord/n8n. Dev owns frontend/design; old assignments were replaced.
- No files were pushed to a remote repository by this handoff process.
