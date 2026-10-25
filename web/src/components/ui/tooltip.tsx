'use client';

import { Tooltip as T } from 'radix-ui';

/** Supplementary hint only; anything essential is also visible text. */
export function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={300}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={6} className="z-50 max-w-64 rounded-[10px] bg-ink px-3 py-2 text-sm text-on-ink">
            {label}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
