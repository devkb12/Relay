'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarArrowDown, CalendarCheck, Check, Plus, Trash2 } from 'lucide-react';
import { DEMO_ONLY } from '@/lib/room';
import type { Plan } from '@/lib/schemas';
import { settle } from '@/lib/motion';
import { MAX_WINDOW_MS, isoToWallTime, timeZones, wallTimeToIso } from '@/lib/time';
import { cn } from '@/lib/utils';
import { LocalTime } from '@/components/time';
import { RelayError, describeError } from '@/lib/errors';
import { Button, buttonVariants } from '@/components/ui/button';
import { NoCommonTime } from '@/components/graphics';
import { useRoomCtx } from '@/components/room/context';
import { toast } from 'sonner';

type Draft = { start: string; end: string };
const CHIPS = [90, 60, 45, 30];

export function ScheduleView() {
  const { view, room, basePath } = useRoomCtx();
  const editable = view.stage === 'lobby' && !room.demo;
  // The member's stored preference (server default America/Phoenix) so server and browser agree.
  const [tz, setTz] = useState(view.me.timezone || 'America/Phoenix');
  const active = view.members.filter((m) => m.state !== 'withdrawn').length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Schedule together</span>
        <h1 className="text-3xl sm:text-4xl">Find a time everyone can make.</h1>
        <p className="measure text-muted">Add the windows you’re free. RELAY only compares the times people enter; a missing entry is unknown, never assumed free.</p>
        <p className="text-sm text-muted">Calendar sync isn’t available yet, so add your free times by hand.</p>
        {!editable ? <p className="rounded-[12px] border border-line px-4 py-2 text-sm">{room.demo ? DEMO_ONLY + ' This schedule is read-only in the synthetic session.' : 'The session has started, so the schedule is read-only.'}</p> : null}
      </header>

      <PlanCard tz={tz} active={active} />
      <Availability tz={tz} setTz={setTz} editable={editable} />
      {view.is_host ? <Propose editable={editable} tz={tz} /> : null}
      <Reminders />
      <div className="flex flex-wrap gap-2"><Link href={basePath} className={buttonVariants({ variant: 'quiet', size: 'sm' })}>Back to the room</Link></div>
    </div>
  );
}

export function PlanCard({ tz, active }: { tz: string; active: number }) {
  const { view, room, sid } = useRoomCtx();
  const [acceptShorter, setAcceptShorter] = useState(false);
  const [replaced, setReplaced] = useState<{ from: number; to: number; plan: Plan | null } | null>(null);
  const prev = useRef<{ version: number; plan: Plan | null } | null>(null);

  // "Plan changed: v7 → v8, approvals reset." — only for changes seen while this page is open.
  useEffect(() => {
    const p = prev.current;
    if (p && p.version !== view.plan_version) setReplaced({ from: p.version, to: view.plan_version, plan: p.plan });
    prev.current = { version: view.plan_version, plan: view.plan };
  }, [view.plan_version, view.plan]);

  const plan = view.plan;
  const download = async () => {
    if (room.demo) { toast(DEMO_ONLY); return; }
    try {
      const blob = await room.client.calendarFile(sid);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'relay-session.ics'; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(describeError(e).body); }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="plan-heading">
      <h2 id="plan-heading" className="font-sans text-base font-bold">Current plan</h2>
      <AnimatePresence initial={false}>
        {replaced ? (
          <motion.p key={`r${replaced.to}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={settle} role="status" className="rounded-[12px] border border-amber/30 bg-amber-tint px-4 py-2 text-sm text-amber">
            Plan changed: <span className="mono">v{replaced.from} → v{replaced.to}</span>, approvals reset.
            <button className="ml-2 font-semibold underline" type="button" onClick={() => setReplaced(null)}>Dismiss</button>
          </motion.p>
        ) : null}
      </AnimatePresence>
      <div className="relative">
        {replaced?.plan ? (
          <div aria-hidden className="card absolute inset-x-3 -bottom-2 h-full translate-y-2 bg-paper opacity-70">
            <span className="mono absolute right-4 bottom-1 text-xs text-muted">Replaced by v{replaced.to}</span>
          </div>
        ) : null}
        <motion.div key={view.plan_version} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={settle} className="card relative p-5 sm:p-6">
          {plan ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-2xl"><LocalTime iso={plan.start} tz={tz} /></p>
                  <p className="text-sm text-muted">until <LocalTime iso={plan.end} tz={tz} withDate={false} /> · {plan.minutes} minutes</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="mono rounded-full border border-line px-2 py-0.5 text-xs">v{view.plan_version}</span>
                  {plan.shorter_alternative ? <span className="rounded-full bg-amber-tint px-2 py-0.5 text-xs font-semibold text-amber">Shorter alternative</span> : null}
                </div>
              </div>
              <p className="text-sm">
                <span className="mono font-semibold">{view.approved_count}/{active}</span> approved
                {view.approved_by_me ? <span className="ml-2 inline-flex items-center gap-1 text-green"><Check className="size-4" strokeWidth={1.75} aria-hidden />You approved</span> : <span className="ml-2 text-muted">You haven’t approved yet.</span>}
              </p>
              {view.needs_reproposal ? <p className="text-sm text-amber">The group changed after this proposal. The host needs to propose again before anyone can approve.</p> : null}
              {view.schedule_confirmed ? (
                <div className="flex flex-col gap-2 rounded-[12px] border border-green/30 bg-green-tint px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-semibold text-green"><CalendarCheck className="size-5" strokeWidth={1.75} aria-hidden />Everyone approved this time.</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="secondary" size="sm" onClick={download}><CalendarArrowDown strokeWidth={1.75} />Download calendar file</Button>
                    <span className="text-sm text-text">RELAY doesn’t access your calendar. Importing the file is your choice.</span>
                  </div>
                </div>
              ) : !view.approved_by_me && view.stage === 'lobby' ? (
                <div className="flex flex-col gap-2">
                  {plan.shorter_alternative ? (
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1 size-4" checked={acceptShorter} onChange={(e) => setAcceptShorter(e.target.checked)} />
                      <span>I accept the shorter {plan.minutes}-minute time. The host asked for longer, and nothing was changed without asking.</span>
                    </label>
                  ) : null}
                  <div>
                    <Button disabled={!!room.pending || (plan.shorter_alternative && !acceptShorter) || !!view.needs_reproposal}
                      onClick={() => room.act('approve', () => room.client.approve(sid, view.plan_version, plan.shorter_alternative && acceptShorter))}>
                      {room.pending === 'approve' ? 'Approving…' : `Approve v${view.plan_version}`}
                    </Button>
                  </div>
                </div>
              ) : null}
              {view.is_host && view.stage === 'lobby' ? (
                <div><Button variant="quiet" size="sm" disabled={!!room.pending} onClick={() => room.act('cancel', () => room.client.cancelPlan(sid))}>Cancel this proposal</Button></div>
              ) : null}
              <p className="text-xs text-muted">Times shown in {tz}. Approvals are tied to this exact version; any change resets them.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="font-semibold">No time proposed yet.</p>
              {view.plan_cancelled ? <p className="text-sm text-muted">The host cancelled the earlier proposal (<span className="mono">v{view.plan_cancelled.version}</span>, <LocalTime iso={view.plan_cancelled.start} tz={tz} />).</p> : null}
              <p className="text-sm text-muted">{view.is_host ? 'When everyone has added availability, ask RELAY to find a time.' : 'Add your free windows; the host asks RELAY to find a time.'}</p>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

function Availability({ tz, setTz, editable }: { tz: string; setTz: (tz: string) => void; editable: boolean }) {
  const { view, room, sid } = useRoomCtx();
  const [drafts, setDrafts] = useState<Draft[]>(() => view.me.availability.length ? view.me.availability.map((w) => ({ start: isoToWallTime(w.start, tz), end: isoToWallTime(w.end, tz) })) : [{ start: '', end: '' }]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const zones = timeZones();

  const save = () => {
    const out: { start: string; end: string }[] = [];
    const errs: Record<number, string> = {};
    drafts.forEach((d, i) => {
      const s = wallTimeToIso(d.start, tz); const e = wallTimeToIso(d.end, tz);
      if (!s || !e) errs[i] = 'Enter a start and an end.';
      else if (new Date(e) <= new Date(s)) errs[i] = 'The end must be after the start.';
      else if (new Date(e).getTime() - new Date(s).getTime() > MAX_WINDOW_MS) errs[i] = 'Each window can be at most 2 days long.';
      else out.push({ start: s, end: e });
    });
    setErrors(errs);
    if (Object.keys(errs).length || !out.length) return;
    void room.act('availability', () => room.client.availability(sid, out, tz));
  };

  return (
    <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="avail-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="avail-heading" className="font-sans text-base font-bold">Your free windows</h2>
        <span className="text-xs text-muted">Only you and RELAY see these.</span>
      </div>
      {view.me.availability.length ? (
        <ul className="grid gap-1 text-sm">
          {view.me.availability.map((w, i) => <li key={i} className="mono"><LocalTime iso={w.start} tz={tz} /> → <LocalTime iso={w.end} tz={tz} withDate={false} /></li>)}
        </ul>
      ) : <p className="text-sm text-muted">You haven’t added any availability yet.</p>}
      {editable ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Your timezone</span>
            <select value={tz} onChange={(e) => setTz(e.target.value)} className="min-h-11 rounded-[12px] border border-line-strong bg-card px-3">
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          {drafts.map((d, i) => (
            <fieldset key={i} className="grid gap-2 rounded-[12px] border border-line p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <legend className="px-1 text-xs text-muted">Window {i + 1}</legend>
              <label className="flex flex-col gap-1 text-sm"><span>From</span>
                <input type="datetime-local" value={d.start} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="min-h-11 rounded-[10px] border border-control bg-card px-3" aria-invalid={!!errors[i]} />
              </label>
              <label className="flex flex-col gap-1 text-sm"><span>To</span>
                <input type="datetime-local" value={d.end} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="min-h-11 rounded-[10px] border border-control bg-card px-3" aria-invalid={!!errors[i]} />
              </label>
              <Button type="button" variant="quiet" size="sm" aria-label={`Remove window ${i + 1}`} disabled={drafts.length === 1} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}><Trash2 strokeWidth={1.75} /></Button>
              {errors[i] ? <p className="text-sm text-amber sm:col-span-3" role="alert">{errors[i]}</p> : null}
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={drafts.length >= 12} onClick={() => setDrafts([...drafts, { start: '', end: '' }])}><Plus strokeWidth={1.75} />Add a window</Button>
            <Button type="submit" disabled={!!room.pending}>{room.pending === 'availability' ? 'Saving…' : 'Save my availability'}</Button>
          </div>
          <p className="text-xs text-muted">Saving replaces your windows and resets any current proposal and approvals.</p>
        </form>
      ) : null}
    </section>
  );
}

function Propose({ editable, tz }: { editable: boolean; tz: string }) {
  const { room, sid } = useRoomCtx();
  const [target, setTarget] = useState(90);
  const [options, setOptions] = useState<Plan[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const durations = [target, ...CHIPS.filter((c) => c < target)].slice(0, 4);
  const ask = () => {
    setError(null); setNotice(null);
    void room.act('propose', async () => {
      try {
        const r = await room.client.propose(sid, durations);
        setOptions(r.options); setNotice(r.notice);
        return r;
      } catch (e) {
        // Missing availability is a 400 with the server's own wording; show it verbatim.
        if (e instanceof RelayError && e.status === 400) { setError(e.message); setOptions(null); return null; }
        throw e;
      }
    });
  };
  return (
    <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="propose-heading">
      <div>
        <h2 id="propose-heading" className="font-sans text-base font-bold">Ask RELAY for a time <span className="ml-1 text-xs font-normal text-muted">host</span></h2>
        <p className="text-sm text-muted">The first length is the request. Shorter lengths only come back labeled as alternatives, and each person approves them explicitly.</p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Target length</legend>
        <div className="flex flex-wrap items-center gap-2">
          {CHIPS.map((c) => (
            <button key={c} type="button" aria-pressed={target === c} disabled={!editable} onClick={() => setTarget(c)}
              className={cn('press min-h-11 rounded-full border px-4 text-sm font-semibold', target === c ? 'border-primary bg-primary-tint text-primary' : 'border-line-strong hover:border-text/40')}>
              {c} min
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Custom length in minutes</span>
            <input type="number" min={10} max={180} value={target} disabled={!editable} onChange={(e) => setTarget(Math.min(180, Math.max(10, Number(e.target.value) || 10)))} className="mono min-h-11 w-24 rounded-[12px] border border-control bg-card px-3" />
            <span className="text-muted">minutes (10–180)</span>
          </label>
        </div>
        <p className="mono text-xs text-muted">durations sent: [{durations.join(', ')}]</p>
      </fieldset>
      <div><Button disabled={!editable || !!room.pending} onClick={ask}>{room.pending === 'propose' ? 'Searching…' : 'Find a time'}</Button></div>
      {error ? <p className="rounded-[12px] border border-amber/30 bg-amber-tint px-4 py-3 text-sm text-amber" role="alert">{error} Ask anyone missing to add their free windows, then try again.</p> : null}
      {notice ? (
        <div className="flex flex-col gap-2 rounded-[12px] border border-line px-4 py-3" role="status">
          <div className="w-44"><NoCommonTime /></div>
          <p className="text-sm">{notice}</p>
          <p className="text-sm text-muted">Next: ask people to add more windows, or try a shorter length.</p>
        </div>
      ) : null}
      {options && options.length > 1 ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Other times found <span className="font-normal text-muted">(from the last proposal, read-only; RELAY picked the first)</span></span>
          <ul className="grid gap-1 text-sm">
            {options.slice(1).map((o, i) => <li key={i} className="mono"><LocalTime iso={o.start} tz={tz} /> · {o.minutes} min{o.shorter_alternative ? ' · shorter alternative' : ''}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Reminders() {
  const { view, room, sid } = useRoomCtx();
  const on = view.me.reminders;
  return (
    <section className="card flex flex-col gap-2 p-5 sm:p-6" aria-labelledby="remind-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="remind-heading" className="font-sans text-base font-bold">Reminders</h2>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="remind-heading" disabled={!!room.pending}
          onClick={() => room.act('consent', () => room.client.consent(sid, !on))}
          className={cn('press relative h-8 w-14 shrink-0 rounded-full border-2', on ? 'border-green bg-green' : 'border-line-strong bg-card')}>
          <span className={cn('absolute top-0.5 size-6 rounded-full transition-transform duration-200', on ? 'translate-x-6 bg-white' : 'translate-x-0.5 bg-line-strong')} />
          <span className="sr-only">{on ? 'On' : 'Off'}</span>
        </button>
      </div>
      <p className="text-sm text-muted">{on ? 'On: RELAY may send you a private Discord reminder before the approved time and one optional practice check later.' : 'Off: RELAY sends you nothing. Turning this on lets RELAY send a private reminder before the approved time and one optional practice check later.'}</p>
      <p className="text-xs text-muted">Delivery also needs the backend’s reminder worker, which may be switched off. Turning this on is not a promise that a message will arrive.</p>
    </section>
  );
}
