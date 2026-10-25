/**
 * Same-origin proxy from Next.js route handlers to the FastAPI backend (server-only).
 * Reads RELAY_API_BASE_URL at request time. Forwards only documented browser routes; /internal/*
 * can never match. An unset or unreachable backend becomes 503 {code:"backend_not_connected"}.
 */
import 'server-only';

const SID = '[A-Za-z0-9_-]{1,40}';
const ACTIONS = 'join|advance|answer|explain|facilitate|availability|propose|cancel-plan|approve|consent|challenge|review|resolve|leave|presentation|calendar\\.ics';
export const ALLOWED: RegExp[] = [
  /^\/health$/,
  /^\/api\/concepts$/,
  /^\/api\/me\/sessions$/,
  /^\/api\/sessions$/,
  new RegExp(`^/api/sessions/${SID}(/(${ACTIONS}))?$`),
  /^\/auth\/discord\/(login|callback)$/,
  /^\/auth\/(me|logout)$/,
];

const REQUEST_HEADERS = ['authorization', 'cookie', 'content-type', 'x-csrf-token', 'origin', 'x-request-id', 'accept'];
const RESPONSE_HEADERS = ['content-type', 'content-disposition', 'cache-control', 'location', 'x-request-id', 'vary'];

export function isAllowed(path: string) {
  return !path.startsWith('/internal') && ALLOWED.some((re) => re.test(path));
}

export function backendBase(): string | null {
  const raw = process.env.RELAY_API_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const notConnected = () => json(503, { detail: 'Backend not connected', code: 'backend_not_connected' });

export async function proxy(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (!isAllowed(path)) return json(404, { detail: 'Not found' });
  const base = backendBase();
  if (!base) return notConnected();

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(base + path + url.search, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return notConnected();
  }

  const out = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);
  if (!out.has('cache-control')) out.set('cache-control', 'no-store');
  const body = upstream.status === 204 || upstream.status === 304 ? null : await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers: out });
}
