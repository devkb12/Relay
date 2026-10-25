import type { Metadata } from 'next';
import { RoomIndex } from '@/components/live/room-index';

export const metadata: Metadata = { title: 'Study room' };

export default function Page() {
  return <RoomIndex />;
}
