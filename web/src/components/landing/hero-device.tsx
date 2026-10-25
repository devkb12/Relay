import { ArrowRight, EyeOff, Lock, MessageSquareText, Repeat2 } from 'lucide-react';
import pack from '@/fixtures/sample-pack.json';
import { RelayMark } from '@/components/graphics';

/**
 * Hero product shot: the idea in one picture, from the sample round you can play. A private first
 * question on the phone, then a peer's explanation, then a different problem answered alone.
 * Server-rendered (no client JS); every word comes from data/sample_round.json.
 */
export function HeroDevice() {
  const q = pack.concept.diagnostic;
  const fresh = pack.concept.transfer;
  const peer = pack.explanations[0]!;
  const options = Object.entries(q.options as Record<string, string>);
  return (
    <div className="relative mx-auto w-full max-w-[25rem] pt-20 pb-44 lg:max-w-none" role="img"
      aria-label="The sample round on a phone: a private first question, then a fictional peer’s explanation, then a different problem answered alone">
      <div aria-hidden className="bg-brand-soft absolute inset-x-6 top-16 bottom-36 rounded-[48px] blur-2xl" />

      <div className="relative mx-auto w-[min(19.5rem,82vw)] rounded-[46px] border-[10px] border-ink bg-ink shadow-[0_40px_80px_-30px_rgba(23,32,50,0.55)]" aria-hidden>
        <div className="absolute top-2 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-ink" />
        <div className="flex h-[32rem] flex-col gap-3 overflow-hidden rounded-[36px] bg-paper px-4 pt-10 pb-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[0.95rem] font-extrabold text-ink"><RelayMark className="size-6" />Relay</span>
            <span className="rounded-full bg-primary-tint px-2.5 py-0.5 text-[0.65rem] font-bold text-primary">01 · Think privately</span>
          </div>
          <svg viewBox="0 0 260 14" className="w-full" aria-hidden>
            <path d="M6 7h248" stroke="var(--color-line-strong)" strokeWidth="2" strokeLinecap="round" />
            <path d="M6 7h62" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" />
            {[6, 68, 130, 192, 254].map((x, i) => <circle key={x} cx={x} cy={7} r={i < 2 ? 4.5 : 4} fill={i < 2 ? 'var(--color-primary)' : '#fff'} stroke={i < 2 ? 'var(--color-primary)' : 'var(--color-line-strong)'} strokeWidth="2" />)}
            <path d="M76 7h10" stroke="var(--color-handoff)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div className="flex flex-1 flex-col gap-2.5 rounded-[22px] border border-line bg-card p-3.5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between">
              <span className="text-[0.6rem] font-bold tracking-[0.1em] text-muted uppercase">Your first attempt</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[0.6rem] font-semibold"><EyeOff className="size-3" strokeWidth={1.75} />Only you</span>
            </div>
            <p className="font-display text-[1.02rem] leading-snug text-text">{q.prompt}</p>
            <div className="flex flex-col gap-1.5">
              {options.map(([k, v], i) => (
                <div key={k} className={`flex items-center gap-2 rounded-[11px] border px-2.5 py-1.5 text-[0.78rem] ${i === 0 ? 'border-primary bg-primary-tint' : 'border-line'}`}>
                  <span className={`grid size-3.5 place-items-center rounded-full border-2 ${i === 0 ? 'border-primary' : 'border-line-strong'}`}>{i === 0 ? <span className="size-1.5 rounded-full bg-primary" /> : null}</span>
                  <span className="mono font-semibold">{k}</span>{v}
                </div>
              ))}
            </div>
            <div className="mt-auto flex items-center gap-2">
              <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2 text-[0.78rem] font-semibold text-white"><Lock className="size-3.5" strokeWidth={1.75} />Lock my answer</span>
            </div>
          </div>
        </div>
      </div>

      {/* 02: the handoff. A peer explains the assumption; the coral bar marks a turn being passed. */}
      <div className="card-float float-in absolute bottom-0 -left-2 w-[16rem] p-4 sm:-left-6 lg:left-0" style={{ animationDelay: '420ms' }}>
        <div className="flex items-center gap-2 text-[0.7rem] font-bold tracking-[0.08em] text-handoff-text uppercase"><MessageSquareText className="size-3.5" strokeWidth={1.75} />02 · Explain together</div>
        <div className="relative mt-2 pl-3">
          <span aria-hidden className="absolute top-0.5 left-0 h-[calc(100%-4px)] w-[3px] rounded-full bg-handoff" />
          <p className="text-[0.85rem] leading-snug text-text">“{peer.text}”</p>
          <p className="mt-1 text-[0.7rem] text-muted">{peer.by}, a fictional sample peer</p>
        </div>
      </div>

      {/* 03: a different problem on the same idea, answered alone. */}
      <div className="card-float float-in absolute top-0 -right-1 w-[15rem] p-3.5 sm:-right-4 lg:-right-12" style={{ animationDelay: '600ms' }}>
        <div className="flex items-center gap-2 text-[0.7rem] font-bold tracking-[0.08em] text-green uppercase"><Repeat2 className="size-3.5" strokeWidth={1.75} />03 · Fresh problem</div>
        <p className="mt-1.5 text-[0.82rem] leading-snug font-semibold text-text">{fresh.prompt}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-[0.7rem] text-muted">Answered on your own <ArrowRight className="size-3" strokeWidth={1.75} /> then reflect</p>
      </div>

      <p className="absolute right-2 -bottom-6 text-xs text-muted sm:right-6">Sample round · fictional peers · original practice material</p>
    </div>
  );
}
