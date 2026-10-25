'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { RelayError } from './errors';
import { SampleEngine, freshState, type SampleState } from './sample';
import type { Room, RoomClient } from './room';
import type { SessionView } from './schemas';

/**
 * The sample round's store: one engine per browser tab, kept in sessionStorage so moving between
 * /demo, /demo/debrief and /demo/present keeps the same round. Reloading the tab keeps it; "Start over"
 * resets it. Nothing leaves the browser.
 */
const KEY = 'relay.sample.v1';
let engine: SampleEngine | null = null;
let snapshot: SessionView | null = null;
const listeners = new Set<() => void>();

function load(): SampleEngine {
  if (engine) return engine;
  let state: SampleState = freshState();
  try {
    const saved = window.sessionStorage.getItem(KEY);
    if (saved) state = { ...freshState(), ...(JSON.parse(saved) as SampleState) };
  } catch { /* storage blocked or corrupt: start fresh */ }
  engine = new SampleEngine(state);
  snapshot = engine.view();
  return engine;
}

function publish() {
  const e = load();
  snapshot = e.view();
  try { window.sessionStorage.setItem(KEY, JSON.stringify(e.s)); } catch { /* not persisted; still works */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => { load(); return snapshot; };
const getServerSnapshot = () => null;

export function resetSample() {
  engine = new SampleEngine(freshState());
  publish();
}

const unsupported = () => Promise.reject(new RelayError('http', 'The sample round covers one study session. Scheduling, reminders and leaving work in real sessions.', 400));

/** Same signatures as the real API; the session id is ignored because there is only one sample. */
const client: RoomClient = {
  advance: async (_sid, expected, nonresponders) => { const v = load().advance(expected, nonresponders); publish(); return v; },
  answer: async (_sid, body) => { const v = load().answer(body); publish(); return v; },
  explain: async (_sid, text, fallback) => { const v = load().explain(text, fallback); publish(); return v; },
  challenge: async (_sid, reason) => { const v = load().challenge(reason); publish(); return v; },
  resolve: async (_sid, decision, note, challengeId) => { const v = load().resolve(decision, note, challengeId); publish(); return v; },
  facilitate: unsupported, review: unsupported, consent: unsupported, leave: unsupported, remove: unsupported,
  availability: unsupported, propose: unsupported, cancelPlan: unsupported, approve: unsupported, calendarFile: unsupported,
};

/** The fictional peers act on their script while the room is open; their timers restart per stage. */
function usePeers(view: SessionView | null) {
  const key = view ? `${view.stage}:${view.paused}:${view.invalidated}` : '';
  useEffect(() => {
    if (!view) return;
    const timers = load().pendingPeers().map((p) => window.setTimeout(() => { load().peer(p.name); publish(); }, p.after_ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // Re-plan only when the stage or hold changes, not on every peer event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function useSampleRoom({ peers = true }: { peers?: boolean } = {}): Room & { reset: () => void } {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<RelayError | null>(null);
  usePeers(peers ? view : null);

  const act = useCallback(async <T,>(key: string, fn: () => Promise<T>, onDone?: (r: T) => void): Promise<T | null> => {
    if (pending) return null;
    setPending(key); setNotice(null);
    try {
      const r = await fn();
      onDone?.(r);
      return r;
    } catch (e) {
      if (!(e instanceof RelayError)) throw e;
      setNotice(e);
      return null;
    } finally {
      setPending(null);
    }
  }, [pending]);

  return {
    view, refreshing: false, error: null, notice, pending, kind: 'sample', demo: true, client,
    refresh: async () => {}, act, dismissNotice: () => setNotice(null), switchIdentity: () => {},
    reset: () => { setNotice(null); resetSample(); },
  };
}
