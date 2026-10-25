'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { EyeOff, Lock, LockOpen } from 'lucide-react';
import type { Question } from '@/lib/schemas';
import { settle } from '@/lib/motion';
import { RadioGroup, RadioRow } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { useRoomCtx } from './context';

const CONFIDENCE = [
  { value: 'unsure', label: 'Unsure' },
  { value: 'somewhat', label: 'Somewhat sure' },
  { value: 'confident', label: 'Confident' },
] as const;
type Confidence = (typeof CONFIDENCE)[number]['value'];

const EYEBROW = { diagnostic: 'First question · think on your own', transfer: 'A fresh problem · different scenario, same idea', debrief: 'Delayed practice · separate from today' };

/** Private attempt. One explicit choice (or Skip), one explicit confidence, one lock action. */
export function AttemptCard({ question }: { question: Question }) {
  const { view, room, sid } = useRoomCtx();
  const [choice, setChoice] = useState<string>('');
  const [confidence, setConfidence] = useState<Confidence | ''>('');
  const [rationale, setRationale] = useState('');
  const [why, setWhy] = useState(false);
  const locked = view.my_answer;
  const busy = room.pending === 'answer';
  const skip = choice === 'SKIP';
  const ready = !!choice && (skip || !!confidence);
  const stage = view.stage === 'transfer' ? 'transfer' : view.stage === 'debrief' ? 'debrief' : 'diagnostic';

  const submit = () =>
    room.act('answer', () => room.client.answer(sid, { question_id: question.id, choice, confidence: (confidence || 'unsure') as Confidence, rationale: skip ? '' : rationale }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">{EYEBROW[stage]}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-text">
          <EyeOff className="size-3.5" strokeWidth={1.75} aria-hidden /> Only you can see this
        </span>
      </div>
      {/* Exam-booklet surface: the prompt is set like a printed question. */}
      <h2 className="text-[1.5rem] leading-snug text-text sm:text-[1.75rem]" id="question-prompt">{question.prompt}</h2>

      <AnimatePresence mode="wait" initial={false}>
        {locked ? (
          <motion.div key="locked" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={settle} className="flex flex-col gap-3">
            <div className="flex items-start gap-3 rounded-[12px] border border-green/30 bg-green-tint px-4 py-3 text-green">
              <Lock className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden />
              <div>
                <strong className="block">{locked.choice === 'SKIP' ? 'Skipped' : 'Answer locked'}</strong>
                <span className="text-sm text-text">
                  {locked.choice === 'SKIP' ? 'Recorded as skipped, not as wrong.' : <>You chose <span className="mono font-semibold">{locked.choice}</span>{question.options[locked.choice] ? <> · {question.options[locked.choice]}</> : null} · {CONFIDENCE.find((c) => c.value === locked.confidence)?.label}</>}
                </span>
              </div>
            </div>
            <p className="text-sm text-muted">Correctness stays hidden until the group reaches Reflect. Your answer cannot be changed.</p>
          </motion.div>
        ) : (
          <motion.form key="open" exit={{ opacity: 0, y: -6 }} transition={settle} className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (ready) void submit(); }}>
            <fieldset className="flex flex-col gap-2" aria-describedby="question-prompt">
              <legend className="mb-1.5 text-sm font-semibold">Your answer</legend>
              <RadioGroup value={choice} onValueChange={setChoice} aria-label="Answer choices" disabled={busy} className="sm:grid-cols-2">
                {Object.entries(question.options).map(([key, text]) => (
                  <RadioRow key={key} value={key}>
                    <span className="mono mr-1 font-semibold">{key}</span>{' '}
                    <span>{text}</span>
                  </RadioRow>
                ))}
                <RadioRow value="SKIP" className="border-dashed sm:col-span-2">
                  <span className="font-semibold">Skip this one</span>{' '}
                  <span className="text-sm text-muted">Recorded as skipped, never as wrong.</span>
                </RadioRow>
              </RadioGroup>
            </fieldset>

            {!skip ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-sm font-semibold">How sure are you?</legend>
                <RadioGroup value={confidence} onValueChange={(v) => setConfidence(v as Confidence)} className="grid-cols-1 sm:grid-cols-3" aria-label="Confidence" disabled={busy}>
                  {CONFIDENCE.map((c) => <RadioRow key={c.value} value={c.value}>{c.label}</RadioRow>)}
                </RadioGroup>
              </fieldset>
            ) : null}

            {!skip ? (
              why ? (
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold">Your reasoning <span className="font-normal text-muted">(optional, private)</span></span>
                  <textarea
                    value={rationale}
                    maxLength={600}
                    onChange={(e) => setRationale(e.target.value)}
                    rows={3}
                    autoFocus
                    className="min-h-24 rounded-[12px] border border-control bg-card px-4 py-3 text-base"
                    aria-describedby="rationale-count"
                  />
                  <span id="rationale-count" className="mono self-end text-xs text-muted">{rationale.length}/600</span>
                </label>
              ) : (
                <button type="button" onClick={() => setWhy(true)} className="press -my-1 w-fit rounded-full px-1 text-sm font-semibold text-primary underline underline-offset-4">
                  Add your reasoning (optional, private)
                </button>
              )
            ) : null}

            <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t border-line bg-card/95 px-5 py-3 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
              <Button type="submit" disabled={!ready || busy} aria-describedby="lock-help">
                {busy ? <LockOpen strokeWidth={1.75} /> : <Lock strokeWidth={1.75} />}
                {busy ? 'Locking…' : skip ? 'Skip and lock' : 'Lock my answer'}
              </Button>
              <span id="lock-help" className="text-sm text-muted">{!choice ? 'Choose an answer or skip.' : !ready ? 'Choose how sure you are.' : 'Once locked it cannot be changed.'}</span>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
