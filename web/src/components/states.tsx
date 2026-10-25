import Link from 'next/link';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { describeError, type RelayError } from '@/lib/errors';
import { Button, buttonVariants } from '@/components/ui/button';
import { StartsInDiscord } from '@/components/graphics';
import type { Health } from '@/lib/schemas';
import { cn } from '@/lib/utils';

export type Mode = 'synthetic' | 'local' | 'connected';

/** Always-visible data-mode chip. Synthetic data never shares a screen with live data. */
export function ModeChip({ mode, health, className }: { mode: Mode; health?: Health; className?: string }) {
  const label = mode === 'synthetic' ? 'Synthetic session' : mode === 'local' ? 'Local test identities' : 'Connected backend';
  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full border px-3 py-1 text-xs font-semibold', mode === 'synthetic' ? 'border-violet/30 bg-card text-violet' : mode === 'local' ? 'border-amber/30 bg-amber-tint text-amber' : 'border-line-strong bg-card text-text', className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', mode === 'synthetic' ? 'bg-violet' : mode === 'local' ? 'bg-amber' : 'bg-green')} />
      {label}
      {mode === 'connected' && health ? (
        <span className="mono font-normal text-muted">live_model={String(health.live_model)} · delivery_enabled={String(health.delivery_enabled)}</span>
      ) : null}
    </span>
  );
}

export function SyntheticBanner() {
  return (
    <p className="rounded-[12px] border border-violet/25 bg-card px-4 py-2 text-sm text-text">
      <strong className="text-violet">Synthetic session:</strong> original teaching material, not real students. Anything that would write says “Demo only. Nothing was sent.”
    </p>
  );
}

export function LocalBanner() {
  return (
    <p className="rounded-[12px] border border-amber/25 bg-amber-tint px-4 py-2 text-sm text-amber">
      <strong>Local test identities:</strong> not real accounts. One presenter can play every participant on this laptop.
    </p>
  );
}

/** A full-screen state with copy, an optional illustration and one next step. */
export function StateView({ title, body, art, children, className }: { title: string; body: React.ReactNode; art?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('card mx-auto flex max-w-xl flex-col items-start gap-4 p-8', className)} aria-live="polite">
      {art ? <div className="w-full max-w-60">{art}</div> : null}
      <h2 className="text-2xl">{title}</h2>
      <div className="measure text-muted">{body}</div>
      {children ? <div className="flex flex-wrap gap-3">{children}</div> : null}
    </section>
  );
}

export function NotConnected() {
  return (
    <StateView title="Backend not connected" body="This site is not connected to a RELAY backend right now, so live rooms are unavailable. The synthetic session shows every stage with original teaching material." art={<StartsInDiscord />}>
      <Link href="/demo" className={buttonVariants()}>Walk through a synthetic session</Link>
    </StateView>
  );
}

export function StartsInDiscordState({ loginHref }: { loginHref?: string | null }) {
  return (
    <StateView title="Sessions start in Discord" body={<>This backend does not allow browser test identities. Start a session with <code className="mono">/relay create</code> in your study server and join with <code className="mono">/relay join</code>.{loginHref ? ' Then sign in here with Discord to open it.' : ' Browser sign-in is not configured on this backend yet.'}</>} art={<StartsInDiscord />}>
      {loginHref ? <a href={loginHref} className={buttonVariants()}>Sign in with Discord</a> : null}
      <Link href="/demo" className={buttonVariants({ variant: 'secondary' })}>Walk through a synthetic session</Link>
    </StateView>
  );
}

/** Screen-level error: what happened, and the one thing to do next. */
export function ErrorState({ error, onRetry }: { error: RelayError; onRetry?: () => void }) {
  if (error.kind === 'not_connected') return <NotConnected />;
  const copy = describeError(error);
  return (
    <StateView title={copy.title} body={<>{copy.body}{error.requestId ? <span className="mono mt-2 block text-xs">request {error.requestId}</span> : null}</>}>
      {copy.action === 'retry' || copy.action === 'refresh' ? <Button variant="secondary" onClick={onRetry}><RefreshCw strokeWidth={1.75} />Try again</Button> : null}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full-page navigation to the OAuth route handler (302 to Discord), not a page */}
      {copy.action === 'signin' ? <a href="/auth/discord/login" className={buttonVariants()}>Sign in with Discord</a> : null}
      <Link href="/room" className={buttonVariants({ variant: 'quiet' })}>Back to rooms</Link>
    </StateView>
  );
}

/** Inline banner for a transient problem while the last known view stays on screen. */
export function NoticeBanner({ error, onDismiss }: { error: RelayError; onDismiss: () => void }) {
  const copy = describeError(error);
  const network = error.kind === 'network' || error.kind === 'not_connected';
  return (
    <div role="alert" className="flex items-start gap-3 rounded-[12px] border border-amber/30 bg-amber-tint px-4 py-3 text-sm text-amber">
      {network ? <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />}
      <div className="min-w-0 flex-1">
        <strong className="block">{network ? 'Showing the last known view' : copy.title}</strong>
        <span>{network ? `${copy.body}` : copy.body}</span>
        {Object.keys(error.fields).length ? (
          <ul className="mt-1 list-disc pl-5">{Object.entries(error.fields).map(([f, m]) => <li key={f}><span className="mono">{f}</span>: {m}</li>)}</ul>
        ) : null}
      </div>
      <button type="button" onClick={onDismiss} className="press -m-1 rounded-full px-2 py-1 font-semibold hover:bg-amber/10">Dismiss</button>
    </div>
  );
}

export function Loading({ label = 'Opening the room' }: { label?: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-8" role="status">
      <div className="h-[2px] w-full overflow-hidden rounded-full bg-line"><div className="h-full w-1/3 rounded-full bg-blue" /></div>
      <p className="text-muted">{label}…</p>
    </div>
  );
}
