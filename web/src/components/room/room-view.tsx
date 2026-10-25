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
import { EvidenceGlyph, Wordmark } from '@/components/graphics';
import { Button, buttonVariants } from '@/components/ui/button';
import { ModeChip, NoticeBanner, SyntheticBanner, LocalBanner, type Mode } from '@/components/states';
import { ReceiptCard } from '@/components/debrief/receipt';
import { RoomProvider, useRoomCtx } from './context';
import { AttemptCard } from './attempt-card';
import { DiscussionCard } from './discussion-card';
import { ChallengeButton, DangerZone, EvidenceButton, HoldBanner, ResolutionNote, StageActions } from './controls';

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

/**
 * The study room, task first: a compact header and stepper, then the one working card for the
 * current stage with this person's primary action in its footer. Group, source and schedule are
 * context beside it (below it on phones), never in front of it.
 */
export function RoomView({ room, view, mode, health, basePath, onIdentityChange, extra }: Props) {
  return (
    <RoomProvider value={{ room, view, sid: view.id, mode, health, basePath }}>
      <div className="min-h-dvh">
        <TopBar />
        <PhoneStrip />
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-28 sm:px-6 md:pt-5 md:pb-12">
          {mode === 'synthetic' ? <SyntheticBanner /> : mode === 'local' ? <LocalBanner /> : null}
          {extra}
          {mode === 'local' ? <IdentitySwitcher onChange={onIdentityChange} /> : null}
          <SessionHeader />
          <Stepper />
          {room.notice ? <NoticeBanner error={room.notice} onDismiss={room.dismissNotice} /> : null}
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <HoldBanner />
              <WorkingCard />
              <ResolutionNote />
              <div className="flex flex-wrap items-center gap-2 lg:hidden">
                <EvidenceButton />
                <ChallengeButton />
                <RoomLinks />
              </div>
            </div>
            <Aside />
          </div>
          <p className="text-xs text-muted">{view.notice}</p>
        </main>
      </div>
    </RoomProvider>
  );
}

/** Slim progress line while refreshing; the last view stays put (no skeleton swap). */
function RefreshLine() {
  const { room } = useRoomCtx();
  return <div aria-hidden className={cn('h-[2px] w-full bg-transparent', room.refreshing && 'bg-gradient-to-r from-transparent via-primary/50 to-transparent')} />;
}

function TopBar() {
  const { mode, health, room } = useRoomCtx();
  return (
    <header className="on-ink relative hidden bg-ink text-on-ink md:block">
      <span aria-hidden className="bg-brand absolute inset-x-0 top-0 h-[3px]" />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="shrink-0"><Wordmark tone="paper" /></Link>
          <span className="hidden truncate border-l border-white/20 pl-4 text-sm text-on-ink-muted lg:block">A practice room, not a performance.</span>
        </div>
        <ModeChip mode={mode} health={room.kind === 'live' ? health : undefined} />
      </div>
      <RefreshLine />
    </header>
  );
}

/** Phone: compact station strip pinned at the top, doubling as navigation. */
function PhoneStrip() {
  const { view, mode, basePath, room } = useRoomCtx();
  const at = stageIndex(view.stage);
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-card/95 md:hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-2">
        <Link href="/" aria-label="Relay home"><Wordmark className="text-[1.1rem] [&_svg]:size-7" /></Link>
        <ModeChip mode={mode} className="text-[0.7rem]" />
      </div>
      <nav aria-label="Session stations" className="px-2 pb-1">
        <ol className="grid grid-cols-5">
          {STAGE_ORDER.map((s, i) => {
            const href = s === 'lobby' && room.kind !== 'sample' ? `${basePath}/schedule` : s === 'debrief' ? `${basePath}/debrief` : basePath;
            return (
              <li key={s}>
                <Link href={href} aria-current={i === at ? 'step' : undefined} className="flex min-h-11 flex-col items-center justify-center gap-1 text-[0.68rem] leading-none">
                  <span className={cn('block size-2.5 rounded-full border-2', i < at && 'border-primary bg-primary', i === at && (view.paused ? 'border-amber bg-amber' : 'border-primary bg-primary ring-4 ring-primary/20'), i > at && 'border-line-strong bg-card')} />
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

/** Tablet and desktop: the relay track as a horizontal stepper. */
function Stepper() {
  const { view } = useRoomCtx();
  return (
    <nav aria-label="Session stages" className="card hidden px-6 pt-3 pb-2 md:block">
      <Track stage={view.stage} paused={!!view.paused} />
      <div className="lg:hidden"><TrackLabels stage={view.stage} labels={STAGE_SHORT} /></div>
      <div className="hidden lg:block"><TrackLabels stage={view.stage} labels={STAGE_LABEL} /></div>
    </nav>
  );
}

function SessionHeader() {
  const { view, room } = useRoomCtx();
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-2xl sm:text-[1.85rem]">{view.concept.title}</h1>
        <p className="text-sm text-muted">
          <span className="font-semibold text-text">{STAGE_LABEL[view.stage]}</span>
          {room.kind === 'live' ? <> · room <span className="mono text-text">{view.id}</span></> : null}
          {' '}· pack <span className="mono text-text" title="First 8 characters of the question pack fingerprint">{shortHash(view.pack_hash)}</span>
        </p>
      </div>
      <div className="lg:hidden"><Roster members={view.members} approvedByMe={view.approved_by_me} /></div>
    </header>
  );
}

/**
 * The single working card. Swaps in from the direction of travel when the server's stage changes.
 * Each card carries its own copy of the room context: AnimatePresence keeps an exiting card's last
 * props, so the outgoing card keeps showing its own stage instead of re-rendering the new one (which
 * would mount, take input, then be thrown away when the real card arrives).
 */
function WorkingCard() {
  const ctx = useRoomCtx();
  const { view } = ctx;
  const key = `${view.stage}:${view.question?.id ?? ''}:${view.invalidated}`;
  const footer = view.stage !== 'debrief' && !view.invalidated;
  return (
    <div className={cn('relative transition-opacity duration-200', view.paused && 'pointer-events-none opacity-45')} inert={view.paused || undefined} aria-hidden={view.paused || undefined}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.section key={key} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={handoff}
          className="card overflow-hidden shadow-[var(--shadow-soft)]" aria-label="Current task">
          <RoomProvider value={ctx}>
            <div className="p-5 sm:p-7"><StageBody /></div>
            {footer ? <div className="border-t border-line bg-paper/60 px-5 py-4 sm:px-7"><StageActions /></div> : null}
          </RoomProvider>
        </motion.section>
      </AnimatePresence>
    </div>
  );
}

function StageBody() {
  const { view } = useRoomCtx();
  // Reflect shows the receipt, unless the separate delayed check is due (it opens after 24 hours).
  if (view.stage === 'debrief') return view.question && view.allowed_actions.answer.allowed ? <AttemptCard key={view.question.id} question={view.question} /> : <DebriefBody />;
  if (view.invalidated) return <DiscardedBody />;
  if (view.question && (view.stage === 'diagnostic' || view.stage === 'transfer')) return <AttemptCard key={view.question.id} question={view.question} />;
  if (view.stage === 'lobby') return <LobbyBody />;
  if (view.stage === 'discussion') return <DiscussionCard />;
  return <p className="text-muted">Waiting for the next step.</p>;
}

function LobbyBody() {
  const { view, basePath, room } = useRoomCtx();
  const people = view.members.filter((m) => m.state !== 'withdrawn');
  const others = people.filter((m) => !m.is_me);
  return (
    <div className="flex flex-col gap-5">
      <span className="eyebrow">Gather</span>
      <h2 className="text-[1.55rem] sm:text-3xl">{others.length ? `You and ${others.length} ${others.length === 1 ? 'other' : 'others'} are here.` : 'You’re the first one here.'}</h2>
      <p className="measure text-muted">
        Everyone answers privately first, explains together, then tries a fresh problem alone. Nothing is ranked, and anyone can skip a question or challenge it.
        {room.kind === 'sample' ? ` ${others.map((m) => m.name).join(', ')} are fictional peers. You are the host, so you start when ready.` : ''}
      </p>
      {room.kind !== 'sample' ? (
        <div className="rounded-[16px] border border-line px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>Meeting time</strong>
            <Link className={buttonVariants({ variant: 'secondary', size: 'sm' })} href={`${basePath}/schedule`}>Open schedule</Link>
          </div>
          <p className="mt-1 text-sm text-muted">
            {view.plan ? <>Proposed <LocalTime iso={view.plan.start} /> · <span className="mono">v{view.plan_version}</span> · <span className="mono">{view.approved_count}/{people.length}</span> approved{view.schedule_confirmed ? ' · confirmed' : ''}</> : 'No time proposed yet. Add your free windows on the schedule.'}
          </p>
        </div>
      ) : null}
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

/** Reflect: the receipt is the task. */
function DebriefBody() {
  const { view, basePath } = useRoomCtx();
  if (!view.receipt) return <p className="text-muted">No receipt: you are no longer part of this session.</p>;
  return (
    <div className="flex flex-col gap-6">
    {view.invalidated ? <div className="border-b border-line pb-6"><DiscardedBody /></div> : null}
    <ReceiptCard receipt={view.receipt} results={view.my_results}>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Link className={buttonVariants()} href={`${basePath}/debrief`}>Open the full reflection</Link>
        <Link className={buttonVariants({ variant: 'secondary' })} href={`${basePath}/present`}>Show the group screen</Link>
      </div>
    </ReceiptCard>
    </div>
  );
}

function RoomLinks() {
  const { basePath, room } = useRoomCtx();
  return (
    <>
      {room.kind !== 'sample' ? <Link href={`${basePath}/schedule`} className={buttonVariants({ variant: 'quiet', size: 'sm' })}><CalendarClock strokeWidth={1.75} />Schedule</Link> : null}
      <Link href={`${basePath}/debrief`} className={buttonVariants({ variant: 'quiet', size: 'sm' })}><NotebookPen strokeWidth={1.75} />Reflection</Link>
      <Link href={`${basePath}/present`} className={buttonVariants({ variant: 'quiet', size: 'sm' })}><MonitorPlay strokeWidth={1.75} />Group screen</Link>
      <DangerZone />
    </>
  );
}

/** Context column (desktop): who is here, why this question, when you meet. */
function Aside() {
  const { view, room } = useRoomCtx();
  const people = view.members.filter((m) => m.state !== 'withdrawn').length;
  return (
    <aside className="hidden flex-col gap-4 lg:flex" aria-label="Session context">
      <section className="card p-5">
        <span className="eyebrow">Your group</span>
        <h2 className="mt-2 font-sans text-base font-bold">{people} {people === 1 ? 'person' : 'people'}, one idea</h2>
        <div className="mt-3"><Roster members={view.members} approvedByMe={view.approved_by_me} layout="list" /></div>
        <p className="mt-3 text-xs text-muted">Shows who has answered, never who is right.{room.kind === 'sample' ? ' Everyone except you is fictional.' : ''}</p>
      </section>
      <section className="card flex flex-col gap-3 p-5">
        <span className="eyebrow">Why this question?</span>
        <div className="flex items-start gap-2">
          <EvidenceGlyph className="mt-1 size-5 shrink-0 text-ink" />
          <div className="min-w-0">
            <h2 className="font-sans text-base font-bold">{view.source ? view.source.source_title : 'The source opens after everyone answers'}</h2>
            <p className="mt-1 text-sm text-muted">{view.source ? 'RELAY checks answers against this reviewed note, not the majority.' : 'You think on your own first. The reviewed note opens in Explain together.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2"><EvidenceButton /><ChallengeButton /></div>
      </section>
      {room.kind !== 'sample' ? (
        <section className="card p-5 text-sm">
          <span className="eyebrow">Meeting time</span>
          {view.plan ? (
            <>
              <p className="mt-2"><LocalTime className="font-semibold" iso={view.plan.start} /> · {view.plan.minutes} min</p>
              <p className="mt-1 text-muted"><span className="mono">v{view.plan_version}</span> · <span className="mono">{view.approved_count}/{people}</span> approved{view.schedule_confirmed ? ' · confirmed' : ''}</p>
            </>
          ) : <p className="mt-2 text-muted">No time proposed.</p>}
        </section>
      ) : null}
      {room.kind === 'live' ? <section className="card p-5"><RoomCode /></section> : null}
      <div className="flex flex-wrap gap-1"><RoomLinks /></div>
    </aside>
  );
}

function RoomCode() {
  const { view } = useRoomCtx();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(view.id); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* clipboard refused; the code stays selectable */ }
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow">Room code</span>
      <div className="flex items-center gap-2">
        <span className="mono text-base font-semibold text-text select-all">{view.id}</span>
        <button type="button" onClick={copy} className="press grid size-9 place-items-center rounded-full hover:bg-text/5" aria-label={copied ? 'Room code copied' : 'Copy room code'}>
          {copied ? <Check className="size-4" strokeWidth={1.75} /> : <Copy className="size-4" strokeWidth={1.75} />}
        </button>
      </div>
      <span className="text-xs text-muted">A room code is not a password: joining still needs an account or invite.</span>
    </div>
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
          <input id="test-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Add a test participant" className="min-h-9 flex-1 rounded-[10px] border border-control bg-card px-3 text-sm" />
          <Button size="sm" variant="secondary" disabled={!name.trim() || busy || !!room.pending}><UserPlus strokeWidth={1.75} />Add</Button>
          {addError ? <p role="alert" className="w-full text-sm text-amber">{addError}</p> : null}
        </form>
      ) : <p className="text-xs text-muted">The roster locks once the session starts.</p>}
    </section>
  );
}
