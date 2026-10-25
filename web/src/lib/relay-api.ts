/**
 * Typed browser client for the documented FastAPI routes, called same-origin through the Next.js
 * proxy (src/app/api, src/app/auth, src/app/health). Never calls /internal/*.
 *
 * Auth: local test backends use a participant bearer token from sessionStorage; connected backends
 * use the HttpOnly Discord session cookie plus the CSRF token from /auth/me (kept in memory only).
 */
import { z } from 'zod';
import { RelayError, fieldErrors } from './errors';
import { activeIdentity } from './identities';
import {
  AuthMe, ConceptList, Credentials, Deleted, ErrorBody, Health, MySessions, PresentationView, ProposeResult,
  ReviewPacket, SessionView, Withdrawn, type Stage,
} from './schemas';

let csrfToken: string | null = null;
export const setCsrf = (token: string | null) => { csrfToken = token; };

type Auth = { bearer?: string | null };
type Options = { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; auth?: Auth; signal?: AbortSignal };

async function request<T>(path: string, schema: z.ZodType<T>, { method = 'GET', body, auth, signal }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth?.bearer) headers.Authorization = `Bearer ${auth.bearer}`;
  if (method !== 'GET' && csrfToken && !auth?.bearer) headers['X-CSRF-Token'] = csrfToken;
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new RelayError('network', 'Network request failed');
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(data);
    const code = (data as { code?: string } | null)?.code;
    if (res.status === 503 && code === 'backend_not_connected') throw new RelayError('not_connected', 'Backend not connected', 503);
    const detail = parsed.success ? parsed.data.detail : null;
    const message = typeof detail === 'string' ? detail : res.status === 422 ? 'Some fields need attention.' : `HTTP ${res.status}`;
    throw new RelayError('http', message, res.status, parsed.success ? parsed.data.request_id : null, fieldErrors(detail));
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new RelayError('schema', `${issue?.path.join('.') || 'response'}: ${issue?.message ?? 'invalid'}`, res.status);
  }
  return result.data;
}

const bearerFor = (sid: string): Auth => ({ bearer: activeIdentity(sid)?.token ?? null });
const s = (sid: string, action = '') => `/api/sessions/${encodeURIComponent(sid)}${action ? '/' + action : ''}`;

export const api = {
  health: (signal?: AbortSignal) => request('/health', Health, { signal }),
  me: () => request('/auth/me', AuthMe),
  logout: () => request('/auth/logout', z.object({ authenticated: z.literal(false) }), { method: 'POST' }),
  concepts: () => request('/api/concepts', ConceptList),
  mySessions: () => request('/api/me/sessions', MySessions),

  create: (name: string, concept_id: string) => request('/api/sessions', Credentials, { method: 'POST', body: { name, concept_id } }),
  join: (sid: string, name: string) => request(s(sid, 'join'), Credentials, { method: 'POST', body: { name } }),

  view: (sid: string, signal?: AbortSignal) => request(s(sid), SessionView, { auth: bearerFor(sid), signal }),
  presentation: (sid: string, signal?: AbortSignal) => request(s(sid, 'presentation'), PresentationView, { auth: bearerFor(sid), signal }),
  advance: (sid: string, expected_stage: Stage, nonresponders: 'wait' | 'mark_missing' = 'wait') =>
    request(s(sid, 'advance'), SessionView, { method: 'POST', body: { expected_stage, nonresponders }, auth: bearerFor(sid) }),
  answer: (sid: string, body: { question_id: string; choice: string; confidence: 'unsure' | 'somewhat' | 'confident'; rationale: string }) =>
    request(s(sid, 'answer'), SessionView, { method: 'POST', body, auth: bearerFor(sid) }),
  explain: (sid: string, text: string, source_fallback = false) =>
    request(s(sid, 'explain'), SessionView, { method: 'POST', body: { text, source_fallback }, auth: bearerFor(sid) }),
  facilitate: (sid: string) => request(s(sid, 'facilitate'), SessionView, { method: 'POST', auth: bearerFor(sid) }),
  challenge: (sid: string, reason: string) => request(s(sid, 'challenge'), SessionView, { method: 'POST', body: { reason }, auth: bearerFor(sid) }),
  review: (sid: string) => request(s(sid, 'review'), ReviewPacket, { auth: bearerFor(sid) }),
  resolve: (sid: string, decision: 'resume' | 'discard', note: string, challenge_id?: string | null) =>
    request(s(sid, 'resolve'), SessionView, { method: 'POST', body: { decision, note, challenge_id: challenge_id ?? null }, auth: bearerFor(sid) }),
  availability: (sid: string, windows: { start: string; end: string }[], timezone: string) =>
    request(s(sid, 'availability'), SessionView, { method: 'POST', body: { windows, timezone }, auth: bearerFor(sid) }),
  propose: (sid: string, durations: number[]) => request(s(sid, 'propose'), ProposeResult, { method: 'POST', body: { durations }, auth: bearerFor(sid) }),
  cancelPlan: (sid: string) => request(s(sid, 'cancel-plan'), SessionView, { method: 'POST', auth: bearerFor(sid) }),
  approve: (sid: string, version: number, accept_shorter: boolean) =>
    request(s(sid, 'approve'), SessionView, { method: 'POST', body: { version, accept_shorter }, auth: bearerFor(sid) }),
  consent: (sid: string, enabled: boolean) => request(s(sid, 'consent'), SessionView, { method: 'POST', body: { enabled }, auth: bearerFor(sid) }),
  leave: (sid: string) => request(s(sid, 'leave'), Withdrawn, { method: 'POST', auth: bearerFor(sid) }),
  remove: (sid: string) => request(s(sid), Deleted, { method: 'DELETE', auth: bearerFor(sid) }),

  /** .ics as a blob with the credential in a header, so the token never appears in a link. */
  async calendarFile(sid: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    const bearer = bearerFor(sid).bearer;
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    let res: Response;
    try { res = await fetch(s(sid, 'calendar.ics'), { headers, credentials: 'same-origin', cache: 'no-store' }); }
    catch { throw new RelayError('network', 'Network request failed'); }
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { detail?: string } | null;
      throw new RelayError('http', typeof data?.detail === 'string' ? data.detail : `HTTP ${res.status}`, res.status);
    }
    return res.blob();
  },
};

export type Api = typeof api;
