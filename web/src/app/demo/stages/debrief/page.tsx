import type { Metadata } from 'next';
import { DemoDebrief } from '@/components/demo/demo-room';

export const metadata: Metadata = { title: 'Captured Reflect screen' };

export default function Page() {
  return <DemoDebrief />;
}
