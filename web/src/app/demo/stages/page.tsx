import type { Metadata } from 'next';
import { DemoRoom } from '@/components/demo/demo-room';

export const metadata: Metadata = { title: 'Every stage, captured' };

export default function Page() {
  return <DemoRoom />;
}
