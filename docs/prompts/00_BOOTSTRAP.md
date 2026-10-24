You are working in the connected GitHub repository devkb12/Relay. Bootstrap the supplied RELAY
starter safely; do not create a replacement application.

1. Inspect the current directory, git status, branch, recent commits and origin. Verify origin is
   the intended devkb12/Relay repository. Preserve all teammate changes and the .git directory.
   The screenshot was empty earlier, but do not assume the remote is still empty. Fetch before
   deciding what to push. Never force-push or reset another person's work.
2. Find the extracted Relay_Repo_Ready bundle provided in this session or the local Downloads
   folder. Its root contains CLAUDE.md, README.md, relay/, web/, n8n/ and contracts/.
   Import those CONTENTS at the existing repository root, not another Relay folder. Never import
   .env, runtime databases, cached files or .git. The included scripts/import_starter.py can
   preview a safe import and refuses to overwrite differing files. Review collisions individually.
   If this Claude environment cannot access the attachment, say exactly where it must be uploaded;
   do not pretend to have imported it or regenerate a different product from memory.
3. Read CLAUDE.md, docs/TEAM_OWNERSHIP.md, docs/API_CONTRACT.md and TEST_REPORT.md.
   Latest ownership: Rithik handles all backend, Discord, AI, auth, n8n and deployment; Dev handles
   frontend/UI/UX, original graphics and transitions. Keep Track 1 and Track 2 out of this repo.
4. Create an isolated Python environment and install requirements. Create .env locally from the
   template only if absent. Generate a service key privately; never print it. Start with provider
   none, delivery false, and synthetic browser access limited to localhost. Run pytest, Python
   compilation and JavaScript syntax checks. Attempt browser checks when available; report skips.
5. Inspect the staged diff and excluded files. Commit only intended project files. If the remote
   truly has no commits, push the bootstrap as main, provided branch policy and permissions allow.
   Otherwise use setup/relay-starter and open a PR using authenticated tooling if available.
   Do not overwrite a protected main or claim a PR/push succeeded without verifying the result.
6. Report files imported, exact test results, branch, commit and verified remote outcome. List
   missing external credentials without asking the user to paste secrets into the chat. Do not
   publish the demo, enable reminders, send messages or make paid model calls during bootstrap.
