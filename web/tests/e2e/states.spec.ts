import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { noHorizontalOverflow, watchConsole } from './helpers';

test('backend down: live screens say so and point to the synthetic session', async ({ page }) => {
  const con = watchConsole(page);
  await page.route('**/connection', (r) => r.fulfill({ json: { connected: false } }));
  await page.goto('/room');
  await expect(page.getByRole('heading', { name: 'Backend not connected' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Walk through a synthetic session' })).toBeVisible();
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

test('synthetic walkthrough renders every step, labeled, and writes nothing', async ({ page }) => {
  const con = watchConsole(page);
  await page.goto('/demo');
  await expect(page.getByText('Synthetic session:').first()).toBeVisible();
  for (const step of ['Gather', 'Schedule', 'Think privately', 'Explain together', 'Challenge hold', 'Fresh problem', 'Reflect']) {
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
  await page.getByRole('tab', { name: /Explain together/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Test understanding/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Synthetic session · nothing is sent')).toBeVisible();
});

test('reduced motion: same content, instant swaps', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const con = watchConsole(page);
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Reflect', exact: true }).click();
  await expect(page.getByText('The session is complete.')).toBeVisible();
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
    for (const path of ['/', '/demo', '/demo/schedule', '/demo/debrief', '/demo/present', '/room']) {
      await page.goto(path);
      await page.waitForLoadState('load');
      await page.waitForTimeout(600); // let 200ms entrance fades settle so contrast is measured at rest
      await noHorizontalOverflow(page);
      const axe = await new AxeBuilder({ page }).analyze();
      const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${path}: ${v.id} (${v.nodes.length})`)).toEqual([]);
    }
    con.assertClean();
    await ctx.close();
  });
}
