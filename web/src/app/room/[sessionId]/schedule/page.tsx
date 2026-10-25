import type { Metadata } from 'next';
import { LiveSchedule } from '@/components/live/live-session';

export const metadata: Metadata = { title: 'Schedule', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <LiveSchedule sessionId={decodeURIComponent(sessionId)} />;
}
