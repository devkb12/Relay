'use client';

/**
 * The twelve scenes of the RELAY product film. Each is a pure function of `t` (seconds into the
 * scene). Web screens use RELAY's real components (Track, Roster, FacilitatorNote, ExplanationFeed,
 * ReceiptCard) fed by the real sample engine, so what the film shows is what RELAY produces. The
 * study server is a recreation of a Discord server for illustration; the group is fictional.
 */
import { Check, EyeOff, Flag, Lock, MessageSquareText } from 'lucide-react';
import pack from '@/fixtures/sample-pack.json';
import { SampleEngine, freshState } from '@/lib/sample';
import type { SessionView, Stage } from '@/lib/schemas';
import { STAGE_LABEL } from '@/lib/stages';
import { RelayMark, Wordmark } from '@/components/graphics';
import { Track, TrackLabels } from '@/components/track';
import { Roster } from '@/components/roster';
import { FacilitatorNote, ExplanationFeed } from '@/components/room/discussion-card';
import { ReceiptCard } from '@/components/debrief/receipt';
import { cn } from '@/lib/utils';
import { BrowserWindow, Caption, Chapter, ChatShell, Cursor, Embed, Ephemeral, Msg, SlashPopup, SystemLine, camera, easeInOut as easeInOutP, enter, pop, prog, rise, typed } from './kit';

/* Real views, computed once by the sample engine (the same rules the backend enforces). */
function computeViews() {
  const e = new SampleEngine(freshState(), () => pack.now);
  const diag = (e.advance('lobby'), e.view());
  for (const p of e.pendingPeers()) e.peer(p.name);
  e.answer({ question_id: 'sample-d1', choice: 'A', confidence: 'confident', rationale: '' });
  e.advance('diagnostic');
  const discussion = e.view();
  for (const p of e.pendingPeers()) e.peer(p.name);
  const explained = e.view();
  e.advance('discussion');
  const transfer = e.view();
  for (const p of e.pendingPeers()) e.peer(p.name);
  e.answer({ question_id: 'sample-t1', choice: 'C', confidence: 'somewhat', rationale: '' });
  e.advance('transfer');
  return { diag, discussion, explained, transfer, debrief: e.view() };
}
const V = computeViews();
const D = pack.concept.diagnostic, F = pack.concept.transfer;
const ROOM = 'k3P9xQ2m';
const WEB_URL = `relay-two-lovat.vercel.app/room/${ROOM}`;

type M = SessionView['members'][number];
const member = (name: string, state: M['state']): M => ({ name, state, responded: state === 'responded', is_me: name === 'Alex', is_host: name === 'Alex' });
const group = (states: Record<string, M['state']>) => ['Alex', 'Ari', 'Bea', 'Cy'].map((n) => member(n, states[n] ?? 'present'));

export type SceneProps = { t: number; d: number };

/* ── Frames ──────────────────────────────────────────────────────────────────────────────── */

function Backdrop({ dark = false }: { dark?: boolean }) {
  return (
    <div className={cn('absolute inset-0', dark ? 'bg-ink' : 'bg-[#e9e5f3]')}>
      <div className="bg-brand absolute -top-40 left-1/2 h-[30rem] w-[70rem] -translate-x-1/2 rounded-full blur-3xl" style={{ opacity: dark ? 0.32 : 0.22 }} />
      <div className="absolute inset-0" style={{ background: dark ? 'radial-gradient(ellipse at 50% 120%, rgba(226,106,79,.18), transparent 60%)' : 'radial-gradient(ellipse at 50% 120%, rgba(91,67,214,.16), transparent 60%)' }} />
    </div>
  );
}

/** The browser window, placed consistently in every product scene. */
function Screen({ t, tab, url, cam, children, cursor }: { t: number; tab: 0 | 1; url: string; cam?: Parameters<typeof camera>[1]; children: React.ReactNode; cursor?: React.ReactNode }) {
  return (
    <>
      <Backdrop />
      <div className="absolute inset-0" style={cam ? camera(t, cam) : undefined}>
        <BrowserWindow tab={tab} url={url} className="absolute top-[64px] left-[60px] h-[620px] w-[1160px]">{children}</BrowserWindow>
        {cursor}
      </div>
    </>
  );
}

/** The RELAY web room, laid out like the real one (task first), rendered at 0.8 scale. */
function WebRoom({ stage, paused, members, children, aside, scroll = 0 }: { stage: Stage; paused?: boolean; members: M[]; children: React.ReactNode; aside?: React.ReactNode; scroll?: number }) {
  return (
    <div className="absolute top-0 left-0 flex flex-col bg-paper text-text" style={{ width: 1450, height: 670, transform: 'scale(0.8)', transformOrigin: '0 0' }}>
      <div className="on-ink relative z-10 flex h-14 shrink-0 items-center justify-between bg-ink px-8 text-on-ink">
        <span aria-hidden className="bg-brand absolute inset-x-0 top-0 h-[3px]" />
        <div className="flex items-center gap-4"><Wordmark tone="paper" /><span className="border-l border-white/20 pl-4 text-sm text-on-ink-muted">A practice room, not a performance.</span></div>
        <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-card px-3 py-1 text-xs font-semibold text-text"><span className="size-1.5 rounded-full bg-green" />Signed in as Alex</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden"><div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 pt-5 pb-10" style={{ transform: `translateY(${-scroll}px)` }}>
        <div className="flex items-baseline justify-between"><h1 className="text-[1.85rem]">{pack.concept.title}</h1><p className="text-sm text-muted"><span className="font-semibold text-text">{STAGE_LABEL[stage]}</span> · room <span className="mono text-text">{ROOM}</span></p></div>
        <div className="card px-6 pt-3 pb-2"><Track stage={stage} paused={paused} /><TrackLabels stage={stage} labels={STAGE_LABEL} /></div>
        <div className="grid grid-cols-[minmax(0,1fr)_19rem] items-start gap-5">
          <div className="flex min-w-0 flex-col gap-4">{children}</div>
          <div className="flex flex-col gap-4">
            <section className="card p-5"><span className="eyebrow">Your group</span><h2 className="mt-2 font-sans text-base font-bold">4 people, one idea</h2><div className="mt-3"><Roster members={members} layout="list" /></div></section>
            {aside}
          </div>
        </div>
      </div></div>
    </div>
  );
}

function Card({ children, footer, dim }: { children: React.ReactNode; footer?: React.ReactNode; dim?: boolean }) {
  return (
    <section className={cn('card overflow-hidden shadow-[var(--shadow-soft)] transition-opacity', dim && 'opacity-45')}>
      <div className="p-7">{children}</div>
      {footer ? <div className="border-t border-line bg-paper/60 px-7 py-4">{footer}</div> : null}
    </section>
  );
}

/** The private attempt, driven by time: choose, rate confidence, lock. */
type Item = { prompt: string; options: Record<string, string> };
function Attempt({ t, item, eyebrow, pick, conf, at }: { t: number; item: Item; eyebrow: string; pick: string; conf: string; at: [number, number, number] }) {
  const [tPick, tConf, tLock] = at;
  const locked = t >= tLock + 0.3;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between"><span className="eyebrow">{eyebrow}</span><span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold"><EyeOff className="size-3.5" strokeWidth={1.75} />Only you can see this</span></div>
      <h2 className="text-[1.6rem] leading-snug">{item.prompt}</h2>
      {locked ? (
        <div className="flex items-start gap-3 rounded-[12px] border border-green/30 bg-green-tint px-4 py-3 text-green" style={rise(t, tLock + 0.3, 8)}>
          <Lock className="mt-0.5 size-5" strokeWidth={1.75} /><div><strong className="block">Answer locked</strong><span className="text-sm text-text">You chose <span className="mono font-semibold">{pick}</span> · {item.options[pick]} · {conf}</span></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(item.options).map(([k, v]) => {
              const on = k === pick && t >= tPick;
              return (
                <div key={k} className={cn('flex min-h-12 items-center gap-3 rounded-[12px] border px-4 py-3 transition-colors duration-150', on ? 'border-primary bg-primary-tint' : 'border-line bg-card')}>
                  <span className={cn('grid size-5 place-items-center rounded-full border-2', on ? 'border-primary' : 'border-control')}>{on ? <span className="size-2.5 rounded-full bg-primary" /> : null}</span>
                  <span className="mono font-semibold">{k}</span>{v}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['Unsure', 'Somewhat sure', 'Confident'].map((c) => (
              <div key={c} className={cn('flex min-h-11 items-center gap-3 rounded-[12px] border px-4 transition-colors duration-150', c === conf && t >= tConf ? 'border-primary bg-primary-tint' : 'border-line bg-card')}>
                <span className={cn('grid size-5 place-items-center rounded-full border-2', c === conf && t >= tConf ? 'border-primary' : 'border-control')}>{c === conf && t >= tConf ? <span className="size-2.5 rounded-full bg-primary" /> : null}</span>{c}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className={cn('inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold text-white transition-all', t >= tConf ? 'bg-primary' : 'bg-primary/50', t >= tLock && 'scale-[0.97]')}><Lock className="size-[18px]" strokeWidth={1.75} />Lock my answer</span>
            <span className="text-sm text-muted">{t < tPick ? 'Choose an answer or skip.' : t < tConf ? 'Choose how sure you are.' : 'Once locked it cannot be changed.'}</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Scenes ──────────────────────────────────────────────────────────────────────────────── */

function Intro({ t }: SceneProps) {
  const m = enter(t, 0.2, 0.9);
  return (
    <>
      <Backdrop dark />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 text-center">
        <div style={{ opacity: m, transform: `scale(${0.6 + 0.4 * m}) rotate(${(1 - m) * -12}deg)` }}><RelayMark className="size-32" /></div>
        <div className="font-sans text-[64px] leading-none font-extrabold tracking-[-0.03em] text-white" style={rise(t, 0.9, 20, 0.6)}>Relay</div>
        <h1 className="text-[46px] text-white" style={rise(t, 1.9, 18, 0.6)}>Don’t just agree. <em className="text-brand pr-2 italic">Understand.</em></h1>
        <p className="text-[18px] text-on-ink-muted" style={rise(t, 3.0, 12)}>A study-group assistant for Discord</p>
      </div>
    </>
  );
}

function Problem({ t }: SceneProps) {
  const lines: [string, string][] = [['Ari', 'anyone free thursday??'], ['Bea', 'i can do 7… wait no, 8'], ['Cy', 'just send me the answers lol'], ['Alex', 'ok so it’s 80 right? up 25% then down 25%'], ['Bea', 'yeah 80 👍']];
  const o = enter(t, 5.4, 0.6);
  return (
    <Screen t={t} tab={0} url="chat.example/channels/stat-201/study-room" cam={[{ t: 0, s: 1, x: 0, y: 0 }, { t: 4.5, s: 1.08, x: -60, y: -40 }]}>
      <ChatShell members={['Alex', 'Ari', 'Bea', 'Cy']}>
        {lines.map(([n, x], i) => <Msg key={i} name={n} time={`Today at 6:${41 + i} PM`} style={pop(t, 0.6 + i * 0.8)}>{x}</Msg>)}
      </ChatShell>
      <div className="absolute inset-0 grid place-items-center bg-ink/70 backdrop-blur-[2px]" style={{ opacity: o }}>
        <div className="text-center text-white" style={rise(t, 5.6, 16)}>
          <p className="font-display text-[44px] leading-tight">“It makes sense”</p>
          <p className="font-display text-[44px] leading-tight">is not <em className="text-brand italic">“I can apply it.”</em></p>
        </div>
      </div>
    </Screen>
  );
}

function Install({ t }: SceneProps) {
  const cmd = t < 2.5 ? typed(t, '/relay', 1.0, 1.8) : '/relay create  concept: Changing percentages';
  const sent = t >= 4.2;
  return (
    <Screen t={t} tab={0} url="chat.example/channels/stat-201/study-room"
      cam={[{ t: 0, s: 1, x: 0, y: 0 }, { t: 1.0, s: 1.18, x: -230, y: -150 }, { t: 4.6, s: 1.18, x: -230, y: -150 }, { t: 6.4, s: 1.05, x: -60, y: -30 }]}
      cursor={<Cursor t={t} path={[{ t: 1.9, x: 700, y: 640 }, { t: 2.4, x: 560, y: 538, click: true }, { t: 3.6, x: 700, y: 640 }, { t: 4.2, x: 760, y: 645, click: true }]} />}>
      <ChatShell composer={sent ? undefined : t >= 1.0 ? cmd : undefined} popup={t >= 1.6 && t < 2.6 ? <SlashPopup t={t - 1.6} /> : null} members={['Alex', 'Ari', 'Bea', 'Cy', ...(t >= 0.6 ? ['RELAY'] : [])]}>
        <SystemLine style={rise(t, 0.6)}><strong className="text-white">Alex</strong> added <strong className="text-[#c9bfff]">RELAY</strong> to the server.</SystemLine>
        {sent ? (
          <Msg name="RELAY" style={pop(t, 5.4)}>
            <Ephemeral>Created. You are the host. Participants use <code className="rounded bg-black/30 px-1">/relay join</code>. Web room: <span className="text-[#00a8fc] underline">{WEB_URL}</span></Ephemeral>
            <div style={rise(t, 6.0, 10)}><Embed title="RELAY / Changing percentages" fields={[['Stage', 'Lobby'], ['Participants', '1']]} note="Original demo teaching material. Private inputs are processed by the RELAY service." /></div>
          </Msg>
        ) : null}
      </ChatShell>
    </Screen>
  );
}

function Team({ t }: SceneProps) {
  const joined = ['Ari', 'Bea', 'Cy'].filter((_, i) => t >= 1.0 + i);
  const approvals = Math.min(4, Math.max(0, Math.floor((t - 6.5) / 0.6) + 1));
  return (
    <Screen t={t} tab={0} url="chat.example/channels/stat-201/study-room" cam={[{ t: 0, s: 1.05, x: -60, y: -30 }, { t: 5, s: 1.05, x: -60, y: -30 }, { t: 7, s: 1.16, x: -210, y: -150 }]}
      cursor={<Cursor t={t} path={[{ t: 5.8, x: 900, y: 600 }, { t: 6.5, x: 470, y: 600, click: true }, { t: 7.6, x: 520, y: 640 }]} />}>
      <ChatShell members={['Alex', ...joined, 'RELAY']}>
        {joined.map((n, i) => <SystemLine key={n} style={rise(t, 1.0 + i)}><strong className="text-white">{n}</strong> used <code className="rounded bg-black/30 px-1">/relay join</code></SystemLine>)}
        <Msg name="RELAY" time="Today at 7:04 PM">
          <Embed title="RELAY / Changing percentages" fields={[['Stage', 'Lobby'], ['Participants', String(1 + joined.length)]]} />
          {t >= 4.6 ? (
            <div style={rise(t, 4.6, 10)}>
              <Embed title="Schedule proposal v3" accent="#116b60">
                <p className="mt-2 text-[14px]">Thu, Oct 30 · 7:00 PM for 60 min · everyone added free windows privately</p>
                <p className="mt-1 text-[14px]"><span className="mono">{approvals}/4</span> approved{approvals === 4 ? ' · ' : ''}{approvals === 4 ? <strong className="text-[#57f287]">everyone approved this exact version</strong> : null}</p>
                <div className="mt-2 flex gap-2"><span className={cn('rounded-[4px] px-4 py-1.5 text-[14px] font-semibold text-white', approvals ? 'bg-[#248046]' : 'bg-[#248046]/80')}>{approvals ? '✓ Approved v3' : 'Approve v3'}</span><span className="rounded-[4px] bg-[#4e5058] px-4 py-1.5 text-[14px] text-white">Add .ics file</span></div>
              </Embed>
            </div>
          ) : null}
        </Msg>
      </ChatShell>
    </Screen>
  );
}

function SignIn({ t }: SceneProps) {
  const web = t >= 2.7;
  const consent = t >= 4.6 && t < 6.2;
  const inRoom = t >= 6.2;
  return (
    <Screen t={t} tab={web ? 1 : 0} url={web ? (consent ? 'discord.com/oauth2/authorize · scope: identify' : WEB_URL) : 'chat.example/channels/stat-201/study-room'}
      cursor={<Cursor t={t} path={[{ t: 0.8, x: 900, y: 560 }, { t: 2.2, x: 548, y: 545, click: true }, { t: 3.6, x: 640, y: 420 }, { t: 4.4, x: 640, y: 452, click: true }, { t: 5.2, x: 760, y: 500 }, { t: 5.6, x: 700, y: 498, click: true }]} />}>
      {!web ? (
        <ChatShell members={['Alex', 'Ari', 'Bea', 'Cy', 'RELAY']}>
          <Msg name="RELAY" time="Today at 7:05 PM">
            <Embed title="RELAY / Changing percentages" fields={[['Stage', 'Lobby'], ['Participants', '4'], ['Schedule', 'v3 · 4/4 approved']]}>
              <div className="mt-2"><div className="text-[13px] font-bold text-white">On the web</div><div className="text-[13.5px]"><span className={cn('text-[#00a8fc] underline', t >= 1.4 && 'rounded bg-[#00a8fc]/15')}>Open this session</span> and sign in with Discord. Only members of this session can open it.</div></div>
            </Embed>
          </Msg>
        </ChatShell>
      ) : inRoom ? (
        <WebRoom stage="lobby" members={group({})}>
          <Card footer={<span className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-semibold text-white">Start: think privately →</span>}>
            <span className="eyebrow">Gather</span><h2 className="mt-3 text-3xl" style={rise(t, 6.3)}>You and 3 others are here.</h2>
            <p className="measure mt-3 text-muted">Everyone answers privately first, explains together, then tries a fresh problem alone. Nothing is ranked.</p>
          </Card>
        </WebRoom>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-paper">
          <section className="card flex w-[460px] flex-col items-start gap-4 p-8" style={rise(t, 2.8)}>
            <h2 className="text-2xl">Sign in to continue</h2>
            <p className="text-muted">This room is for members of the session. RELAY uses Discord to check who you are.</p>
            <span className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-semibold text-white">Sign in with Discord</span>
          </section>
          {consent ? (
            <div className="absolute inset-0 grid place-items-center bg-ink/55" style={{ opacity: enter(t, 4.6, 0.3) }}>
              <div className="w-[420px] rounded-[16px] bg-[#313338] p-6 text-[#dbdee1]" style={rise(t, 4.6, 12)}>
                <p className="text-[13px] text-[#b5bac1]">Discord asks you to approve</p>
                <p className="mt-1 text-[19px] font-bold text-white">RELAY wants to know who you are</p>
                <ul className="mt-3 text-[14px]"><li>✓ Your username and avatar (scope: <span className="mono">identify</span>)</li><li className="text-[#949ba4]">✕ Not your messages, servers or email</li></ul>
                <div className="mt-5 flex justify-end gap-2"><span className="rounded-[4px] px-4 py-2 text-[14px]">Cancel</span><span className="rounded-[4px] bg-[#5b43d6] px-4 py-2 text-[14px] font-semibold text-white">Authorize</span></div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Screen>
  );
}

function Think({ t }: SceneProps) {
  const states = { Ari: t >= 1.5 ? 'responded' : 'waiting', Bea: t >= 2.5 ? 'responded' : 'waiting', Alex: t >= 6.4 ? 'responded' : 'waiting', Cy: t >= 7.6 ? 'responded' : 'waiting' } as Record<string, M['state']>;
  const waiting = Object.values(states).filter((s) => s === 'waiting').length;
  return (
    <Screen t={t} tab={1} url={WEB_URL} cam={[{ t: 0, s: 1, x: 0, y: 0 }, { t: 2.2, s: 1.08, x: -50, y: -40 }, { t: 7, s: 1.08, x: -50, y: -40 }, { t: 9, s: 1, x: 0, y: 0 }]}
      cursor={<Cursor t={t} path={[{ t: 2.2, x: 700, y: 560 }, { t: 3.0, x: 300, y: 476, click: true }, { t: 4.2, x: 690, y: 532, click: true }, { t: 5.4, x: 236, y: 574, click: true }, { t: 6.6, x: 420, y: 640 }]} />}>
      <WebRoom stage="diagnostic" members={group(states)}>
        <Card footer={<p className="text-sm text-muted">{waiting ? <><span className="font-semibold text-text">Waiting for {waiting} more {waiting === 1 ? 'answer' : 'answers'}.</span> The host moves the group forward when everyone has answered.</> : <span className="font-semibold text-green">Everyone has answered. The host can open the discussion.</span>}</p>}>
          <Attempt t={t} item={D} eyebrow="First question · think on your own" pick="A" conf="Confident" at={[3.0, 4.2, 5.4]} />
        </Card>
      </WebRoom>
    </Screen>
  );
}

function Moment({ t }: SceneProps) {
  const title = enter(t, 0.8, 0.5) * (1 - prog(t, 5.2, 5.8));
  return (
    <Screen t={t} tab={1} url={WEB_URL} cam={[{ t: 5.4, s: 1, x: 0, y: 0 }, { t: 7.5, s: 1.08, x: -50, y: -40 }]}>
      <WebRoom stage="discussion" members={group({})}>
        <Card>
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between"><span className="eyebrow">Explain together · peer first</span><span className="text-xs text-muted">Nobody has to speak. Nobody is ranked.</span></div>
            <h2 className="text-3xl" style={rise(t, 5.8)}>{V.discussion.discussion_signal}</h2>
            <div className={cn('rounded-[18px] transition-shadow', t >= 7 && 'ring-4 ring-primary/25')}><FacilitatorNote hint={V.discussion.hint!} /></div>
          </div>
        </Card>
      </WebRoom>
      <div className="absolute inset-0 grid place-items-center bg-ink/80" style={{ opacity: title }}>
        <div className="text-center text-white">
          <p className="text-[24px] text-on-ink-muted" style={rise(t, 1.0, 10)}>Three confident answers. All the same: 80.</p>
          <p className="mt-3 font-display text-[68px] leading-none" style={rise(t, 1.6, 18, 0.6)}>They agreed.</p>
          <p className="font-display text-[68px] leading-tight" style={rise(t, 2.8, 18, 0.6)}><em className="text-brand italic">They were wrong.</em></p>
          <p className="mt-5 text-[18px] text-on-ink-muted" style={rise(t, 4.0, 10)}>RELAY checks the reviewed source, not the majority.</p>
        </div>
      </div>
    </Screen>
  );
}

function Explain({ t }: SceneProps) {
  const feed = t >= 4.0 ? V.explained.explanations : [];
  const b = prog(t, 6.0, 7.4);
  return (
    <Screen t={t} tab={1} url={WEB_URL} cam={[{ t: 0, s: 1.04, x: -25, y: -15 }, { t: 3.5, s: 1.1, x: -60, y: -110 }, { t: 9, s: 1.1, x: -60, y: -110 }, { t: 11, s: 1.02, x: -10, y: -10 }]}>
      <WebRoom stage="discussion" members={group({})} aside={
        <section className="card p-5">
          <span className="eyebrow">The baton</span>
          <div className="relative mt-4 flex justify-between px-2">
            {['Cy', 'Alex', 'Ari', 'Bea'].map((n) => <span key={n} className="grid size-11 place-items-center rounded-full border-2 border-ink bg-card text-sm font-bold">{n[0]}</span>)}
            <span className="absolute top-[18px] h-2 w-10 rounded-full bg-handoff shadow-[0_0_16px_rgba(226,106,79,.7)]" style={{ left: `${4 + b * 26}%`, opacity: t >= 5.6 ? 1 : 0 }} />
          </div>
          <p className="mt-3 text-xs text-muted">A turn was taken and passed on. It never means anyone is ranked.</p>
        </section>
      }>
        <Card>
          <div className="flex flex-col gap-5">
            <h2 className="text-3xl">{V.discussion.discussion_signal}</h2>
            <FacilitatorNote hint={V.discussion.hint!} />
            <div className="flex flex-wrap gap-2 text-xs" style={rise(t, 1.2, 8)}>
              <span className="rounded-full bg-primary-tint px-3 py-1 font-semibold text-primary">Hint: reviewed teaching note</span>
              <span className="rounded-full border border-line px-3 py-1 text-muted">AI drafts are optional · always labeled · never grade</span>
            </div>
            <div className="flex items-center gap-3"><span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-control bg-card px-4 text-sm font-semibold"><MessageSquareText className="size-4" strokeWidth={1.75} />Explain to the group</span></div>
            <div style={pop(t, 4.0)}><ExplanationFeed items={feed} /></div>
          </div>
        </Card>
      </WebRoom>
    </Screen>
  );
}

function Challenge({ t }: SceneProps) {
  const dialog = t >= 1.5 && t < 3.0;
  const held = t >= 3.0 && t < 8.0;
  const done = t >= 8.0;
  return (
    <Screen t={t} tab={1} url={WEB_URL}
      cursor={<Cursor t={t} path={[{ t: 0.6, x: 1000, y: 600 }, { t: 1.5, x: 1120, y: 512, click: true }, { t: 2.6, x: 780, y: 470 }, { t: 3.0, x: 760, y: 470, click: true }, { t: 6.2, x: 330, y: 400 }, { t: 7.0, x: 300, y: 420, click: true }]} />}>
      <WebRoom stage="discussion" paused={held} members={group({})} aside={
        <section className="card flex flex-col gap-3 p-5"><span className="eyebrow">Why this question?</span><h2 className="font-sans text-base font-bold">{pack.concept.source_title}</h2>
          <span className={cn('inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold', t >= 1.3 && t < 1.8 ? 'bg-text/10' : '')}><Flag className="size-4" strokeWidth={1.75} />Challenge this item</span></section>
      }>
        {held ? (
          <section className="flex flex-col gap-3 rounded-[20px] border border-amber/30 bg-amber-tint p-5" style={rise(t, 3.0, -8)}>
            <strong className="text-amber">Item under review · scoring and stage changes are paused</strong>
            <p><span className="font-semibold">Concern raised:</span> Does “the new total” mean after the songs were added?</p>
            <div className="grid grid-cols-2 gap-2">
              {[['Resume', 'The item stands as written.'], ['Discard', 'Withdraw it. No scores, no follow-up.']].map(([k, v]) => (
                <div key={k} className={cn('rounded-[12px] border bg-card px-4 py-3', k === 'Resume' && t >= 7.0 ? 'border-primary bg-primary-tint' : 'border-line')}><strong>{k}</strong><span className="block text-sm text-muted">{v}</span></div>
              ))}
            </div>
            <div className="rounded-[12px] border border-control bg-card px-4 py-2 text-sm">{typed(t, 'Checked the sample note: the second change uses the new total.', 4.2, 6.6) || <span className="text-muted">Note for the group</span>}</div>
          </section>
        ) : null}
        {done ? <p className="rounded-[12px] border border-line bg-card px-4 py-3 text-sm" style={rise(t, 8.0)}><strong className="text-green"><Check className="mr-1 inline size-4" />Resumed after review.</strong> Host note: Checked the sample note: the second change uses the new total.</p> : null}
        <Card dim={held}>
          <div className="flex flex-col gap-4"><h2 className="text-3xl">{V.discussion.discussion_signal}</h2><ExplanationFeed items={V.explained.explanations} /></div>
        </Card>
      </WebRoom>
      {dialog ? (
        <div className="absolute inset-0 grid place-items-center bg-ink/45" style={{ opacity: enter(t, 1.5, 0.25) }}>
          <div className="w-[480px] rounded-[20px] bg-card p-6" style={rise(t, 1.5, 12)}>
            <h3 className="text-xl">Challenge this item</h3>
            <p className="mt-1 text-sm text-muted">Your concern pauses scoring until the host reviews the source. Challenge the question, not a person.</p>
            <div className="mt-3 rounded-[12px] border border-control px-4 py-3">{typed(t, 'Does “the new total” mean after the songs were added?', 1.7, 2.7)}</div>
            <div className="mt-3 flex justify-end"><span className="rounded-full bg-primary px-5 py-2.5 font-semibold text-white">Pause and review</span></div>
          </div>
        </div>
      ) : null}
    </Screen>
  );
}

function Fresh({ t }: SceneProps) {
  return (
    <Screen t={t} tab={1} url={WEB_URL} cam={[{ t: 0, s: 1.06, x: -40, y: -30 }]}
      cursor={<Cursor t={t} path={[{ t: 1.6, x: 700, y: 560 }, { t: 2.5, x: 740, y: 476, click: true }, { t: 3.6, x: 480, y: 532, click: true }, { t: 4.6, x: 236, y: 574, click: true }, { t: 5.6, x: 420, y: 640 }]} />}>
      <WebRoom stage="transfer" members={group({ Ari: 'responded', Cy: 'responded', Alex: t >= 4.9 ? 'responded' : 'waiting', Bea: 'waiting' })}>
        <Card><Attempt t={t} item={F} eyebrow="A fresh problem · different scenario, same idea" pick="C" conf="Somewhat sure" at={[2.5, 3.6, 4.6]} /></Card>
      </WebRoom>
    </Screen>
  );
}

function Reflect({ t }: SceneProps) {
  return (
    <Screen t={t} tab={1} url={WEB_URL} cam={[{ t: 0, s: 1, x: 0, y: 0 }]}>
      <WebRoom stage="debrief" members={group({})} scroll={easeInOutP(prog(t, 2.5, 10.5)) * 620}>
        <Card><ReceiptCard receipt={V.debrief.receipt!} results={V.debrief.my_results} /></Card>
      </WebRoom>
    </Screen>
  );
}

function Outro({ t }: SceneProps) {
  return (
    <>
      <Backdrop dark />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center">
        <div style={rise(t, 0.3, 20, 0.7)}><Wordmark tone="paper" className="text-[3rem] [&_svg]:size-16" /></div>
        <h2 className="text-[44px] text-white" style={rise(t, 1.0, 16)}>Your group explains it. <em className="text-brand pr-2 italic">RELAY checks a fresh problem.</em></h2>
        <div className="flex items-center gap-4" style={rise(t, 2.2, 12)}>
          <span className="rounded-full bg-white px-7 py-3.5 text-[18px] font-bold text-ink">Try a sample round →</span>
          <span className="mono text-[18px] text-on-ink-muted">relay-two-lovat.vercel.app/demo</span>
        </div>
        <p className="mt-4 text-[14px] text-on-ink-muted" style={rise(t, 3.4, 8)}>Runs in your Discord server · /relay create to start · DEVHACKS Track 3</p>
      </div>
    </>
  );
}

export const SCENES: Record<string, (p: SceneProps) => React.ReactNode> = {
  intro: Intro, problem: Problem, install: Install, team: Team, signin: SignIn, think: Think,
  moment: Moment, explain: Explain, challenge: Challenge, fresh: Fresh, reflect: Reflect, outro: Outro,
};

export { Caption, Chapter };
