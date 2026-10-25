/**
 * Original RELAY SVG set. 2px round-capped lines; stations, nodes and a baton.
 * Every illustration has a text alternative or sits beside text that says the same thing.
 */
import { useId } from 'react';
import { cn } from '@/lib/utils';

const line = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, fill: 'none' };

/**
 * The RELAY mark, "Baton R": the R's stem and bowl in the violet → blue → cyan blend, and its leg is
 * the gold baton, already handed forward across a small gap. Vector, so it is sharp at any size and
 * works on light and navy alike. Source: docs/design/logo/relay-mark.svg.
 */
export function RelayMark({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={cn('size-8 shrink-0', className)} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={`relay-blend-${id}`} x1="12" y1="56" x2="48" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7A3FF2" /><stop offset=".55" stopColor="#3A5BFF" /><stop offset="1" stopColor="#1FB8EC" />
        </linearGradient>
      </defs>
      <path d="M16.5 53.5V12.5H31a11.25 11.25 0 0 1 0 22.5H16.5" fill="none" stroke={`url(#relay-blend-${id})`} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36.5 43.5 46.5 54.5" fill="none" stroke="#F5B12E" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

/** Mark + "Relay" set in a heavy sans, matching the lockup in docs/design/logo. */
export function Wordmark({ className, tone = 'ink' }: { className?: string; tone?: 'ink' | 'paper' }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-sans text-[1.4rem] leading-none font-extrabold tracking-[-0.025em]', tone === 'paper' ? 'text-on-ink' : 'text-ink', className)}>
      <RelayMark className="size-8" />
      Relay
    </span>
  );
}

/** Small simplified glyph (draft line drawing) for places where the full-color mark would be too busy. */
export function RelayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M4 9.5 16 4l12 5.5-12 5.5z" fill="currentColor" />
      <path d="M26 10.5v4.5" {...line} strokeWidth={1.6} />
      <path d="M10.5 13v2.6c0 1.2 2.5 2 5.5 2s5.5-.8 5.5-2V13" {...line} strokeWidth={1.8} />
      <path d="M11 29V19.5h5.2a3.6 3.6 0 0 1 0 7.2H11M15.6 26.7 20.5 29" {...line} strokeWidth={2.6} strokeLinejoin="round" />
    </svg>
  );
}

/** A page with a quotation mark: reviewed source evidence. */
export function EvidenceGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M6 3h8l4 4v14H6z" {...line} strokeWidth={1.75} strokeLinejoin="round" />
      <path d="M14 3v4h4" {...line} strokeWidth={1.75} strokeLinejoin="round" />
      <path d="M9.5 12.5c0-1.2.8-2 2-2M9.5 12.5v2h2v-2h-2M13 12.5c0-1.2.8-2 2-2M13 12.5v2h2v-2h-2" {...line} strokeWidth={1.5} />
    </svg>
  );
}

/** The track with a stop bar: an item under review. */
export function HoldGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" className={className} aria-hidden>
      <path d="M3 12h34" {...line} />
      <circle cx="10" cy="12" r="3" fill="currentColor" />
      <path d="M24 5v14" {...line} strokeWidth={3} />
      <circle cx="32" cy="12" r="3" {...line} />
    </svg>
  );
}

function Frame({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <svg viewBox="0 0 240 120" className={cn('h-auto w-full max-w-60 text-ink', className)} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** Two availability bars that never overlap. */
export const NoCommonTime = () => (
  <Frame label="Two people's free times that never overlap">
    <path d="M20 40h200M20 80h200" stroke="var(--color-line-strong)" strokeWidth={2} strokeLinecap="round" />
    <rect x="28" y="32" width="84" height="16" rx="8" fill="var(--color-primary-tint)" stroke="var(--color-primary)" strokeWidth={2} />
    <rect x="132" y="72" width="80" height="16" rx="8" fill="var(--color-amber-tint)" stroke="var(--color-amber)" strokeWidth={2} />
    <path d="M122 24v72" stroke="var(--color-line-strong)" strokeWidth={2} strokeDasharray="4 6" strokeLinecap="round" />
  </Frame>
);

/** Open nodes: waiting on answers. */
export const WaitingOnAnswers = () => (
  <Frame label="Participants who have not answered yet, shown as open circles">
    <path d="M30 60h180" {...line} stroke="var(--color-line-strong)" />
    {[50, 100, 150, 200].map((x, i) => (
      <circle key={x} cx={x} cy={60} r={14} fill={i === 0 ? 'var(--color-ink)' : 'var(--color-card)'} stroke="var(--color-ink)" strokeWidth={2} />
    ))}
  </Frame>
);

/** The baton resting at the start: no explanation yet. */
export const NoExplanationYet = () => (
  <Frame label="The baton resting at the start of the track">
    <path d="M30 60h180" {...line} stroke="var(--color-line-strong)" />
    <circle cx="40" cy="60" r="7" fill="var(--color-ink)" />
    <path d="M52 60h22" stroke="var(--color-handoff)" strokeWidth={4} strokeLinecap="round" />
    {[110, 160, 205].map((x) => <circle key={x} cx={x} cy={60} r={7} fill="var(--color-card)" stroke="var(--color-line-strong)" strokeWidth={2} />)}
  </Frame>
);

/** Three nodes, one unfilled: results withheld. */
export const ResultsWithheld = () => (
  <Frame label="Three participants, one without a paired answer, so group results stay hidden">
    <path d="M50 60h140" {...line} stroke="var(--color-line-strong)" />
    <circle cx="60" cy="60" r="14" fill="var(--color-ink)" />
    <circle cx="120" cy="60" r="14" fill="var(--color-ink)" />
    <circle cx="180" cy="60" r="14" fill="var(--color-card)" stroke="var(--color-ink)" strokeWidth={2} strokeDasharray="4 4" />
  </Frame>
);

/** The track running off the page to a chat glyph (no Discord logo). */
export const StartsInDiscord = () => (
  <Frame label="The session track leading to a group chat">
    <path d="M10 70h150" {...line} stroke="var(--color-primary)" />
    {[30, 75, 120].map((x) => <circle key={x} cx={x} cy={70} r={6} fill="var(--color-primary)" />)}
    <path d="M160 70c20 0 22-22 40-22" {...line} stroke="var(--color-primary)" strokeDasharray="2 6" />
    <path d="M190 28h36a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-22l-10 8v-8h-4a6 6 0 0 1-6-6V34a6 6 0 0 1 6-6z" fill="var(--color-card)" stroke="var(--color-ink)" strokeWidth={2} strokeLinejoin="round" />
    <path d="M198 40h22M198 48h14" {...line} stroke="var(--color-ink)" />
  </Frame>
);

/** Landing hero: four participant nodes on a relay track, the baton mid-handoff. */
export function HeroTrack({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 300" className={cn('h-auto w-full', className)} role="img" aria-label="Four study partners on a relay track, one passing the baton to the next">
      <path d="M40 210 C 120 210, 140 90, 220 90 S 330 170, 390 120" fill="none" stroke="var(--color-line-strong)" strokeWidth={2} strokeLinecap="round" />
      <path d="M40 210 C 120 210, 140 90, 220 90" fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinecap="round" />
      {[
        { x: 40, y: 210, t: 'A', done: true },
        { x: 150, y: 132, t: 'B', done: true },
        { x: 262, y: 104, t: 'C', done: false },
        { x: 390, y: 120, t: 'D', done: false },
      ].map((n) => (
        <g key={n.t}>
          <circle cx={n.x} cy={n.y} r={20} fill={n.done ? 'var(--color-ink)' : 'var(--color-card)'} stroke="var(--color-ink)" strokeWidth={2} />
          <text x={n.x} y={n.y + 5} textAnchor="middle" fontFamily="var(--font-sans)" fontSize="14" fontWeight="700" fill={n.done ? 'var(--color-on-ink)' : 'var(--color-ink)'}>{n.t}</text>
        </g>
      ))}
      <path d="M196 93 L228 89" stroke="var(--color-handoff)" strokeWidth={6} strokeLinecap="round" />
    </svg>
  );
}
