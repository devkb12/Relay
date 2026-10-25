'use client';

import Link from 'next/link';
import { CircleCheck, CircleDashed, CircleMinus, CircleX, Lock, Ban } from 'lucide-react';
import { useRoomCtx } from '@/components/room/context';
import { useHydrated } from '@/components/time';
import { buttonVariants } from '@/components/ui/button';
import { ResultsWithheld } from '@/components/graphics';
import { STAGE_LABEL, PHASE_LABEL } from '@/lib/stages';
import { WITHHELD, STATUS_TEXT, followUpLine, groupLines, retryTopics } from '@/lib/debrief';
import type { MyResult } from '@/lib/schemas';

const ICON: Record<MyResult['status'], typeof CircleCheck> = {
  correct: CircleCheck, incorrect: CircleX, skipped: CircleMinus, missing: CircleDashed, invalidated: Ban,
};

export function DebriefView() {
  const { view, basePath } = useRoomCtx();
  const hydrated = useHydrated();
  if (view.stage !== 'debrief') {
    return (
      <section className="card flex flex-col gap-3 p-6 sm:p-8">
        <span className="eyebrow inline-flex items-center gap-2"><Lock className="size-4" strokeWidth={1.75} aria-hidden />Debrief locked</span>
        <h1 className="text-3xl">Reflect opens after the fresh problem.</h1>
        <p className="measure text-muted">The group is at <strong className="text-text">{STAGE_LABEL[view.stage]}</strong>. Results stay hidden until everyone has finished both questions, so nobody’s first answer is exposed early.</p>
        <div><Link href={basePath} className={buttonVariants({ variant: 'secondary' })}>Back to the room</Link></div>
      </section>
    );
  }
  const lines = groupLines(view.group);
  const topics = retryTopics(view);
  const results = Object.entries(view.my_results) as [keyof typeof PHASE_LABEL, MyResult][];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Reflect on learning</span>
        <h1 className="text-3xl sm:text-4xl">What happened in this session</h1>
        <p className="measure text-muted">Two different questions, the same group. This is practice evidence, not a grade.</p>
      </header>

      {view.invalidated ? (
        <section className="card p-5 sm:p-6">
          <h2 className="text-xl">Item discarded</h2>
          <p className="mt-1 text-muted">The host withdrew an item after review, so no group results or follow-up are published for this session.</p>
        </section>
      ) : null}

      <section className="card flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="group-heading">
        <h2 id="group-heading" className="font-sans text-base font-bold">Group observations</h2>
        {lines && view.group ? (
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

      <section className="card flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="mine-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="mine-heading" className="font-sans text-base font-bold">Your private feedback</h2>
          <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">Only you can see this</span>
        </div>
        {results.length ? (
          <ol className="grid gap-3">
            {results.map(([phase, r]) => {
              const Icon = ICON[r.status];
              return (
                <li key={phase} className="rounded-[12px] border border-line px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{PHASE_LABEL[phase]}</span>
                    <span className="inline-flex items-center gap-1 text-sm"><Icon className="size-4" strokeWidth={1.75} aria-hidden />{STATUS_TEXT[r.status]}</span>
                    {r.choice && r.choice !== 'SKIP' ? <span className="mono text-sm text-muted">you chose {r.choice}</span> : null}
                  </div>
                  <p className="mt-1 text-sm">{r.explanation}</p>
                </li>
              );
            })}
          </ol>
        ) : <p className="text-sm text-muted">No answers from you were recorded in this session.</p>}
      </section>

      <section className="card flex flex-col gap-2 p-5 sm:p-6" aria-labelledby="topics-heading">
        <h2 id="topics-heading" className="font-sans text-base font-bold">Topics to try again</h2>
        {topics.length ? <ul className="list-disc pl-5">{topics.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="text-sm text-muted">Nothing from your answers today. That is about two questions, not the whole topic.</p>}
      </section>

      <section className="card flex flex-col gap-2 p-5 sm:p-6" aria-labelledby="follow-heading">
        <h2 id="follow-heading" className="font-sans text-base font-bold">Follow-up</h2>
        <p>{followUpLine(view, (ms) => (hydrated ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' }) : new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'))}</p>
        <p className="text-sm text-muted">{view.retention_note ?? 'A later practice check is separate evidence, not an improvement measure.'}</p>
        {!view.me.reminders ? <div><Link href={`${basePath}/schedule`} className={buttonVariants({ variant: 'quiet', size: 'sm' })}>Open Schedule</Link></div> : null}
      </section>
    </div>
  );
}
