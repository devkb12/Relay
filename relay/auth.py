"""Backend-managed Discord OAuth (authorization code, scope=identify) and opaque browser sessions.

The browser receives only an HttpOnly session cookie and a per-session CSRF token. Session ids
are stored as SHA-256 hashes. Discord access tokens are revoked right after the identity lookup;
RELAY keeps only the verified Discord user id and a display name.
"""
from __future__ import annotations
import hashlib, hmac, os, secrets, time
from dataclasses import dataclass
from urllib.parse import urlencode
from .core import RelayError, digest
from .store import Store

AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'
TOKEN_URL = 'https://discord.com/api/oauth2/token'
REVOKE_URL = 'https://discord.com/api/oauth2/token/revoke'
ME_URL = 'https://discord.com/api/users/@me'
STATE_TTL = 600

@dataclass
class OAuthConfig:
    client_id: str
    client_secret: str
    redirect_uri: str
    frontend_url: str
    secure_cookies: bool
    session_hours: float
    allowed_origins: tuple[str, ...]

    @property
    def enabled(self): return bool(self.client_id and self.client_secret and self.redirect_uri)
    @property
    def session_cookie(self): return '__Host-relay_session' if self.secure_cookies else 'relay_session'
    @property
    def state_cookie(self): return '__Host-relay_oauth' if self.secure_cookies else 'relay_oauth'

def load_config(production: bool) -> OAuthConfig:
    origins = tuple(x.strip().rstrip('/') for x in os.getenv('RELAY_ALLOWED_ORIGINS', '').split(',') if x.strip())
    cfg = OAuthConfig(os.getenv('DISCORD_CLIENT_ID', '').strip(), os.getenv('DISCORD_CLIENT_SECRET', '').strip(),
                      os.getenv('RELAY_OAUTH_REDIRECT_URI', '').strip(), os.getenv('RELAY_FRONTEND_URL', '').strip().rstrip('/'),
                      production or os.getenv('RELAY_COOKIE_SECURE', 'false').lower() == 'true',
                      float(os.getenv('RELAY_WEB_SESSION_HOURS', '12')), origins)
    if production and cfg.enabled:
        problems = []
        if not cfg.redirect_uri.startswith('https://'): problems.append('RELAY_OAUTH_REDIRECT_URI must be https')
        if not cfg.frontend_url.startswith('https://'): problems.append('RELAY_FRONTEND_URL must be https')
        if not cfg.allowed_origins or any(not o.startswith('https://') for o in cfg.allowed_origins):
            problems.append('RELAY_ALLOWED_ORIGINS must list exact https origins')
        if problems: raise RuntimeError('; '.join(problems))
    return cfg

def safe_return_path(value: str | None) -> str:
    # Only same-site relative paths: blocks open redirects such as //evil.example or /\evil.
    value = value or '/'
    if not value.startswith('/') or value.startswith('//') or '\\' in value or len(value) > 300 or any(ord(c) < 32 for c in value):
        return '/'
    return value

@dataclass
class WebUser:
    discord_id: str
    name: str
    session_hash: str
    expires_at: float

class Auth:
    def __init__(self, store: Store, cfg: OAuthConfig, secret: str, now=time.time):
        self.store, self.cfg, self.secret, self.now = store, cfg, secret, now

    def csrf_for(self, session_hash: str) -> str:
        return hmac.new(self.secret.encode(), b'csrf:' + session_hash.encode(), hashlib.sha256).hexdigest()

    def begin(self, return_to: str):
        if not self.cfg.enabled: raise RelayError('Discord login is not configured on this server.', 503)
        state = secrets.token_urlsafe(32)
        with self.store.transaction() as db:
            db.execute('DELETE FROM oauth_states WHERE expires_at<?', (self.now(),))
            db.execute('INSERT INTO oauth_states(state_hash,created_at,expires_at,return_to) VALUES(?,?,?,?)',
                       (digest(state), self.now(), self.now() + STATE_TTL, safe_return_path(return_to)))
        query = urlencode({'response_type': 'code', 'client_id': self.cfg.client_id, 'scope': 'identify',
                           'redirect_uri': self.cfg.redirect_uri, 'state': state})
        return f'{AUTHORIZE_URL}?{query}', state

    def consume_state(self, state: str | None, cookie_state: str | None, iss: str | None):
        # The state must match the browser-bound cookie AND an unexpired, unused server record.
        if iss is not None and iss != 'https://discord.com':
            raise RelayError('Unexpected OAuth issuer.', 400)
        if not state or not cookie_state or not hmac.compare_digest(state, cookie_state):
            raise RelayError('Login state did not match this browser. Start the login again.', 400)
        with self.store.transaction() as db:
            row = db.execute('SELECT return_to,expires_at FROM oauth_states WHERE state_hash=?', (digest(state),)).fetchone()
            db.execute('DELETE FROM oauth_states WHERE state_hash=?', (digest(state),))
        if not row or row['expires_at'] < self.now():
            raise RelayError('Login expired or was already used. Start the login again.', 400)
        return row['return_to']

    async def exchange(self, code: str, http=None):
        """Code -> access token -> verified Discord user. The token is revoked immediately after."""
        import httpx
        client = http or httpx.AsyncClient(timeout=10)
        auth = (self.cfg.client_id, self.cfg.client_secret)
        try:
            r = await client.post(TOKEN_URL, auth=auth, data={'grant_type': 'authorization_code', 'code': code,
                                  'redirect_uri': self.cfg.redirect_uri})
            if r.status_code != 200: raise RelayError('Discord rejected the login code.', 400)
            access = r.json().get('access_token')
            if not access: raise RelayError('Discord returned no access token.', 502)
            me = await client.get(ME_URL, headers={'Authorization': f'Bearer {access}'})
            if me.status_code != 200: raise RelayError('Could not read the Discord identity.', 502)
            user = me.json()
            try: await client.post(REVOKE_URL, auth=auth, data={'token': access, 'token_type_hint': 'access_token'})
            except Exception: pass  # Revocation is best-effort; the short-lived token is never stored.
        finally:
            if http is None: await client.aclose()
        uid = str(user.get('id', ''))
        if not uid.isdigit(): raise RelayError('Discord returned an invalid user id.', 502)
        return uid, str(user.get('global_name') or user.get('username') or 'Discord user')[:40]

    def start_session(self, discord_id: str, name: str):
        raw = secrets.token_urlsafe(32); h = digest(raw)
        expires = self.now() + self.cfg.session_hours * 3600
        with self.store.transaction() as db:
            db.execute('INSERT INTO web_sessions(id_hash,discord_id,display_name,csrf_hash,created_at,expires_at) VALUES(?,?,?,?,?,?)',
                       (h, discord_id, name, digest(self.csrf_for(h)), self.now(), expires))
        return raw, expires

    def user(self, raw: str | None) -> WebUser | None:
        if not raw or len(raw) > 200: return None
        h = digest(raw)
        with self.store.connect() as db:
            row = db.execute('SELECT discord_id,display_name,expires_at,revoked_at FROM web_sessions WHERE id_hash=?', (h,)).fetchone()
        if not row or row['revoked_at'] is not None or row['expires_at'] < self.now(): return None
        return WebUser(row['discord_id'], row['display_name'], h, row['expires_at'])

    def check_csrf(self, user: WebUser, header: str | None):
        if not header or not hmac.compare_digest(header, self.csrf_for(user.session_hash)):
            raise RelayError('Missing or invalid CSRF token.', 403)

    def revoke(self, user: WebUser):
        with self.store.transaction() as db:
            db.execute('UPDATE web_sessions SET revoked_at=? WHERE id_hash=?', (self.now(), user.session_hash))

    def revoke_all(self, discord_id: str):
        with self.store.transaction() as db:
            db.execute('UPDATE web_sessions SET revoked_at=? WHERE discord_id=? AND revoked_at IS NULL', (self.now(), discord_id))
