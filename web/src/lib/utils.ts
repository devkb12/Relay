import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** "2026-10-25T20:00:00Z" -> local wall time in the viewer's timezone, stated explicitly. */
export function localTime(iso: string, tz?: string, withDate = true, locale?: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: withDate ? 'short' : undefined,
    month: withDate ? 'short' : undefined,
    day: withDate ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

export const viewerTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
};

export const shortHash = (hash: string) => hash.slice(0, 8);
