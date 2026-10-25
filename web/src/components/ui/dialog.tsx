'use client';

import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/** Centered dialog. Radix moves focus in on open, traps it, closes on Escape and returns focus. */
export function DialogContent({ className, children, title, description, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-ink-deep/40" />
      <D.Content
        className={cn(
          'card fixed top-1/2 left-1/2 z-50 w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 p-6 shadow-[0_20px_60px_-20px_rgba(14,23,41,0.45)]',
          className,
        )}
        {...props}
      >
        <D.Title className="font-display text-2xl">{title}</D.Title>
        {description ? <D.Description className="mt-2 text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        <div className="mt-5">{children}</div>
        <D.Close className="press absolute top-4 right-4 grid size-10 place-items-center rounded-full hover:bg-text/5" aria-label="Close">
          <X className="size-5" strokeWidth={1.75} />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
