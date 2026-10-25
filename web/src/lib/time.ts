/** Time helpers for availability. Storage and the API are UTC; display always names a timezone. */

function offsetMinutes(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(instant))
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - instant) / 60000);
}

/**
 * "2026-10-25T15:00" wall time in `tz` -> "2026-10-25T22:00:00.000Z" (an offset-aware ISO instant).
 * Two passes handle DST edges. Returns null for unparseable input.
 */
export function wallTimeToIso(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  let instant = guess - offsetMinutes(guess, tz) * 60000;
  instant = guess - offsetMinutes(instant, tz) * 60000;
  return new Date(instant).toISOString();
}

/** UTC ISO -> "2026-10-25T15:00" in `tz`, for a datetime-local input. */
export function isoToWallTime(iso: string, tz: string): string {
  const d = new Date(iso).getTime();
  const shifted = new Date(d + offsetMinutes(d, tz) * 60000);
  return shifted.toISOString().slice(0, 16);
}

export function timeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'America/Phoenix', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York'];
  }
}

export const MAX_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
