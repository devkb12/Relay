'use client';

import Link from 'next/link';
import type { PresentationView } from '@/lib/schemas';
import { STAGE_LABEL, STAGE_SHORT } from '@/lib/stages';
import { groupLines, WITHHELD } from '@/lib/debrief';
import { LocalTime } from '@/components/time';
import { Track, TrackLabels } from '@/components/track';
import { Roster } from '@/components/roster';
import { HoldGlyph, RelayMark } from '@/components/graphics';

/**
 * Projector view. Typed as PresentationView, which has no me / my_answer / my_results at all,
 * so private data cannot be rendered here even by mistake. Display only, not access control.
 */
export function PresentView({ p, backHref, synthetic }: { p: PresentationView; backHref: string; synthetic?: boolean }) {
  const lines = groupLines(p.group);
  return (
    <div className="on-ink min-h-dvh bg-ink-deep px-6 py-8 text-on-ink sm:px-12 sm:py-10">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <span className="inline-flex items-center gap-3 text-2xl font-extrabold"><RelayMark className="size-11" />Relay</span>
          <div className="flex flex-wrap items-center gap-3 text-sm text-on-ink-muted">
            {synthetic ? <span className="rounded-full border border-white/25 px-3 py-1">Synthetic session</span> : null}
            <span className="rounded-full border border-white/25 px-3 py-1">Display only, not access control</span>
            <Link href={backHref} className="underline underline-offset-4 hover:text-on-ink">Exit presentation</Link>
          </div>
        </header>

        <div className="flex flex-col gap-2">
          <span className="text-lg font-semibold text-on-ink-muted">{STAGE_LABEL[p.stage]}</span>
          <h1 className="text-5xl leading-tight sm:text-6xl">{p.concept.title}</h1>
        </div>

        <div className="flex flex-col gap-3">
          <Track stage={p.stage} paused={!!p.paused} tone="ink" />
          <TrackLabels stage={p.stage} labels={STAGE_SHORT} tone="ink" />
        </div>

        {p.challenge?.pending ? (
          <section className="rounded-[20px] border border-amber/50 bg-[#2a2213] p-8" role="status">
            <div className="flex items-center gap-3 text-2xl font-bold text-[#ffd79a]"><HoldGlyph className="h-8 w-14" />Item under review</div>
            <p className="mt-3 text-2xl">{p.challenge.reason}</p>
            <p className="mt-2 text-lg text-on-ink-muted">Scoring and stage changes are paused until the host records a review.</p>
          </section>
        ) : null}

        <div className="grid gap-8 desk:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <main className="flex flex-col gap-6">
            {p.invalidated ? <p className="text-3xl">Item discarded after review. No scores are shown.</p> : null}
            {p.question && !p.invalidated ? (
              <section className="flex flex-col gap-5">
                <p className="font-display text-4xl leading-snug">{p.question.prompt}</p>
                <ul className="grid gap-3 text-2xl sm:grid-cols-2">
                  {Object.entries(p.question.options).map(([k, v]) => <li key={k} className="rounded-[16px] border border-white/15 px-5 py-4"><span className="mono mr-3 font-semibold">{k}</span>{v}</li>)}
                </ul>
                <p className="text-lg text-on-ink-muted">Answer privately on your own device. Answers are never shown here.</p>
              </section>
            ) : null}
            {p.stage === 'discussion' ? (
              <section className="flex flex-col gap-4">
                <p className="text-3xl font-semibold">{p.discussion_signal ?? 'Compare the reasoning'}</p>
                {p.hint ? <p className="font-display text-4xl leading-snug">{p.hint.discussion_question}</p> : null}
                {p.hint ? <span className="mono w-fit rounded-full border border-white/20 px-3 py-1 text-sm text-on-ink-muted">{p.hint.mode}</span> : null}
              </section>
            ) : null}
            {p.explanations.length ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-2xl">Explanations shared</h2>
                {p.explanations.map((e, i) => (
                  <blockquote key={i} className="rounded-[16px] border-l-4 border-violet bg-white/5 px-5 py-4 text-xl">
                    <span className="block text-base text-on-ink-muted">{e.author}{e.source_fallback ? ' · source review, not peer teaching' : ''}</span>
                    {e.text}
                  </blockquote>
                ))}
              </section>
            ) : null}
            {p.stage === 'debrief' && !p.invalidated ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-3xl">Group observations</h2>
                {lines && p.group ? (
                  <>
                    <ul className="grid gap-3 sm:grid-cols-2">{lines.map((l) => <li key={l} className="mono rounded-[16px] border border-white/15 px-5 py-4 text-2xl">{l}</li>)}</ul>
                    <p className="text-lg text-on-ink-muted">{p.group.warning}</p>
                  </>
                ) : <p className="text-2xl">{WITHHELD}</p>}
              </section>
            ) : null}
          </main>
          <aside className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h2 className="text-2xl">In the room</h2>
              <Roster members={p.members} tone="ink" layout="list" />
            </section>
            {p.plan ? (
              <section className="flex flex-col gap-1 text-lg">
                <h2 className="text-2xl">Meeting time</h2>
                <p><LocalTime iso={p.plan.start} /> · {p.plan.minutes} min{p.plan.shorter_alternative ? ' · shorter alternative' : ''}</p>
                <p className="mono text-on-ink-muted">v{p.plan_version} · {p.approved_count} approved{p.schedule_confirmed ? ' · confirmed' : ''}</p>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
