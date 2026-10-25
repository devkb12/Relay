import type { Metadata } from 'next';
import { DemoSchedule } from '@/components/demo/demo-room';

export const metadata: Metadata = { title: 'Synthetic schedule' };

export default function Page() {
  return <DemoSchedule />;
}
