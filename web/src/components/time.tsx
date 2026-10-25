'use client';

import { useSyncExternalStore } from 'react';
import { localTime, viewerTimeZone } from '@/lib/utils';

const noop = () => () => {};
/** False during server render and hydration, true after. Lets the first client render match the server. */
export const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** The viewer's timezone once hydrated; UTC on the server (always labeled, never silent). */
export function useViewerZone() {
  return useHydrated() ? viewerTimeZone() : 'UTC';
}

/** A time always stated with its zone. Server + hydration render a pinned en-US/UTC string (identical on both
 * sides); after hydration the browser re-renders in the viewer's locale and zone. */
export function LocalTime({ iso, tz, withDate = true, className }: { iso: string; tz?: string; withDate?: boolean; className?: string }) {
  const hydrated = useHydrated();
  return <time dateTime={iso} className={className}>{hydrated ? localTime(iso, tz, withDate) : localTime(iso, 'UTC', withDate, 'en-US')}</time>;
}
