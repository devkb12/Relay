"""Run RELAY's production configuration on one laptop ($0 hosting).

    python -m relay.local_host check --env-file "%LOCALAPPDATA%\\RELAY\\relay.env"
    python -m relay.local_host start --env-file "%LOCALAPPDATA%\\RELAY\\relay.env"

Starts three processes, all bound to 127.0.0.1:
  public  API :8787  RELAY_EXPOSE_INTERNAL=false  (the only port Tailscale Funnel may point at)
  private API :8000  /internal/* for the bot and local n8n; never exposed
  bot              Discord gateway, talking to the private API
Both APIs share one SQLite file (WAL; writes serialized by BEGIN IMMEDIATE). Ctrl+C stops all.
The env file is read explicitly from the path given; production never reads the repo's .env.
"""
from __future__ import annotations
import argparse, os, subprocess, sys, time
from pathlib import Path
from urllib.request import urlopen

# 8787 avoids ports commonly taken by Docker/WSL (8080) on dev laptops; Funnel targets 127.0.0.1:8787 only.
PUBLIC_PORT, PRIVATE_PORT = 8787, 8000

def read_env_file(path):
    from dotenv import dotenv_values
    values = {k: (v or '').strip() for k, v in dotenv_values(path).items()}
    if values.get('RELAY_ENV', '').lower() != 'production':
        raise SystemExit('This launcher only runs RELAY_ENV=production configurations.')
    return values

def environment(values, **extra):
    base = {k: v for k, v in os.environ.items() if not k.startswith(('RELAY_', 'DISCORD_', 'GEMINI_', 'DATABASE_URL'))}
    base.update(values); base.update(extra); base['PYTHONUNBUFFERED'] = '1'
    return base

def init_env(path, public_url, source_env):
    """Write a production env file for laptop hosting. Secrets are generated or copied, never printed."""
    import secrets
    from dotenv import dotenv_values
    path = Path(path)
    if path.exists(): raise SystemExit(f'{path} already exists; edit it or delete it first.')
    src = {k: (v or '').strip() for k, v in dotenv_values(source_env).items()} if Path(source_env).exists() else {}
    url = public_url.rstrip('/')
    if not url.startswith('https://'): raise SystemExit('--public-url must be the https Funnel or Vercel origin.')
    db = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'RELAY' / 'relay.sqlite3'
    client_id = src.get('DISCORD_CLIENT_ID', '')
    if not client_id and src.get('DISCORD_BOT_TOKEN'):
        # The OAuth client id is the (public) application id; look it up instead of asking for it.
        try:
            import httpx
            r = httpx.get('https://discord.com/api/v10/applications/@me', headers={'Authorization': 'Bot ' + src['DISCORD_BOT_TOKEN']}, timeout=10)
            client_id = str(r.json().get('id', '')) if r.status_code == 200 else ''
        except Exception:
            client_id = ''
    lines = ['# RELAY laptop production config. Outside the repo and OneDrive on purpose. Never commit or share.',
             'RELAY_ENV=production', f'RELAY_DB={db.as_posix()}', f'RELAY_SERVICE_KEY={secrets.token_urlsafe(48)}',
             'RELAY_PUBLIC_DEMO=false', 'RELAY_SERVE_WEB=false', 'RELAY_MODEL_PROVIDER=none', 'RELAY_DELIVERY_ENABLED=false',
             'RELAY_RETENTION_DAYS=30', f"DISCORD_BOT_TOKEN={src.get('DISCORD_BOT_TOKEN', '')}", f"DISCORD_GUILD_ID={src.get('DISCORD_GUILD_ID', '')}",
             '# Browser login: set DISCORD_CLIENT_SECRET with scripts/set_env_secret.py --env-file <this file>.',
             f'DISCORD_CLIENT_ID={client_id}', 'DISCORD_CLIENT_SECRET=',
             f'RELAY_FRONTEND_URL={url}', f'RELAY_OAUTH_REDIRECT_URI={url}/auth/discord/callback', f'RELAY_ALLOWED_ORIGINS={url}', '']
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('\n'.join(lines), encoding='utf-8')
    print(f'Wrote {path} (secrets generated/copied; values not shown).')

def preflight(values):
    from .check_config import checks
    ok = True
    values = {**values, 'RELAY_BASE_URL': f'http://127.0.0.1:{PRIVATE_PORT}'}
    for role in ('api', 'bot'):
        for name, passed, required in checks(role, values):
            if required and not passed:
                print(f'FAIL  [{role}] {name}'); ok = False
    if not ok: raise SystemExit('Preflight failed; nothing started. Values were not printed.')
    print('Preflight passed for api and bot (values not shown).')

def port_in_use(port):
    """True if anything accepts connections on the IPv4 or IPv6 loopback ('localhost' may resolve to either)."""
    import socket
    for family, host in ((socket.AF_INET, '127.0.0.1'), (socket.AF_INET6, '::1')):
        try:
            with socket.socket(family, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                if s.connect_ex((host, port)) == 0: return True
        except OSError:
            pass
    return False

def wait_ready(port, proc, seconds=40):
    for _ in range(seconds * 4):
        if proc.poll() is not None: return False
        try:
            with urlopen(f'http://127.0.0.1:{port}/ready', timeout=1) as r:
                if r.status == 200: return True
        except Exception: time.sleep(0.25)
    return False

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('command', choices=('init', 'check', 'start'))
    p.add_argument('--env-file', required=True)
    p.add_argument('--public-url', help='init: the https origin browsers use (Funnel URL now, Vercel later)')
    p.add_argument('--no-bot', action='store_true', help='start only the two API listeners')
    a = p.parse_args(argv)
    if a.command == 'init':
        if not a.public_url: raise SystemExit('init needs --public-url https://...')
        init_env(a.env_file, a.public_url, Path(__file__).resolve().parents[1] / '.env'); return 0
    values = read_env_file(a.env_file)
    db = values.get('RELAY_DB') or values.get('DATABASE_URL', '')
    if db and not db.startswith(('postgres://', 'postgresql://')):
        Path(db).parent.mkdir(parents=True, exist_ok=True)
    preflight(values)
    py = sys.executable
    migrate = subprocess.run([py, '-m', 'relay.migrate'], env=environment(values), capture_output=True, text=True)
    if migrate.returncode: raise SystemExit('Migration failed: ' + migrate.stderr[-500:])
    print(migrate.stdout.strip())
    if a.command == 'check': return 0
    busy = [port for port in (PUBLIC_PORT, PRIVATE_PORT) if port_in_use(port)]
    if busy: raise SystemExit(f'Port(s) {busy} already answer on 127.0.0.1 or ::1 (another app, Docker, WSL, or an old RELAY). Stop it first.')
    uv = lambda port: [py, '-m', 'uvicorn', 'relay.api:app', '--host', '127.0.0.1', '--port', str(port), '--timeout-graceful-shutdown', '10']
    procs = {'private': subprocess.Popen(uv(PRIVATE_PORT), env=environment(values, RELAY_EXPOSE_INTERNAL='true')),
             'public': subprocess.Popen(uv(PUBLIC_PORT), env=environment(values, RELAY_EXPOSE_INTERNAL='false'))}
    try:
        for name, port in (('private', PRIVATE_PORT), ('public', PUBLIC_PORT)):
            if not wait_ready(port, procs[name]): raise SystemExit(f'{name} API did not become ready on 127.0.0.1:{port}.')
        print(f'public API  http://127.0.0.1:{PUBLIC_PORT}  (point Tailscale Funnel here)')
        print(f'private API http://127.0.0.1:{PRIVATE_PORT}  (bot / local n8n only)')
        if not a.no_bot:
            procs['bot'] = subprocess.Popen([py, '-u', '-m', 'relay.bot'], env=environment(values, RELAY_BASE_URL=f'http://127.0.0.1:{PRIVATE_PORT}'))
        print('Running. Keep this window and the laptop on; Ctrl+C stops everything.')
        while all(proc.poll() is None for proc in procs.values()):
            time.sleep(1)
        stopped = [n for n, proc in procs.items() if proc.poll() is not None]
        print('Stopped unexpectedly: ' + ', '.join(stopped)); return 1
    except KeyboardInterrupt:
        print('Stopping...'); return 0
    finally:
        for proc in procs.values():
            if proc.poll() is None: proc.terminate()
        for proc in procs.values():
            try: proc.wait(15)
            except subprocess.TimeoutExpired: proc.kill()

if __name__ == '__main__':
    sys.exit(main())
