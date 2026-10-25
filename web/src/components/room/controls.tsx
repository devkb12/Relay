'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowRight, Flag, LogOut, ShieldAlert, Trash2 } from 'lucide-react';
import { api } from '@/lib/relay-api';
import { ADVANCE_LABEL } from '@/lib/stages';
import type { ReviewPacket } from '@/lib/schemas';
import { describeError, RelayError } from '@/lib/errors';
import { forgetSession } from '@/lib/identities';
import { settle } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { RadioGroup, RadioRow } from '@/components/ui/radio-group';
import { EvidenceGlyph, HoldGlyph } from '@/components/graphics';
import { useRoomCtx, waitingCount } from './context';

/** Evidence: the reviewed source. Drawer on wide screens, full-screen panel on phones. */
export function EvidenceContent() {
  const { view } = useRoomCtx();
  if (!view.source) {
    return <p className="text-sm text-muted">The source opens during discussion and debrief, not during an independent attempt.</p>;
  }
  return (
    <article className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted">
        <EvidenceGlyph className="size-5 text-ink" />
        <span className="mono">{view.source.source_id}</span>
      </div>
      <h3 className="text-xl">{view.source.source_title}</h3>
      <p className="whitespace-pre-wrap leading-relaxed">{view.source.source_text}</p>
      <p className="text-xs text-muted">Reviewed source for this session (pack {view.pack_hash.slice(0, 8)}). RELAY checks answers against this, not the majority. Sources can still be wrong: anyone can challenge.</p>
    </article>
  );
}

export function EvidenceButton({ className }: { className?: string }) {
  const { view } = useRoomCtx();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm" className={className} disabled={!view.source} aria-disabled={!view.source}>
          <EvidenceGlyph className="size-[18px]" />{view.source ? 'Open the source' : 'Source opens in discussion'}
        </Button>
      </SheetTrigger>
      <SheetContent title="The source" description="Reviewed teaching material for this item.">
        <EvidenceContent />
      </SheetContent>
    </Sheet>
  );
}

/** Anyone can challenge an item during an active round. */
export function ChallengeButton() {
  const { view, room, sid } = useRoomCtx();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const active = ['diagnostic', 'discussion', 'transfer'].includes(view.stage) && !view.paused && !view.invalidated;
  if (!active) return null;
  const valid = reason.trim().length >= 5;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}><Flag strokeWidth={1.75} />Challenge this item</Button>
      <DialogContent title="Challenge this item" description="Your concern is shared with the group and pauses scoring until the host reviews the source. Challenge the question, not a person.">
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) void room.act('challenge', () => api.challenge(sid, reason.trim()), () => { setOpen(false); setReason(''); }); }}>
          <label htmlFor="challenge-reason" className="text-sm font-semibold">What looks wrong or ambiguous?</label>
          <textarea id="challenge-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="rounded-[12px] border border-line-strong bg-card px-4 py-3" />
          <span className="mono self-end text-xs text-muted">{reason.length}/500</span>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="quiet">Cancel</Button></DialogClose>
            <Button type="submit" disabled={!valid || room.pending === 'challenge'}>{room.pending === 'challenge' ? 'Pausing…' : 'Pause and review'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The hold: motion stops, the working card dims behind the amber banner until the host resolves. */
export function HoldBanner() {
  const { view, room, sid } = useRoomCtx();
  const [decision, setDecision] = useState<'resume' | 'discard' | ''>('');
  const [note, setNote] = useState('');
  const [packet, setPacket] = useState<ReviewPacket | null>(null);
  const [packetError, setPacketError] = useState<string | null>(null);
  const ch = view.challenge;
  if (!view.paused || !ch) return null;
  const valid = !!decision && note.trim().length >= 10;
  const openPacket = async () => {
    setPacketError(null);
    try { setPacket(await api.review(sid)); }
    catch (e) { setPacketError(e instanceof RelayError ? describeError(e).body : 'Could not open the review packet.'); }
  };
  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={settle} role="status" aria-live="polite"
      className="relative z-10 flex flex-col gap-3 rounded-[20px] border border-amber/30 bg-amber-tint p-5 text-text shadow-[0_16px_40px_-24px_rgba(138,88,27,0.6)]">
      <div className="flex items-center gap-3 text-amber">
        <HoldGlyph className="h-6 w-10" />
        <strong>Item under review · scoring and stage changes are paused</strong>
      </div>
      <p><span className="font-semibold">Concern raised:</span> {ch.reason}</p>
      {view.is_host ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (valid && decision) void room.act('resolve', () => api.resolve(sid, decision, note.trim(), ch.id)); }}>
          {!room.demo ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={openPacket}><ShieldAlert strokeWidth={1.75} />Open review packet</Button>
              <span className="text-xs text-amber">Contains the answer key. Don’t show it on a shared screen.</span>
            </div>
          ) : null}
          {packetError ? <p className="text-sm">{packetError}</p> : null}
          {packet ? (
            <div className="rounded-[12px] border border-line bg-card p-4 text-sm">
              <p className="font-semibold">{packet.item.prompt}</p>
              <ul className="mt-2 grid gap-1">{Object.entries(packet.item.options).map(([k, v]) => <li key={k}><span className="mono font-semibold">{k}</span> {v}{k === packet.item.correct ? ' · reviewed key' : ''}</li>)}</ul>
              <p className="mt-2 text-muted">{packet.item.explanation}</p>
              <p className="mt-2 text-muted"><span className="mono">{packet.source.source_id}</span> · {packet.source.source_text}</p>
            </div>
          ) : null}
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Your review</legend>
            <RadioGroup value={decision} onValueChange={(v) => setDecision(v as 'resume' | 'discard')} className="sm:grid-cols-2">
              <RadioRow value="resume"><strong>Resume</strong><span className="block text-sm text-muted">The item stands as written.</span></RadioRow>
              <RadioRow value="discard"><strong>Discard</strong><span className="block text-sm text-muted">Withdraw it. No scores, no follow-up.</span></RadioRow>
            </RadioGroup>
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Note for the group (10–500 characters)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className="rounded-[12px] border border-line-strong bg-card px-4 py-3" />
          </label>
          <div><Button type="submit" disabled={!valid || room.pending === 'resolve'}>{room.pending === 'resolve' ? 'Recording…' : 'Record the review'}</Button></div>
        </form>
      ) : (
        <p className="text-sm">Waiting for the host to review the source. Nothing you’ve answered is scored while the item is on hold.</p>
      )}
    </motion.section>
  );
}

export function ResolutionNote() {
  const { view } = useRoomCtx();
  const res = view.challenge?.resolution;
  if (!res || view.paused) return null;
  return (
    <p className="rounded-[12px] border border-line bg-card px-4 py-3 text-sm">
      <strong>{res.decision === 'resume' ? 'Resumed after review.' : 'Item discarded after review.'}</strong> Host note: {res.host_note}
    </p>
  );
}

/** Host's advance (sends expected_stage) plus the explicit "record missing" policy. Non-hosts see why not. */
export function StageActions() {
  const { view, room, sid } = useRoomCtx();
  const label = ADVANCE_LABEL[view.stage];
  const waiting = waitingCount(view);
  const answering = view.stage === 'diagnostic' || view.stage === 'transfer';
  if (!label || view.invalidated) return null;
  if (!view.is_host) {
    return <p className="text-sm text-muted">The host moves the group forward{answering && waiting ? ` once ${waiting} more ${waiting === 1 ? 'answer arrives' : 'answers arrive'}` : ''}.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={!!room.pending || !!view.paused} onClick={() => room.act('advance', () => api.advance(sid, view.stage))}>
        {room.pending === 'advance' ? 'Moving…' : label}<ArrowRight strokeWidth={1.75} />
      </Button>
      {answering && waiting > 0 ? (
        <Button variant="secondary" disabled={!!room.pending || !!view.paused} onClick={() => room.act('advance', () => api.advance(sid, view.stage, 'mark_missing'))}>
          Close round: record {waiting} as missing
        </Button>
      ) : null}
      {view.paused ? <span className="text-sm text-amber">Paused until the review is recorded.</span> : answering && waiting ? <span className="text-sm text-muted">Missing is recorded as “no response”, never as wrong.</span> : null}
    </div>
  );
}

export function DangerZone() {
  const { view, room, sid } = useRoomCtx();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (room.demo) return null;
  const host = view.is_host;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>{host ? <><Trash2 strokeWidth={1.75} />Delete session</> : <><LogOut strokeWidth={1.75} />Leave session</>}</Button>
      <DialogContent
        title={host ? 'Delete this session?' : 'Leave this session?'}
        description={host ? 'This deletes the session, its answers and pending reminders from RELAY. Messages already posted in Discord are not retracted.' : 'Your answers, reasoning, availability and pending reminders are removed. Messages already posted in Discord stay.'}
      >
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="quiet">Keep it</Button></DialogClose>
          <Button onClick={() => room.act<{ notice: string }>(host ? 'delete' : 'leave', () => (host ? api.remove(sid) : api.leave(sid)), () => { forgetSession(sid); router.push('/room'); })}>
            {host ? 'Delete session' : 'Leave session'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
