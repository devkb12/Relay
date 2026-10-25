'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

/** Same footprint as the loaded Track so nothing shifts when it arrives. */
function Placeholder() {
  return (
    <div className="flex min-h-[46rem] flex-col gap-6" aria-busy="true">
      <div className="h-[6.25rem] rounded-[12px] border border-dashed border-line-strong" />
      <p className="text-muted">Loading the synthetic session…</p>
      <div className="card flex-1" />
    </div>
  );
}

const Island = dynamic(() => import('./landing-track-island'), { ssr: false, loading: Placeholder });

/**
 * The interactive Track is not needed for first paint: its code (room components, fixtures,
 * motion) loads only when the section comes near the viewport, or immediately on keyboard focus.
 */
export function TrackLoader() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setShow(true); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <div ref={ref} onFocusCapture={() => setShow(true)}>
      {show ? <Island /> : <Placeholder />}
    </div>
  );
}
