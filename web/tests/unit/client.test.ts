import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeError, fieldErrors, RelayError } from '@/lib/errors';
import { STAGE_LABEL, ADVANCE_LABEL, STAGE_ORDER } from '@/lib/stages';
import { FORBIDDEN_CLAIMS, groupLines, retryTopics, followUpLine, WITHHELD, STATUS_TEXT } from '@/lib/debrief';
import { FIXTURES } from '@/lib/fixtures';
import { isAllowed } from '@/lib/proxy';

/** Minimal sessionStorage/localStorage for the node environment. */
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  dump() { return JSON.stringify([...this.m]); }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('error mapping', () => {
  const http = (status: number, detail: string, fields = {}) => new RelayError('http', detail, status, 'rid', fields);
  it.each([
    [http(400, 'Every participant must enter availability. Missing does not mean free.'), 'Request failed'],
    [http(401, 'Sign in with Discord to open this session.'), 'Sign in to continue'],
    [http(403, 'Only the session host may do this.'), 'Host only'],
    [http(403, 'Public demo creation is disabled; join through Discord.'), 'Sessions start in Discord'],
    [http(403, 'Participant bearer tokens are disabled here. Sign in with Discord.'), 'Sign in with Discord'],
    [http(403, 'Not authorized for this session.'), 'Not allowed'],
    [http(404, 'Session not found.'), 'Session not found'],
    [http(409, 'The stage changed. Refresh before continuing.'), 'Something changed'],
    [http(422, 'Some fields need attention.', { note: 'String should have at least 10 characters' }), 'Check the highlighted fields'],
    [new RelayError('network', 'Network request failed'), 'Connection lost'],
    [new RelayError('schema', 'stage: Invalid option'), 'Unexpected response'],
    [new RelayError('not_connected', 'Backend not connected', 503), 'Backend not connected'],
  ])('%s -> %s', (err, title) => expect(describeError(err).title).toBe(title));

  it('409 keeps the server reason and says the view refreshed', () => {
    expect(describeError(http(409, 'This proposal changed. Review the current version.')).body).toMatch(/proposal changed.*refreshed/);
  });
  it('422 field errors map to their field', () => {
    expect(fieldErrors([{ loc: ['body', 'note'], msg: 'String should have at least 10 characters' }])).toEqual({ note: 'String should have at least 10 characters' });
  });
});

describe('stage labels', () => {
  it('uses the product labels and only backend values as keys', () => {
    expect(STAGE_ORDER).toEqual(['lobby', 'diagnostic', 'discussion', 'transfer', 'debrief']);
    expect(STAGE_LABEL).toEqual({ lobby: 'Gather your group', diagnostic: 'Think privately', discussion: 'Explain together', transfer: 'Try a fresh problem', debrief: 'Reflect on learning' });
    expect(ADVANCE_LABEL.debrief).toBeNull();
  });
});

describe('debrief rules', () => {
  it('withholds group results when the server returns null', () => {
    expect(groupLines(null)).toBeNull();
    expect(WITHHELD).toBe('Group results stay hidden until at least 3 people have answered both questions.');
  });
  it('reports server counts with denominators, never a difference', () => {
    const lines = groupLines(FIXTURES.debrief.group)!;
    expect(lines[0]).toMatch(/^First question: \d+ of \d+ correct$/);
    expect(lines[1]).toMatch(/^Fresh question: \d+ of \d+ correct$/);
    for (const text of [...lines, ...Object.values(STATUS_TEXT), WITHHELD, followUpLine({ me: { ...FIXTURES.debrief.me, reminders: false }, retention_due_at: 1 }, String)]) {
      expect(text).not.toMatch(FORBIDDEN_CLAIMS);
      expect(text).not.toMatch(/%|↑|→ \d/);
    }
  });
  it('topics to retry come only from the viewer\'s own non-correct results', () => {
    const v = FIXTURES['participant-debrief-skipped'];
    const topics = retryTopics(v);
    const misses = Object.values(v.my_results).filter((r) => r!.status === 'incorrect' || r!.status === 'skipped').length;
    expect(topics).toHaveLength(misses);
    expect(retryTopics({ ...v, my_results: {} })).toEqual([]);
  });
  it('follow-up line depends on consent', () => {
    expect(followUpLine({ me: { ...FIXTURES.debrief.me, reminders: true }, retention_due_at: 100 }, () => 'LATER')).toBe('Follow-up check planned for LATER.');
    expect(followUpLine({ me: { ...FIXTURES.debrief.me, reminders: false }, retention_due_at: 100 }, () => 'LATER')).toBe('No follow-up reminder. You can opt in from Schedule.');
  });
});

describe('tokens and the calendar download', () => {
  let session: MemoryStorage, local: MemoryStorage;
  beforeEach(() => {
    session = new MemoryStorage(); local = new MemoryStorage();
    vi.stubGlobal('window', { sessionStorage: session, localStorage: local });
    vi.stubGlobal('localStorage', local);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('.ics sends the bearer header and never puts the token in the URL', async () => {
    const { addIdentity } = await import('@/lib/identities');
    const { api } = await import('@/lib/relay-api');
    addIdentity({ session_id: 'S1', token: 'SECRET-TOKEN-123', member_id: 'web:1', name: 'Ana' });
    const fetchMock = vi.fn(async () => new Response('BEGIN:VCALENDAR', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await api.calendarFile('S1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/sessions/S1/calendar.ics');
    expect(url).not.toContain('SECRET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer SECRET-TOKEN-123');
  });

  it('tokens live in sessionStorage only and never in request URLs', async () => {
    const { addIdentity } = await import('@/lib/identities');
    const { api } = await import('@/lib/relay-api');
    addIdentity({ session_id: 'S2', token: 'SECRET-TOKEN-456', member_id: 'web:2', name: 'Ben' });
    const fetchMock = vi.fn(async () => json(200, FIXTURES.lobby));
    vi.stubGlobal('fetch', fetchMock);
    await api.view('S2');
    await api.advance('S2', 'lobby').catch(() => null);
    for (const [url] of fetchMock.mock.calls as unknown as [string][]) expect(url).not.toContain('SECRET');
    expect(session.dump()).toContain('SECRET-TOKEN-456');
    expect(local.dump()).not.toContain('SECRET');
  });

  it('a schema mismatch is a visible error, not a blank', async () => {
    const { api } = await import('@/lib/relay-api');
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { ...FIXTURES.lobby, stage: 'finished' })));
    await expect(api.view('S3')).rejects.toMatchObject({ kind: 'schema' });
  });

  it('a network failure and a disconnected backend are distinguished', async () => {
    const { api } = await import('@/lib/relay-api');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(api.view('S4')).rejects.toMatchObject({ kind: 'network' });
    vi.stubGlobal('fetch', vi.fn(async () => json(503, { detail: 'Backend not connected', code: 'backend_not_connected' })));
    await expect(api.view('S4')).rejects.toMatchObject({ kind: 'not_connected' });
  });
});

describe('proxy allowlist', () => {
  it.each(['/health', '/api/concepts', '/api/me/sessions', '/api/sessions', '/api/sessions/AbC_12-x', '/api/sessions/AbC/answer', '/api/sessions/AbC/calendar.ics', '/auth/me', '/auth/logout', '/auth/discord/login', '/auth/discord/callback'])('forwards %s', (p) => expect(isAllowed(p)).toBe(true));
  it.each(['/internal/discord', '/api/internal/jobs', '/api/sessions/AbC/../../internal/discord', '/api/sessions/AbC/unknown', '/auth/discord/other', '/docs', '/openapi.json'])('refuses %s', (p) => expect(isAllowed(p)).toBe(false));
});
