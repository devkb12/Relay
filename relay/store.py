"""Session store. SQLite (one instance, persistent volume) or PostgreSQL (RELAY_DB=postgresql://...).
API and bot share one store through the API only. Session bodies are JSON documents; writes run
inside transactions that lock the session row, so concurrent updates cannot be lost.
"""
from __future__ import annotations
import json, os, sqlite3, time
from contextlib import contextmanager
from pathlib import Path
from .migrations import MIGRATIONS, LATEST

class SchemaOutdated(RuntimeError): pass

class Row(dict):
    """Rows readable by name or position, matching sqlite3.Row for both backends."""
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)

class Conn:
    def __init__(self, raw, backend, in_txn=False):
        self.raw, self.backend, self.in_txn = raw, backend, in_txn
    def execute(self, sql, args=()):
        if self.backend == 'postgres':
            cur = self.raw.cursor()
            cur.execute(sql.replace('?', '%s'), tuple(args))
            return cur
        return self.raw.execute(sql, args)
    def executescript(self, sql):
        if self.backend == 'postgres':
            self.raw.cursor().execute(sql)
        else:
            for statement in [x.strip() for x in sql.split(';') if x.strip()]:
                self.raw.execute(statement)

def _pg_row(cursor):
    names = [c.name for c in cursor.description or []]  # DDL/UPDATE have no description
    return lambda values: Row(zip(names, values))

class Store:
    def __init__(self, path: str, auto_migrate: bool = True):
        self.path = str(path)
        self.backend = 'postgres' if self.path.startswith(('postgres://', 'postgresql://')) else 'sqlite'
        if self.backend == 'sqlite':
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
            raw = sqlite3.connect(self.path, timeout=10)
            raw.execute('PRAGMA journal_mode=WAL'); raw.close()
        if auto_migrate:
            self.migrate()
        elif self.schema_version() < LATEST:
            raise SchemaOutdated(f'Database schema {self.schema_version()} < {LATEST}. Run: python -m relay.migrate')

    def _raw(self):
        if self.backend == 'postgres':
            import psycopg
            return psycopg.connect(self.path, row_factory=_pg_row, connect_timeout=10)
        raw = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        raw.row_factory = sqlite3.Row
        raw.execute('PRAGMA foreign_keys=ON')
        return raw

    @contextmanager
    def connect(self):
        raw = self._raw()
        if self.backend == 'postgres': raw.autocommit = True
        try: yield Conn(raw, self.backend)
        finally: raw.close()

    @contextmanager
    def transaction(self):
        raw = self._raw()
        try:
            if self.backend == 'sqlite': raw.execute('BEGIN IMMEDIATE')
            yield Conn(raw, self.backend, in_txn=True)
            raw.commit() if self.backend == 'postgres' else raw.execute('COMMIT')
        except BaseException:
            if self.backend == 'postgres': raw.rollback()
            elif raw.in_transaction: raw.execute('ROLLBACK')
            raise
        finally:
            raw.close()

    def schema_version(self):
        with self.connect() as db:
            try:
                return db.execute('SELECT COALESCE(MAX(version),0) FROM schema_migrations').fetchone()[0]
            except Exception:
                return 0

    def migrate(self):
        applied = []
        with self.transaction() as db:
            if self.backend == 'postgres':
                db.execute('SELECT pg_advisory_xact_lock(424242)')
            db.execute('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, description TEXT NOT NULL, applied_at REAL NOT NULL)')
            done = {r[0] for r in db.execute('SELECT version FROM schema_migrations').fetchall()}
            for version, description, steps in MIGRATIONS:
                if version in done: continue
                step = steps[self.backend]
                step(db) if callable(step) else db.executescript(step)
                db.execute('INSERT INTO schema_migrations(version,description,applied_at) VALUES(?,?,?)', (version, description, time.time()))
                applied.append(version)
        return applied

    def ping(self):
        with self.connect() as db:
            return db.execute('SELECT 1').fetchone()[0] == 1

    def load(self, db, sid):
        # Inside a PostgreSQL transaction, lock the row so read-modify-write is serialized.
        lock = ' FOR UPDATE' if db.backend == 'postgres' and db.in_txn else ''
        row = db.execute('SELECT body FROM sessions WHERE id=?' + lock, (sid,)).fetchone()
        if not row:
            raise KeyError('Session not found.')
        return json.loads(row['body'])

    def save(self, db, session):
        db.execute('INSERT INTO sessions(id,body,channel,created_at,deleted) VALUES(?,?,?,?,?) '
                   'ON CONFLICT(id) DO UPDATE SET body=excluded.body,channel=excluded.channel,deleted=excluded.deleted',
                   (session['id'], json.dumps(session), session.get('channel'), session.get('created_at', 0), int(bool(session.get('deleted')))))
        db.execute('DELETE FROM session_members WHERE session_id=?', (session['id'],))
        for mid in session['members']:
            db.execute('INSERT INTO session_members(session_id,member_id) VALUES(?,?)', (session['id'], mid))

    def by_channel(self, channel):
        with self.connect() as db:
            row = db.execute('SELECT body FROM sessions WHERE channel=? AND deleted=0 ORDER BY created_at DESC LIMIT 1', (channel,)).fetchone()
        return json.loads(row['body']) if row else None

    def for_member(self, member_id, limit=20):
        with self.connect() as db:
            rows = db.execute('SELECT s.body FROM sessions s JOIN session_members m ON m.session_id=s.id '
                              'WHERE m.member_id=? AND s.deleted=0 ORDER BY s.created_at DESC LIMIT ?', (member_id, limit)).fetchall()
        return [json.loads(r['body']) for r in rows]

    def delete_session(self, db, sid):
        for table in ('jobs', 'session_members', 'audit_events'):
            db.execute(f'DELETE FROM {table} WHERE session_id=?', (sid,))
        db.execute('DELETE FROM sessions WHERE id=?', (sid,))

    def audit(self, db, sid, kind, detail, at=None):
        # Privacy-minimized: kind + short non-content detail only. Never answer text or rationales.
        db.execute('INSERT INTO audit_events(session_id,at,kind,detail) VALUES(?,?,?,?)',
                   (sid, time.time() if at is None else at, kind, json.dumps(detail)[:500]))

def default_db():
    """RELAY_DB wins; Railway/Heroku-style DATABASE_URL is accepted; local default is SQLite."""
    return os.getenv('RELAY_DB') or os.getenv('DATABASE_URL') or 'relay.sqlite3'

def load_local_env():
    """Read .env for local development only. In production every setting comes from the platform,
    so a stray developer .env can never redirect the database or inject credentials."""
    if os.getenv('RELAY_ENV', '').strip().lower() != 'production':
        from dotenv import load_dotenv
        load_dotenv()
