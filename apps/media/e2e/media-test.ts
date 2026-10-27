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
