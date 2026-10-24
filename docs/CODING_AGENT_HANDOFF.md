# RELAY Claude Code handoff: current ownership

The user changed the work split after the original kit. This version supersedes that plan.

1. Run docs/prompts/00_BOOTSTRAP.md once in the connected devkb12/Relay checkout.
2. Rithik uses docs/prompts/01_RITHIK_CORE.md on rithik/core.
3. Dev uses docs/prompts/02_DEV_FRONTEND.md on dev/uiux after pulling the bootstrap.

Rithik owns all core logic, Discord integration, AI, n8n, scheduling, backend identity and deployment.
Dev owns frontend design, graphics, transitions and interface implementation. The contract under
contracts/ is the shared interface. Do not implement two scoring engines or invent endpoints.

Read docs/REPO_SETUP.md for import/push instructions and docs/TEAM_OWNERSHIP.md for file ownership.
Local test claims are in TEST_REPORT.md. External integrations remain unverified unless explicitly
recorded by the team after a real run. No remote repository was modified while preparing this kit.
