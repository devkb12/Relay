import { upstreamConfig } from '@/lib/proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const out = (body: { connected: boolean; reason?: string }) => Response.json(body, { headers: { 'cache-control': 'no-store' } });

/**
 * Is a backend configured and reachable, checked at request time (never baked into the build)?
 * Always 200, so a backend-down site shows a designed state without console errors. Reveals a
 * boolean and a reason code, never the backend's address.
 */
export async function GET() {
  const up = upstreamConfig();
  if (!('base' in up)) return out({ connected: false, reason: up.reason });
  try {
    const r = await fetch(`${up.base}/health`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return r.ok ? out({ connected: true }) : out({ connected: false, reason: 'unhealthy' });
  } catch {
    return out({ connected: false, reason: 'unreachable' });
  }
}
