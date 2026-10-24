"""Disposable n8n execution check: imports the committed workflows into a throwaway n8n container,
points them at a local dry-run API with a one-off key, and executes each trigger branch.
Usage: python scripts/n8n_local_check.py .   (requires Docker; pulls n8nio/n8n:latest)
This proves import + HTTP/credential wiring, NOT that a published schedule fires or that a DM is delivered."""
import json, os, secrets, shutil, socket, sqlite3, subprocess, sys, tempfile, time
from pathlib import Path
import httpx

REPO = Path(sys.argv[1]).resolve()
PY = REPO / '.venv' / 'Scripts' / 'python.exe'
work = Path(tempfile.mkdtemp(prefix='relay-n8n-'))
key = secrets.token_urlsafe(40)
with socket.socket() as s:
    s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
db = work / 'api.sqlite3'
env = {k: v for k, v in os.environ.items() if not k.startswith(('RELAY_', 'DISCORD_', 'GEMINI_'))}
env.update(RELAY_DB=str(db), RELAY_SERVICE_KEY=key, RELAY_DELIVERY_ENABLED='false', RELAY_MODEL_PROVIDER='none',
           RELAY_PUBLIC_DEMO='false', RELAY_SERVE_WEB='false')
host = '127.0.0.1'
api = subprocess.Popen([str(PY), '-m', 'uvicorn', 'relay.api:app', '--host', host, '--port', str(port), '--log-level', 'warning'],
                       cwd=REPO, env=env)
try:
    for _ in range(60):
        try:
            if httpx.get(f'http://127.0.0.1:{port}/ready', timeout=1).status_code == 200: break
        except httpx.HTTPError: time.sleep(0.25)
    con = sqlite3.connect(db)
    con.execute("INSERT INTO jobs(id,session_id,member_id,kind,due_at) VALUES('seeded-due','s1','discord:1','retention',1)")
    con.commit(); con.close()

    wf = work / 'wf'; wf.mkdir()
    i = 0
    for path in sorted((REPO / 'n8n').glob('*.json')):
        base = json.loads(path.read_text())
        # CLI execution needs an Execute Workflow Trigger; one copy per real trigger branch.
        targets = [c['main'][0][0]['node'] for name, c in base['connections'].items()
                   if next(x for x in base['nodes'] if x['name'] == name)['type'].endswith(('scheduleTrigger', 'errorTrigger'))]
        for t in targets:
            i += 1
            flow = json.loads(json.dumps(base)); flow['id'] = f'relaycheck{i:06d}'; flow['name'] += f' [{t}]'
            # n8n's CLI starts from the first trigger it finds, so keep only this branch.
            trig = next(n for n, c in base['connections'].items() if c['main'][0][0]['node'] == t)
            keep, frontier = {trig}, [trig]
            while frontier:
                cur = frontier.pop()
                for e in base['connections'].get(cur, {}).get('main', [[]])[0]:
                    if e['node'] not in keep: keep.add(e['node']); frontier.append(e['node'])
            flow['nodes'] = [n for n in flow['nodes'] if n['name'] in keep]
            flow['connections'] = {k: v for k, v in flow['connections'].items() if k in keep}
            for n in flow['nodes']:
                if n['type'] == 'n8n-nodes-base.httpRequest':
                    n['parameters']['url'] = n['parameters']['url'].replace('https://relay-api.example.invalid', f'http://host.docker.internal:{port}')
                    n['credentials'] = {'httpHeaderAuth': {'id': 'relaycheckcred1', 'name': 'RELAY check key'}}
            flow['nodes'].append({'id': 'cli-start', 'name': 'CLI check start', 'type': 'n8n-nodes-base.executeWorkflowTrigger',
                                  'typeVersion': 1.1, 'position': [0, 0], 'parameters': {'inputSource': 'passthrough'}})
            flow['connections']['CLI check start'] = {'main': [[{'node': t, 'type': 'main', 'index': 0}]]}
            (wf / f'{i:02d}.json').write_text(json.dumps(flow))
    count = i
    (work / 'creds.json').write_text(json.dumps([{'id': 'relaycheckcred1', 'name': 'RELAY check key', 'type': 'httpHeaderAuth',
                                                  'data': {'name': 'X-Relay-Key', 'value': key}}]))
    script = ('n8n import:credentials --input=/files/creds.json && n8n import:workflow --separate --input=/files/wf && '
              + ' && '.join(f'echo "=== EXEC relaycheck{i:06d}" && n8n execute --id=relaycheck{i:06d} --rawOutput' for i in range(1, count + 1)))
    out = subprocess.run(['docker', 'run', '--rm', '--add-host=host.docker.internal:host-gateway',
                          '-v', f'{work.as_posix()}:/files', '--entrypoint', 'sh', 'n8nio/n8n:latest', '-c', script],
                         capture_output=True, text=True, timeout=600)
    text = (out.stdout + out.stderr).replace(key, '<redacted>')
    print('docker exit', out.returncode)
    print(text)
    con = sqlite3.connect(db)
    print('automation_errors rows:', con.execute('SELECT workflow,execution FROM automation_errors').fetchall())
    print('seeded job status (dry run must leave it pending):', con.execute("SELECT status FROM jobs WHERE id='seeded-due'").fetchone())
    con.close()
finally:
    api.terminate(); api.wait(10)
    shutil.rmtree(work, ignore_errors=True)
