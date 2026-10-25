import { expect, type Page } from '@playwright/test';

/** Collect console errors and page errors; assert none at the end of a test. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { errors, assertClean: (allow: RegExp[] = []) => expect(errors.filter((e) => !allow.some((a) => a.test(e)))).toEqual([]) };
}

export async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

/** Switch the local test identity (Local test backends only). */
export async function viewAs(page: Page, name: string) {
  await page.getByRole('radiogroup', { name: 'Test identity' }).getByRole('radio', { name, exact: true }).click();
  await expect(page.getByText(`${name} (you)`).filter({ visible: true }).first()).toBeVisible();
}

export function tomorrowAt(hour: number) {
  const d = new Date(Date.now() + 36 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}

export const sessionStore = (page: Page) => page.evaluate(() => JSON.stringify({ ...sessionStorage }));
export const localStore = (page: Page) => page.evaluate(() => JSON.stringify({ ...localStorage }));
