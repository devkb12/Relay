'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LogOut } from 'lucide-react';
import { detectConnection, useConnection } from '@/lib/connection';
import { api, setCsrf } from '@/lib/relay-api';
import { addIdentity, listIdentities, type Identity } from '@/lib/identities';
import { RelayError, describeError } from '@/lib/errors';
import type { MySessions } from '@/lib/schemas';
import { STAGE_LABEL } from '@/lib/stages';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState, Loading, LocalBanner, ModeChip, NotConnected, StartsInDiscordState, StateView } from '@/components/states';
import { Wordmark } from '@/components/graphics';

export function RoomIndex() {
  const { conn } = useConnection();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/"><Wordmark /></Link>
        {conn.status === 'local' ? <ModeChip mode="local" /> : conn.status === 'connected' ? <ModeChip mode="connected" health={conn.health} /> : null}
      </div>
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Study room</span>
        <h1 className="text-4xl">Open a study room</h1>
      </header>
      {conn.status === 'checking' ? <Loading label="Checking the backend" /> : null}
      {conn.status === 'not_connected' ? <NotConnected /> : null}
      {conn.status === 'error' ? <ErrorState error={conn.error} /> : null}
      {conn.status === 'local' ? <LocalRooms /> : null}
      {conn.status === 'connected' ? (conn.me.authenticated ? <MyRooms name={conn.me.user.name} /> : <StartsInDiscordState loginHref={conn.me.login_available ? '/auth/discord/login?return_to=%2Froom' : null} />) : null}
    </div>
  );
}

function LocalRooms() {
  const router = useRouter();
  const [concepts, setConcepts] = useState<{ id: string; title: string }[]>([]);
  const [concept, setConcept] = useState('');
  const [host, setHost] = useState('');
  const [code, setCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mine, setMine] = useState<Identity[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => setMine(listIdentities()), 0);
    api.concepts().then((c) => { setConcepts(c); setConcept((x) => x || c[0]?.id || ''); }).catch((e) => setError(describeError(e).body));
    return () => window.clearTimeout(t);
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof RelayError ? `${describeError(e).title}: ${describeError(e).body}` : String(e)); } finally { setBusy(null); }
  };
  const create = () => run('create', async () => { const c = await api.create(host.trim(), concept); addIdentity({ ...c, name: host.trim() }); router.push(`/room/${c.session_id}`); });
  const join = () => run('join', async () => { const sid = code.trim(); const c = await api.join(sid, joinName.trim()); addIdentity({ ...c, name: joinName.trim() }); router.push(`/room/${sid}`); });
  const sessions = [...new Map(mine.map((i) => [i.session_id, i])).values()];

  return (
    <>
      <LocalBanner />
      {error ? <p role="alert" className="rounded-[12px] border border-amber/30 bg-amber-tint px-4 py-3 text-sm text-amber">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <form className="card flex flex-col gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (host.trim() && concept) void create(); }}>
          <h2 className="text-xl">Start a test session</h2>
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Your test name</span>
            <input value={host} maxLength={40} onChange={(e) => setHost(e.target.value)} className="min-h-11 rounded-[12px] border border-line-strong bg-card px-3" /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Concept</span>
            <select value={concept} onChange={(e) => setConcept(e.target.value)} className="min-h-11 rounded-[12px] border border-line-strong bg-card px-3">
              {concepts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select></label>
          <Button disabled={!host.trim() || !concept || !!busy}>{busy === 'create' ? 'Creating…' : 'Create session'}</Button>
        </form>
        <form className="card flex flex-col gap-3 p-5" onSubmit={(e) => { e.preventDefault(); if (code.trim() && joinName.trim()) void join(); }}>
          <h2 className="text-xl">Join with a room code</h2>
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Room code</span>
            <input value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} className="mono min-h-11 rounded-[12px] border border-line-strong bg-card px-3" /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Your test name</span>
            <input value={joinName} maxLength={40} onChange={(e) => setJoinName(e.target.value)} className="min-h-11 rounded-[12px] border border-line-strong bg-card px-3" /></label>
          <Button variant="secondary" disabled={!code.trim() || !joinName.trim() || !!busy}>{busy === 'join' ? 'Joining…' : 'Join session'}</Button>
        </form>
      </div>
      {sessions.length ? (
        <section className="card flex flex-col gap-2 p-5">
          <h2 className="text-xl">Rooms on this tab</h2>
          <ul className="grid gap-2">{sessions.map((s) => <li key={s.session_id}><Link className="mono inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline" href={`/room/${s.session_id}`}>{s.session_id}<ArrowRight className="size-4" strokeWidth={1.75} /></Link></li>)}</ul>
          <p className="text-xs text-muted">Test identities live only in this tab’s session storage.</p>
        </section>
      ) : null}
    </>
  );
}

function MyRooms({ name }: { name: string }) {
  const router = useRouter();
  const [list, setList] = useState<MySessions | null>(null);
  const [error, setError] = useState<RelayError | null>(null);
  useEffect(() => { api.mySessions().then(setList).catch((e) => e instanceof RelayError && setError(e)); }, []);
  const logout = async () => { try { await api.logout(); } finally { setCsrf(null); await detectConnection(true); router.push('/'); } };
  if (error) return <ErrorState error={error} />;
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl">Your sessions, {name}</h2>
        <Button variant="quiet" size="sm" onClick={logout}><LogOut strokeWidth={1.75} />Sign out</Button>
      </div>
      {!list ? <Loading label="Loading your sessions" /> : list.length ? (
        <ul className="grid gap-2">
          {list.map((s) => (
            <li key={s.id}>
              <Link href={`/room/${s.id}`} className={buttonVariants({ variant: 'secondary', className: 'w-full justify-between' })}>
                <span className="truncate">{s.concept.title}</span>
                <span className="text-sm font-normal text-muted">{s.paused ? 'On hold' : STAGE_LABEL[s.stage]}{s.is_host ? ' · host' : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <StateView className="p-0 border-0" title="No sessions yet" body={<>Start one in Discord with <code className="mono">/relay create</code>, or join with <code className="mono">/relay join</code>. It appears here after that.</>} />
      )}
    </section>
  );
}
