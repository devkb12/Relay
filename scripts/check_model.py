"""List the Gemini models this GEMINI_API_KEY can call (metadata only: no content is generated or sent).

Use it to pick a real RELAY_MODEL id instead of copying one from a chat. Seeing a model here does NOT
prove calls are free for your project: check the project's billing state in Google AI Studio first.
Never prints the key. Run: python -m scripts.check_model
"""
from __future__ import annotations
import os, sys
import httpx
from relay.store import load_local_env


def main():
    load_local_env()
    key = os.getenv('GEMINI_API_KEY', '').strip()
    if not key:
        sys.exit('GEMINI_API_KEY is not set. Add it with: python scripts/set_env_secret.py GEMINI_API_KEY')
    r = httpx.get('https://generativelanguage.googleapis.com/v1beta/models', headers={'x-goog-api-key': key}, params={'pageSize': 200}, timeout=20)
    if r.is_error:
        sys.exit(f'Model listing failed: HTTP {r.status_code}. The key may be invalid or restricted.')
    current = os.getenv('RELAY_MODEL', '').strip()
    usable = [m for m in r.json().get('models', []) if 'generateContent' in m.get('supportedGenerationMethods', [])]
    for m in sorted(usable, key=lambda m: m['name']):
        mid = m['name'].removeprefix('models/')
        print(f"{'*' if mid == current else ' '} {mid:40} in={m.get('inputTokenLimit')} out={m.get('outputTokenLimit')}")
    print(f'\nRELAY_MODEL is {"set to " + current if current else "not set"}; provider is {os.getenv("RELAY_MODEL_PROVIDER", "none")}.')
    if current and current not in {m['name'].removeprefix('models/') for m in usable}:
        print('Warning: RELAY_MODEL is not in this list. RELAY will keep using the reviewed hint.')


if __name__ == '__main__':
    main()
