import { CalendarCheck, EyeOff, Lock } from 'lucide-react';
import participant from '@/fixtures/participant-diagnostic.json';
import scheduled from '@/fixtures/schedule-confirmed.json';
import discussion from '@/fixtures/discussion.json';
import { RelayMark } from '@/components/graphics';

/**
 * Hero product shot: a phone showing the real "Think privately" screen, rendered from the synthetic
 * fixture (server-only, no client JS), plus two floating insight cards from real fixture fields.
 */
export function HeroDevice() {
  const q = participant.question!;
  const options = Object.entries(q.options as Record<string, string>);
  const active = scheduled.members.length;
  return (
    <div className="relative mx-auto w-full max-w-[25rem] pt-16 pb-40 lg:max-w-none" aria-label="RELAY on a phone, showing a private question from a synthetic session" role="img">
      {/* Brand atmosphere behind the device. */}
      <div aria-hidden className="bg-brand-soft absolute inset-x-6 top-16 bottom-36 rounded-[48px] blur-2xl" />

      <div className="relative mx-auto w-[min(19.5rem,82vw)] rounded-[46px] border-[10px] border-ink bg-ink shadow-[0_40px_80px_-30px_rgba(13,27,62,0.55)]" aria-hidden>
        <div className="absolute top-2 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-ink" />
        <div className="flex h-[32rem] flex-col gap-3 overflow-hidden rounded-[36px] bg-paper px-4 pt-10 pb-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[0.95rem] font-extrabold text-ink"><RelayMark className="size-6" />Relay</span>
            <span className="rounded-full bg-blue-tint px-2.5 py-0.5 text-[0.65rem] font-bold text-blue">Think privately</span>
          </div>
          <svg viewBox="0 0 260 14" className="w-full" aria-hidden>
            <path d="M6 7h248" stroke="var(--color-line-strong)" strokeWidth="2" strokeLinecap="round" />
            <path d="M6 7h62" stroke="var(--color-blue)" strokeWidth="2" strokeLinecap="round" />
            {[6, 68, 130, 192, 254].map((x, i) => <circle key={x} cx={x} cy={7} r={i < 2 ? 4.5 : 4} fill={i < 2 ? 'var(--color-blue)' : '#fff'} stroke={i < 2 ? 'var(--color-blue)' : 'var(--color-line-strong)'} strokeWidth="2" />)}
            <path d="M76 7h10" stroke="var(--color-violet)" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div className="flex flex-1 flex-col gap-2.5 rounded-[22px] border border-line bg-card p-3.5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between">
              <span className="text-[0.6rem] font-bold tracking-[0.1em] text-muted uppercase">First question</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[0.6rem] font-semibold"><EyeOff className="size-3" strokeWidth={1.75} />Only you</span>
            </div>
            <p className="font-display text-[1.05rem] leading-snug text-text">{q.prompt}</p>
            <div className="flex flex-col gap-1.5">
              {options.map(([k, v], i) => (
                <div key={k} className={`flex items-center gap-2 rounded-[11px] border px-2.5 py-1.5 text-[0.78rem] ${i === 1 ? 'border-blue bg-blue-tint' : 'border-line'}`}>
                  <span className={`grid size-3.5 place-items-center rounded-full border-2 ${i === 1 ? 'border-blue' : 'border-line-strong'}`}>{i === 1 ? <span className="size-1.5 rounded-full bg-blue" /> : null}</span>
                  <span className="mono font-semibold">{k}</span>{v}
                </div>
              ))}
            </div>
            <div className="mt-auto flex items-center gap-2">
              <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-blue px-3 py-2 text-[0.78rem] font-semibold text-white"><Lock className="size-3.5" strokeWidth={1.75} />Lock my answer</span>
            </div>
          </div>
                  </div>
      </div>

      <p className="absolute right-2 bottom-1 text-xs text-muted sm:right-6">Synthetic session · original teaching material</p>

      {/* Floating card: the signature moment, in the server's own words. */}
      <div className="card-float float-in absolute bottom-0 -left-2 w-[15.5rem] p-4 sm:-left-6 lg:-left-20" style={{ animationDelay: '420ms' }}>
        <div className="flex items-center gap-2">
          <span className="bg-brand h-8 w-1 rounded-full" aria-hidden />
          <div>
            <p className="text-[0.95rem] leading-tight font-bold text-text">Everyone agreed.<br />Everyone was wrong.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => <span key={i} className="grid size-7 place-items-center rounded-full border-2 border-ink bg-ink text-[0.6rem] font-bold text-white">✓</span>)}
          <span className="ml-1 text-xs text-muted">4 of 4 answered</span>
        </div>
        <p className="mt-2.5 rounded-[10px] bg-amber-tint px-2.5 py-1.5 text-xs font-semibold text-amber">RELAY: “{discussion.discussion_signal}”</p>
        <p className="mt-1.5 text-[0.7rem] text-muted">Checked against the reviewed source, not the majority.</p>
      </div>

      {/* Floating card: an approved time. */}
      <div className="card-float float-in absolute top-0 -right-1 w-[13.5rem] p-3.5 sm:-right-4 lg:-right-12" style={{ animationDelay: '600ms' }}>
        <div className="flex items-center gap-2 text-sm font-bold text-green"><CalendarCheck className="size-4" strokeWidth={1.75} />Time found</div>
        <p className="mt-1 text-[0.85rem] font-semibold text-text">{scheduled.plan!.minutes} min · everyone free</p>
        <p className="mono mt-0.5 text-xs text-muted">v{scheduled.plan_version} · {scheduled.approved_count}/{active} approved</p>
      </div>
    </div>
  );
}
