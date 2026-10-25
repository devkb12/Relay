'use client';

import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import type { SessionView } from '@/lib/schemas';
import { settle } from '@/lib/motion';
import { cn } from '@/lib/utils';

type M = Pick<SessionView['members'][number], 'name' | 'state' | 'is_host'> & { is_me?: boolean };

const STATE_TEXT: Record<M['state'], string> = {
  waiting: 'Waiting',
  responded: 'Answered',
  missing: 'No response recorded',
  withdrawn: 'Left the session',
  present: 'In the room',
};

/** Short forms for the compact row; the list layout and title keep the full wording. */
const SHORT_TEXT: Record<M['state'], string> = { waiting: 'Waiting', responded: 'Answered', missing: 'No answer', withdrawn: 'Left', present: 'Here' };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/**
 * Participants as nodes on a line. A node shows only whether someone has responded,
 * never correctness or ability. There is no online/offline signal from the API, so none is shown.
 */
export function Roster({ members, approvedByMe, tone = 'paper', layout = 'row' }: { members: M[]; approvedByMe?: boolean; tone?: 'paper' | 'ink'; layout?: 'row' | 'list' }) {
  const ink = tone === 'ink';
  if (layout === 'list') {
    return (
      <ul className="grid gap-2" aria-label="Participants">
        {members.map((m, i) => (
          <li key={`${m.name}-${i}`} className="flex items-center gap-3">
            <Node m={m} ink={ink} ring={!!(m.is_me && approvedByMe)} />
            <span className="min-w-0">
              <span className={cn('block truncate text-sm font-semibold', ink ? 'text-on-ink' : 'text-text')}>
                {m.name}
                {m.is_me ? <span className="font-normal"> (you)</span> : null}
                {m.is_host ? <span className={cn('ml-1 text-xs font-normal', ink ? 'text-on-ink-muted' : 'text-muted')}>host</span> : null}
              </span>
              <span className={cn('block text-xs', ink ? 'text-on-ink-muted' : 'text-muted')}>{STATE_TEXT[m.state]}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="relative flex flex-wrap items-start gap-x-6 gap-y-3" aria-label="Participants">
      {members.map((m, i) => (
        // Fixed-height cells (one truncated line each) so a font swap can never reflow the page.
        <li key={`${m.name}-${i}`} className="flex h-[5.25rem] w-20 flex-col items-center gap-1 text-center" title={`${m.name}: ${STATE_TEXT[m.state]}`}>
          <Node m={m} ink={ink} ring={!!(m.is_me && approvedByMe)} />
          <span className={cn('block h-4 w-full truncate text-xs leading-4 font-semibold whitespace-nowrap', ink ? 'text-on-ink' : 'text-text')}>{m.is_me ? `${m.name} (you)` : m.name}</span>
          <span className={cn('block h-4 w-full truncate text-[0.7rem] leading-4 whitespace-nowrap', ink ? 'text-on-ink-muted' : 'text-muted')}>{SHORT_TEXT[m.state]}</span>
        </li>
      ))}
    </ul>
  );
}

function Node({ m, ink, ring }: { m: M; ink: boolean; ring: boolean }) {
  const filled = m.state === 'responded';
  return (
    <span className="relative grid size-11 shrink-0 place-items-center" aria-hidden>
      {ring ? <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={settle} className="absolute inset-[-4px] rounded-full border-2 border-green" /> : null}
      <span
        className={cn(
          'grid size-11 place-items-center rounded-full border-2 text-sm font-bold',
          filled && (ink ? 'border-on-ink bg-on-ink text-ink' : 'border-ink bg-ink text-on-ink'),
          m.state === 'waiting' && (ink ? 'border-on-ink-muted text-on-ink' : 'border-line-strong bg-card text-text'),
          m.state === 'present' && (ink ? 'border-on-ink-muted text-on-ink' : 'border-line-strong bg-card text-text'),
          m.state === 'missing' && 'border-dashed border-line-strong bg-transparent text-muted',
          m.state === 'withdrawn' && 'border-dotted border-line-strong bg-transparent text-muted opacity-60',
        )}
      >
        {filled ? <Check className="size-5" strokeWidth={2.25} /> : initials(m.name)}
      </span>
    </span>
  );
}
