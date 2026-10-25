# Frontend requests to Rithik

The Next.js app (`web/`, branch `dev/uiux`) uses only documented routes. Every row below is a gap
the UI handles honestly today (it says what it can't show). Nothing is faked.

Updated 2026-10-24. Starter rows now implemented on `main` were removed: Discord-to-web identity
(OAuth + cookie + CSRF), participant withdrawal (`/leave`), host nonresponder policy. Still deferred
and still not claimed by the UI: public production deployment, Google Calendar linking.

| # | Need | Why the UI needs it | Minimum change asked | Today the UI… |
|---|---|---|---|---|
| 1 | Update CLAUDE.md and docs/UI_SPEC.md for the agreed frontend-only Next.js migration | Both still say not to migrate | Edit the two files (decision recorded in docs/design/DECISIONS.md) | — |
| 2 | Limit FastAPI's static mount to the three legacy files | `app.mount('/static', StaticFiles(directory=web))` would serve `web/src`, `web/node_modules`, `web/.next` and any stray `web/.env*` when `RELAY_SERVE_WEB=true` locally | Serve only `index.html`, `app.js`, `style.css` (or move them to `web/legacy/`) | Keeps secrets out of `web/`; production already sets `RELAY_SERVE_WEB=false` |
| 3 | Adopt CI for `web/` | `web/` isn't built or tested in CI | Use `docs/design/ci-web.example.yml` | Checks run locally only |
| 4 | Projector credential | Presentation mode uses a participant's credential; a shared screen shouldn't hold one | A read-only, revocable, group-only credential scoped to `GET /presentation` | Labels it "Display only, not access control" |
| 5 | Who has approved (names, not choices) | Roster rings can only show *your* approval | `members[].approved: bool` for the current `plan_version` | Shows `approved_count/active` and your own state |
| 6 | Who still needs availability | Missing availability is only a 400 message | `members[].has_availability: bool` in the lobby | Shows the server's message verbatim and what to do |
| 7 | Choose among proposed options | The server auto-picks the first option; the rest exist only in the host's propose response | `POST /select-plan {start}` (host), invalidating approvals | Lists other times read-only, labeled "from the last proposal" |
| 8 | Plan history | Only the current `plan_version` exists | `plan_history: [{version, start, minutes, cancelled}]` | Shows "v7 → v8" only for changes seen while the page is open |
| 9 | Presence | No online/offline signal | Optional `members[].last_seen_bucket` ("now" / "earlier") | Shows no presence dots or typing indicators |
| 10 | Anonymous group availability | No group overlap view | Optional per-15-minute count of members free (no names) | Shows only your own windows |
| 11 | Topics to retry | Debrief derives topics only from your non-correct results + the concept title | Optional `my_results[*].topic` from the reviewed pack | Uses concept title + question label |

Frontend owner: add rows here; never call undocumented routes. Rithik: update the contract and
fixtures when a row is agreed, then run `npm run sync-fixtures` in `web/`.
