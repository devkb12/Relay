import { expect, test, type Page } from '@playwright/test';
import { sessionStore, localStore, tomorrowAt, viewAs, watchConsole } from './helpers';

const PEOPLE = ['Ana', 'Ben', 'Cai', 'Dee'];

async function createSession(page: Page) {
  await page.goto('/room');
  await expect(page.getByText('Local test identities').first()).toBeVisible();
  await page.getByLabel('Your test name').first().fill('Ana');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.waitForURL(/\/room\/[A-Za-z0-9_-]+$/);
  const sid = page.url().split('/').pop()!;
  for (const name of PEOPLE.slice(1)) {
    // Retry if a re-render cleared the field between typing and clicking.
    await expect(async () => {
      if (!(await page.getByRole('radio', { name, exact: true }).count())) {
        await page.getByLabel('Test participant name').fill(name);
        await expect(page.getByRole('button', { name: 'Add' })).toBeEnabled({ timeout: 1000 });
        await page.getByRole('button', { name: 'Add' }).click();
      }
      await expect(page.getByRole('radio', { name, exact: true })).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20_000 });
  }
  return sid;
}

async function advance(page: Page, label: RegExp) {
  await viewAs(page, 'Ana');
  await page.getByRole('button', { name: label }).click();
}

async function answerAll(page: Page, choices: Record<string, { choice?: RegExp; skip?: boolean; confidence?: string }>) {
  for (const [name, a] of Object.entries(choices)) {
    await viewAs(page, name);
    if (a.skip) {
      await page.getByRole('radio', { name: /Skip this one/ }).click();
      await page.getByRole('button', { name: 'Skip and lock' }).click();
      await expect(page.getByText('Recorded as skipped, not as wrong.')).toBeVisible();
    } else {
      await page.getByRole('radio', { name: a.choice! }).click();
      await page.getByRole('radio', { name: a.confidence ?? 'Confident' }).click();
      if (name === 'Ben') {
        await page.getByRole('button', { name: /Add your reasoning/ }).click();
        await page.getByLabel(/Your reasoning/).fill('PRIVATE-REASONING-BEN multiply the factors');
      }
      await page.getByRole('button', { name: 'Lock my answer' }).click();
      await expect(page.getByText('Answer locked')).toBeVisible();
    }
  }
}

test('four students run the full loop against a local FastAPI', async ({ page }) => {
  test.setTimeout(240_000);
  const con = watchConsole(page);
  const sid = await createSession(page);

  // Availability for everyone (Phoenix wall time, sent as UTC instants).
  for (const name of PEOPLE) {
    await viewAs(page, name);
    await page.getByRole('link', { name: 'Schedule' }).first().click();
    await page.getByLabel('From', { exact: true }).fill(tomorrowAt(15));
    await page.getByLabel('To', { exact: true }).fill(tomorrowAt(18));
    await page.getByRole('button', { name: 'Save my availability' }).click();
    await expect(page.getByText('You haven’t added any availability yet.')).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to the room' }).click();
  }

  // Host asks for 90 minutes with shorter fallbacks; RELAY proposes; everyone approves.
  await viewAs(page, 'Ana');
  await page.getByRole('link', { name: 'Schedule' }).first().click();
  await page.getByRole('button', { name: '90 min' }).click();
  await expect(page.getByText('durations sent: [90, 60, 45, 30]')).toBeVisible();
  await page.getByRole('button', { name: 'Find a time' }).click();
  await expect(page.getByRole('button', { name: /^Approve v\d+$/ })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the room' }).click();
  for (const name of PEOPLE) {
    await viewAs(page, name);
    await page.getByRole('link', { name: 'Schedule' }).first().click();
    const approveBtn = page.getByRole('button', { name: /^Approve v\d+$/ });
    const approved = page.getByText(/You approved|Everyone approved this time/).first();
    await expect(approveBtn.or(approved)).toBeVisible();
    if (await approveBtn.isVisible()) await approveBtn.click();
    await expect(approved).toBeVisible();
    await page.getByRole('link', { name: 'Back to the room' }).click();
  }

  // The calendar file: bearer header, never a token in the URL.
  await viewAs(page, 'Ana');
  await page.getByRole('link', { name: 'Schedule' }).first().click();
  await expect(page.getByText('Everyone approved this time.')).toBeVisible();
  const icsRequest = page.waitForRequest((r) => r.url().includes('calendar.ics'));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download calendar file' }).click();
  const req = await icsRequest;
  expect(req.headers()['authorization']).toMatch(/^Bearer /);
  expect(req.url()).not.toMatch(/token|bearer/i);
  expect((await download).suggestedFilename()).toBe('relay-session.ics');
  await page.getByRole('link', { name: 'Back to the room' }).click();

  // Start; three confident wrong answers and one skip.
  await advance(page, /Start: think privately/);
  await answerAll(page, { Ana: { choice: /^A / }, Ben: { choice: /^A / }, Cai: { choice: /^A / }, Dee: { skip: true } });
  // Nobody else's answer is visible: Cai's view must not contain Ben's private reasoning.
  await viewAs(page, 'Cai');
  await expect(page.getByText('PRIVATE-REASONING-BEN')).toHaveCount(0);

  await advance(page, /Open: explain together/);
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  // Whatever signal the server returns, shown verbatim; the hint mode is shown as-is.
  await expect(page.getByLabel('Facilitator note from RELAY')).toContainText('curated fallback');

  await viewAs(page, 'Ben');
  await page.getByRole('button', { name: 'Explain to the group' }).click();
  await page.getByLabel(/Explain the idea/).fill('The second percent applies to the new amount, not the original.');
  await page.getByRole('button', { name: 'Share explanation' }).click();
  await expect(page.getByRole('list', { name: 'Shared explanations' }).getByText('The second percent applies to the new amount, not the original.')).toBeVisible();

  await viewAs(page, 'Ana');
  await page.getByRole('button', { name: 'Ask RELAY for a hint' }).click();
  await expect(page.getByLabel('Facilitator note from RELAY')).toContainText(/curated fallback/);

  // A challenge holds the room; the host resumes it with a note.
  await viewAs(page, 'Cai');
  await page.getByRole('button', { name: 'Challenge this item' }).click();
  await page.getByLabel('What looks wrong or ambiguous?').fill('Is the base really the updated value?');
  await page.getByRole('button', { name: 'Pause and review' }).click();
  await expect(page.getByText(/Item under review/)).toBeVisible();
  await viewAs(page, 'Ana');
  await page.getByRole('radio', { name: /^Resume/ }).click();
  await page.getByLabel(/Note for the group/).fill('Checked the source: the item stands.');
  await page.getByRole('button', { name: 'Record the review' }).click();
  await expect(page.getByText('Resumed after review.')).toBeVisible();

  // Fresh problem: different scenario; the first question never reappears.
  await advance(page, /Start the fresh problem/);
  await expect(page.getByText('A fresh problem · different scenario, same idea')).toBeVisible();
  await expect(page.getByText(/practice account starts at \$100/)).toHaveCount(0);
  await answerAll(page, { Ana: { choice: /^B / }, Ben: { choice: /^B / }, Cai: { choice: /^B / }, Dee: { choice: /^B /, confidence: 'Unsure' } });
  await advance(page, /Close and reflect/);

  // Debrief reports exactly what the server returned.
  await viewAs(page, 'Ben');
  await page.getByRole('link', { name: 'Reflection' }).first().click();
  await expect(page.getByText(/^First question: \d+ of \d+ correct$/)).toBeVisible();
  await expect(page.getByText(/^Fresh question: \d+ of \d+ correct$/)).toBeVisible();
  await expect(page.getByText('Here is what this round showed.')).toBeVisible();
  await expect(page.getByText('Your response: A · $100. Reviewed answer: $75.')).toBeVisible();
  // Prompts contain percentages; scores never do.
  await expect(page.locator('body')).not.toContainText(/\bmastered\b|\bimprov\w*|\d+% (correct|score|accuracy|mastery)/i);

  // Presentation mode never renders private data.
  await page.goto(`/room/${sid}/present`);
  await expect(page.getByText('Display only, not access control')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Only you can see this|Your receipt|Here is what this round showed|PRIVATE-REASONING|Your response/i);

  // Tokens: only in sessionStorage, never localStorage or the URL.
  expect(await localStore(page)).not.toMatch(/token/);
  expect(await sessionStore(page)).toMatch(/relay\.identities/);
  expect(page.url()).not.toMatch(/token/);
  con.assertClean([/status of 409/]);
});

test('stale stage (409) re-fetches and explains', async ({ page, request }) => {
  const con = watchConsole(page);
  const sid = await createSession(page);
  await viewAs(page, 'Ana');
  const token = await page.evaluate((s) => JSON.parse(sessionStorage.getItem('relay.identities')!).find((i: { session_id: string; name: string }) => i.session_id === s && i.name === 'Ana').token, sid);
  // Another tab advances first.
  const r = await request.post(`/api/sessions/${sid}/advance`, { headers: { Authorization: `Bearer ${token}` }, data: { expected_stage: 'lobby' } });
  expect(r.status()).toBe(200);
  await page.getByRole('button', { name: /Start: think privately/ }).click();
  await expect(page.getByText('Something changed').or(page.getByText(/stage changed/i)).first()).toBeVisible();
  await expect(page.getByText('First question · think on your own')).toBeVisible();
  con.assertClean([/status of 409/]);
});

test('stale plan (409) shows the new version and refreshes', async ({ page, request }) => {
  const sid = await createSession(page);
  const tokens = await page.evaluate((s) => Object.fromEntries(JSON.parse(sessionStorage.getItem('relay.identities')!).filter((i: { session_id: string }) => i.session_id === s).map((i: { name: string; token: string }) => [i.name, i.token])), sid);
  const start = new Date(Date.now() + 30 * 3600e3), end = new Date(start.getTime() + 3 * 3600e3);
  for (const name of PEOPLE) await request.post(`/api/sessions/${sid}/availability`, { headers: { Authorization: `Bearer ${tokens[name]}` }, data: { windows: [{ start: start.toISOString(), end: end.toISOString() }], timezone: 'America/Phoenix' } });
  await request.post(`/api/sessions/${sid}/propose`, { headers: { Authorization: `Bearer ${tokens.Ana}` }, data: { durations: [60] } });
  await viewAs(page, 'Ben');
  await page.getByRole('link', { name: 'Schedule' }).first().click();
  const approve = page.getByRole('button', { name: /^Approve v\d+$/ });
  await expect(approve).toBeVisible();
  const oldLabel = await approve.innerText();
  // Host re-proposes in another tab; Ben's button is now stale.
  await request.post(`/api/sessions/${sid}/propose`, { headers: { Authorization: `Bearer ${tokens.Ana}` }, data: { durations: [45] } });
  await approve.click({ timeout: 2000 }).catch(() => {});
  await expect(page.getByText(/This proposal changed|Plan changed: v\d+ → v\d+, approvals reset/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Approve v\d+$/ })).not.toHaveText(oldLabel);
});

test('a challenge can be discarded: item discarded, never wrong', async ({ page }) => {
  await createSession(page);
  await advance(page, /Start: think privately/);
  await viewAs(page, 'Dee');
  await page.getByRole('button', { name: 'Challenge this item' }).click();
  await page.getByLabel('What looks wrong or ambiguous?').fill('Two options look equivalent here.');
  await page.getByRole('button', { name: 'Pause and review' }).click();
  await viewAs(page, 'Ana');
  await page.getByRole('radio', { name: /^Discard/ }).click();
  await page.getByLabel(/Note for the group/).fill('Withdrawn: the options overlap.');
  await page.getByRole('button', { name: 'Record the review' }).click();
  await expect(page.getByText('No score is better than a misleading score.')).toBeVisible();
  await page.getByRole('link', { name: 'Reflection' }).first().click();
  await expect(page.getByText('Item discarded').first()).toBeVisible();
  await expect(page.getByText('Discarded, not scored').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Not correct/);
});
