# Reference audit and archived-finding reproduction (2026-10-25)

## What was actually inspected

| Target | Access | Observed (not assumed) |
|---|---|---|
| https://rumi-lemon.vercel.app | fetched as text | One promise ("Find a roommate you'll actually like living with"), a product mockup, numbered "how it works", trust row, safety section, FAQ, one repeated CTA to `/login`. Mock profiles are illustrative. Colours/fonts not inspected (text fetch only). |
| https://github.com/kjodhpur/Rumi | not inspected | — |
| https://relay-two-lovat.vercel.app | fetched as text + endpoint probes | The previous RELAY landing ("Find the time. Pass the understanding."); `/connection` `{"connected":false}`; `/health` 503 `backend_not_connected`; `/internal/jobs` 404 |
| The supplied `relay_experience_reference.html` | read in full | An original design specimen with fictional data; not production code |

What RELAY borrows is coherence: one promise, the product shown doing the promise, one obvious next
step, and designed states. No Rumi text, assets or code were copied.

## Archived starter findings, rechecked against the current Next.js app

| Finding (archived static UI) | Current app before this change | Now |
|---|---|---|
| F1 Task starts far down (task y=528, Fresh-problem action y=1033 at 1440×900) | task card y≈341; Lock my answer y=1191 (below the fold) | task card **y=317**; Lock my answer **y=854** (inside 900). Discussion's host action y=979: the explanation feed is deliberately the dominant content there. Phone 390×844: task y=385 (archived 597). Enforced by `web/tests/e2e/sample.spec.ts` |
| F2 Unsent host review note lost on an unrelated revision | Not reproducible: notes are React state that survives polls. **But** a different real loss existed: during the 200 ms stage transition the outgoing card re-rendered the new stage, so a selection made then was discarded. Also a deleted session or expired sign-in during a room was silent | Fixed (each card keeps its own context). `web/tests/e2e/drafts.spec.ts` reproduces the archived sequence on a real FastAPI (another member changes consent, then leaves) and checks answer, reasoning and review-note drafts survive; deletion shows "Session not found" with the view kept |
| F3 Navigation-shaped divs | Not present: stepper stations are links or plain labels | unchanged |
| F4 Developer-prototype entry | Already separated (`/demo` vs `/room`) | `/demo` is now an interactive sample round; `/room` explains sign-in, the bot, the server and the session as four separate things |
| F5 Scheduling competes with the task | Schedule card always in the side column | scheduling is a summary in context; the sample round has none |

Measured with Playwright (Chromium) against `next start` + local FastAPI. Not measured: 1280×800,
768×1024, 200 % zoom, a person using a screen reader, Lighthouse.
