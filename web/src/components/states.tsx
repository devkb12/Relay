import Link from 'next/link';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { describeError, type RelayError } from '@/lib/errors';
import { Button, buttonVariants } from '@/components/ui/button';
import { StartsInDiscord } from '@/components/graphics';
import { SignInLink } from '@/components/sign-in-link';
import type { Health } from '@/lib/schemas';
import { cn } from '@/lib/utils';

export type Mode = 'sample' | 'synthetic' | 'local' | 'connected';

/** Always-visible data-mode chip. Synthetic data never shares a screen with live data. */
export function ModeChip({ mode, health, className }: { mode: Mode; health?: Health; className?: string }) {
  const label = mode === 'sample' ? 'Sample round' : mode === 'synthetic' ? 'Synthetic session' : mode === 'local' ? 'Local test identities' : 'Connected backend';
  const fictional = mode === 'sample' || mode === 'synthetic';
  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full border px-3 py-1 text-xs font-semibold', fictional ? 'border-primary/30 bg-card text-primary' : mode === 'local' ? 'border-amber/30 bg-amber-tint text-amber' : 'border-line-strong bg-card text-text', className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', fictional ? 'bg-primary' : mode === 'local' ? 'bg-amber' : 'bg-green')} />
      {label}
      {mode === 'connected' && health ? (
        <span className="mono font-normal text-muted">live_model={String(health.live_model)} · delivery_enabled={String(health.delivery_enabled)}</span>
      ) : null}
    </span>
  );
}

export function SyntheticBanner() {
  return (
    <p className="rounded-[12px] border border-primary/25 bg-card px-4 py-2 text-sm text-text">
      <strong className="text-primary">Synthetic session:</strong> original teaching material, not real students. Anything that would write says “Demo only. Nothing was sent.”
    </p>
  );
}

/** The required public label for the sample round. */
export function SampleBanner({ onReset }: { onReset?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-primary/25 bg-card px-4 py-1.5 text-sm text-text">
      <p className="min-w-0 flex-1">
        <strong className="text-primary">Sample round · fictional peers · original practice material.</strong>{' '}
        You host; nothing leaves this tab and no AI is called.
      </p>
      {onReset ? <button type="button" onClick={onReset} className="press min-h-8 rounded-full px-3 font-semibold text-primary hover:bg-primary/10">Start over</button> : null}
    </div>
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

/** What the /connection probe found, in words. Never the backend's address. */
const NOT_CONNECTED: Record<string, string> = {
  not_configured: 'This site has no backend configured yet (its server setting RELAY_API_BASE_URL is empty).',
  invalid_url: 'This site’s backend setting is not a valid http(s) address.',
  local_address: 'This site is set to a local or private address, which a hosted site can never reach. It needs the backend’s public HTTPS address.',
  unreachable: 'The backend is configured but not answering. The laptop, the backend or its tunnel may be offline.',
  unhealthy: 'The backend answered but reports it is not ready.',
};

export function NotConnected({ reason }: { reason?: string }) {
  return (
    <StateView title="Backend not connected" body={<>{(reason && NOT_CONNECTED[reason]) || 'This site is not connected to a RELAY backend right now.'} Live rooms are unavailable until it is; nothing is shown in their place. The sample round still works: fictional peers, original practice material.{reason ? <span className="mono mt-2 block text-xs">reason: {reason}</span> : null}</>} art={<StartsInDiscord />}>
      <Link href="/demo" className={buttonVariants()}>Try a sample round</Link>
    </StateView>
  );
}

export function StartsInDiscordState({ loginHref }: { loginHref?: string | null }) {
  return (
    <StateView title="Sessions start in Discord" body={<>This backend does not allow browser test identities. Start a session with <code className="mono">/relay create</code> in your study server and join with <code className="mono">/relay join</code>.{loginHref ? ' Then sign in here with Discord to open it.' : ' Browser sign-in is not configured on this backend yet.'}</>} art={<StartsInDiscord />}>
      {loginHref ? <a href={loginHref} className={buttonVariants()}>Sign in with Discord</a> : null}
      <Link href="/demo" className={buttonVariants({ variant: 'secondary' })}>Try a sample round</Link>
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
      {copy.action === 'signin' ? <SignInLink className={buttonVariants()} /> : null}
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
        {copy.action === 'signin' ? <SignInLink className="mt-1 block font-semibold underline underline-offset-4">Sign in with Discord again</SignInLink> : null}
        {error.status === 404 ? <Link href="/room" className="mt-1 block font-semibold underline underline-offset-4">Back to your rooms</Link> : null}
      </div>
      <button type="button" onClick={onDismiss} className="press -m-1 rounded-full px-2 py-1 font-semibold hover:bg-amber/10">Dismiss</button>
    </div>
  );
}

export function Loading({ label = 'Opening the room' }: { label?: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-8" role="status">
      <div className="h-[2px] w-full overflow-hidden rounded-full bg-line"><div className="h-full w-1/3 rounded-full bg-primary" /></div>
      <p className="text-muted">{label}…</p>
    </div>
  );
}
