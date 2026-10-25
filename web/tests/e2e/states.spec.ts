import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { noHorizontalOverflow, watchConsole } from './helpers';

test('backend down: live screens say so and point to the sample round', async ({ page }) => {
  const con = watchConsole(page);
  await page.route('**/connection', (r) => r.fulfill({ json: { connected: false } }));
  await page.goto('/room');
  await expect(page.getByRole('heading', { name: 'Backend not connected' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try a sample round' })).toBeVisible();
  con.assertClean();
});

test('production backend: browser identities refused, sessions start in Discord', async ({ page }) => {
  const con = watchConsole(page);
  await page.route('**/auth/me', (r) => r.fulfill({ json: { authenticated: false, login_available: false, demo_mode: false } }));
  await page.goto('/room');
  await expect(page.getByRole('heading', { name: 'Sessions start in Discord' })).toBeVisible();
  await expect(page.getByText('Browser sign-in is not configured on this backend yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create session' })).toHaveCount(0);
  con.assertClean();
});

test('production backend with Discord login offers a real sign-in link (no fake account)', async ({ page }) => {
  await page.route('**/auth/me', (r) => r.fulfill({ json: { authenticated: false, login_available: true, demo_mode: false } }));
  await page.goto('/room');
  await expect(page.getByRole('link', { name: 'Sign in with Discord' })).toHaveAttribute('href', /^\/auth\/discord\/login\?return_to=/);
});

test('proxy never forwards /internal and maps unknown paths to 404', async ({ request }) => {
  expect((await request.post('/api/../internal/discord', { data: {} })).status()).toBe(404);
  expect((await request.get('/api/internal/jobs')).status()).toBe(404);
  expect((await request.get('/health')).status()).toBe(200);
});

test('captured stage gallery renders every step, labeled, and writes nothing', async ({ page }) => {
  const con = watchConsole(page);
  await page.goto('/demo/stages');
  await expect(page.getByText('Synthetic session:').first()).toBeVisible();
  for (const step of ['Gather', 'Schedule', 'Think privately', 'Explain together', 'Challenge hold', 'Fresh problem', 'Reflect', 'Two people', 'Item discarded']) {
    await page.getByRole('button', { name: step, exact: true }).click();
    await noHorizontalOverflow(page);
  }
  await page.getByRole('button', { name: 'Challenge hold', exact: true }).click();
  await expect(page.getByText(/Item under review/)).toBeVisible();
  await page.getByRole('button', { name: 'Think privately', exact: true }).click();
  await page.getByRole('radio', { name: /^B / }).click();
  await page.getByRole('radio', { name: 'Confident' }).click();
  await page.getByRole('button', { name: 'Lock my answer' }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Demo only. Nothing was sent.' })).toBeVisible();
  con.assertClean();
});

test('landing track is keyboard driven and labeled synthetic', async ({ page }) => {
  await page.goto('/');
  await page.locator('#track').scrollIntoViewIfNeeded(); // the Track loads when it nears the viewport
  await page.getByRole('tab', { name: /Explain together/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Fresh problem/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Synthetic session · nothing is sent')).toBeVisible();
});

test('reduced motion: same content, instant swaps', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const con = watchConsole(page);
  await page.goto('/demo/stages');
  await page.getByRole('button', { name: 'Reflect', exact: true }).click();
  await expect(page.getByText('Here is what this round showed.')).toBeVisible();
  const duration = await page.evaluate(() => getComputedStyle(document.querySelector('.press')!).transitionDuration);
  expect(duration).toBe('0s');
  con.assertClean();
  await ctx.close();
});

for (const width of [360, 390, 820, 1280, 1920]) {
  test(`layout and accessibility at ${width}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 1000 } });
    const page = await ctx.newPage();
    const con = watchConsole(page);
    for (const path of ['/', '/demo', '/demo/debrief', '/demo/present', '/demo/stages', '/demo/stages/schedule', '/demo/stages/debrief', '/room', '/tour']) {
      await page.goto(path);
      await page.waitForLoadState('load');
      await page.waitForTimeout(600); // let 200ms entrance fades settle so contrast is measured at rest
      await noHorizontalOverflow(page);
      // The tour's animated frame is moving picture content (like a video); its accessible
      // alternative is the captions, chapter list and full transcript, which are scanned.
      const axe = await new AxeBuilder({ page }).exclude('[data-film]').analyze();
      const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${path}: ${v.id} (${v.nodes.length})`)).toEqual([]);
    }
    con.assertClean();
    await ctx.close();
  });
}

test('the product tour plays from the soundtrack clock, jumps by chapter, and labels itself', async ({ page }) => {
  const con = watchConsole(page);
  await page.goto('/tour');
  await expect(page.getByRole('button', { name: /Play the tour/ })).toBeVisible();
  await expect(page.getByText('Transcript')).toBeVisible();
  const chapters = page.getByRole('navigation', { name: 'Chapters' }).getByRole('button');
  await expect(chapters).toHaveCount(12);
  await chapters.filter({ hasText: 'The moment' }).click();
  await expect(page.getByText('Recreated walkthrough · fictional study group')).toBeVisible();
  await expect(chapters.filter({ hasText: 'The moment' })).toHaveAttribute('aria-current', 'step');
  const audio = await page.evaluate(() => fetch('/tour/relay-tour.m4a', { method: 'HEAD' }).then((r) => r.status));
  expect(audio).toBe(200);
  await noHorizontalOverflow(page);
  con.assertClean([/play\(\) failed|NotAllowedError|AbortError/i]);
});
