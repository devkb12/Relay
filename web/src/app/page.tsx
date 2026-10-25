import Link from 'next/link';
import { ArrowRight, BookOpenCheck, CalendarClock, EyeOff, Flag, Gauge, MessageSquareText, Repeat2, ShieldCheck, Sparkles, Users } from 'lucide-react';
import discussion from '@/fixtures/discussion.json';
import { buttonVariants } from '@/components/ui/button';
import { RelayMark, Wordmark } from '@/components/graphics';
import { SiteNav } from '@/components/landing/site-nav';
import { HeroDevice } from '@/components/landing/hero-device';
import { TrackLoader } from '@/components/landing/track-loader';
import { RevealObserver } from '@/components/reveal-observer';

const invite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim() || null;

const STEPS = [
  { icon: CalendarClock, title: 'Schedule together', body: 'Everyone adds the windows they’re free. RELAY proposes one time and each person approves that exact version.' },
  { icon: EyeOff, title: 'Think privately', body: 'Answer alone first, with how sure you are. Nobody sees anyone else’s answer.' },
  { icon: MessageSquareText, title: 'Explain together', body: 'Peers explain to each other first. RELAY nudges with the reviewed source, not the majority.' },
  { icon: Repeat2, title: 'Test understanding', body: 'A different problem on the same idea, answered alone again. Then reflect on what happened.' },
];

const RULES = [
  { icon: Gauge, title: 'Confidence without ranking', body: 'You say how sure you are. A confident wrong answer starts a conversation about the reasoning, never a label on a person.' },
  { icon: Users, title: 'A peer-first quiet period', body: 'The group gets space to explain before RELAY offers anything. Anyone can pass. A source review is labeled as exactly that.' },
  { icon: Sparkles, title: 'A fresh application', body: 'After discussion you get a different scenario on the same idea and answer alone again. Not the first question with new numbers.' },
  { icon: Flag, title: 'Anyone can challenge an item', body: 'If a question or source looks wrong, anyone can pause it. The host reviews the source, then resumes or discards it. Nobody is marked wrong.' },
];

const WONT = ['Grade you or predict your grade', 'Claim you have mastered anything', 'Rank students in public', 'Let the AI overrule a reviewed answer', 'Send reminders unless you opt in', 'Read or write your calendar'];

const COMMANDS: [string, string][] = [
  ['/relay create', 'Start a session in this channel'],
  ['/relay join', 'Join the session in this channel'],
  ['/relay availability', 'Add a free window, privately'],
  ['/relay schedule', 'Host: propose a time everyone can make'],
  ['/relay question', 'Answer privately, or see your results'],
  ['/relay explain', 'Share an explanation with the group'],
  ['/relay hint', 'Host: a source-based prompt'],
  ['/relay challenge', 'Pause an item that looks wrong'],
  ['/relay next', 'Host: move to the next stage'],
];

const FAQ = [
  { q: 'What does RELAY store?', a: 'The session, the roster, your answers, confidence and optional reasoning, your availability windows and your reminder choice. It is kept to run the session and is not encrypted end to end. The backend’s cleanup job deletes sessions older than its retention period (30 days by default) whenever it runs.' },
  { q: 'Who sees my answers?', a: 'Only you, until the group reaches Reflect. Then you see your own results, and the group sees totals only when at least three people answered both questions. In a group this small, totals are not anonymous, so they stay simple: counts with their denominators.' },
  { q: 'What does the AI see?', a: 'If a live model is switched on at all, it gets the reviewed source, the question and how many people picked each option. No names, no reasoning you typed, no fresh or delayed questions. When no model is configured, RELAY uses a reviewed hint and says so.' },
  { q: 'Can I leave or delete a session?', a: 'Yes. Leaving removes your answers, reasoning, availability and pending reminders. The host can delete the whole session. Messages already posted in Discord stay where they are.' },
  { q: 'Is this the real thing or a demo?', a: 'The synthetic session on this site uses original teaching material and invented people. Real sessions run in your Discord server; this site opens them only when it is connected to a RELAY backend.' },
];

/** Illustrative group-chat lines (not data): scattered, then they settle into order on scroll. */
const CHAOS = [
  { text: 'anyone free thursday??', who: 'A', dx: '-18px', dy: '22px', r: '-6deg' },
  { text: 'i can do 7… wait no, 8', who: 'B', dx: '26px', dy: '-10px', r: '5deg' },
  { text: 'just send me the answers lol', who: 'C', dx: '-10px', dy: '-18px', r: '-3deg' },
  { text: 'wait why is it 75 and not 100?', who: 'D', dx: '22px', dy: '14px', r: '7deg' },
  { text: 'ok whoever gets it explain pls', who: 'A', dx: '-24px', dy: '6px', r: '-4deg' },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <RevealObserver />
      <SiteNav />

      <main className="flex flex-col">
        {/* ── Hero ── */}
        <section className="relative">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pt-16">
            <div className="flex flex-col items-start gap-7">
              <span className="rise rise-1 inline-flex items-center gap-2 rounded-full border border-line bg-card py-1 pr-3.5 pl-1 text-sm shadow-[var(--shadow-soft)]">
                <span className="bg-brand rounded-full px-2.5 py-0.5 text-xs font-bold text-white">New</span>
                An AI teammate for Discord study groups
              </span>
              <h1 className="rise rise-2 text-[3rem] leading-[1.02] tracking-[-0.02em] text-ink sm:text-[4.4rem] lg:text-[5rem]">
                Find the time.<br />
                Pass the <em className="text-brand pr-2 font-normal italic">understanding.</em>
              </h1>
              <p className="rise rise-3 measure text-lg text-muted sm:text-xl">
                RELAY finds when your study group can meet, then runs the session: everyone thinks privately, explains to each other, and tries a fresh problem to check what stuck.
              </p>
              <div className="rise rise-4 flex flex-wrap items-center gap-3">
                <Link href="/room" className={buttonVariants({ variant: 'dark', size: 'lg' })}>Open the study room<ArrowRight strokeWidth={1.75} /></Link>
                <Link href="/demo" className={buttonVariants({ variant: 'quiet', size: 'lg' })}>Walk through a synthetic session</Link>
                {invite ? <a href={invite} className={buttonVariants({ variant: 'secondary', size: 'lg' })} rel="noopener noreferrer">Add RELAY to Discord</a> : null}
              </div>
              <ul className="rise rise-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
                <li className="inline-flex items-center gap-2"><EyeOff className="size-4 text-ink" strokeWidth={1.75} />Answers stay private</li>
                <li className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-ink" strokeWidth={1.75} />No rankings, ever</li>
                <li className="inline-flex items-center gap-2"><BookOpenCheck className="size-4 text-ink" strokeWidth={1.75} />Checked against the source</li>
              </ul>
            </div>
            <div className="rise rise-3"><HeroDevice /></div>
          </div>
        </section>

        {/* ── The problem ── */}
        <section className="border-y border-line bg-card">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <div className="flex flex-col gap-5" data-reveal>
              <span className="eyebrow text-violet">Study groups today</span>
              <h2 className="text-4xl text-ink sm:text-5xl">A group chat is not a study session.</h2>
              <p className="measure text-lg text-muted">Times get lost in the scroll. The fastest person posts the answer, everyone nods, and three people leave thinking they understood it.</p>
              <p className="font-display text-2xl text-ink italic">RELAY turns the chat into a session with a shape.</p>
            </div>
            <div className="relative mx-auto flex w-full max-w-md flex-col gap-3" data-settle aria-label="Illustration: a messy study group chat">
              {CHAOS.map((m, i) => (
                <div key={i} style={{ ['--dx' as string]: m.dx, ['--dy' as string]: m.dy, ['--r' as string]: m.r }}
                  className={`flex items-end gap-2.5 ${i % 2 ? 'flex-row-reverse self-end' : 'self-start'}`}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white" aria-hidden>{m.who}</span>
                  <p className={`rounded-[18px] px-4 py-2.5 text-[0.95rem] shadow-[var(--shadow-soft)] ${i % 2 ? 'rounded-br-md bg-blue text-white' : 'rounded-bl-md border border-line bg-paper text-text'}`}>{m.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-24 sm:px-6">
          <div className="flex max-w-3xl flex-col gap-4" data-reveal>
            <span className="eyebrow text-violet">How it works</span>
            <h2 className="text-4xl text-ink sm:text-5xl">Four stations. One baton. <em className="text-brand pr-1 italic">Everyone</em> runs.</h2>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card group flex flex-col gap-3 p-6 transition-shadow duration-200 hover:shadow-[var(--shadow-float)]" data-reveal style={{ transitionDelay: `${i * 70}ms` }}>
                <div className="flex items-center justify-between">
                  <span className="bg-brand-soft grid size-11 place-items-center rounded-[14px] text-ink"><s.icon className="size-5" strokeWidth={1.75} /></span>
                  <span className="mono text-brand text-2xl font-semibold">0{i + 1}</span>
                </div>
                <h3 className="text-2xl text-ink">{s.title}</h3>
                <p className="text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <div id="track" className="card-float flex flex-col gap-6 p-5 sm:p-8" data-reveal>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="eyebrow">The track</span>
                <h3 className="mt-1 text-3xl text-ink">Pick a station to see the real screen.</h3>
              </div>
              <p className="max-w-sm text-sm text-muted">Every screen here is a captured response from a synthetic session. Station three is the signature moment.</p>
            </div>
            <TrackLoader />
          </div>
        </section>

        {/* ── The signature moment ── */}
        <section id="moment" className="on-ink relative overflow-hidden bg-ink text-on-ink">
          <div aria-hidden className="bg-brand absolute -top-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full opacity-25 blur-3xl" />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-28 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="flex flex-col gap-6" data-reveal>
              <span className="eyebrow text-gold">The signature moment</span>
              <h2 className="text-5xl leading-[1.05] text-white sm:text-6xl">Everyone agreed.<br /><em className="text-brand italic">Everyone was wrong.</em></h2>
              <p className="measure text-lg text-on-ink-muted">When the whole group lands on the same confident answer, a chat moves on. RELAY doesn’t take the majority’s word for it: it checks the reviewed source and turns the moment into a peer explanation.</p>
            </div>
            <div className="flex flex-col gap-4" data-reveal>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.06] p-6">
                <div className="flex items-center gap-2 text-sm text-on-ink-muted"><RelayMark className="size-7" />RELAY · <span className="mono">{discussion.hint!.mode}</span></div>
                <p className="mt-4 text-xl font-semibold text-white">{discussion.discussion_signal}</p>
                <p className="mt-2 font-display text-2xl leading-snug text-white">{discussion.hint!.discussion_question}</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-6">
                <span className="mono text-xs text-on-ink-muted">{discussion.source!.source_id}</span>
                <p className="mt-1 font-display text-lg text-white">{discussion.source!.source_title}</p>
                <p className="mt-2 text-sm leading-relaxed text-on-ink-muted">{discussion.source!.source_text}</p>
              </div>
              <p className="text-xs text-on-ink-muted">From the synthetic session. Original teaching material.</p>
            </div>
          </div>
        </section>

        {/* ── Rules ── */}
        <section id="rules" className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-24 sm:px-6">
          <div className="flex max-w-3xl flex-col gap-4" data-reveal>
            <span className="eyebrow text-violet">Rules of the room</span>
            <h2 className="text-4xl text-ink sm:text-5xl">Safe enough to be wrong in front of three friends.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {RULES.map((r, i) => (
              <article key={r.title} className="card flex gap-5 p-7" data-reveal style={{ transitionDelay: `${(i % 2) * 80}ms` }}>
                <span className="bg-brand grid size-12 shrink-0 place-items-center rounded-[16px] text-white shadow-[0_10px_24px_-12px_rgba(58,91,255,0.8)]"><r.icon className="size-5" strokeWidth={1.75} /></span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-2xl text-ink">{r.title}</h3>
                  <p className="text-muted">{r.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Won't do + Discord ── */}
        <section id="discord" className="border-y border-line bg-card">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <div className="flex flex-col gap-6" data-reveal>
              <span className="eyebrow text-violet">What RELAY won’t do</span>
              <h2 className="text-4xl text-ink">Honest by design.</h2>
              <ul className="grid gap-3">
                {WONT.map((w) => (
                  <li key={w} className="flex items-center gap-3 rounded-[14px] border border-line px-4 py-3">
                    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-paper text-sm font-bold text-ink">×</span>{w}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-6" data-reveal>
              <span className="eyebrow text-violet">In Discord</span>
              <h2 className="text-4xl text-ink">Runs where your group already talks.</h2>
              <div className="overflow-hidden rounded-[22px] bg-ink-deep text-on-ink shadow-[var(--shadow-float)]">
                <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3 text-sm text-on-ink-muted">
                  <span className="mono text-on-ink">/relay</span><span>slash commands</span>
                </div>
                <dl className="divide-y divide-white/[0.07]">
                  {COMMANDS.map(([c, d]) => (
                    <div key={c} className="flex flex-col gap-0.5 px-5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                      <dt className="mono w-44 shrink-0 text-sm font-semibold text-white">{c}</dt>
                      <dd className="text-sm text-on-ink-muted">{d}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <p className="text-sm text-muted">The bot runs the session in your server. This site is the companion study room, scheduler and debrief.</p>
              {invite ? <a href={invite} className={buttonVariants({ variant: 'dark', className: 'w-fit' })} rel="noopener noreferrer">Add RELAY to Discord</a> : null}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-24 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col gap-4" data-reveal>
            <span className="eyebrow text-violet">Questions</span>
            <h2 className="text-4xl text-ink">What a careful student would ask.</h2>
          </div>
          <div className="flex flex-col divide-y divide-line border-y border-line" data-reveal>
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-display text-xl text-ink [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-lg text-muted transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="measure mt-3 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="ring-brand relative mx-auto flex w-full max-w-6xl flex-col items-start gap-6 overflow-hidden rounded-[32px] bg-card p-8 shadow-[var(--shadow-float)] sm:p-14" data-reveal>
            <div aria-hidden className="bg-brand-soft absolute -right-20 -bottom-24 size-80 rounded-full blur-2xl" />
            <h2 className="relative max-w-2xl text-4xl text-ink sm:text-5xl">Bring RELAY to your next study session.</h2>
            <p className="relative measure text-lg text-muted">Walk through a full synthetic session in two minutes, or open a study room.</p>
            <div className="relative flex flex-wrap gap-3">
              <Link href="/demo" className={buttonVariants({ variant: 'dark', size: 'lg' })}>Walk through the demo<ArrowRight strokeWidth={1.75} /></Link>
              <Link href="/room" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>Open the study room</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-2">
            <Wordmark />
            <span className="text-sm text-muted">Find the time. Pass the understanding. · DEVHACKS Track 3</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            <a href="#how" className="hover:text-text">How it works</a>
            <a href="#rules" className="hover:text-text">Rules</a>
            <a href="#faq" className="hover:text-text">FAQ</a>
            <Link href="/demo" className="hover:text-text">Synthetic demo</Link>
            <Link href="/room" className="hover:text-text">Study room</Link>
          </nav>
        </div>
        <p className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-muted sm:px-6">Synthetic demo content is original teaching material, not real students.</p>
      </footer>
    </div>
  );
}
