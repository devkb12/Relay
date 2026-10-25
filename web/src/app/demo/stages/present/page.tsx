import type { Metadata } from 'next';
import { DemoPresent } from '@/components/demo/demo-room';

export const metadata: Metadata = { title: 'Captured group screen' };

export default function Page() {
  return <DemoPresent />;
}
