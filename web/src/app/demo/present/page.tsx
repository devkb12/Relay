import type { Metadata } from 'next';
import { DemoPresent } from '@/components/demo/demo-room';

export const metadata: Metadata = { title: 'Synthetic presentation' };

export default function Page() {
  return <DemoPresent />;
}
