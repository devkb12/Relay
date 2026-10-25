"""Write one secret into the local .env with hidden input (nothing echoed, nothing in shell history).
Usage: .venv\\Scripts\\python.exe scripts\\set_env_secret.py DISCORD_BOT_TOKEN
       .venv\\Scripts\\python.exe scripts\\set_env_secret.py RELAY_SERVICE_KEY --generate
Close .env in your editor first so an open buffer does not overwrite the change.
"""
from __future__ import annotations
import argparse, getpass, os, re, secrets, sys, tempfile
from pathlib import Path

ALLOWED = {'DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_SECRET', 'GEMINI_API_KEY', 'RELAY_SERVICE_KEY'}

def set_value(path: Path, key: str, value: str):
    text = path.read_text(encoding='utf-8') if path.exists() else ''
    line = f'{key}={value}'
    new, n = re.subn(rf'(?m)^{re.escape(key)}=.*$', lambda _: line, text)
    if n == 0:
        new = text + ('' if text.endswith('\n') or not text else '\n') + line + '\n'
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix='.env.')
    with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
        f.write(new)
    os.replace(tmp, path)

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('key', choices=sorted(ALLOWED))
    p.add_argument('--generate', action='store_true', help='generate a random value instead of prompting')
    p.add_argument('--env-file', default=str(Path(__file__).resolve().parents[1] / '.env'))
    a = p.parse_args(argv)
    if a.generate:
        value = secrets.token_urlsafe(48)
    else:
        value = getpass.getpass(f'Paste {a.key} (input hidden), then press Enter: ').strip().strip('"').strip("'")
    if not value or any(c.isspace() for c in value):
        print('Nothing written: the value was empty or contained spaces.'); return 1
    if a.key == 'DISCORD_BOT_TOKEN' and value.count('.') != 2:
        print('Nothing written: a Discord bot token has three parts separated by dots.'); return 1
    set_value(Path(a.env_file), a.key, value)
    print(f'{a.key} saved to {Path(a.env_file).name} ({len(value)} characters; value not shown).')
    return 0

if __name__ == '__main__':
    sys.exit(main())
