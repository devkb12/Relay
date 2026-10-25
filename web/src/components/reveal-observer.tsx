'use client';

import { useEffect } from 'react';

/**
 * Turns on scroll reveals for elements marked [data-reveal] / [data-settle]. Content is visible
 * without JavaScript: hiding only starts once this adds `reveal-on` to <html>. Each element reveals
 * once and stays. Reduced motion is handled in CSS (instant, no transform).
 */
export function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal], [data-settle]'));
    // Anything already on screen is shown immediately so the first frame never blinks.
    const vh = window.innerHeight;
    for (const el of targets) if (el.getBoundingClientRect().top < vh * 0.9) el.setAttribute('data-in', '');
    root.classList.add('reveal-on');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.setAttribute('data-in', ''); io.unobserve(e.target); }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    );
    for (const el of targets) if (!el.hasAttribute('data-in')) io.observe(el);
    return () => io.disconnect();
  }, []);
  return null;
}
