import { backendBase } from '@/lib/proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Is a backend configured and reachable? Always 200, so a backend-down site shows a designed state
 * without failed requests in the console. Reveals only a boolean, never the backend's address.
 */
export async function GET() {
  const base = backendBase();
  if (!base) return Response.json({ connected: false }, { headers: { 'cache-control': 'no-store' } });
  try {
    const r = await fetch(`${base}/health`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return Response.json({ connected: r.ok }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ connected: false }, { headers: { 'cache-control': 'no-store' } });
  }
}
