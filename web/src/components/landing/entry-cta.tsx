'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

type Entry = 'checking' | 'offline' | 'signin' | 'signed-in' | 'no-signin';

/**
 * The hero's live entry, stated truthfully: "Continue with Discord" only when this site's backend
 * really offers Discord sign-in. Plain fetches (no schema library) to keep the landing page light;
 * anything unexpected falls back to "offline", never to a pretend signed-in state.
 */
export function EntryCta() {
  const [entry, setEntry] = useState<Entry>('checking');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const conn = await fetch('/connection', { cache: 'no-store' }).then((r) => r.json());
        if (!conn?.connected) { if (live) setEntry('offline'); return; }
        const me = await fetch('/auth/me', { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null));
        if (!live) return;
        setEntry(me?.authenticated === true ? 'signed-in' : me?.login_available === true ? 'signin' : 'no-signin');
      } catch { if (live) setEntry('offline'); }
    })();
    return () => { live = false; };
  }, []);

  const status: Record<Entry, string> = {
    checking: 'Checking live sign-in…',
    offline: 'Live sessions: this site is not connected to a RELAY backend right now.',
    signin: 'Live sessions: Discord sign-in is available.',
    'signed-in': 'Live sessions: you are signed in.',
    'no-signin': 'Live sessions: connected, but Discord sign-in is not configured.',
  };
  return (
    <div className="flex w-min flex-col gap-1.5 [&>*:first-child]:w-max">
      {entry === 'signin' ? (
        // Full-page navigation to the OAuth route handler (302 to Discord), not a page.
        // eslint-disable-next-line @next/next/no-html-link-for-pages
        <a href="/auth/discord/login?return_to=%2Froom" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>Continue with Discord</a>
      ) : (
        <Link href="/room" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>{entry === 'signed-in' ? 'Open your study room' : 'Open the study room'}</Link>
      )}
      <span className="max-w-[17rem] text-xs text-muted" aria-live="polite">{status[entry]}</span>
    </div>
  );
}
