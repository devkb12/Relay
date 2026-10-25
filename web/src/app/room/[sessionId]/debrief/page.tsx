import type { Metadata } from 'next';
import { LiveDebrief } from '@/components/live/live-session';

export const metadata: Metadata = { title: 'Debrief', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <LiveDebrief sessionId={decodeURIComponent(sessionId)} />;
}
