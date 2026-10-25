import type { Metadata } from 'next';
import { DemoRoom } from '@/components/demo/demo-room';

export const metadata: Metadata = { title: 'Synthetic session' };

export default function Page() {
  return <DemoRoom />;
}
