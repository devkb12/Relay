'use client';

import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';

/** reducedMotion="user": every move becomes an instant swap with the same labels. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster
        position="top-center"
        toastOptions={{ className: 'font-sans', style: { background: '#FFFDF8', color: '#1E2535', border: '1px solid #E6E0D6', borderRadius: 12 } }}
      />
    </MotionConfig>
  );
}
