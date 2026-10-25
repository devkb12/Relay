'use client';

import { useEffect, useState } from 'react';
import { api, setCsrf } from './relay-api';
import { RelayError } from './errors';
import type { AuthMe, Health } from './schemas';

export type Connection =
  | { status: 'checking' }
  | { status: 'not_connected' }
  | { status: 'error'; error: RelayError }
  | { status: 'local'; health: Health; me: AuthMe }
  | { status: 'connected'; health: Health; me: AuthMe };

let cached: Promise<Connection> | null = null;

/** Which data mode this browser is in. Health flags are shown exactly as reported, never as proof. */
export function detectConnection(force = false): Promise<Connection> {
  if (cached && !force) return cached;
  cached = (async (): Promise<Connection> => {
    try {
      const probe = (await fetch('/connection', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ connected: false }))) as { connected?: boolean };
      if (!probe.connected) return { status: 'not_connected' };
      const health = await api.health();
      const me = await api.me();
      setCsrf(me.authenticated ? me.csrf_token : null);
      return me.demo_mode ? { status: 'local', health, me } : { status: 'connected', health, me };
    } catch (e) {
      if (e instanceof RelayError && e.kind === 'not_connected') return { status: 'not_connected' };
      if (e instanceof RelayError) return { status: 'error', error: e };
      throw e;
    }
  })();
  return cached;
}

export function useConnection() {
  const [conn, setConn] = useState<Connection>({ status: 'checking' });
  useEffect(() => {
    let alive = true;
    detectConnection().then((c) => alive && setConn(c));
    return () => { alive = false; };
  }, []);
  return { conn, recheck: () => detectConnection(true).then(setConn) };
}
