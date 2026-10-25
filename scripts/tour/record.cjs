// Record the RELAY product film to MP4: plays /tour?record=1 in real time in a headless browser,
// then muxes the video with the soundtrack (web/public/tour/relay-tour.m4a) using ffmpeg.
// Usage: node scripts/tour/record.cjs <ffmpeg path> [base url, default http://127.0.0.1:3001]
const { chromium } = require('../../web/node_modules/playwright-core');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');

const ffmpeg = process.argv[2];
const base = process.argv[3] || 'http://127.0.0.1:3001';
const root = resolve(__dirname, '../..');
const timeline = require(join(root, 'web/src/components/tour/timeline.json'));

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-tour-'));
  const browser = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } } });
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto(`${base}/tour?record=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // fonts and first paint settle
  const offset = (Date.now() - t0) / 1000;
  await page.evaluate(() => window.__tourStart());
  await page.waitForFunction(() => window.__tourDone === true, null, { timeout: (timeline.total + 30) * 1000, polling: 500 });
  await page.waitForTimeout(500);
  await ctx.close(); await browser.close();
  const webm = join(dir, readdirSync(dir).find((f) => f.endsWith('.webm')));
  const out = join(root, 'web/public/tour/relay-tour.mp4');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', offset.toFixed(3), '-i', webm, '-i', join(root, 'web/public/tour/relay-tour.m4a'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'copy', '-t', String(timeline.total), '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log(`Recorded ${timeline.total}s (lead-in trimmed ${offset.toFixed(2)}s) -> web/public/tour/relay-tour.mp4`);
})().catch((e) => { console.error(e); process.exit(1); });
