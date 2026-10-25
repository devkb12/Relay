/** One error type for every failure the UI can show, plus the copy for each. */
export type ErrorKind = 'http' | 'network' | 'schema' | 'not_connected';

export class RelayError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public status?: number,
    public requestId?: string | null,
    public fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'RelayError';
  }
}

export type ErrorCopy = { title: string; body: string; action?: 'refresh' | 'signin' | 'demo' | 'retry' | 'none' };

const DEMO_DISABLED = /demo creation is disabled|join through discord/i;
const HOST_ONLY = /only the session host/i;
const BEARER_OFF = /bearer tokens are disabled/i;
const NOT_MEMBER = /not authorized for this session|use \/relay join first/i;

/** Map an error to the words the person sees. Server text is shown verbatim where it explains the rule. */
export function describeError(err: unknown): ErrorCopy {
  if (!(err instanceof RelayError)) return { title: 'Something went wrong', body: String((err as Error)?.message ?? err), action: 'retry' };
  switch (err.kind) {
    case 'not_connected':
      return { title: 'Backend not connected', body: 'This site is not connected to a RELAY backend right now. The synthetic session still works.', action: 'demo' };
    case 'network':
      return { title: 'Connection lost', body: 'Your last action may not have reached RELAY. Nothing is assumed; check your connection and try again.', action: 'retry' };
    case 'schema':
      return { title: 'Unexpected response', body: `RELAY sent data this screen does not understand (${err.message}). Nothing is shown rather than guessed.`, action: 'retry' };
  }
  const s = err.status;
  if (s === 401) return { title: 'Sign in to continue', body: err.message, action: 'signin' };
  if (s === 403 && DEMO_DISABLED.test(err.message)) return { title: 'Sessions start in Discord', body: 'This backend does not allow browser test identities. Create or join with /relay create and /relay join in your study server.', action: 'none' };
  if (s === 403 && HOST_ONLY.test(err.message)) return { title: 'Host only', body: err.message, action: 'none' };
  if (s === 403 && BEARER_OFF.test(err.message)) return { title: 'Sign in with Discord', body: err.message, action: 'signin' };
  // A room link identifies a session; it never grants access. Membership comes from /relay join.
  if (s === 403 && NOT_MEMBER.test(err.message)) return { title: 'You haven’t joined this session', body: 'You’re signed in, but you are not a member of this session. In its Discord channel, run /relay join, then reload this page.', action: 'none' };
  if (s === 403) return { title: 'Not allowed', body: err.message, action: 'none' };
  if (s === 404) return { title: 'Session not found', body: 'It may have been deleted, or the link is wrong.', action: 'none' };
  if (s === 409) return { title: 'Something changed', body: `${err.message} The view was refreshed.`, action: 'refresh' };
  if (s === 410) return { title: 'This control is out of date', body: err.message, action: 'refresh' };
  if (s === 422) return { title: 'Check the highlighted fields', body: Object.values(err.fields).join(' ') || err.message, action: 'none' };
  if (s === 429) return { title: 'Slow down a moment', body: err.message, action: 'retry' };
  if (s === 503) return { title: 'Not available', body: err.message, action: 'none' };
  return { title: 'Request failed', body: err.message, action: 'retry' };
}

/** FastAPI 422 bodies list {loc:[...,"field"], msg}. Map to {field: message}. */
export function fieldErrors(detail: unknown): Record<string, string> {
  if (!Array.isArray(detail)) return {};
  const out: Record<string, string> = {};
  for (const item of detail as { loc?: (string | number)[]; msg?: string }[]) {
    const field = String(item.loc?.at(-1) ?? 'form');
    if (item.msg && !out[field]) out[field] = item.msg.replace(/^Value error, /, '');
  }
  return out;
}
