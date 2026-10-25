'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useRoomCtx } from '@/components/room/context';
import { useHydrated } from '@/components/time';
import { buttonVariants } from '@/components/ui/button';
import { ResultsWithheld } from '@/components/graphics';
import { EvidenceButton } from '@/components/room/controls';
import { STAGE_LABEL } from '@/lib/stages';
import { WITHHELD, STATUS_TEXT, followUpLine, groupLines } from '@/lib/debrief';
import { ReceiptCard } from './receipt';

export function DebriefView() {
  const { view, basePath, room } = useRoomCtx();
  const hydrated = useHydrated();
  if (view.stage !== 'debrief') {
    return (
      <section className="card flex flex-col gap-3 p-6 sm:p-8">
        <span className="eyebrow inline-flex items-center gap-2"><Lock className="size-4" strokeWidth={1.75} aria-hidden />Reflect is locked</span>
        <h1 className="text-3xl">Reflect opens after the fresh problem.</h1>
        <p className="measure text-muted">The group is at <strong className="text-text">{STAGE_LABEL[view.stage]}</strong>. Results stay hidden until both questions are done, so nobody’s first answer is exposed early.</p>
        <div><Link href={basePath} className={buttonVariants({ variant: 'secondary' })}>Back to the room</Link></div>
      </section>
    );
  }
  const lines = groupLines(view.group);
  const delayed = view.my_results.retention;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Reflect</span>
        <h1 className="text-3xl sm:text-4xl">{view.concept.title}</h1>
        <p className="measure text-muted">What did we check, what did I do, and what should I try next? Practice evidence, not a grade.</p>
      </header>

      <section className="card p-5 sm:p-8" aria-label="Your receipt">
        {view.receipt ? (
          <ReceiptCard receipt={view.receipt} results={view.my_results}>
            <div className="flex flex-wrap gap-2"><EvidenceButton /></div>
          </ReceiptCard>
        ) : <p className="text-muted">No receipt: you are no longer part of this session, so nothing of yours is kept.</p>}
      </section>

      <section className="card flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="group-heading">
        <h2 id="group-heading" className="font-sans text-base font-bold">Group observations</h2>
        {view.invalidated ? <p className="text-muted">The item was discarded after review, so no group results are published.</p> : lines && view.group ? (
          <>
            <ul className="grid gap-2 sm:grid-cols-2">
              {lines.map((l) => <li key={l} className="mono rounded-[12px] border border-line px-4 py-3 text-base">{l}</li>)}
            </ul>
            <p className="text-sm text-muted">{view.group.warning}</p>
          </>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <div className="w-40"><ResultsWithheld /></div>
            <p>{WITHHELD}</p>
            <p className="text-sm text-muted">Even with results shown, a group this small is not anonymous.</p>
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-2 p-5 sm:p-6" aria-labelledby="follow-heading">
        <h2 id="follow-heading" className="font-sans text-base font-bold">Follow-up</h2>
        {room.kind === 'sample' ? (
          <p>The sample round schedules nothing. In a real session you can opt in to one delayed practice question, sent only with your consent.</p>
        ) : (
          <>
            <p>{followUpLine(view, (ms) => (hydrated ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' }) : new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'))}</p>
            {delayed ? <p className="text-sm">Delayed practice: <strong>{STATUS_TEXT[delayed.status]}</strong>. {delayed.explanation}</p> : null}
            <p className="text-sm text-muted">{view.retention_note ?? 'A later practice check is separate evidence, not an improvement measure.'} Scheduled is not sent, and sent is not answered.</p>
            {!view.me.reminders ? <div><Link href={`${basePath}/schedule`} className={buttonVariants({ variant: 'quiet', size: 'sm' })}>Open Schedule</Link></div> : null}
          </>
        )}
      </section>
    </div>
  );
}
