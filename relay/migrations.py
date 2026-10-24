"""Ordered schema migrations for SQLite and PostgreSQL. Run explicitly: python -m relay.migrate"""
from __future__ import annotations
import json

def _backfill_index(db):
    # Session bodies stay authoritative JSON; these columns/rows are lookup indexes only.
    for row in db.execute('SELECT id,body FROM sessions').fetchall():
        s = json.loads(row['body'])
        db.execute('UPDATE sessions SET channel=?,created_at=?,deleted=? WHERE id=?',
                   (s.get('channel'), s.get('created_at', 0), int(bool(s.get('deleted'))), s['id']))
        for mid in s.get('members', {}):
            db.execute('INSERT INTO session_members(session_id,member_id) VALUES(?,?) ON CONFLICT DO NOTHING', (s['id'], mid))

# (version, description, {backend: sql-or-callable})
MIGRATIONS = [
    (1, 'starter tables', {
        'sqlite': '''
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs(
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL, member_id TEXT NOT NULL,
          kind TEXT NOT NULL, due_at REAL NOT NULL, plan_version INTEGER,
          status TEXT NOT NULL DEFAULT 'pending', lease_until REAL,
          attempts INTEGER NOT NULL DEFAULT 0, provider_id TEXT, error TEXT);
        CREATE TABLE IF NOT EXISTS automation_errors(
          id INTEGER PRIMARY KEY, created_at REAL, workflow TEXT, execution TEXT);''',
        'postgres': '''
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs(
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL, member_id TEXT NOT NULL,
          kind TEXT NOT NULL, due_at DOUBLE PRECISION NOT NULL, plan_version INTEGER,
          status TEXT NOT NULL DEFAULT 'pending', lease_until DOUBLE PRECISION,
          attempts INTEGER NOT NULL DEFAULT 0, provider_id TEXT, error TEXT);
        CREATE TABLE IF NOT EXISTS automation_errors(
          id BIGSERIAL PRIMARY KEY, created_at DOUBLE PRECISION, workflow TEXT, execution TEXT);'''}),
    (2, 'session lookup indexes and memberships', {
        'sqlite': '''
        ALTER TABLE sessions ADD COLUMN channel TEXT;
        ALTER TABLE sessions ADD COLUMN created_at REAL NOT NULL DEFAULT 0;
        ALTER TABLE sessions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE session_members(session_id TEXT NOT NULL, member_id TEXT NOT NULL,
          PRIMARY KEY(session_id,member_id));
        CREATE INDEX idx_members_member ON session_members(member_id);
        CREATE INDEX idx_sessions_channel ON sessions(channel,deleted,created_at);
        CREATE INDEX idx_jobs_due ON jobs(status,due_at);''',
        'postgres': '''
        ALTER TABLE sessions ADD COLUMN channel TEXT;
        ALTER TABLE sessions ADD COLUMN created_at DOUBLE PRECISION NOT NULL DEFAULT 0;
        ALTER TABLE sessions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE session_members(session_id TEXT NOT NULL, member_id TEXT NOT NULL,
          PRIMARY KEY(session_id,member_id));
        CREATE INDEX idx_members_member ON session_members(member_id);
        CREATE INDEX idx_sessions_channel ON sessions(channel,deleted,created_at);
        CREATE INDEX idx_jobs_due ON jobs(status,due_at);'''}),
    (3, 'backfill session indexes', {'sqlite': _backfill_index, 'postgres': _backfill_index}),
    (4, 'browser auth and audit', {
        'sqlite': '''
        CREATE TABLE oauth_states(state_hash TEXT PRIMARY KEY, created_at REAL NOT NULL,
          expires_at REAL NOT NULL, return_to TEXT NOT NULL);
        CREATE TABLE web_sessions(id_hash TEXT PRIMARY KEY, discord_id TEXT NOT NULL,
          display_name TEXT NOT NULL, csrf_hash TEXT NOT NULL, created_at REAL NOT NULL,
          expires_at REAL NOT NULL, revoked_at REAL);
        CREATE INDEX idx_web_sessions_user ON web_sessions(discord_id);
        CREATE TABLE audit_events(id INTEGER PRIMARY KEY, session_id TEXT NOT NULL,
          at REAL NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL);
        CREATE INDEX idx_audit_session ON audit_events(session_id);''',
        'postgres': '''
        CREATE TABLE oauth_states(state_hash TEXT PRIMARY KEY, created_at DOUBLE PRECISION NOT NULL,
          expires_at DOUBLE PRECISION NOT NULL, return_to TEXT NOT NULL);
        CREATE TABLE web_sessions(id_hash TEXT PRIMARY KEY, discord_id TEXT NOT NULL,
          display_name TEXT NOT NULL, csrf_hash TEXT NOT NULL, created_at DOUBLE PRECISION NOT NULL,
          expires_at DOUBLE PRECISION NOT NULL, revoked_at DOUBLE PRECISION);
        CREATE INDEX idx_web_sessions_user ON web_sessions(discord_id);
        CREATE TABLE audit_events(id BIGSERIAL PRIMARY KEY, session_id TEXT NOT NULL,
          at DOUBLE PRECISION NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL);
        CREATE INDEX idx_audit_session ON audit_events(session_id);'''}),
]

LATEST = MIGRATIONS[-1][0]
