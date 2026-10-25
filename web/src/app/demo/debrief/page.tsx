import type { Metadata } from 'next';
import { SampleDebrief } from '@/components/demo/sample-round';

export const metadata: Metadata = { title: 'Sample round · Reflect' };

export default function Page() {
  return <SampleDebrief />;
}
