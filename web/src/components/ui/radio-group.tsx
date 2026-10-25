'use client';

import { RadioGroup as R } from 'radix-ui';
import { cn } from '@/lib/utils';

export const RadioGroup = ({ className, ...props }: React.ComponentProps<typeof R.Root>) => (
  <R.Root className={cn('grid gap-2', className)} {...props} />
);

/** A full-width option row: the whole row is the target (>=44px), state shown by ring + dot + text. */
export function RadioRow({ value, children, className, disabled }: { value: string; children: React.ReactNode; className?: string; disabled?: boolean }) {
  return (
    <R.Item
      value={value}
      disabled={disabled}
      className={cn(
        'press group flex min-h-12 w-full items-start gap-3 rounded-[12px] border border-line bg-card px-4 py-3 text-left',
        'hover:border-line-strong data-[state=checked]:border-primary data-[state=checked]:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-70',
        className,
      )}
    >
      <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-control group-data-[state=checked]:border-primary">
        <R.Indicator className="size-2.5 rounded-full bg-primary" />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </R.Item>
  );
}
