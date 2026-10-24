"""Deterministic scheduling. Missing availability is not free time."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Iterable

UTC = timezone.utc


def parse_time(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None or result.utcoffset() is None:
        raise ValueError('Use an ISO datetime with an explicit UTC offset.')
    return result.astimezone(UTC)


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace('+00:00', 'Z')


def normalize(windows: Iterable[dict]) -> list[tuple[datetime, datetime]]:
    values = []
    for item in windows:
        start, end = parse_time(item['start']), parse_time(item['end'])
        if end <= start:
            raise ValueError('Availability must end after it starts.')
        if end - start > timedelta(days=2):
            raise ValueError('Use individual availability windows of at most two days.')
        values.append((start, end))
    values.sort()
    merged: list[tuple[datetime, datetime]] = []
    for start, end in values:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged


def find_slots(availability: dict[str, list[dict]], durations=(60, 45, 30),
               not_before: datetime | None = None, limit: int = 6) -> list[dict]:
    if not availability or any(not windows for windows in availability.values()):
        raise ValueError('Every participant must enter availability. Missing does not mean free.')
    if not durations or any(not isinstance(x, int) or not 10 <= x <= 180 for x in durations):
        raise ValueError('Durations must be integers between 10 and 180 minutes.')
    all_windows = [normalize(v) for v in availability.values()]
    intersection = all_windows[0]
    for windows in all_windows[1:]:
        intersection = [(max(a, c), min(b, d)) for a, b in intersection
                        for c, d in windows if max(a, c) < min(b, d)]
    found = []
    floor = not_before.astimezone(UTC) if not_before else None
    # Prefer requested duration before an explicitly labeled shorter alternative.
    for duration in dict.fromkeys(durations):
        for begin, end in intersection:
            begin = max(begin, floor) if floor else begin
            # Candidates start on the next 15-minute UTC boundary.
            seconds = begin.timestamp()
            aligned = datetime.fromtimestamp(((int(seconds) + 899) // 900) * 900, UTC)
            while aligned + timedelta(minutes=duration) <= end:
                found.append({'start': iso(aligned), 'end': iso(aligned + timedelta(minutes=duration)),
                              'minutes': duration, 'shorter_alternative': duration != durations[0]})
                if len(found) >= limit:
                    return found
                aligned += timedelta(minutes=15)
    return found


def ics_event(session_id: str, version: int, start: str, end: str) -> str:
    """An opt-in calendar FILE, not proof that Google Calendar was changed."""
    def fmt(value: str) -> str:
        return parse_time(value).strftime('%Y%m%dT%H%M%SZ')
    stamp = datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RELAY//Study Session//EN',
             'BEGIN:VEVENT', f'UID:relay-{session_id}@local.invalid', f'SEQUENCE:{version}',
             f'DTSTAMP:{stamp}', f'DTSTART:{fmt(start)}', f'DTEND:{fmt(end)}',
             'SUMMARY:RELAY study session',
             'DESCRIPTION:Approved study time. Importing this file is your choice.',
             'END:VEVENT', 'END:VCALENDAR', '']
    return '\r\n'.join(lines)
