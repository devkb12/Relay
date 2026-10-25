'use client';

import Link from 'next/link';
import { useSampleRoom } from '@/lib/sample-room';
import { presentation } from '@/lib/sample';
import { RoomView } from '@/components/room/room-view';
import { RoomProvider } from '@/components/room/context';
import { DebriefView } from '@/components/debrief/debrief-view';
import { PresentView } from '@/components/present/present-view';
import { Loading, ModeChip, SampleBanner } from '@/components/states';
import { Wordmark } from '@/components/graphics';

/** /demo: the interactive sample round. You are the host; Ari, Bea and Cy are fictional. */
export function SampleRound() {
  const room = useSampleRoom();
  if (!room.view) return <Loading label="Opening the sample round" />;
  return <RoomView room={room} view={room.view} mode="sample" basePath="/demo" extra={<SampleBanner onReset={room.reset} />} />;
}

/** /demo/debrief: the same in-tab round, Reflect page. */
export function SampleDebrief() {
  const room = useSampleRoom({ peers: false });
  if (!room.view) return <Loading label="Opening the sample round" />;
  return (
    <RoomProvider value={{ room, view: room.view, sid: room.view.id, mode: 'sample', basePath: '/demo' }}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/"><Wordmark /></Link>
          <ModeChip mode="sample" />
        </div>
        <SampleBanner onReset={room.reset} />
        <Link href="/demo" className="w-fit text-sm font-semibold text-primary underline underline-offset-4">Back to the sample room</Link>
        <DebriefView />
      </div>
    </RoomProvider>
  );
}

/** /demo/present: the group-safe projection of the same round, as a shared screen would show it. */
export function SamplePresent() {
  const room = useSampleRoom({ peers: false });
  if (!room.view) return <Loading label="Opening the sample round" />;
  return <PresentView p={presentation(room.view)} backHref="/demo" synthetic />;
}
