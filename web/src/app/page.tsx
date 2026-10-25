import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { HeroTrack, Wordmark } from '@/components/graphics';
import { TrackLoader } from '@/components/landing/track-loader';

const invite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim() || null;

const RULES = [
  { title: 'Confidence without ranking', body: 'You say how sure you are. A confident wrong answer starts a conversation about the reasoning, never a label on a person. Nobody sees a leaderboard.' },
  { title: 'A peer-first quiet period', body: 'Before RELAY offers anything, the group gets space to explain to each other. Anyone can pass. If nobody volunteers, the host records a source review, and it is labeled as exactly that.' },
  { title: 'A fresh application', body: 'After discussion you get a different scenario on the same idea and answer alone again. Not the first question with new numbers.' },
  { title: 'Anyone can challenge an item', body: 'If a question or source looks wrong, anyone can pause it. The host reviews the source and either resumes it or discards it. A discarded item marks nobody wrong.' },
];

const WONT = [
  'Grade you or predict your grade',
  'Claim you have mastered anything',
  'Rank students in public',
  'Let the AI overrule a reviewed answer',
  'Send reminders unless you opt in',
  'Read or write your calendar',
];

const COMMANDS: [string, string][] = [
  ['/relay create', 'Start a session in this channel (you become the host)'],
  ['/relay join', 'Join the session in this channel'],
  ['/relay availability', 'Add one free window, privately'],
  ['/relay schedule', 'Host: propose a time everyone can make'],
  ['/relay next', 'Host: move the group to the next stage'],
  ['/relay question', 'See your question and answer privately, or your results'],
  ['/relay explain', 'Share an explanation with the group'],
  ['/relay hint', 'Host: ask RELAY for a source-based prompt'],
  ['/relay source', 'Read the reviewed source during discussion'],
  ['/relay challenge', 'Pause an item that looks wrong'],
  ['/relay review · /relay resolve', 'Host: check the source, then resume or discard'],
  ['/relay reminders', 'Turn private reminders on or off'],
  ['/relay status', 'Update the group card in the channel'],
  ['/relay leave · /relay delete', 'Leave a session · host deletes it'],
];

const FAQ = [
  { q: 'What does RELAY store?', a: 'The session, the roster, your answers, confidence and optional reasoning, your availability windows and your reminder choice. It is kept to run the session and is not encrypted end to end. The backend’s cleanup job deletes sessions older than its retention period (30 days by default) whenever it runs.' },
  { q: 'Who sees my answers?', a: 'Only you, until the group reaches Reflect. Then you see your own results, and the group sees totals only when at least three people answered both questions. In a group this small, totals are not anonymous, so they stay simple: counts with their denominators.' },
  { q: 'What does the AI see?', a: 'If a live model is switched on at all, it gets the reviewed source, the question and how many people picked each option. No names, no reasoning you typed, no fresh or delayed questions. When no model is configured, RELAY uses a reviewed hint and says so.' },
  { q: 'Can I leave or delete a session?', a: 'Yes. Leaving removes your answers, reasoning, availability and pending reminders. The host can delete the whole session. Messages already posted in Discord stay where they are.' },
  { q: 'Is this the real thing or a demo?', a: 'The synthetic session on this site uses original teaching material and invented people. Real sessions run in your Discord server; this site opens them only when it is connected to a RELAY backend.' },
];

function Glyph({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 40 16" className="h-4 w-10 shrink-0 text-ink" aria-hidden>
      <path d="M2 8h36" stroke="var(--color-line-strong)" strokeWidth={2} strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={5 + i * 10} cy={8} r={3} fill={i < n ? 'currentColor' : 'var(--color-card)'} stroke="currentColor" strokeWidth={1.5} />)}
    </svg>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" aria-label="RELAY home"><Wordmark /></Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          <a href="#track" className="hidden rounded-full px-3 py-2 hover:bg-text/5 sm:inline">How it works</a>
          <a href="#questions" className="hidden rounded-full px-3 py-2 hover:bg-text/5 sm:inline">Questions</a>
          <Link href="/room" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Study room</Link>
        </nav>
      </header>

      <main className="flex flex-col">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pt-12">
          <div className="flex flex-col items-start gap-6">
            <span className="eyebrow">An AI teammate for study groups, in Discord</span>
            <h1 className="text-[2.6rem] leading-[1.08] sm:text-6xl">Find the time.<br />Pass the understanding.</h1>
            <p className="measure text-lg text-muted">RELAY finds when your study group can meet, then runs the session: everyone thinks privately, explains to each other, and tries a fresh problem to check what stuck.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/room" className={buttonVariants({ size: 'lg' })}>Open the study room<ArrowRight strokeWidth={1.75} /></Link>
              <Link href="/demo" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>Walk through a synthetic session</Link>
              {invite ? <a href={invite} className={buttonVariants({ variant: 'quiet', size: 'lg' })} rel="noopener noreferrer">Add RELAY to Discord</a> : null}
            </div>
            <ul className="grid gap-2 text-sm text-muted sm:grid-cols-2">
              <li><strong className="text-text">The time problem.</strong> Groups can’t find a slot that works for everyone.</li>
              <li><strong className="text-text">The understanding problem.</strong> People leave thinking they get it because someone else explained the answer.</li>
            </ul>
          </div>
          <div className="mx-auto w-full max-w-md lg:max-w-none"><HeroTrack /></div>
        </section>

        <section id="track" className="border-y border-line bg-card/60">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-16 sm:px-6">
            <div className="flex flex-col gap-3">
              <span className="eyebrow">The track</span>
              <h2 className="text-4xl sm:text-5xl">Schedule together. Think privately. Explain together. Test understanding.</h2>
              <p className="measure text-muted">Pick a station to see the real screen for that stage, rendered from a captured synthetic session. The signature moment is station three: everyone agreed, and everyone was wrong.</p>
            </div>
            <TrackLoader />
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <span className="eyebrow">Rules of the room</span>
            <ol className="flex flex-col gap-6">
              {RULES.map((r, i) => (
                <li key={r.title} className="flex gap-4">
                  <span className="mono w-6 shrink-0 pt-1 text-lg text-muted">{i + 1}</span>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-3"><Glyph n={i + 1} /><h3 className="text-2xl">{r.title}</h3></span>
                    <p className="measure text-muted">{r.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-4">
              <span className="eyebrow">What RELAY won’t do</span>
              <ul className="grid gap-2">
                {WONT.map((w) => <li key={w} className="flex items-start gap-3 border-b border-line pb-2"><span aria-hidden className="mt-2.5 h-[2px] w-4 shrink-0 rounded-full bg-ink" />{w}</li>)}
              </ul>
            </div>
            <div className="flex flex-col gap-4">
              <span className="eyebrow">In Discord</span>
              <p className="text-muted">The bot runs the session in your server. This site is the companion study room, scheduler and debrief.</p>
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                {COMMANDS.map(([c, d]) => (
                  <div key={c} className="contents">
                    <dt className="mono font-semibold whitespace-nowrap">{c}</dt>
                    <dd className="text-muted">{d}</dd>
                  </div>
                ))}
              </dl>
              {invite ? <a href={invite} className={buttonVariants({ variant: 'secondary', className: 'w-fit' })} rel="noopener noreferrer">Add RELAY to Discord</a> : null}
            </div>
          </div>
        </section>

        <section id="questions" className="border-t border-line">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6">
            <span className="eyebrow">Questions a careful student would ask</span>
            <div className="flex flex-col divide-y divide-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-display text-xl">
                    {f.q}
                    <span aria-hidden className="mono text-muted transition-transform duration-200 group-open:rotate-45">+</span>
                  </summary>
                  <p className="measure mt-2 text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span>RELAY · DEVHACKS Track 3 group chat assistant</span>
          <span>Synthetic demo content is original teaching material, not real students.</span>
        </div>
      </footer>
    </div>
  );
}
