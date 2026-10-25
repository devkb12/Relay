'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Captions, Pause, Play, RotateCcw } from 'lucide-react';
import timeline from './timeline.json';
import { SCENES, Caption, Chapter } from './scenes';
import { cn } from '@/lib/utils';

const W = 1280, H = 720;
const AUDIO = '/tour/relay-tour.m4a';
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function sceneAt(t: number) {
  const list = timeline.scenes;
  let i = list.findIndex((s) => t >= s.start && t < s.start + s.duration);
  if (i < 0) i = t <= 0 ? 0 : list.length - 1;
  return { i, scene: list[i]! };
}

/** The frame at time `t`: one scene, with a soft fade/zoom across chapter changes. */
export function Frame({ t, captions }: { t: number; captions: boolean }) {
  const { i, scene } = sceneAt(t);
  const lt = Math.max(0, t - scene.start);
  const inP = Math.min(1, lt / 0.5), outP = Math.min(1, Math.max(0, (scene.duration - lt) / 0.4));
  const o = i === 0 ? outP : Math.min(inP, outP);
  const Scene = SCENES[scene.id]!;
  return (
    <div className="relative overflow-hidden bg-ink" style={{ width: W, height: H }}>
      <div className="absolute inset-0" style={{ opacity: o, transform: `scale(${1.015 - 0.015 * Math.min(inP, 1)})` }}>
        <Scene t={lt} d={scene.duration} />
      </div>
      {scene.id !== 'intro' && scene.id !== 'outro' ? <Chapter n={i} title={scene.chapter} t={lt} /> : null}
      <span className="absolute top-5 right-8 z-40 rounded-full bg-ink/88 px-3 py-1.5 text-[12px] text-white shadow-lg">Recreated walkthrough · fictional study group</span>
      {captions ? <Caption text={scene.text} t={lt} duration={scene.duration} /> : null}
    </div>
  );
}

/** Recording mode (/tour?record=1): bare frame, a wall clock started by the recorder. */
function Recorder({ at }: { at?: number }) {
  const [t, setT] = useState(at ?? 0);
  useEffect(() => {
    if (at !== undefined) return; // still frame for review
    let raf = 0, t0 = 0;
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      setT(s);
      if (s >= timeline.total) { (window as unknown as { __tourDone: boolean }).__tourDone = true; return; }
      raf = requestAnimationFrame(tick);
    };
    (window as unknown as { __tourStart: () => void }).__tourStart = () => { t0 = performance.now(); raf = requestAnimationFrame(tick); };
    return () => cancelAnimationFrame(raf);
  }, [at]);
  return <Frame t={t} captions />;
}

function useStageScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(0.6);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el); return () => ro.disconnect();
  }, [ref]);
  return scale;
}

export function TourPlayer({ record, at }: { record: boolean; at?: number }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const scale = useStageScale(box);
  const [t, setT] = useState(2.6);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [captions, setCaptions] = useState(true);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    // Follow the soundtrack only once it has data; until then a requested jump stands.
    const tick = () => { const a = audio.current; if (a && a.readyState >= 2 && pending.current === null) setT(a.currentTime); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  /** Only the poster's Play starts from the top; every other play continues from where the clock is. */
  const play = useCallback(async (fromStart = false) => {
    const a = audio.current; if (!a) return;
    if (fromStart) { a.currentTime = 0; setT(0); }
    setStarted(true);
    if (a.ended) a.currentTime = 0;
    try { await a.play(); setPlaying(true); } catch { setPlaying(false); }
  }, []);
  const pause = () => { audio.current?.pause(); setPlaying(false); };
  const seek = (s: number) => {
    const to = Math.max(0, Math.min(timeline.total - 0.05, s));
    setStarted(true); setT(to);
    const a = audio.current; if (!a) return;
    if (a.readyState >= 1) { a.currentTime = to; pending.current = null; } else pending.current = to;
  };
  const applyPending = () => { const a = audio.current; if (a && pending.current !== null) { a.currentTime = pending.current; pending.current = null; } };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,button')) return;
      if (e.key === ' ') { e.preventDefault(); if (playing) pause(); else void play(); }
      if (e.key === 'ArrowRight') seek(t + 5);
      if (e.key === 'ArrowLeft') seek(t - 5);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });

  if (record) return <Recorder at={at} />;
  const { i: current } = sceneAt(t);

  return (
    <div className="flex flex-col gap-4">
      <div ref={box} data-film className="relative w-full overflow-hidden rounded-[18px] bg-ink shadow-[var(--shadow-float)]" style={{ aspectRatio: '16 / 9' }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: W, height: H }} aria-hidden>
          <Frame t={t} captions={captions && started} />
        </div>
        {!started ? (
          <button type="button" onClick={() => void play(true)} className="group absolute inset-0 grid place-items-center bg-ink/35">
            <span className="flex items-center gap-3 rounded-full bg-white px-6 py-4 text-lg font-bold text-ink shadow-[var(--shadow-float)] transition-transform group-hover:scale-105">
              <Play className="size-6 fill-ink" />Play the tour · {fmt(timeline.total)} · sound on
            </span>
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => (playing ? pause() : void play())} className="press grid size-11 place-items-center rounded-full bg-ink text-on-ink" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <button type="button" onClick={() => void play(true)} className="press grid size-11 place-items-center rounded-full border border-line-strong bg-card" aria-label="Restart"><RotateCcw className="size-5" /></button>
        <span className="mono w-24 text-sm text-muted">{fmt(t)} / {fmt(timeline.total)}</span>
        <input type="range" min={0} max={timeline.total} step={0.1} value={t} onChange={(e) => seek(Number(e.target.value))} aria-label="Position in the tour" className="h-2 min-w-40 flex-1 accent-[var(--color-primary)]" />
        <button type="button" onClick={() => setCaptions((c) => !c)} aria-pressed={captions} className={cn('press inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold', captions ? 'border-ink bg-ink text-on-ink' : 'border-line-strong bg-card')}><Captions className="size-4" />Captions</button>
      </div>

      <nav aria-label="Chapters" className="flex gap-1 overflow-x-auto rounded-[14px] border border-line bg-card p-1">
        {timeline.scenes.map((s, i) => (
          <button key={s.id} type="button" onClick={() => { seek(s.start + 0.01); if (!playing) void play(); }} aria-current={i === current ? 'step' : undefined}
            className={cn('press shrink-0 rounded-[10px] px-3 py-2 text-left text-sm', i === current ? 'bg-ink text-on-ink' : 'text-muted hover:bg-text/5 hover:text-text')}>
            <span className="mono mr-1.5 text-xs">{String(i + 1).padStart(2, '0')}</span>{s.chapter}
          </button>
        ))}
      </nav>
      <details className="card px-5 py-4">
        <summary className="cursor-pointer font-semibold">Transcript</summary>
        <ol className="mt-3 grid gap-3">
          {timeline.scenes.map((s, i) => (
            <li key={s.id}><span className="mono text-xs text-muted">{fmt(s.start)} · {String(i + 1).padStart(2, '0')} {s.chapter}</span><p>{s.text}</p></li>
          ))}
        </ol>
      </details>
      {/* The soundtrack drives the clock: narration (Windows voice), original music and interface sounds. */}
      <audio ref={audio} src={AUDIO} preload="auto" onLoadedMetadata={applyPending} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} />
    </div>
  );
}
