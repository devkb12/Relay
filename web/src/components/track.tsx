'use client';

import { motion } from 'motion/react';
import { STAGE_ORDER, STAGE_SHORT, stageIndex } from '@/lib/stages';
import type { Stage } from '@/lib/schemas';
import { handoff } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * The relay track: stages are stations on a 2px round-capped line, like a transit diagram.
 * A station fills only when the server reports that stage. The baton sits at the current
 * station; on a stage change it runs there (handoff ~400ms) and settles. During a challenge it
 * holds: no motion, an amber stop bar across the line.
 */
type Props = {
  stage: Stage;
  paused?: boolean;
  orientation?: 'horizontal' | 'vertical';
  tone?: 'paper' | 'ink';
  labels?: Partial<Record<Stage, string>>;
  onSelect?: (stage: Stage) => void;
  selectable?: boolean;
  className?: string;
};

export function Track({ stage, paused, orientation = 'horizontal', tone = 'paper', labels, onSelect, selectable, className }: Props) {
  const at = stageIndex(stage);
  const vertical = orientation === 'vertical';
  const n = STAGE_ORDER.length;
  const pos = (i: number) => (i / (n - 1)) * 100;
  const ink = tone === 'ink';
  const rest = ink ? 'var(--color-ink-line)' : 'var(--color-line-strong)';
  const live = ink ? '#8fa6ff' : 'var(--color-blue)';

  return (
    <div
      className={cn('relative', vertical ? 'h-72 w-12' : 'h-14 w-full', className)}
      role={selectable ? 'group' : 'img'}
      aria-label={`Session track: ${STAGE_ORDER.map((s, i) => `${STAGE_SHORT[s]}${i < at ? ' (done)' : i === at ? ' (now)' : ''}`).join(', ')}${paused ? '. Paused for item review.' : ''}`}
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {/* Live portion grows by stroke offset (pathLength), never by changing geometry. */}
        {vertical ? (
          <>
            <line x1="50%" y1="0%" x2="50%" y2="100%" stroke={rest} strokeWidth={2} strokeLinecap="round" />
            <motion.line x1="50%" y1="0%" x2="50%" y2="100%" initial={false} animate={{ pathLength: Math.max(at / (n - 1), 0.001) }} transition={handoff} stroke={live} strokeWidth={2} strokeLinecap="round" />
          </>
        ) : (
          <>
            <line x1="0%" y1="50%" x2="100%" y2="50%" stroke={rest} strokeWidth={2} strokeLinecap="round" />
            <motion.line x1="0%" y1="50%" x2="100%" y2="50%" initial={false} animate={{ pathLength: Math.max(at / (n - 1), 0.001) }} transition={handoff} stroke={live} strokeWidth={2} strokeLinecap="round" />
          </>
        )}
      </svg>
      {STAGE_ORDER.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'now' : 'next';
        const style = vertical ? { top: `${pos(i)}%`, left: '50%' } : { left: `${pos(i)}%`, top: '50%' };
        const dot = (
          <span
            className={cn(
              'block size-3.5 rounded-full border-2',
              state === 'next' && (ink ? 'border-ink-line bg-ink' : 'border-line-strong bg-card'),
              state !== 'next' && 'border-[color:var(--live)] bg-[color:var(--live)]',
              state === 'now' && 'ring-4 ring-[color:var(--live)]/20',
              state === 'now' && paused && 'border-amber bg-amber ring-amber/20',
            )}
            style={{ ['--live' as string]: live }}
          />
        );
        return (
          <div key={s} className="absolute -translate-x-1/2 -translate-y-1/2" style={style}>
            {selectable && onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(s)}
                aria-pressed={state === 'now'}
                aria-label={`${labels?.[s] ?? STAGE_SHORT[s]}${state === 'now' ? ', showing' : ''}`}
                className="press grid size-11 place-items-center rounded-full hover:bg-text/5"
              >
                {dot}
              </button>
            ) : (
              <span className="grid size-6 place-items-center">{dot}</span>
            )}
          </div>
        );
      })}
      {/* The baton: a full-size layer translated by the station's percentage (transform only),
          carrying a short segment just past the station. Frozen during a hold. */}
      {/* Clip box: lets the translated layer move without ever widening the page. */}
      <div aria-hidden className={cn('pointer-events-none absolute overflow-hidden', vertical ? '-inset-y-4 inset-x-0' : '-inset-x-4 inset-y-0')}>
      <motion.div
        className={cn('absolute', vertical ? 'inset-x-0 top-4 bottom-4' : 'inset-y-0 left-4 right-4')}
        initial={false}
        animate={vertical ? { y: `${pos(at)}%` } : { x: `${pos(at)}%` }}
        transition={paused ? { duration: 0 } : handoff}
      >
        <span
          className={cn(
            'absolute block rounded-full',
            vertical ? 'top-[10px] left-1/2 h-5 w-[3px] -translate-x-1/2' : 'top-1/2 h-[3px] w-5 -translate-y-1/2',
            !vertical && (at === n - 1 ? '-left-[30px]' : 'left-[10px]'),
            paused ? 'bg-amber' : 'bg-violet',
          )}
        />
        {paused ? (
          <span className={cn('absolute block rounded-full bg-amber', vertical ? 'top-[38px] left-1/2 h-[2px] w-6 -translate-x-1/2' : 'top-1/2 h-6 w-[2px] -translate-y-1/2', !vertical && (at === n - 1 ? '-left-[42px]' : 'left-[38px]'))} />
        ) : null}
      </motion.div>
      </div>
    </div>
  );
}

/** Station labels for a horizontal track, aligned under each station. */
export function TrackLabels({ stage, labels, tone = 'paper' }: { stage: Stage; labels: Record<Stage, string>; tone?: 'paper' | 'ink' }) {
  const at = stageIndex(stage);
  const last = STAGE_ORDER.length - 1;
  // Each label sits under its station's exact position (0%, 25%, …, 100%); the ends align inward.
  return (
    <ol className="relative h-5 text-[0.8rem] leading-5 whitespace-nowrap">
      {STAGE_ORDER.map((s, i) => (
        <li key={s} style={{ left: `${(i / last) * 100}%` }}
          className={cn('absolute top-0', i === 0 ? '' : i === last ? '-translate-x-full' : '-translate-x-1/2',
            i === at ? (tone === 'ink' ? 'font-bold text-on-ink' : 'font-bold text-text') : tone === 'ink' ? 'text-on-ink-muted' : 'text-muted')}>
          {i === at ? <span className="sr-only">Current stage: </span> : null}
          {labels[s]}
        </li>
      ))}
    </ol>
  );
}
