'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DEMO_STEPS, FIXTURES, PRESENTATION_FIXTURES, type FixtureName } from '@/lib/fixtures';
import { useRoom } from '@/lib/room';
import { RoomView } from '@/components/room/room-view';
import { RoomProvider } from '@/components/room/context';
import { ScheduleView } from '@/components/schedule/schedule-view';
import { DebriefView } from '@/components/debrief/debrief-view';
import { PresentView } from '@/components/present/present-view';
import { ModeChip, SyntheticBanner } from '@/components/states';
import { Wordmark } from '@/components/graphics';
import { cn } from '@/lib/utils';

type Perspective = 'host' | 'participant';

function StepPicker({ step, setStep, perspective, setPerspective }: { step: string; setStep: (s: string) => void; perspective: Perspective; setPerspective: (p: Perspective) => void }) {
  const current = DEMO_STEPS.find((s) => s.id === step) ?? DEMO_STEPS[0]!;
  return (
    <section className="card flex flex-col gap-3 p-4" aria-label="Synthetic walkthrough">
      <span className="eyebrow">Every stage, captured from the real backend</span>
      {/* Toggle buttons, not tabs: each step swaps the whole room below; there is no tab panel. */}
      <div role="group" aria-label="Session step" className="flex flex-wrap gap-1 rounded-[12px] border border-line bg-card p-1">
        {DEMO_STEPS.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === step} onClick={() => setStep(s.id)}
            className={cn('press min-h-10 rounded-[9px] px-3 text-sm font-semibold', s.id === step ? 'bg-ink text-on-ink' : 'text-muted hover:text-text')}>
            {s.label}
          </button>
        ))}
      </div>
      {current.participant ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="radiogroup" aria-label="Point of view">
          <span className="text-muted">Seen by</span>
          {(['host', 'participant'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={perspective === p} onClick={() => setPerspective(p)}
              className={cn('press min-h-9 rounded-full border px-3', perspective === p ? 'border-ink bg-ink text-on-ink' : 'border-line-strong')}>
              {p === 'host' ? 'the host' : 'a participant'}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted">Each step is a real backend response captured with synthetic people. Nothing here is sent anywhere. To play a round yourself, <Link className="font-semibold text-primary underline underline-offset-4" href="/demo">try the sample round</Link>.</p>
    </section>
  );
}

export function DemoRoom() {
  const [step, setStep] = useState('think');
  const [perspective, setPerspective] = useState<Perspective>('participant');
  const s = DEMO_STEPS.find((x) => x.id === step) ?? DEMO_STEPS[0]!;
  const name: FixtureName = perspective === 'participant' && s.participant ? s.participant : s.host;
  const room = useRoom({ kind: 'fixture', view: FIXTURES[name] });
  return (
    <RoomView room={room} view={FIXTURES[name]} mode="synthetic" basePath="/demo/stages"
      extra={<StepPicker step={step} setStep={setStep} perspective={perspective} setPerspective={setPerspective} />} />
  );
}

/** Schedule / debrief pages for the synthetic session, with the same shell chrome. */
function DemoPage({ fixture, children }: { fixture: FixtureName; children: React.ReactNode }) {
  const room = useRoom({ kind: 'fixture', view: FIXTURES[fixture] });
  return (
    <RoomProvider value={{ room, view: FIXTURES[fixture], sid: 'synthetic-session', mode: 'synthetic', basePath: '/demo/stages' }}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/"><Wordmark /></Link><ModeChip mode="synthetic" /></div>
        <SyntheticBanner />
        {children}
      </div>
    </RoomProvider>
  );
}

export const DemoSchedule = () => <DemoPage fixture="schedule-confirmed"><ScheduleView /></DemoPage>;

export function DemoDebrief() {
  const [perspective, setPerspective] = useState<Perspective>('participant');
  const fixture: FixtureName = perspective === 'participant' ? 'participant-debrief-skipped' : 'debrief';
  return (
    <DemoPage fixture={fixture}>
      <div className="flex flex-wrap items-center gap-2 text-sm" role="radiogroup" aria-label="Point of view">
        <span className="text-muted">Seen by</span>
        {(['host', 'participant'] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={perspective === p} onClick={() => setPerspective(p)}
            className={cn('press min-h-9 rounded-full border px-3', perspective === p ? 'border-ink bg-ink text-on-ink' : 'border-line-strong')}>
            {p === 'host' ? 'the host' : 'a participant who skipped one'}
          </button>
        ))}
      </div>
      <DebriefView key={fixture} />
    </DemoPage>
  );
}

export function DemoPresent() {
  const [which, setWhich] = useState<keyof typeof PRESENTATION_FIXTURES>('presentation-discussion');
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 bg-ink px-6 pt-4 text-sm text-on-ink" role="radiogroup" aria-label="Presentation step">
        {(Object.keys(PRESENTATION_FIXTURES) as (keyof typeof PRESENTATION_FIXTURES)[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={which === k} onClick={() => setWhich(k)}
            className={cn('press min-h-9 rounded-full border px-3', which === k ? 'border-on-ink bg-on-ink text-ink' : 'border-white/30')}>
            {k === 'presentation-discussion' ? 'Explain together' : 'Reflect'}
          </button>
        ))}
      </div>
      <PresentView p={PRESENTATION_FIXTURES[which]} backHref="/demo/stages" synthetic />
    </div>
  );
}
