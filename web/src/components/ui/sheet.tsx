'use client';

import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;

/**
 * Side drawer on wide screens, full-screen panel on phones. Slides in from its own edge
 * (180-220ms, CSS so it respects reduced motion); focus moves in on open and back on close.
 */
export function SheetContent({ className, children, title, description, ...props }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-ink-deep/30" />
      <D.Content
        className={cn(
          'fixed inset-0 z-50 flex flex-col overflow-y-auto bg-card p-6 shadow-[-20px_0_60px_-30px_rgba(14,23,41,0.45)] md:inset-y-0 md:right-0 md:left-auto md:w-[28rem] md:border-l md:border-line',
          'data-[state=open]:animate-[relay-slide-in_220ms_cubic-bezier(0.2,0,0,1)]',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <D.Title className="font-display text-2xl">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="press -mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-text/5" aria-label="Close panel">
            <X className="size-5" strokeWidth={1.75} />
          </D.Close>
        </div>
        <div className="mt-6 flex-1">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
