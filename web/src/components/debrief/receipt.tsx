'use client';

import { Ban, CircleCheck, CircleDashed, CircleMinus, RotateCcw } from 'lucide-react';
import type { Receipt, ReceiptPart, SessionView } from '@/lib/schemas';
import { shortHash, cn } from '@/lib/utils';

/** Outcome words for one item. Missing and skipped are never "wrong"; nothing is a score. */
const OUTCOME: Record<ReceiptPart['status'], { label: string; tone: string; Icon: typeof CircleCheck }> = {
  correct: { label: 'Correct on this item', tone: 'text-green', Icon: CircleCheck },
  incorrect: { label: 'Revisit this item', tone: 'text-amber', Icon: RotateCcw },
  skipped: { label: 'Skipped, not counted as wrong', tone: 'text-muted', Icon: CircleMinus },
  missing: { label: 'No response, not counted as wrong', tone: 'text-muted', Icon: CircleDashed },
  invalidated: { label: 'Discarded, not scored', tone: 'text-muted', Icon: Ban },
};

function Row({ title, part, why }: { title: string; part: ReceiptPart; why?: string }) {
  const o = OUTCOME[part.status];
  const yours = part.choice ? <><span className="mono font-semibold">{part.choice}</span> · {part.choice_text}</> : part.status === 'skipped' ? 'skipped' : 'no response recorded';
  return (
    <li className="grid gap-x-6 gap-y-1 border-b border-line py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <strong className="block">{title}</strong>
        <p className="mt-0.5 text-sm text-muted">{part.prompt}</p>
        <p className="mt-1 text-sm">Your response: {yours}.{part.reviewed_answer ? <> Reviewed answer: <span className="font-semibold">{part.reviewed_answer}</span>.</> : null}</p>
        {why && part.status !== 'invalidated' ? <p className="mt-1 text-sm text-muted">{why}</p> : null}
      </div>
      <span className={cn('inline-flex items-center gap-1.5 self-start text-sm font-bold sm:justify-end sm:self-center', o.tone)}>
        <o.Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />{o.label}
      </span>
    </li>
  );
}

const STEP_TONE: Record<Receipt['next_step']['kind'], string> = {
  try_later: 'bg-green-tint text-green',
  revisit_source: 'bg-amber-tint text-amber',
  no_fresh_answer: 'bg-paper text-text',
  discarded: 'bg-paper text-text',
};

/**
 * The receipt: what was checked, what this person did, and one reviewed next step from the server's
 * fixed policy. Private to the viewer; never shown on the shared screen.
 */
export function ReceiptCard({ receipt, results, children }: { receipt: Receipt; results?: SessionView['my_results']; children?: React.ReactNode }) {
  const discarded = receipt.next_step.kind === 'discarded';
  const ex = receipt.explanations;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Your receipt · only you can see this</span>
        <span className={cn('rounded-full px-3 py-1 text-xs font-bold', discarded ? 'bg-amber-tint text-amber' : 'bg-green-tint text-green')}>{discarded ? 'Item discarded' : 'Round complete'}</span>
      </div>
      <h2 className="text-[1.55rem] leading-snug sm:text-3xl">Here is what this round showed.</h2>
      <p className="measure text-muted">Two independent answers with a group explanation between them. No group score, and no claim about progress.</p>
      <ol className="border-t border-line">
        <Row title="First problem, answered alone" part={receipt.initial} why={results?.diagnostic?.explanation} />
        <li className="border-b border-line py-4">
          <strong className="block">Explained together</strong>
          <p className="mt-1 text-sm">
            {ex.shared ? `${ex.shared} ${ex.shared === 1 ? 'explanation was' : 'explanations were'} shared` : 'No peer explanation was shared'}
            {ex.source_fallback ? '; the group also reviewed the source together' : ''}.{' '}
            {ex.mine ? 'One of them was yours.' : 'You did not explain this time, and that is fine.'}
          </p>
        </li>
        <Row title="Fresh problem, answered alone" part={receipt.fresh} why={results?.transfer?.explanation} />
      </ol>
      <section className={cn('rounded-[16px] px-5 py-4', STEP_TONE[receipt.next_step.kind])} aria-labelledby="next-step">
        <h3 id="next-step" className="font-sans text-sm font-bold">Suggested next step</h3>
        <p className="mt-1 text-text">{receipt.next_step.text}</p>
        <p className="mono mt-2 text-xs text-muted">policy {receipt.next_step.policy} · evidence {receipt.next_step.evidence.join(', ')}</p>
      </section>
      <section aria-labelledby="limits">
        <h3 id="limits" className="font-sans text-sm font-bold">What this does not show</h3>
        <ul className="mt-1 list-disc pl-5 text-sm text-muted">{receipt.limits.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>
      <p className="text-xs text-muted">
        Checked against <span className="font-semibold text-text">{receipt.source.source_title}</span> (<span className="mono">{receipt.source.source_id}</span>) · question pack <span className="mono">{shortHash(receipt.pack_hash)}</span>
      </p>
      {children}
    </div>
  );
}
