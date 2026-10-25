import type { Metadata } from 'next';
import { SamplePresent } from '@/components/demo/sample-round';

export const metadata: Metadata = { title: 'Sample round · group screen' };

export default function Page() {
  return <SamplePresent />;
}
