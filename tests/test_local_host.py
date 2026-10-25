"""Laptop hosting ($0): public listener without /internal, no public docs, preflight and env init."""
import pytest
from fastapi.testclient import TestClient
from relay.api import make_app
from relay.check_config import checks
from relay.store import Store
from relay import local_host

KEY = 'k' * 48

def prod_env(monkeypatch, **extra):
    for k in ('DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'RELAY_OAUTH_REDIRECT_URI', 'RELAY_FRONTEND_URL', 'RELAY_ALLOWED_ORIGINS'):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv('RELAY_ENV', 'production'); monkeypatch.setenv('RELAY_SERVICE_KEY', KEY)
    monkeypatch.setenv('RELAY_PUBLIC_DEMO', 'false')
    for k, v in extra.items(): monkeypatch.setenv(k, v)

def test_public_listener_has_no_internal_routes(tmp_path, monkeypatch):
    db = str(tmp_path / 'p.sqlite3'); Store(db).migrate()
    prod_env(monkeypatch, RELAY_EXPOSE_INTERNAL='false')
    public = TestClient(make_app(db))
    for path in ('/internal/discord', '/internal/automation/tick', '/internal/maintenance/purge', '/internal/automation/error'):
        assert public.post(path, headers={'X-Relay-Key': KEY}, json={}).status_code == 404, path
    assert public.get('/internal/jobs', headers={'X-Relay-Key': KEY}).status_code == 404
    assert public.get('/ready').json() == {'ready': True} and public.get('/auth/me').status_code == 200
    monkeypatch.setenv('RELAY_EXPOSE_INTERNAL', 'true')
    private = TestClient(make_app(db))
    assert private.post('/internal/automation/tick', headers={'X-Relay-Key': KEY}, json={'dry_run': True}).status_code == 200

def test_production_publishes_no_api_docs(tmp_path, monkeypatch):
    db = str(tmp_path / 'd.sqlite3'); Store(db).migrate()
    prod_env(monkeypatch)
    c = TestClient(make_app(db))
    assert [c.get(p).status_code for p in ('/docs', '/redoc', '/openapi.json')] == [404, 404, 404]

def base_api(**extra):
    env = {'RELAY_ENV': 'production', 'RELAY_SERVICE_KEY': KEY, 'RELAY_PUBLIC_DEMO': 'false',
           'RELAY_DB': 'C:/Users/me/AppData/Local/RELAY/relay.sqlite3'}
    env.update(extra); return env

def required_failures(role, env):
    return [n for n, ok, req in checks(role, env) if req and not ok]

def test_preflight_accepts_laptop_sqlite_but_not_synced_or_relative_paths():
    assert required_failures('api', base_api()) == []
    assert required_failures('api', base_api(RELAY_DB='C:/Users/me/OneDrive/Desktop/Relay/relay.sqlite3'))
    assert required_failures('api', base_api(RELAY_DB='relay.sqlite3'))

def test_preflight_partial_oauth_only_warns_and_bot_loopback_is_allowed():
    assert required_failures('api', base_api(DISCORD_CLIENT_ID='123')) == []
    assert required_failures('bot', {'RELAY_ENV': 'production', 'RELAY_SERVICE_KEY': KEY, 'DISCORD_BOT_TOKEN': 'a.b.c',
                                     'RELAY_BASE_URL': 'http://127.0.0.1:8000'}) == []
    assert required_failures('bot', {'RELAY_ENV': 'production', 'RELAY_SERVICE_KEY': KEY, 'DISCORD_BOT_TOKEN': 'a.b.c',
                                     'RELAY_BASE_URL': 'http://192.168.1.5:8000'})

def test_init_writes_production_env_without_printing_secrets(tmp_path, monkeypatch, capsys):
    src = tmp_path / 'dev.env'
    src.write_text('DISCORD_BOT_TOKEN=aaa.bbb.ccc\nDISCORD_GUILD_ID=42\n')
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path / 'appdata'))
    import httpx
    class App:
        status_code = 200
        def json(self): return {'id': '1563683875119570995'}
    monkeypatch.setattr(httpx, 'get', lambda *a, **k: App())  # no network in tests
    out = tmp_path / 'relay.env'
    local_host.init_env(out, 'https://laptop.example.ts.net/', src)
    printed = capsys.readouterr().out
    text = out.read_text()
    values = dict(l.split('=', 1) for l in text.splitlines() if '=' in l and not l.startswith('#'))
    assert values['RELAY_ENV'] == 'production' and len(values['RELAY_SERVICE_KEY']) >= 32
    assert values['DISCORD_BOT_TOKEN'] == 'aaa.bbb.ccc' and values['RELAY_PUBLIC_DEMO'] == 'false'
    assert values['RELAY_OAUTH_REDIRECT_URI'] == 'https://laptop.example.ts.net/auth/discord/callback'
    assert 'onedrive' not in values['RELAY_DB'].lower() and values['DISCORD_CLIENT_ID'] == '1563683875119570995'
    assert values['RELAY_SERVICE_KEY'] not in printed and 'aaa.bbb' not in printed
    assert required_failures('api', values) == [] and required_failures('bot', {**values, 'RELAY_BASE_URL': 'http://127.0.0.1:8000'}) == []
    with pytest.raises(SystemExit): local_host.init_env(out, 'https://x.example', src)       # never overwrites
    with pytest.raises(SystemExit): local_host.init_env(tmp_path / 'b.env', 'http://x.example', src)  # https only

def test_launcher_refuses_non_production_files(tmp_path):
    f = tmp_path / 'dev.env'; f.write_text('RELAY_ENV=local\n')
    with pytest.raises(SystemExit): local_host.read_env_file(f)
