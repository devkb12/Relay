import type { Metadata } from 'next';
import { SampleRound } from '@/components/demo/sample-round';

export const metadata: Metadata = { title: 'Sample round', description: 'Try one RELAY study round with fictional peers and original practice material. Nothing is sent.' };

export default function Page() {
  return <SampleRound />;
}
