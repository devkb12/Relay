import type { Metadata } from 'next';
import { LiveRoom } from '@/components/live/live-session';

export const metadata: Metadata = { title: 'Study room', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <LiveRoom sessionId={decodeURIComponent(sessionId)} />;
}
