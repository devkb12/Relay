'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from './relay-api';
import { RelayError } from './errors';
import { activeIdentity } from './identities';
import { STAGE_LABEL } from './stages';
import type { SessionView } from './schemas';

export type RoomSource = { kind: 'live'; sessionId: string } | { kind: 'fixture'; view: SessionView };

export type Room = {
  view: SessionView | null;
  /** True while a background refresh is in flight; the last view stays on screen. */
  refreshing: boolean;
  /** Fatal for the screen (401/403/404/not connected/schema) when there is no view to keep. */
  error: RelayError | null;
  /** Transient problem with a view still on screen (network loss, 409 explanation). */
  notice: RelayError | null;
  pending: string | null;
  demo: boolean;
  refresh: () => Promise<void>;
  /** Run a server action. No optimistic update: pending, then the server's result. */
  act: <T>(key: string, fn: () => Promise<T>, onDone?: (r: T) => void) => Promise<T | null>;
  dismissNotice: () => void;
  /** Switching test identity: drop the old identity's view immediately, then fetch the new one. */
  switchIdentity: () => void;
};

const POLL_MS = 3000;
export const DEMO_ONLY = 'Demo only. Nothing was sent.';

export function useRoom(source: RoomSource): Room {
  const [liveView, setView] = useState<SessionView | null>(null);
  // Fixture mode renders the given view directly; only live mode keeps fetched state.
  const view = source.kind === 'fixture' ? source.view : liveView;
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<RelayError | null>(null);
  const [notice, setNotice] = useState<RelayError | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const lastKey = useRef('');
  const inFlight = useRef(false);
  const selfChange = useRef(false);
  const viewRef = useRef<SessionView | null>(null);
  useEffect(() => { viewRef.current = view; }, [view]);
  const sid = source.kind === 'live' ? source.sessionId : null;

  const whoAmI = (id: string) => activeIdentity(id)?.member_id ?? 'cookie';

  /**
   * `who` is the identity whose credential made the request. A response for anyone other than the
   * currently active identity is dropped: a slow poll for one test identity must never be shown
   * (or cached) as another identity's private view.
   */
  const accept = useCallback((next: SessionView, who: string) => {
    if (who !== whoAmI(next.id)) return;
    const prev = viewRef.current;
    const key = `${next.revision}:${who}`;
    if (key === lastKey.current && prev) return;
    lastKey.current = key;
    // Toasts only for things that happened elsewhere, never for this browser's own actions.
    if (prev && prev.id === next.id && !selfChange.current) {
      if (prev.stage !== next.stage) toast(`The host opened ${STAGE_LABEL[next.stage]}.`);
      else if (!prev.challenge?.pending && next.challenge?.pending) toast('Someone challenged this item. The room is on hold.');
      else if (prev.plan_version !== next.plan_version && next.plan) toast(`Plan changed: v${prev.plan_version} → v${next.plan_version}, approvals reset.`);
    }
    selfChange.current = false;
    viewRef.current = next;
    setView(next);
  }, []);

  const again = useRef(false);
  const refresh = useCallback(async (): Promise<void> => {
    if (!sid) return;
    if (inFlight.current) { again.current = true; return; } // run once more after the current poll
    inFlight.current = true;
    setRefreshing(true);
    try {
      const who = whoAmI(sid);
      accept(await api.view(sid), who);
      setError(null);
      setNotice((n) => (n?.kind === 'network' ? null : n));
    } catch (e) {
      if (!(e instanceof RelayError)) throw e;
      if (viewRef.current && (e.kind === 'network' || e.kind === 'not_connected')) setNotice(e);
      else setError(e);
    } finally {
      inFlight.current = false;
      setRefreshing(false);
      if (again.current) { again.current = false; void refresh(); }
    }
  }, [sid, accept]);

  // Revision-based polling; paused while the tab is hidden; never announced per tick.
  useEffect(() => {
    if (!sid) return;
    lastKey.current = '';
    const tick = () => { if (document.visibilityState === 'visible') void refresh(); };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearTimeout(first); window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [sid, refresh]);

  const act = useCallback(async <T,>(key: string, fn: () => Promise<T>, onDone?: (r: T) => void): Promise<T | null> => {
    if (source.kind === 'fixture') {
      toast(DEMO_ONLY);
      return null;
    }
    if (pending) return null; // duplicate-click guard
    setPending(key);
    setNotice(null);
    try {
      selfChange.current = true;
      const who = sid ? whoAmI(sid) : 'cookie';
      const result = await fn();
      const maybeView = (result as { state?: SessionView })?.state ?? result;
      if (maybeView && typeof maybeView === 'object' && 'revision' in (maybeView as object)) accept(maybeView as SessionView, who);
      onDone?.(result);
      return result;
    } catch (e) {
      selfChange.current = false;
      if (!(e instanceof RelayError)) throw e;
      setNotice(e);
      if (e.status === 409 || e.status === 410) { lastKey.current = ''; await refresh(); }
      return null;
    } finally {
      setPending(null);
    }
  }, [source.kind, pending, accept, refresh, sid]);

  return { view, refreshing, error, notice, pending, demo: source.kind === 'fixture', refresh, act, dismissNotice: () => setNotice(null),
    switchIdentity: () => { lastKey.current = ''; viewRef.current = null; setView(null); void refresh(); } };
}
