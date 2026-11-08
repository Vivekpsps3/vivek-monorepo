import { expect, type APIRequestContext, type Page } from '@playwright/test';
export async function resetMedia(request: APIRequestContext) {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
}
export async function addItem(request: APIRequestContext, body: Record<string, unknown> = {}) {
  const response = await request.post('/media/api/library', { data: { kind: 'book', title: 'Browser story', ...body } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
export async function savedItem(request: APIRequestContext, id: number) {
  const response = await request.get('/media/api/entries/' + id);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
/** Section titles stay in the accessibility tree and are clipped out of view. */
export async function expectSectionHeading(page: Page, name?: string | RegExp) {
  const heading = name === undefined
    ? page.locator('main h1')
    : page.getByRole('heading', { level: 1, name, exact: typeof name === 'string' });
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveClass(/ui-page-header__title--concealed/);
  const box = await heading.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(2);
  expect(box?.height ?? 0).toBeLessThanOrEqual(2);
  return heading;
}
export async function openItem(page: Page, id: number, title = 'Browser story') {
  await page.goto('/media/item/' + id);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => resolve = done);
  return { promise, resolve };
}
export async function reloadDraft(page: Page) {
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
}
export async function openFilters(page: Page) {
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
export async function closeFilters(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

export function watchMediaConsole(page: Page, violations: string[]) {
  page.on('console', msg => {
    if (/Content Security Policy|Trusted Types/i.test(msg.text())) violations.push(msg.text());
  });
  page.on('pageerror', error => {
    if (/Content Security Policy|Trusted Types/i.test(error.message)) violations.push(error.message);
  });
}
export async function expectCleanMediaPage(page: Page, violations: string[]) {
  expect(violations).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
