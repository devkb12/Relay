import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { viewAs, watchConsole } from './helpers';

/**
 * Reproductions of the archived starter's findings against the current app, on a real local
 * FastAPI: unsent work must survive unrelated background updates, and a session that disappears
 * (or a sign-in that expires) must be visible, not silent.
 */
async function sessionWith(page: Page, names: string[]) {
  await page.goto('/room');
  await page.getByLabel('Your test name').first().fill(names[0]!);
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.waitForURL(/\/room\/[A-Za-z0-9_-]+$/);
  const sid = page.url().split('/').pop()!;
  for (const name of names.slice(1)) {
    await expect(async () => {
      if (!(await page.getByRole('radio', { name, exact: true }).count())) {
        await page.getByLabel('Test participant name').fill(name);
        await page.getByRole('button', { name: 'Add' }).click();
      }
      await expect(page.getByRole('radio', { name, exact: true })).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20_000 });
  }
  const tokens: Record<string, string> = await page.evaluate((s) => Object.fromEntries(JSON.parse(sessionStorage.getItem('relay.identities')!)
    .filter((i: { session_id: string }) => i.session_id === s).map((i: { name: string; token: string }) => [i.name, i.token])), sid);
  return { sid, tokens };
}

const call = (request: APIRequestContext, token: string, path: string, data: object = {}) =>
  request.post(path, { headers: { Authorization: `Bearer ${token}` }, data });

test('unsent answer, reasoning, explanation and review drafts survive unrelated updates', async ({ page, request }) => {
  test.setTimeout(120_000);
  const con = watchConsole(page);
  const { sid, tokens } = await sessionWith(page, ['Ana', 'Ben', 'Cai']);
  await viewAs(page, 'Ana');
  await page.getByRole('button', { name: /Start: think privately/ }).click();

  // A half-finished private attempt while Ben answers (roster and revision change underneath).
  await page.getByRole('radio', { name: /^C / }).click();
  await page.getByRole('button', { name: /Add your reasoning/ }).click();
  await page.getByLabel(/Your reasoning/).fill('DRAFT-REASONING the loss applies to 150');
  const view = await (await request.get(`/api/sessions/${sid}`, { headers: { Authorization: `Bearer ${tokens.Ben}` } })).json();
  expect((await call(request, tokens.Ben!, `/api/sessions/${sid}/answer`, { question_id: view.question.id, choice: 'A', confidence: 'unsure', rationale: '' })).status()).toBe(200);
  await expect(page.getByText('Waiting for 2 more answers.')).toBeVisible({ timeout: 10_000 }); // the poll landed
  await expect(page.getByRole('radio', { name: /^C / })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel(/Your reasoning/)).toHaveValue('DRAFT-REASONING the loss applies to 150');

  // A challenge: the host's unsent review note survives another participant's settings change.
  expect((await call(request, tokens.Cai!, `/api/sessions/${sid}/challenge`, { reason: 'Is the base the updated value?' })).status()).toBe(200);
  await expect(page.getByText(/Item under review/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('radio', { name: /^Resume/ }).click();
  await page.getByLabel(/Note for the group/).fill('DRAFT-NOTE checked the source, it');
  // The archived repro: another participant changes a setting (revision bump, nothing visible)...
  expect((await call(request, tokens.Ben!, `/api/sessions/${sid}/consent`, { enabled: true })).status()).toBe(200);
  // ...then leaves, which the roster does show: seeing it proves a poll after both updates landed.
  expect((await call(request, tokens.Ben!, `/api/sessions/${sid}/leave`)).status()).toBe(200);
  await expect(page.getByText('Left').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel(/Note for the group/)).toHaveValue('DRAFT-NOTE checked the source, it');
  await expect(page.getByRole('radio', { name: /^Resume/ })).toHaveAttribute('aria-checked', 'true');
  con.assertClean([/status of 409/]);
});

test('a deleted session is announced in the room, with the last view kept', async ({ page, request }) => {
  const { sid, tokens } = await sessionWith(page, ['Ana', 'Ben']);
  await viewAs(page, 'Ben');
  const r = await request.delete(`/api/sessions/${sid}`, { headers: { Authorization: `Bearer ${tokens.Ana}` } });
  expect(r.status()).toBe(200);
  await expect(page.getByRole('alert').getByText('Session not found')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Back to your rooms' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current task' })).toBeVisible();
});
