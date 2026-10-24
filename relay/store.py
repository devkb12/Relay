"""SQLite prototype store. One DB is shared by API and bot through the API only."""
from __future__ import annotations
import json, sqlite3
from contextlib import contextmanager
from pathlib import Path

class Store:
    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs(
              id TEXT PRIMARY KEY, session_id TEXT NOT NULL, member_id TEXT NOT NULL,
              kind TEXT NOT NULL, due_at REAL NOT NULL, plan_version INTEGER,
              status TEXT NOT NULL DEFAULT 'pending', lease_until REAL,
              attempts INTEGER NOT NULL DEFAULT 0, provider_id TEXT, error TEXT);
            CREATE TABLE IF NOT EXISTS automation_errors(
              id INTEGER PRIMARY KEY, created_at REAL, workflow TEXT, execution TEXT);
            ''')
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db
    @contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    def load(self, db, sid):
        row = db.execute('SELECT body FROM sessions WHERE id=?', (sid,)).fetchone()
        if not row:
            raise KeyError('Session not found.')
        return json.loads(row['body'])
    def save(self, db, session):
        db.execute('INSERT OR REPLACE INTO sessions(id,body) VALUES(?,?)',
                   (session['id'], json.dumps(session)))
    def by_channel(self, channel):
        with self.connect() as db:
            rows = db.execute('SELECT body FROM sessions').fetchall()
        candidates = [json.loads(r['body']) for r in rows]
        candidates = [s for s in candidates if s.get('channel') == channel and not s.get('deleted')]
        return max(candidates, key=lambda x: x['created_at']) if candidates else None
