'use client';

/**
 * Building blocks for the RELAY product film (/tour). Everything is a pure function of time `t`
 * (seconds into the scene), so the film can be scrubbed, jumped by chapter, and recorded frame-true.
 * The chat app is a recreation of a Discord server for illustration (no Discord logo or assets).
 */
import { RelayMark } from '@/components/graphics';
import { cn } from '@/lib/utils';

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
/** 0 → 1 as an element enters at `at` over `dur` seconds. */
export const enter = (t: number, at: number, dur = 0.45) => easeOut(prog(t, at, at + dur));
/** Style for an element that rises in at `at`. */
export const rise = (t: number, at: number, dy = 14, dur = 0.45): React.CSSProperties => {
  const p = enter(t, at, dur);
  return { opacity: p, transform: `translateY(${(1 - p) * dy}px)` };
};
export const pop = (t: number, at: number): React.CSSProperties => {
  const p = enter(t, at, 0.35);
  return { opacity: p, transform: `scale(${0.92 + 0.08 * p})`, transformOrigin: 'left bottom' };
};
export const typed = (t: number, text: string, a: number, b: number) => text.slice(0, Math.round(prog(t, a, b) * text.length));

/** Camera: interpolated scale/translate keyframes for slow, deliberate moves. */
export type Cam = { t: number; s: number; x: number; y: number };
export function camera(t: number, keys: Cam[]): React.CSSProperties {
  let a = keys[0]!, b = keys[0]!;
  for (let i = 0; i < keys.length; i++) { if (keys[i]!.t <= t) { a = keys[i]!; b = keys[i + 1] ?? keys[i]!; } }
  const p = a === b ? 1 : easeInOut(prog(t, a.t, b.t));
  const s = a.s + (b.s - a.s) * p, x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p;
  return { transform: `translate(${x}px, ${y}px) scale(${s})`, transformOrigin: '0 0' };
}

/** An animated pointer moving between waypoints; a ripple marks each click. */
export type Way = { t: number; x: number; y: number; click?: boolean };
export function Cursor({ t, path }: { t: number; path: Way[] }) {
  if (!path.length || t < path[0]!.t - 0.3) return null;
  let a = path[0]!, b = path[0]!;
  for (let i = 0; i < path.length; i++) { if (path[i]!.t <= t) { a = path[i]!; b = path[i + 1] ?? path[i]!; } }
  const p = a === b ? 1 : easeInOut(prog(t, a.t + (a.click ? 0.25 : 0), b.t));
  const x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p;
  const clicked = path.find((w) => w.click && t >= w.t && t < w.t + 0.45);
  const r = clicked ? prog(t, clicked.t, clicked.t + 0.45) : 0;
  return (
    <div className="pointer-events-none absolute z-50" style={{ left: x, top: y, opacity: enter(t, path[0]!.t - 0.3, 0.3) }} aria-hidden>
      {clicked ? <span className="absolute rounded-full border-2 border-primary" style={{ left: -18 * r - 4, top: -18 * r - 4, width: 36 * r + 8, height: 36 * r + 8, opacity: 1 - r }} /> : null}
      <svg width="22" height="26" viewBox="0 0 22 26" style={{ transform: `scale(${clicked && r < 0.4 ? 0.88 : 1})`, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' }}>
        <path d="M2 2 L2 21 L7.2 16.4 L10.8 24 L14 22.6 L10.5 15 L18 15 Z" fill="#fff" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** A browser window with two tabs: the study server and the RELAY web room. */
export function BrowserWindow({ tab, url, children, className }: { tab: 0 | 1; url: string; children: React.ReactNode; className?: string }) {
  const tabs = [
    { label: '#study-room · Stat 201 study crew', icon: <span className="grid size-4 place-items-center rounded-full bg-[#5b43d6] text-[9px] font-black text-white">S</span> },
    { label: 'RELAY · Changing percentages', icon: <RelayMark className="size-4" /> },
  ];
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-[14px] bg-[#dfe1e5] shadow-[0_30px_80px_-20px_rgba(10,14,30,.55)]', className)}>
      <div className="flex h-10 items-end gap-1 px-3">
        <div className="mb-3 mr-2 flex gap-1.5">{['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} className="size-3 rounded-full" style={{ background: c }} />)}</div>
        {tabs.map((x, i) => (
          <div key={x.label} className={cn('flex h-8 w-64 items-center gap-2 rounded-t-[10px] px-3 text-[12px] transition-colors duration-300', i === tab ? 'bg-white text-[#1f1f1f]' : 'text-[#5f6368]')}>
            {x.icon}<span className="truncate">{x.label}</span>
          </div>
        ))}
      </div>
      <div className="flex h-9 items-center gap-3 bg-white px-4">
        <span className="text-[#5f6368]">‹ ›</span>
        <div className="flex h-7 flex-1 items-center gap-2 rounded-full bg-[#f1f3f4] px-3 text-[12.5px] text-[#202124]">
          <svg viewBox="0 0 24 24" className="size-3.5 fill-[#5f6368]" aria-hidden><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 5a3 3 0 0 1 6 0v3H9Z" /></svg>
          {url}
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden bg-white">{children}</div>
    </div>
  );
}

/* ── The study server (a recreation of a Discord server, for illustration) ───────────────── */

export const PEOPLE: Record<string, { color: string; role?: string }> = {
  Alex: { color: '#e26a4f', role: 'host' },
  Ari: { color: '#2f9e7a' },
  Bea: { color: '#c0479b' },
  Cy: { color: '#d39b1d' },
  RELAY: { color: '#5b43d6' },
};

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  if (name === 'RELAY') return <span className="grid shrink-0 place-items-center rounded-full bg-[#f6f4f0]" style={{ width: size, height: size }}><RelayMark className="size-7" /></span>;
  return <span className="grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: PEOPLE[name]?.color ?? '#888', fontSize: size * 0.42 }}>{name[0]}</span>;
}

export function ChatShell({ children, composer, popup, members = ['Alex'] }: { children: React.ReactNode; composer?: string; popup?: React.ReactNode; members?: string[] }) {
  return (
    <div className="flex h-full bg-[#313338] text-[#dbdee1]" style={{ fontFamily: 'var(--font-sans)' }}>
      <div className="flex w-[72px] flex-col items-center gap-2 bg-[#1e1f22] py-3">
        <span className="grid size-12 place-items-center rounded-[16px] bg-[#5b43d6] text-lg font-black text-white">S</span>
        <span className="h-0.5 w-8 rounded bg-[#35363c]" />
        {['M', 'B', '+'].map((x) => <span key={x} className="grid size-12 place-items-center rounded-full bg-[#313338] text-lg font-bold text-[#949ba4]">{x}</span>)}
      </div>
      <div className="flex w-[232px] flex-col bg-[#2b2d31]">
        <div className="flex h-12 items-center border-b border-black/30 px-4 text-[15px] font-bold text-white">Stat 201 study crew</div>
        <div className="flex flex-col gap-0.5 px-2 py-3 text-[15px] text-[#949ba4]">
          <span className="px-2 pb-1 text-[11px] font-bold tracking-wide uppercase">Text channels</span>
          {['general', 'study-room', 'resources'].map((c) => (
            <span key={c} className={cn('rounded-[6px] px-2 py-1.5', c === 'study-room' && 'bg-[#404249] text-white')}># {c}</span>
          ))}
          <span className="mt-3 px-2 pb-1 text-[11px] font-bold tracking-wide uppercase">Voice</span>
          <span className="px-2 py-1.5">🔊 Study lounge</span>
        </div>
        <div className="mt-auto flex items-center gap-2 bg-[#232428] px-3 py-2">
          <Avatar name="Alex" size={32} /><div className="text-[13px] leading-tight"><div className="font-semibold text-white">Alex</div><div className="text-[#949ba4]">Online</div></div>
        </div>
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-black/30 px-4 text-[15px] font-bold text-white"><span className="text-[#80848e]">#</span>study-room <span className="ml-2 text-[13px] font-normal text-[#949ba4]">Weekly practice · exams in 2 weeks</span></div>
        <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden px-4 pb-3">{children}</div>
        <div className="relative px-4 pb-5">
          {popup}
          <div className="flex h-11 items-center rounded-[8px] bg-[#383a40] px-4 text-[15px]">
            {composer ? <span className="text-[#dbdee1]">{composer}<span className="ml-0.5 inline-block h-5 w-[2px] translate-y-1 animate-pulse bg-[#dbdee1]" /></span> : <span className="text-[#6d6f78]">Message #study-room</span>}
          </div>
        </div>
      </div>
      <div className="flex w-[220px] flex-col gap-2 bg-[#2b2d31] px-3 py-4 text-[14px]">
        <span className="px-1 text-[11px] font-bold tracking-wide text-[#949ba4] uppercase">Online — {members.length}</span>
        {members.map((m) => (
          <div key={m} className="flex items-center gap-2 px-1"><Avatar name={m} size={32} /><span className={m === 'RELAY' ? 'text-[#c9bfff]' : 'text-[#dbdee1]'}>{m}</span>{m === 'RELAY' ? <AppTag /> : null}</div>
        ))}
      </div>
    </div>
  );
}

const AppTag = () => <span className="rounded-[3px] bg-[#5b43d6] px-1 text-[10px] font-bold leading-4 text-white">APP</span>;

export function Msg({ name, time = 'Today at 7:02 PM', children, style }: { name: string; time?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="flex gap-4" style={style}>
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="text-[15px] font-semibold" style={{ color: name === 'RELAY' ? '#c9bfff' : '#f2f3f5' }}>{name}</span>{name === 'RELAY' ? <AppTag /> : null}<span className="text-[12px] text-[#949ba4]">{time}</span></div>
        <div className="text-[15px] leading-[1.4] text-[#dbdee1]">{children}</div>
      </div>
    </div>
  );
}

export function Embed({ title, fields, note, accent = '#4567ef', children }: { title: string; fields?: [string, React.ReactNode][]; note?: string; accent?: string; children?: React.ReactNode }) {
  return (
    <div className="mt-1 max-w-[560px] rounded-[4px] border-l-4 bg-[#2b2d31] px-4 py-3" style={{ borderColor: accent }}>
      <div className="text-[15px] font-bold text-white">{title}</div>
      <div className="mt-0.5 text-[13.5px] text-[#dbdee1]">Don’t just agree. Understand.</div>
      {fields ? <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2">{fields.map(([k, v]) => <div key={k}><div className="text-[13px] font-bold text-white">{k}</div><div className="text-[13.5px]">{v}</div></div>)}</div> : null}
      {children}
      {note ? <div className="mt-2 text-[11.5px] text-[#b5bac1]">{note}</div> : null}
    </div>
  );
}

export function Ephemeral({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 max-w-[600px] rounded-[6px] bg-[#5b43d6]/12 px-3 py-2">
      <div className="text-[14.5px]">{children}</div>
      <div className="mt-1 text-[11.5px] text-[#949ba4]">👁 Only you can see this · Dismiss message</div>
    </div>
  );
}

export function SlashPopup({ t, highlight = 0 }: { t: number; highlight?: number }) {
  const rows: [string, string][] = [['/relay create', 'Create a study session in this channel.'], ['/relay join', 'Join and consent to processing your practice answers.'], ['/relay question', 'Answer privately, or see your results.'], ['/relay explain', 'Share an explanation with the group.'], ['/relay challenge', 'Pause an item that looks wrong.']];
  return (
    <div className="absolute bottom-[68px] left-4 right-4 overflow-hidden rounded-[8px] bg-[#2b2d31] shadow-[0_8px_24px_rgba(0,0,0,.4)]" style={rise(t, 0, 8, 0.25)}>
      <div className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-wide text-[#949ba4] uppercase">Commands matching /relay</div>
      {rows.map(([c, d], i) => (
        <div key={c} className={cn('flex items-center gap-3 px-3 py-2', i === highlight && 'bg-[#404249]')}>
          <span className="grid size-7 place-items-center rounded-full bg-[#f6f4f0]"><RelayMark className="size-5" /></span>
          <span className="text-[14.5px] font-semibold text-white">{c}</span><span className="truncate text-[13px] text-[#949ba4]">{d}</span>
        </div>
      ))}
    </div>
  );
}

export function SystemLine({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="flex items-center gap-4 pl-3 text-[14.5px] text-[#949ba4]" style={style}><span className="text-[#23a55a]">→</span>{children}</div>;
}

/** Lower-third caption with the narration line. */
export function Caption({ text, t, duration }: { text: string; t: number; duration: number }) {
  const o = Math.min(enter(t, 0.3, 0.4), 1 - prog(t, duration - 0.5, duration));
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-24" style={{ opacity: o }}>
      <p className="max-w-[880px] rounded-[10px] bg-black/72 px-5 py-2.5 text-center text-[19px] leading-snug text-white">{text}</p>
    </div>
  );
}

/** Chapter title chip in the top-left of the frame. */
export function Chapter({ n, title, t }: { n: number; title: string; t: number }) {
  return (
    <div className="absolute top-5 left-8 z-40 flex items-center gap-2.5 rounded-full bg-ink/88 py-1 pr-4 pl-1 shadow-lg" style={rise(t, 0.15, 10)}>
      <span className="mono rounded-full bg-white px-2.5 py-0.5 text-[12px] font-bold text-ink">{String(n).padStart(2, '0')}</span>
      <span className="text-[14px] font-bold tracking-wide text-white">{title}</span>
    </div>
  );
}
