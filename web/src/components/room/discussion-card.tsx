'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpenText, MessageSquareText, Sparkles } from 'lucide-react';
import type { SessionView } from '@/lib/schemas';
import { handoff, settle } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { NoExplanationYet, RelayMark } from '@/components/graphics';
import { useRoomCtx } from './context';

/** RELAY's voice: a facilitator note inside the working card, never a chat bubble or typing dots. */
export function FacilitatorNote({ hint, signal }: { hint: NonNullable<SessionView['hint']>; signal?: string | null }) {
  const live = hint.feedback_source === 'live_model';
  return (
    <aside className="rounded-[16px] border border-line bg-paper px-5 py-4" aria-label="Facilitator note from RELAY">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <RelayMark className="size-5" />
        <strong>RELAY</strong>
        {/* hint.mode verbatim, so a curated fallback never passes as live AI. */}
        <span className="mono rounded-full border border-line px-2 py-0.5 text-xs text-muted">{hint.mode}</span>
        {live ? <span className="text-xs text-amber">Live model output: check its interpretation.</span> : null}
      </div>
      {signal ? <p className="mt-3 font-semibold">{signal}.</p> : null}
      <p className="mt-2 font-display text-xl leading-snug">{hint.discussion_question}</p>
      {hint.possible_misconception ? (
        <p className="mt-3 text-sm text-muted"><span className="font-semibold text-text">Possible reasoning issue:</span> {hint.possible_misconception}</p>
      ) : null}
      {hint.evidence_quote ? <blockquote className="mt-3 border-l-2 border-line-strong pl-3 text-sm italic">“{hint.evidence_quote}”</blockquote> : null}
      {hint.fallback_reason ? <p className="mt-2 text-xs text-muted">Why a reviewed hint: {hint.fallback_reason}</p> : null}
    </aside>
  );
}

export function ExplanationFeed({ items }: { items: SessionView['explanations'] }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-[16px] border border-dashed border-line-strong px-5 py-4">
        <div className="w-40"><NoExplanationYet /></div>
        <p className="text-sm text-muted">No explanation yet. Anyone can volunteer; passing is fine.</p>
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-3" aria-label="Shared explanations">
      <AnimatePresence initial={false}>
        {items.map((e, i) => (
          <motion.li key={`${i}-${e.author}`} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={handoff} className="relative rounded-[16px] border border-line bg-card px-5 py-4">
            {/* Violet baton: a turn was taken. It does not mean anyone understood. */}
            <span aria-hidden className="absolute top-5 -left-px h-5 w-[3px] rounded-full bg-handoff" />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <strong>{e.author}</strong>
              {e.source_fallback ? <span className="rounded-full bg-amber-tint px-2 py-0.5 text-xs font-semibold text-amber">Source review, not peer teaching</span> : <span className="text-xs text-muted">explained to the group</span>}
            </div>
            <p className="mt-1 whitespace-pre-wrap">{e.text}</p>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

export function DiscussionCard() {
  const { view, room, sid } = useRoomCtx();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const valid = text.trim().length >= 12 && text.trim().split(/\s+/).length >= 3;
  const busy = room.pending === 'explain';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Explain together · peer first</span>
        <span className="text-xs text-muted">Nobody has to speak. Nobody is ranked.</span>
      </div>
      <h2 className="text-[1.55rem] leading-snug sm:text-3xl">{view.discussion_signal ?? 'Compare the reasoning'}</h2>
      {view.hint ? <FacilitatorNote hint={view.hint} /> : <p className="rounded-[12px] border border-line px-4 py-3 text-sm text-muted">No hint is available for this item. Use the source and each other.</p>}

      <section className="flex flex-col gap-3" aria-labelledby="share-heading">
        <h3 id="share-heading" className="font-sans text-base font-bold">Volunteer an explanation</h3>
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.form key="form" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={settle} className="flex flex-col gap-2"
              onSubmit={(e) => { e.preventDefault(); if (valid) void room.act('explain', () => room.client.explain(sid, text.trim()), () => { setText(''); setOpen(false); }); }}>
              <label htmlFor="explanation" className="text-sm text-muted">Explain the idea, not just the answer. This is shared with your group.</label>
              <textarea id="explanation" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1200} className="rounded-[12px] border border-control bg-card px-4 py-3" />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!valid || busy}><MessageSquareText strokeWidth={1.75} />{busy ? 'Sharing…' : 'Share explanation'}</Button>
                <Button type="button" variant="quiet" onClick={() => { setOpen(false); setText(''); }}>Not now</Button>
                <span className="mono ml-auto text-xs text-muted">{text.length}/1200</span>
              </div>
              {!valid && text ? <span className="text-sm text-muted">Write at least a short sentence (12 characters, 3 words).</span> : null}
            </motion.form>
          ) : (
            <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={settle} className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setOpen(true)}><MessageSquareText strokeWidth={1.75} />Explain to the group</Button>
              <span className="text-sm text-muted">“Not now” records nothing.</span>
            </motion.div>
          )}
        </AnimatePresence>
        <ExplanationFeed items={view.explanations} />
      </section>

      {view.is_host ? (
        <section className="flex flex-col gap-2 rounded-[16px] border border-line px-5 py-4" aria-label="Host tools for discussion">
          <span className="eyebrow">Host tools</span>
          <div className="flex flex-wrap gap-2">
            {room.kind !== 'sample' ? (
              <Button variant="secondary" size="sm" disabled={!!room.pending} onClick={() => room.act('facilitate', () => room.client.facilitate(sid))}>
                <Sparkles strokeWidth={1.75} />{room.pending === 'facilitate' ? 'Asking RELAY…' : 'Ask RELAY for a hint'}
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" disabled={!!room.pending} onClick={() => setFallbackOpen(true)}><BookOpenText strokeWidth={1.75} />Post a source-review note</Button>
          </div>
          <p className="text-xs text-muted">{room.kind === 'sample' ? 'The sample round never calls an AI model; the hint above is the reviewed one.' : 'Hints are labeled with their source. With no live model configured, RELAY uses a reviewed hint.'}</p>
          <Dialog open={fallbackOpen} onOpenChange={setFallbackOpen}>
            <DialogContent title="Post a source-review note?" description="Use this when nobody volunteers. It records that the group reviewed the source together, and it is labeled as not peer teaching.">
              <div className="flex flex-wrap justify-end gap-2">
                <DialogClose asChild><Button variant="quiet">Cancel</Button></DialogClose>
                <Button onClick={() => room.act('explain', () => room.client.explain(sid, '', true), () => setFallbackOpen(false))}>Post the note</Button>
              </div>
            </DialogContent>
          </Dialog>
        </section>
      ) : null}
    </div>
  );
}
