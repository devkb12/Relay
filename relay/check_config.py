"""Deployment preflight. Prints PASS/FAIL per setting, never values.
Usage: python -m relay.check_config --role api|bot [--env-file .env]
Exit code 1 if any required check fails (use it in Railway's pre-deploy command).
"""
from __future__ import annotations
import argparse, os, sys
from urllib.parse import urlparse

def _https_origin(value):
    u = urlparse(value or '')
    return u.scheme == 'https' and bool(u.netloc) and u.path in ('', '/') and not u.query

def checks(role, env):
    get = lambda k: (env.get(k) or '').strip()
    prod = get('RELAY_ENV').lower() == 'production'
    out = [('RELAY_ENV=production', prod, True)]
    key = get('RELAY_SERVICE_KEY')
    out.append(('RELAY_SERVICE_KEY >= 32 chars', len(key) >= 32, True))
    if role == 'api':
        db = get('RELAY_DB') or get('DATABASE_URL')
        out += [
            ('database set (RELAY_DB or DATABASE_URL)', bool(db), True),
            ('database is PostgreSQL or a /data volume path', db.startswith(('postgres://', 'postgresql://')) or db.startswith('/data/'), True),
            ('RELAY_PUBLIC_DEMO is false', get('RELAY_PUBLIC_DEMO').lower() in ('', 'false'), True),
            ('RELAY_SERVE_WEB is false (Vercel serves the UI)', get('RELAY_SERVE_WEB').lower() == 'false', False),
            ('RELAY_MODEL_PROVIDER is none (no paid inference)', get('RELAY_MODEL_PROVIDER').lower() in ('', 'none'), False),
            ('RELAY_DELIVERY_ENABLED is false (no live DMs)', get('RELAY_DELIVERY_ENABLED').lower() in ('', 'false'), False),
        ]
        oauth = [get(k) for k in ('DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'RELAY_OAUTH_REDIRECT_URI')]
        if any(oauth):
            front = get('RELAY_FRONTEND_URL').rstrip('/')
            redirect = get('RELAY_OAUTH_REDIRECT_URI')
            origins = [o.strip().rstrip('/') for o in get('RELAY_ALLOWED_ORIGINS').split(',') if o.strip()]
            out += [
                ('OAuth: client id, secret and redirect all set', all(oauth), True),
                ('OAuth: DISCORD_CLIENT_ID is numeric', get('DISCORD_CLIENT_ID').isdigit(), True),
                ('OAuth: RELAY_FRONTEND_URL is an https origin', _https_origin(front), True),
                ('OAuth: redirect is <frontend>/auth/discord/callback', redirect == front + '/auth/discord/callback', True),
                ('OAuth: RELAY_ALLOWED_ORIGINS are https origins', bool(origins) and all(_https_origin(o) for o in origins), True),
                ('OAuth: frontend origin is allowed', front in origins, True),
            ]
        else:
            out.append(('OAuth configured (browser login)', False, False))
    else:
        base = get('RELAY_BASE_URL')
        out += [
            ('DISCORD_BOT_TOKEN set (3 segments)', get('DISCORD_BOT_TOKEN').count('.') == 2, True),
            ('DISCORD_GUILD_ID numeric', get('DISCORD_GUILD_ID').isdigit(), False),
            ('RELAY_BASE_URL is https', urlparse(base).scheme == 'https' and bool(urlparse(base).netloc), True),
        ]
    return out

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--role', choices=('api', 'bot'), required=True)
    p.add_argument('--env-file', help='read a dotenv file instead of the process environment')
    a = p.parse_args(argv)
    if a.env_file:
        from dotenv import dotenv_values
        env = {k: v or '' for k, v in dotenv_values(a.env_file).items()}
    else:
        env = dict(os.environ)
    failed = 0
    for name, ok, required in checks(a.role, env):
        label = 'PASS' if ok else ('FAIL' if required else 'WARN')
        failed += (not ok and required)
        print(f'{label}  {name}')
    print(f'{a.role}: {"ready" if not failed else str(failed) + " required check(s) failed"} (values not shown)')
    return 1 if failed else 0

if __name__ == '__main__':
    sys.exit(main())
