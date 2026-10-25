'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Check, Copy, MonitorPlay, NotebookPen, UserPlus } from 'lucide-react';
import type { Room } from '@/lib/room';
import type { Health, SessionView } from '@/lib/schemas';
import { STAGE_LABEL, STAGE_ORDER, STAGE_SHORT, stageIndex } from '@/lib/stages';
import { api } from '@/lib/relay-api';
import { RelayError, describeError } from '@/lib/errors';
import { activeIdentity, addIdentity, listIdentities, setActive, type Identity } from '@/lib/identities';
import { handoff } from '@/lib/motion';
import { cn, shortHash } from '@/lib/utils';
import { LocalTime } from '@/components/time';
import { Track, TrackLabels } from '@/components/track';
import { Roster } from '@/components/roster';
import { Wordmark } from '@/components/graphics';
import { Button, buttonVariants } from '@/components/ui/button';
import { ModeChip, NoticeBanner, SyntheticBanner, LocalBanner, type Mode } from '@/components/states';
import { RoomProvider, useRoomCtx } from './context';
import { AttemptCard } from './attempt-card';
import { DiscussionCard } from './discussion-card';
import { ChallengeButton, DangerZone, EvidenceButton, EvidenceContent, HoldBanner, ResolutionNote, StageActions } from './controls';

type Props = {
  room: Room;
  view: SessionView;
  mode: Mode;
  health?: Health;
  basePath: string;
  /** Local test backends: identities on this browser for this session. */
  onIdentityChange?: () => void;
  extra?: React.ReactNode;
};

export function RoomView({ room, view, mode, health, basePath, onIdentityChange, extra }: Props) {
  return (
    <RoomProvider value={{ room, view, sid: view.id, mode, health, basePath }}>
      <div className="min-h-dvh desk:grid desk:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        <Rail basePath={basePath} />
        <div className="min-w-0">
          <PhoneStrip basePath={basePath} />
          <TabletBar />
          <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-28 sm:px-6 md:pb-12 desk:pt-8">
            {mode === 'synthetic' ? <SyntheticBanner /> : mode === 'local' ? <LocalBanner /> : null}
            {extra}
            {mode === 'local' ? <IdentitySwitcher onChange={onIdentityChange} /> : null}
            <SessionHeader />
            {room.notice ? <NoticeBanner error={room.notice} onDismiss={room.dismissNotice} /> : null}
            <HoldBanner />
            <WorkingCard />
            <ResolutionNote />
            <div className="flex flex-wrap items-center gap-2">
              <span className="desk:hidden"><EvidenceButton /></span>
              <ChallengeButton />
              <Link href={`${basePath}/schedule`} className={buttonVariants({ variant: 'quiet', size: 'sm' })}><CalendarClock strokeWidth={1.75} />Schedule</Link>
              <Link href={`${basePath}/debrief`} className={buttonVariants({ variant: 'quiet', size: 'sm' })}><NotebookPen strokeWidth={1.75} />Debrief</Link>
              <Link href={`${basePath}/present`} className={buttonVariants({ variant: 'quiet', size: 'sm' })}><MonitorPlay strokeWidth={1.75} />Presentation mode</Link>
              <span className="ml-auto"><DangerZone /></span>
            </div>
            <p className="text-xs text-muted">{view.notice}</p>
          </main>
        </div>
        <EvidenceColumn />
      </div>
    </RoomProvider>
  );
}

/** Slim progress line on the track while refreshing; the last view stays put (no skeleton swap). */
function RefreshLine() {
  const { room } = useRoomCtx();
  return <div aria-hidden className={cn('h-[2px] w-full bg-transparent', room.refreshing && 'bg-gradient-to-r from-transparent via-blue/50 to-transparent')} />;
}

function Rail({ basePath }: { basePath: string }) {
  const { view, mode, health } = useRoomCtx();
  const me = view.members.find((m) => m.is_me);
  return (
    <aside className="on-ink sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto bg-ink px-6 py-6 text-on-ink desk:flex" aria-label="Session">
      <Link href="/" className="w-fit"><Wordmark tone="paper" /></Link>
      <RoomCode tone="ink" />
      <ModeChip mode={mode} health={health} className="w-fit" />
      <nav aria-label="Session track" className="flex gap-4">
        <Track stage={view.stage} paused={!!view.paused} orientation="vertical" tone="ink" className="h-72" />
        <ol className="-my-2.5 flex h-[calc(18rem+1.25rem)] flex-col justify-between text-sm leading-5">
          {STAGE_ORDER.map((s, i) => (
            <li key={s} className={cn(i === stageIndex(view.stage) ? 'font-bold text-on-ink' : 'text-on-ink-muted')}>
              {s === 'lobby' ? <Link className="hover:underline" href={`${basePath}/schedule`}>{STAGE_LABEL[s]}</Link> : s === 'debrief' ? <Link className="hover:underline" href={`${basePath}/debrief`}>{STAGE_LABEL[s]}</Link> : STAGE_LABEL[s]}
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-col gap-3">
        <span className="text-xs font-bold tracking-[0.08em] text-on-ink-muted uppercase">Roster</span>
        <Roster members={view.members} approvedByMe={view.approved_by_me} tone="ink" layout="list" />
        <p className="text-xs text-on-ink-muted">Shows who has answered, never who is right. RELAY has no online/offline signal.</p>
      </div>
      {me ? <p className="mt-auto text-xs text-on-ink-muted">Signed in here as {me.name}.</p> : null}
    </aside>
  );
}

function TabletBar() {
  const { view, mode, health } = useRoomCtx();
  return (
    <div className="hidden border-b border-line bg-card md:block desk:hidden">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 pt-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/"><Wordmark /></Link>
          <ModeChip mode={mode} health={health} />
        </div>
        <Track stage={view.stage} paused={!!view.paused} />
        <TrackLabels stage={view.stage} labels={STAGE_SHORT} />
        <Roster members={view.members} approvedByMe={view.approved_by_me} />
      </div>
      <RefreshLine />
    </div>
  );
}

/** Phone: compact station strip pinned at the top, doubling as navigation. */
function PhoneStrip({ basePath }: { basePath: string }) {
  const { view, mode } = useRoomCtx();
  const at = stageIndex(view.stage);
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-card/95 md:hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-2">
        <Link href="/" className="text-sm font-extrabold tracking-[0.14em] text-ink">RELAY</Link>
        <ModeChip mode={mode} className="text-[0.7rem]" />
      </div>
      <nav aria-label="Session stations" className="px-2 pb-1">
        <ol className="grid grid-cols-5">
          {STAGE_ORDER.map((s, i) => {
            const href = s === 'lobby' ? `${basePath}/schedule` : s === 'debrief' ? `${basePath}/debrief` : basePath;
            return (
              <li key={s}>
                <Link href={href} aria-current={i === at ? 'step' : undefined} className="flex min-h-11 flex-col items-center justify-center gap-1 text-[0.68rem] leading-none">
                  <span className={cn('block size-2.5 rounded-full border-2', i < at && 'border-blue bg-blue', i === at && (view.paused ? 'border-amber bg-amber' : 'border-blue bg-blue ring-4 ring-blue/20'), i > at && 'border-line-strong bg-card')} />
                  <span className={i === at ? 'font-bold text-text' : 'text-muted'}>{STAGE_SHORT[s]}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
      <RefreshLine />
    </div>
  );
}

function RoomCode({ tone = 'paper' }: { tone?: 'paper' | 'ink' }) {
  const { view } = useRoomCtx();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(view.id); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* clipboard refused; the code stays selectable */ }
  };
  const ink = tone === 'ink';
  return (
    <div className="flex flex-col gap-1">
      <span className={cn('text-xs font-bold tracking-[0.08em] uppercase', ink ? 'text-on-ink-muted' : 'text-muted')}>Room code</span>
      <div className="flex items-center gap-2">
        <span className={cn('mono text-base font-semibold select-all', ink ? 'text-on-ink' : 'text-text')}>{view.id}</span>
        <button type="button" onClick={copy} className={cn('press grid size-9 place-items-center rounded-full', ink ? 'hover:bg-white/10' : 'hover:bg-text/5')} aria-label={copied ? 'Room code copied' : 'Copy room code'}>
          {copied ? <Check className="size-4" strokeWidth={1.75} /> : <Copy className="size-4" strokeWidth={1.75} />}
        </button>
      </div>
      <span className={cn('text-xs', ink ? 'text-on-ink-muted' : 'text-muted')}>A room code is not a password: joining still needs an account or invite.</span>
    </div>
  );
}

function SessionHeader() {
  const { view } = useRoomCtx();
  return (
    <header className="flex flex-col gap-2">
      <span className="eyebrow">{STAGE_LABEL[view.stage]}</span>
      <h1 className="text-3xl sm:text-4xl">{view.concept.title}</h1>
      <div className="flex flex-col gap-y-1 text-sm text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        <span className="desk:hidden">Room <span className="mono text-text">{view.id}</span></span>
        <span>Question pack <span className="mono text-text" title="First 8 characters of the pack fingerprint">{shortHash(view.pack_hash)}</span></span>
      </div>
      <div className="md:hidden"><Roster members={view.members} approvedByMe={view.approved_by_me} /></div>
    </header>
  );
}

/** The single working card. Swaps in from the direction of travel when the server's stage changes. */
function WorkingCard() {
  const { view } = useRoomCtx();
  const key = `${view.stage}:${view.question?.id ?? ''}:${view.invalidated}`;
  return (
    <div className={cn('relative transition-opacity duration-200', view.paused && 'pointer-events-none opacity-45')} inert={view.paused || undefined} aria-hidden={view.paused || undefined}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.section key={key} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={handoff} className="card p-5 sm:p-8">
          <StageBody />
          <div className="mt-6 border-t border-line pt-5"><StageActions /></div>
        </motion.section>
      </AnimatePresence>
    </div>
  );
}

function StageBody() {
  const { view } = useRoomCtx();
  if (view.invalidated) return <DiscardedBody />;
  if (view.question && (view.stage === 'diagnostic' || view.stage === 'transfer' || view.stage === 'debrief')) return <AttemptCard key={view.question.id} question={view.question} />;
  if (view.stage === 'lobby') return <LobbyBody />;
  if (view.stage === 'discussion') return <DiscussionCard />;
  if (view.stage === 'debrief') return <DebriefBody />;
  return <p className="text-muted">Waiting for the next step.</p>;
}

function LobbyBody() {
  const { view, basePath } = useRoomCtx();
  const others = view.members.filter((m) => !m.is_me && m.state !== 'withdrawn').length;
  return (
    <div className="flex flex-col gap-5">
      <span className="eyebrow">Gather your group</span>
      <h2 className="text-[1.55rem] sm:text-3xl">{others ? `You and ${others} ${others === 1 ? 'other' : 'others'} are here.` : 'You’re the first one here.'}</h2>
      <p className="measure text-muted">Everyone answers privately first, explains together, then tries a fresh problem. Nothing is ranked, and you can skip any question.</p>
      <div className="rounded-[16px] border border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>Meeting time</strong>
          <Link className={buttonVariants({ variant: 'secondary', size: 'sm' })} href={`${basePath}/schedule`}>Open schedule</Link>
        </div>
        <p className="mt-1 text-sm text-muted">
          {view.plan ? <>Proposed <LocalTime iso={view.plan.start} /> · <span className="mono">v{view.plan_version}</span> · <span className="mono">{view.approved_count}/{view.members.filter((m) => m.state !== 'withdrawn').length}</span> approved{view.schedule_confirmed ? ' · confirmed' : ''}</> : 'No time proposed yet. Add your free windows on the schedule.'}
        </p>
      </div>
      {view.is_host && view.members.filter((m) => m.state !== 'withdrawn').length < 2 ? <p className="text-sm text-muted">The session needs at least two participants before it starts.</p> : null}
    </div>
  );
}

function DiscardedBody() {
  const { view } = useRoomCtx();
  return (
    <div className="flex flex-col gap-3">
      <span className="eyebrow">Item discarded</span>
      <h2 className="text-[1.55rem] sm:text-3xl">No score is better than a misleading score.</h2>
      <p className="measure text-muted">The host withdrew this item after review. No group results or follow-up are published for it, and nobody’s answer is marked wrong.</p>
      {view.challenge?.resolution ? <p className="text-sm">Host note: {view.challenge.resolution.host_note}</p> : null}
    </div>
  );
}

function DebriefBody() {
  const { basePath } = useRoomCtx();
  return (
    <div className="flex flex-col gap-4">
      <span className="eyebrow">Reflect on learning</span>
      <h2 className="text-[1.55rem] sm:text-3xl">The session is complete.</h2>
      <p className="measure text-muted">The debrief shows what happened: two different questions, the same group. It is practice evidence, not a grade or proof of mastery.</p>
      <div><Link className={buttonVariants()} href={`${basePath}/debrief`}>Open the debrief</Link></div>
    </div>
  );
}

function EvidenceColumn() {
  const { view } = useRoomCtx();
  return (
    <aside className="hidden flex-col gap-4 border-l border-line bg-paper px-6 py-8 desk:flex" aria-label="Evidence">
      <span className="eyebrow">Evidence</span>
      <div className="card p-5"><EvidenceContent /></div>
      <span className="eyebrow mt-2">Schedule</span>
      <div className="card p-5 text-sm">
        {view.plan ? (
          <>
            <p><LocalTime className="font-semibold" iso={view.plan.start} /> · {view.plan.minutes} min</p>
            <p className="mt-1 text-muted"><span className="mono">v{view.plan_version}</span> · <span className="mono">{view.approved_count}/{view.members.filter((m) => m.state !== 'withdrawn').length}</span> approved{view.schedule_confirmed ? ' · confirmed' : ''}</p>
          </>
        ) : <p className="text-muted">No time proposed.</p>}
      </div>
    </aside>
  );
}

/** Local test backends only: one presenter plays several students on one laptop. */
function IdentitySwitcher({ onChange }: { onChange?: () => void }) {
  const { view, room } = useRoomCtx();
  const [ids, setIds] = useState<Identity[]>(() => listIdentities(view.id));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const me = activeIdentity(view.id);
  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setAddError(null);
    try {
      const c = await api.join(view.id, name.trim());
      addIdentity({ ...c, name: name.trim() });
      setIds(listIdentities(view.id)); setName(''); onChange?.();
    } catch (e) { setAddError(e instanceof RelayError ? describeError(e).body : 'Could not add the test participant.'); } finally { setBusy(false); }
  };
  return (
    <section className="flex flex-col gap-2 rounded-[16px] border border-amber/25 bg-card px-4 py-3" aria-label="Local test identities">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Viewing as</span>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Test identity">
          {ids.map((i) => (
            <button key={i.member_id} type="button" role="radio" aria-checked={me?.member_id === i.member_id}
              onClick={() => { setActive(view.id, i.member_id); onChange?.(); }}
              className={cn('press min-h-9 rounded-full border px-3 text-sm', me?.member_id === i.member_id ? 'border-ink bg-ink text-on-ink' : 'border-line-strong hover:border-text/40')}>
              {i.name}
            </button>
          ))}
        </div>
      </div>
      {view.stage === 'lobby' ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <label htmlFor="test-name" className="sr-only">Test participant name</label>
          <input id="test-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Add a test participant" className="min-h-9 flex-1 rounded-[10px] border border-line-strong bg-card px-3 text-sm" />
          <Button size="sm" variant="secondary" disabled={!name.trim() || busy || !!room.pending}><UserPlus strokeWidth={1.75} />Add</Button>
          {addError ? <p role="alert" className="w-full text-sm text-amber">{addError}</p> : null}
        </form>
      ) : <p className="text-xs text-muted">The roster locks once the session starts.</p>}
    </section>
  );
}

