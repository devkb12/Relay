import type { Metadata } from 'next';
import { LivePresent } from '@/components/live/live-session';

export const metadata: Metadata = { title: 'Presentation mode', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <LivePresent sessionId={decodeURIComponent(sessionId)} />;
}
