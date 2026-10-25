"""Deployment preflight: catches common Railway misconfigurations without printing values."""
from relay.check_config import checks, main

GOOD_API = {'RELAY_ENV': 'production', 'RELAY_SERVICE_KEY': 'k' * 48, 'RELAY_DB': 'postgresql://u:p@h:5432/db',
            'RELAY_PUBLIC_DEMO': 'false', 'RELAY_SERVE_WEB': 'false', 'RELAY_MODEL_PROVIDER': 'none',
            'RELAY_DELIVERY_ENABLED': 'false', 'DISCORD_CLIENT_ID': '1563683875119570995', 'DISCORD_CLIENT_SECRET': 's',
            'RELAY_FRONTEND_URL': 'https://relay.example.app', 'RELAY_OAUTH_REDIRECT_URI': 'https://relay.example.app/auth/discord/callback',
            'RELAY_ALLOWED_ORIGINS': 'https://relay.example.app'}

def failed(role, env):
    return [name for name, ok, required in checks(role, env) if required and not ok]

def test_good_production_api_passes():
    assert failed('api', GOOD_API) == []

def test_common_api_mistakes_are_caught():
    assert failed('api', {**GOOD_API, 'RELAY_PUBLIC_DEMO': 'true'})
    assert failed('api', {**GOOD_API, 'RELAY_DB': 'relay.sqlite3'})            # ephemeral disk
    assert failed('api', {**GOOD_API, 'RELAY_OAUTH_REDIRECT_URI': 'https://relay.example.app/callback'})
    assert failed('api', {**GOOD_API, 'RELAY_FRONTEND_URL': 'http://relay.example.app'})
    assert failed('api', {**GOOD_API, 'RELAY_ALLOWED_ORIGINS': 'https://*.vercel.app'})
    assert failed('api', {**GOOD_API, 'RELAY_SERVICE_KEY': 'short'})

def test_bot_role_and_output_never_shows_values(capsys, tmp_path):
    env = tmp_path / 'bot.env'
    env.write_text('RELAY_ENV=production\nRELAY_SERVICE_KEY=' + 'z' * 48 + '\nDISCORD_BOT_TOKEN=aaa.bbb.ccc\n'
                   'DISCORD_GUILD_ID=123\nRELAY_BASE_URL=https://api.example.app\n')
    assert main(['--role', 'bot', '--env-file', str(env)]) == 0
    out = capsys.readouterr().out
    assert 'z' * 10 not in out and 'aaa.bbb' not in out and 'ready' in out
    env.write_text('RELAY_ENV=production\nRELAY_BASE_URL=http://127.0.0.1:8000\n')
    assert main(['--role', 'bot', '--env-file', str(env)]) == 1

def test_production_never_reads_a_local_env_file(monkeypatch):
    import dotenv
    from relay.store import load_local_env
    calls = []
    monkeypatch.setattr(dotenv, 'load_dotenv', lambda *a, **k: calls.append(1))
    monkeypatch.setenv('RELAY_ENV', 'production'); load_local_env()
    assert calls == []
    monkeypatch.setenv('RELAY_ENV', 'local'); load_local_env()
    assert calls == [1]
