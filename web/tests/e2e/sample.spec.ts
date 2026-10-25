import { expect, test, type Page } from '@playwright/test';
import { noHorizontalOverflow, watchConsole } from './helpers';

/** Every request the page makes to the backend or auth routes. The sample must make none. */
function backendCalls(page: Page) {
  const calls: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/^\/(api|auth|health)\b/.test(u.pathname)) calls.push(`${r.method()} ${u.pathname}`); });
  return calls;
}

async function freshSample(page: Page) {
  await page.goto('/demo');
  await expect(page.getByText('Sample round · fictional peers · original practice material.')).toBeVisible();
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByText(/Ari, Bea, Cy are fictional peers/)).toBeVisible();
}

test('the sample round runs the whole journey in the browser and sends nothing', async ({ page }) => {
  test.setTimeout(90_000);
  const con = watchConsole(page);
  const calls = backendCalls(page);
  await freshSample(page);

  // Think privately: the host cannot move on until the fictional peers answer; the reason is the server's.
  await page.getByRole('button', { name: /Start: think privately/ }).click();
  await page.getByRole('radio', { name: /^A\s+80$/ }).click();
  await page.getByRole('radio', { name: 'Confident' }).click();
  await page.getByRole('button', { name: 'Lock my answer' }).click();
  await expect(page.getByText('Answer locked')).toBeVisible();
  const next = page.getByRole('button', { name: /Open: explain together/ });
  await expect(next).toBeEnabled({ timeout: 10_000 });
  await noHorizontalOverflow(page);

  // Explain together: the signature moment, the reviewed hint (never a model), a fictional peer's explanation.
  await next.click();
  await expect(page.getByRole('heading', { name: 'Check the shared assumption' })).toBeVisible();
  await expect(page.getByLabel('Facilitator note from RELAY')).toContainText('curated fallback');
  await expect(page.getByRole('button', { name: 'Ask RELAY for a hint' })).toHaveCount(0);
  await expect(page.getByText(/The 25% that gets removed is 25% of 100/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Explain to the group' }).click();
  await page.getByLabel(/Explain the idea/).fill('The second change works on the new total, so 25% of 100 comes off.');
  await page.getByRole('button', { name: 'Share explanation' }).click();
  await expect(page.getByRole('list', { name: 'Shared explanations' }).getByText('Alex')).toBeVisible();

  // Fresh problem: one fictional peer is slow, so the host closes the round; missing is never wrong.
  await page.getByRole('button', { name: /Start the fresh problem/ }).click();
  await expect(page.getByText(/A \$40 textbook/)).toBeVisible();
  await page.getByRole('radio', { name: /^C\s+\$30$/ }).click();
  await page.getByRole('radio', { name: 'Somewhat sure' }).click();
  await page.getByRole('button', { name: 'Lock my answer' }).click();
  await expect(page.getByText('Waiting for 1 more answer.')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Close round: record 1 as missing' }).click();

  // Reflect: the evidence-linked receipt, with no score or mastery claim.
  await expect(page.getByText('Here is what this round showed.')).toBeVisible();
  await expect(page.getByText('Revisit this item')).toBeVisible();
  await expect(page.getByText('Correct on this item')).toBeVisible();
  await expect(page.getByText('One of them was yours.')).toBeVisible();
  await expect(page.getByText(/policy receipt-v1 · evidence sample-d1, sample-t1, sample-note-01/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/\bmastered\b|\bimprov\w*|\d+% (correct|score|accuracy|mastery)/i);

  // The same round on Reflect and the group screen; the group screen carries nothing private.
  await page.getByRole('link', { name: 'Open the full reflection' }).click();
  await expect(page.getByText(/^First question: 1 of 3 correct$/)).toBeVisible();
  await page.goto('/demo/present');
  await expect(page.locator('body')).not.toContainText(/Your receipt|Your response|Only you can see this/);

  // Reload keeps the round (this tab only); Start over resets it.
  await page.goto('/demo');
  await expect(page.getByText('Here is what this round showed.')).toBeVisible();
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByRole('button', { name: /Start: think privately/ })).toBeVisible();

  expect(calls, 'the sample round must not touch the backend').toEqual([]);
  con.assertClean();
});

test('a challenge in the sample pauses, then the host discards it: nothing is scored', async ({ page }) => {
  await freshSample(page);
  await page.getByRole('button', { name: /Start: think privately/ }).click();
  await page.getByRole('button', { name: 'Challenge this item' }).first().click();
  await page.getByLabel('What looks wrong or ambiguous?').fill('Two options could both be read as correct.');
  await page.getByRole('button', { name: 'Pause and review' }).click();
  await expect(page.getByText(/Item under review/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open review packet' })).toHaveCount(0); // no answer key on show
  await page.getByRole('radio', { name: /^Discard/ }).click();
  await page.getByLabel(/Note for the group/).fill('Withdrawn for this sample: the wording needs review.');
  await page.getByRole('button', { name: 'Record the review' }).click();
  await expect(page.getByText('No score is better than a misleading score.')).toBeVisible();
  await expect(page.getByText('Discarded, not scored').first()).toBeVisible();
});

test('task first: the working card leads, and the first action is on screen at 1440x900', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await freshSample(page);
  await page.getByRole('button', { name: /Start: think privately/ }).click();
  const card = page.getByRole('region', { name: 'Current task' });
  await expect(card.getByRole('button', { name: 'Lock my answer' })).toBeVisible();
  const cardTop = (await card.boundingBox())!.y;
  const lock = (await card.getByRole('button', { name: 'Lock my answer' }).boundingBox())!;
  expect(cardTop, 'task card top').toBeLessThan(400);
  expect(lock.y + lock.height, 'Lock my answer within the first screen').toBeLessThanOrEqual(900);
  await ctx.close();
});
