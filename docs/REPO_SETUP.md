# Setup and publish to devkb12/Relay

## What is in the archive
The ZIP entries are at the project root: CLAUDE.md, README.md, relay/, web/, n8n/, etc.
Extract to a temporary folder OUTSIDE the existing Git checkout. Do not commit the ZIP itself.
The Python package folder is named relay; that folder legitimately belongs inside the repository.
Do not accidentally add another wrapper directory above README.md.

## Connected Claude Code workflow (recommended)
1. Download/extract the starter where your connected Claude session can read it.
2. Paste docs/prompts/00_BOOTSTRAP.md and give the extracted directory's actual path.
3. Let the import detect differences; review any collisions instead of overwriting teammates.
4. After a verified bootstrap is on main, Rithik uses docs/prompts/01_RITHIK_CORE.md and Dev uses
   docs/prompts/02_DEV_FRONTEND.md in separate local clones/worktrees and separate branches.

A Claude cloud session may not have access to your laptop Downloads folder. Upload the extracted
files through that environment's supported mechanism or import using your local checkout first.
A connection in Claude does not create a GitHub write connection in this chat.

## Optional safe importer (Windows)
Example paths only: replace them with your real folders. Run from the EXISTING checkout.

```powershell
$Kit = "$HOME\Downloads\Relay_Repo_Ready"
py "$Kit\scripts\import_starter.py" --target "$PWD"
py "$Kit\scripts\import_starter.py" --target "$PWD" --apply
py scripts/setup_local.py --install
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m uvicorn relay.api:app --reload --host 127.0.0.1
```

The importer checks origin is devkb12/Relay and refuses every differing file; it does not push.
The setup script generates a private service key for a new .env and preserves an existing .env.
Its pip install needs internet access. It does not enable a model, send messages or deploy.

## macOS (Dev)
After the bootstrap is available:

```bash
git clone https://github.com/devkb12/Relay.git
cd Relay
git switch -c dev/uiux
python3 scripts/setup_local.py --install
.venv/bin/python -m uvicorn relay.api:app --reload --host 127.0.0.1
```

If Dev already has the checkout, fetch/pull the main branch without discarding local work instead
of cloning inside it. Create the branch only once; switch to it on later sessions.

## Publish the bootstrap: only when the remote is confirmed empty
From the imported root, with tests passing and credentials available:

```bash
git status --short
git remote -v
git fetch origin
git ls-remote --heads origin
```

An empty successful ls-remote result means no remote branches, NOT a failed authentication call.
If main already exists, reconcile and use a setup branch/PR. Do not replace the remote history.
For a genuinely new repository, explicitly stage only reviewed project files:

```bash
git add .gitignore .gitattributes .env.example .github CLAUDE.md README.md TEST_REPORT.md requirements.txt pytest.ini relay web n8n data docs contracts scripts tests
git diff --cached --stat
git diff --cached
# Check the entire staged diff for secrets and unintended files before continuing.
git commit -m "Initialize RELAY Track 3 starter and team handoffs"
git branch -M main
git push -u origin main
```

Do not run an origin-add command if origin already exists. Do not force-push, bypass protection,
or commit .env, databases, token-bearing screenshots, generated user logs or real student data.
GitHub access/SSH/credential failures require fixing authentication, not loosening repository access
or pasting tokens into a chat. If git commit requests identity, configure your own name/email;
do not invent them. Initial push is for bootstrap only, not an agreement to deploy.

## Continue in parallel
- Rithik: git switch -c rithik/core (after bootstrap), then normal commits and push of that branch.
- Dev: git switch -c dev/uiux, then normal commits and push of that branch.
- Review and merge vertical slices to main with tests. No force-push or cross-owner staging.
- Shared API changes go through contracts/; current ownership is docs/TEAM_OWNERSHIP.md.

## n8n
Import JSON individually, attach credentials privately, change the placeholder API URL, and leave
workflows unpublished/dry-run until actual permission and delivery tests pass. localhost inside
n8n Cloud cannot reach your laptop's localhost. Use a deliberately deployed, authenticated HTTPS
API or a permitted private development connection; do not publicly expose the synthetic web demo.

## What this package does not claim
No remote GitHub push, live Discord registration, live model request, n8n execution or Google
Calendar OAuth was performed in the preparation environment. Local verification is not deployment.
