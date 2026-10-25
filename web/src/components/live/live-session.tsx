'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useConnection, type Connection } from '@/lib/connection';
import { useRoom } from '@/lib/room';
import { api } from '@/lib/relay-api';
import { activeIdentity, addIdentity } from '@/lib/identities';
import { RelayError, describeError } from '@/lib/errors';
import type { PresentationView } from '@/lib/schemas';
import { RoomView } from '@/components/room/room-view';
import { RoomProvider } from '@/components/room/context';
import { ScheduleView } from '@/components/schedule/schedule-view';
import { DebriefView } from '@/components/debrief/debrief-view';
import { PresentView } from '@/components/present/present-view';
import { ErrorState, Loading, LocalBanner, ModeChip, NotConnected, StartsInDiscordState, StateView, type Mode } from '@/components/states';
import { Wordmark } from '@/components/graphics';
import { Button } from '@/components/ui/button';

const loginHref = (returnTo: string) => `/auth/discord/login?return_to=${encodeURIComponent(returnTo)}`;

/** Resolve the data mode and the viewer's credential before any session data is requested. */
function Gate({ sessionId, returnTo, children }: { sessionId: string; returnTo: string; children: (mode: Mode, conn: Extract<Connection, { status: 'local' | 'connected' }>) => React.ReactNode }) {
  const { conn } = useConnection();
  const [hasIdentity, setHasIdentity] = useState<boolean | null>(null);
  useEffect(() => { const t = window.setTimeout(() => setHasIdentity(!!activeIdentity(sessionId)), 0); return () => window.clearTimeout(t); }, [sessionId]);

  if (conn.status === 'checking' || hasIdentity === null) return <Loading />;
  if (conn.status === 'not_connected') return <Page><NotConnected reason={conn.reason} /></Page>;
  if (conn.status === 'error') return <Page><ErrorState error={conn.error} /></Page>;
  if (conn.status === 'local' && !hasIdentity) return <Page><LocalBanner /><JoinHere sessionId={sessionId} onJoined={() => setHasIdentity(true)} /></Page>;
  if (conn.status === 'connected' && !conn.me.authenticated) {
    return <Page><StartsInDiscordState loginHref={conn.me.login_available ? loginHref(returnTo) : null} /></Page>;
  }
  return <>{children(conn.status === 'local' ? 'local' : 'connected', conn)}</>;
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
      <Link href="/" className="w-fit"><Wordmark /></Link>
      {children}
    </div>
  );
}

function JoinHere({ sessionId, onJoined }: { sessionId: string; onJoined: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true); setError(null);
    try { const c = await api.join(sessionId, name.trim()); addIdentity({ ...c, name: name.trim() }); onJoined(); }
    catch (e) { setError(e instanceof RelayError ? describeError(e).body : 'Could not join.'); }
    finally { setBusy(false); }
  };
  return (
    <StateView title="Join this room on this browser" body={<>Room <span className="mono text-text">{sessionId}</span>. Pick a test name; it is stored only in this tab.</>}>
      <form className="flex w-full flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void join(); }}>
        <label htmlFor="join-name" className="sr-only">Test name</label>
        <input id="join-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="min-h-11 flex-1 rounded-[12px] border border-control bg-card px-3" placeholder="Test name" />
        <Button disabled={!name.trim() || busy}>{busy ? 'Joining…' : 'Join'}</Button>
        {error ? <p className="w-full text-sm text-amber" role="alert">{error}</p> : null}
      </form>
    </StateView>
  );
}

function useLive(sessionId: string) {
  return useRoom({ kind: 'live', sessionId });
}

function LiveRoomInner({ sessionId, mode, conn }: { sessionId: string; mode: Mode; conn: Extract<Connection, { status: 'local' | 'connected' }> }) {
  const room = useLive(sessionId);
  if (room.error && !room.view) return <Page><ErrorState error={room.error} onRetry={room.refresh} /></Page>;
  if (!room.view) return <Loading />;
  return <RoomView room={room} view={room.view} mode={mode} health={conn.health} basePath={`/room/${encodeURIComponent(sessionId)}`} onIdentityChange={room.switchIdentity} />;
}

export const LiveRoom = ({ sessionId }: { sessionId: string }) => (
  <Gate sessionId={sessionId} returnTo={`/room/${sessionId}`}>{(mode, conn) => <LiveRoomInner sessionId={sessionId} mode={mode} conn={conn} />}</Gate>
);

function LiveSubpage({ sessionId, mode, conn, children }: { sessionId: string; mode: Mode; conn: Extract<Connection, { status: 'local' | 'connected' }>; children: React.ReactNode }) {
  const room = useLive(sessionId);
  if (room.error && !room.view) return <Page><ErrorState error={room.error} onRetry={room.refresh} /></Page>;
  if (!room.view) return <Loading />;
  return (
    <RoomProvider value={{ room, view: room.view, sid: sessionId, mode, health: conn.health, basePath: `/room/${encodeURIComponent(sessionId)}` }}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/"><Wordmark /></Link><ModeChip mode={mode} health={conn.health} /></div>
        {mode === 'local' ? <LocalBanner /> : null}
        {children}
      </div>
    </RoomProvider>
  );
}

export const LiveSchedule = ({ sessionId }: { sessionId: string }) => (
  <Gate sessionId={sessionId} returnTo={`/room/${sessionId}/schedule`}>{(mode, conn) => <LiveSubpage sessionId={sessionId} mode={mode} conn={conn}><ScheduleView /></LiveSubpage>}</Gate>
);

export const LiveDebrief = ({ sessionId }: { sessionId: string }) => (
  <Gate sessionId={sessionId} returnTo={`/room/${sessionId}/debrief`}>{(mode, conn) => <LiveSubpage sessionId={sessionId} mode={mode} conn={conn}><DebriefView /></LiveSubpage>}</Gate>
);

/** Projector: fetches GET /presentation only (never the private view), with the same polling cadence. */
function LivePresentInner({ sessionId }: { sessionId: string }) {
  const [p, setP] = useState<PresentationView | null>(null);
  const [error, setError] = useState<RelayError | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try { const next = await api.presentation(sessionId); if (alive) { setP((old) => (old && old.revision === next.revision ? old : next)); setError(null); } }
      catch (e) { if (alive && e instanceof RelayError) setError(e); }
    };
    const first = window.setTimeout(load, 0);
    const t = window.setInterval(load, 3000);
    return () => { alive = false; window.clearTimeout(first); window.clearInterval(t); };
  }, [sessionId]);
  if (error && !p) return <Page><ErrorState error={error} /></Page>;
  if (!p) return <Loading label="Opening presentation mode" />;
  return <PresentView p={p} backHref={`/room/${encodeURIComponent(sessionId)}`} />;
}

export const LivePresent = ({ sessionId }: { sessionId: string }) => (
  <Gate sessionId={sessionId} returnTo={`/room/${sessionId}/present`}>{() => <LivePresentInner sessionId={sessionId} />}</Gate>
);
