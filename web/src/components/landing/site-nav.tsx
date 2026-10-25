import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Wordmark } from '@/components/graphics';
import { buttonVariants } from '@/components/ui/button';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#moment', label: 'The moment' },
  { href: '#rules', label: 'Rules' },
  { href: '#discord', label: 'In Discord' },
  { href: '#faq', label: 'FAQ' },
  { href: '/tour', label: 'Tour' },
];

/** Sticky, solid (no blur) nav. The phone menu is a native <details> disclosure: no JavaScript. */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/95">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Relay home" className="shrink-0"><Wordmark /></Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 text-[0.95rem] text-muted lg:flex">
          {LINKS.map((l) => (l.href.startsWith('/') ? <Link key={l.href} href={l.href} className="rounded-full px-3 py-2 hover:bg-text/5 hover:text-text">{l.label}</Link> : <a key={l.href} href={l.href} className="rounded-full px-3 py-2 hover:bg-text/5 hover:text-text">{l.label}</a>))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <Link href="/demo" className={buttonVariants({ variant: 'quiet', size: 'sm' })}>Try a sample round</Link>
          <Link href="/room" className={buttonVariants({ variant: 'dark', size: 'sm' })}>Open study room</Link>
        </div>
        <details className="group relative sm:hidden">
          <summary className="press grid size-11 cursor-pointer list-none place-items-center rounded-full border border-line-strong bg-card [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <Menu className="size-5 group-open:hidden" strokeWidth={1.75} />
            <X className="hidden size-5 group-open:block" strokeWidth={1.75} />
          </summary>
          <div className="card-float absolute top-14 right-0 flex w-64 flex-col gap-1 p-3">
            {LINKS.map((l) => (l.href.startsWith('/') ? <Link key={l.href} href={l.href} className="rounded-[12px] px-3 py-2.5 hover:bg-text/5">{l.label}</Link> : <a key={l.href} href={l.href} className="rounded-[12px] px-3 py-2.5 hover:bg-text/5">{l.label}</a>))}
            <div className="my-1 h-px bg-line" />
            <Link href="/demo" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Try a sample round</Link>
            <Link href="/room" className={buttonVariants({ variant: 'dark', size: 'sm' })}>Open study room</Link>
          </div>
        </details>
      </div>
    </header>
  );
}
