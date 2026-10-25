import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { Wordmark } from '@/components/graphics';
import { buttonVariants } from '@/components/ui/button';
import { TourPlayer } from '@/components/tour/player';

export const metadata: Metadata = {
  title: 'Product tour',
  description: 'Two minutes: how RELAY runs a study session in your Discord server, from set-up and sign-in to the private receipt.',
};

export default async function Page({ searchParams }: { searchParams: Promise<{ record?: string; at?: string }> }) {
  const q = await searchParams;
  if (q.record === '1') return <TourPlayer record at={q.at !== undefined ? Number(q.at) : undefined} />;
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/"><Wordmark /></Link>
        <div className="flex flex-wrap gap-2">
          <a href="/tour/relay-tour.mp4" download className={buttonVariants({ variant: 'secondary', size: 'sm' })}><Download strokeWidth={1.75} />Download MP4</a>
          <Link href="/demo" className={buttonVariants({ size: 'sm' })}>Try a sample round</Link>
        </div>
      </div>
      <header className="flex flex-col gap-2">
        <span className="eyebrow">Product tour · 2 minutes</span>
        <h1 className="text-3xl sm:text-4xl">How RELAY runs a study session in Discord</h1>
        <p className="measure text-muted">Set-up, forming the group, signing in, the private attempt, the moment everyone agrees and is wrong, a challenge, a fresh problem and the receipt.</p>
      </header>
      <TourPlayer record={false} />
      <p className="text-xs text-muted">Recreated walkthrough with a fictional study group. The chat app is a recreation of a Discord server for illustration; RELAY&apos;s own screens use its real components and the sample round&apos;s engine. Narration uses a built-in Windows voice; the music and sounds were made for this tour. Space plays or pauses; the arrow keys skip 5 seconds.</p>
    </div>
  );
}
