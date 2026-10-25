'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FIXTURES, type FixtureName } from '@/lib/fixtures';
import { JOURNEY } from '@/lib/stages';
import type { Stage } from '@/lib/schemas';
import { useRoom } from '@/lib/room';
import { handoff } from '@/lib/motion';
import { Track } from '@/components/track';
import { RoomProvider } from '@/components/room/context';
import { AttemptCard } from '@/components/room/attempt-card';
import { DiscussionCard } from '@/components/room/discussion-card';
import { PlanCard } from '@/components/schedule/schedule-view';
import { DebriefView } from '@/components/debrief/debrief-view';
import { cn } from '@/lib/utils';

const SOURCE: Record<Stage, FixtureName> = {
  lobby: 'schedule-confirmed',
  diagnostic: 'participant-diagnostic',
  discussion: 'discussion',
  transfer: 'transfer',
  debrief: 'participant-debrief-skipped',
};

const CAPTION: Record<Stage, string> = {
  lobby: 'Everyone adds the windows they’re free. RELAY proposes one time, and each person approves that exact version.',
  diagnostic: 'Each person answers alone first, with a confidence level. Nobody sees anyone else’s answer.',
  discussion: 'In this synthetic run everyone picked the same wrong answer, confidently. RELAY checks the reviewed source, not the majority, and asks the group to explain.',
  transfer: 'A different scenario on the same idea, answered alone again. Not the same question with new numbers.',
  debrief: 'Two questions, the same people, shown with their denominators. Practice evidence, not a grade.',
};

/** The landing journey: click or keyboard only, never scroll-linked, never autoplaying. */
export function LandingTrack() {
  const [stage, setStage] = useState<Stage>('discussion');
  const view = FIXTURES[SOURCE[stage]];
  const room = useRoom({ kind: 'fixture', view });
  const at = JOURNEY.findIndex((j) => j.stage === stage);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Track className="mx-auto w-[calc(100%-1rem)]" stage={stage} selectable onSelect={setStage} labels={Object.fromEntries(JOURNEY.map((j) => [j.stage, j.name]))} />
        <div role="tablist" aria-label="Session stations" className="grid grid-cols-5 gap-1"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const next = JOURNEY[(at + (e.key === 'ArrowRight' ? 1 : JOURNEY.length - 1)) % JOURNEY.length]!;
            setStage(next.stage);
            document.getElementById(`station-${next.stage}`)?.focus();
          }}>
          {JOURNEY.map((j, i) => (
            <button key={j.stage} id={`station-${j.stage}`} role="tab" type="button" aria-selected={j.stage === stage} aria-controls="station-panel"
              tabIndex={j.stage === stage ? 0 : -1} onClick={() => setStage(j.stage)}
              className={cn('press min-h-11 rounded-[10px] px-1 text-center text-[0.78rem] leading-tight sm:text-sm', j.stage === stage ? 'font-bold text-text' : 'text-muted hover:text-text')}>
              <span className="mono mr-1 hidden text-xs sm:inline">{i + 1}</span>{j.name}
            </button>
          ))}
        </div>
      </div>

      <p className="measure min-h-12 text-muted" aria-live="polite">{CAPTION[stage]}</p>

      <div id="station-panel" role="tabpanel" aria-labelledby={`station-${stage}`} className="relative">
        <span className="absolute -top-3 left-5 z-10 rounded-full border border-primary/30 bg-card px-3 py-0.5 text-xs font-semibold text-primary">Synthetic session · nothing is sent</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={stage} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={handoff} className="card max-h-[44rem] overflow-y-auto p-5 sm:p-8">
            <RoomProvider value={{ room, view, sid: view.id, mode: 'synthetic', basePath: '/demo' }}>
              {stage === 'lobby' ? <PlanCard tz={view.me.timezone || 'America/Phoenix'} active={view.members.length} /> : null}
              {(stage === 'diagnostic' || stage === 'transfer') && view.question ? <AttemptCard key={view.question.id} question={view.question} /> : null}
              {stage === 'discussion' ? <DiscussionCard /> : null}
              {stage === 'debrief' ? <DebriefView /> : null}
            </RoomProvider>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
