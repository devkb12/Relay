import { proxy } from '@/lib/proxy';

// Discord login is a full-page navigation through here: the backend's 302 to discord.com and its
// Set-Cookie (__Host-relay_session) pass through unchanged, so the cookie belongs to this site.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = proxy;
export const POST = proxy;
