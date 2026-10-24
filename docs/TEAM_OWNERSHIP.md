# Current two-person work split

This file supersedes the earlier plan that assigned Discord/n8n to Dev.

| Owner | Files | Deliverable |
|---|---|---|
| Rithik | relay/, n8n/, data/, contracts/, tests/, .github/, Python tooling, root configuration | All core behavior, Discord integration, AI, scheduling, permissions, jobs, deployment |
| Dev | web/, web/assets/, docs/design/, scripts/browser_check.py, optional tests/frontend/ | Frontend design, original graphics, motion, responsive UX, API-driven controls |
| Both review | docs/API_CONTRACT.md, README, demo acceptance | Integration without silently changing the other owner's interface |

## Branches
Bootstrap once; put the verified baseline on main. Then Rithik uses rithik/core and Dev uses
dev/uiux. Each starts from the same bootstrap commit. No simultaneous edits in one working
directory: use separate clones or worktrees. Keep each developer's branch current using normal
merge/rebase practices agreed by the team; do not force-push a shared branch.

## Integration agreement
Dev consumes the real API and checked-in synthetic fixtures. Rithik owns API changes and exports
contracts/openapi.json after changes. A fixture is explicitly labeled demo data, never live data.
Dev documents missing fields in docs/design/API_REQUESTS.md instead of modifying core files.
Rithik implements agreed API additions and coordinates fixture updates. Use rendered text, not
unsafe HTML, for model/source/peer content. The Next.js app proxies /api and /auth same-origin to
FastAPI (docs/NEXTJS_BACKEND_HANDOFF.md); /internal is never proxied.

## Important shared boundary
The existing browser identity selector is local test infrastructure, not Discord login. Public
web access and Discord-to-web linking require Rithik's server-verified identity/membership flow.
Dev can build a screen for that flow, but cannot claim authentication exists before it does.
Backend authorization remains necessary even when a control is hidden in the frontend.

## Checkpoints
1. Both machines run the same starter and tests.
2. Dev renders every actual stage from contract fixtures; Rithik completes two real Discord users.
3. One integrated learning loop, then one approved schedule, then one consented reminder.
4. Together test stale state, question challenge, privacy and provider failure before demo polish.
Sankalp reviews one working screen; Kanha reviews the teaching scenario. Neither blocks delivery.
