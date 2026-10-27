import { expect, test } from '@playwright/test';
import { addItem, openItem, resetMedia, savedItem } from './media-test';

test.beforeEach(async ({ request }) => {
  await resetMedia(request);
});

test('a rating of zero stays zero and clearing it saves no rating', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  const rating = page.getByLabel('Rating');
  await rating.fill('0');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect((await savedItem(request, item.id)).rating).toBe(0);
  await expect(rating).toHaveValue('0');
  await page.goto('/media/library');
  const card = page.locator('.media-card').filter({ has: page.getByRole('heading', { name: 'Browser story' }) });
  await expect(card).toContainText('0 / 10');
  await openItem(page, item.id);
  await page.getByLabel('Rating').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect((await savedItem(request, item.id)).rating).toBeNull();
  await expect(page.getByLabel('Rating')).toHaveValue('');
  await page.goto('/media/library');
  await expect(page.locator('.media-card').filter({ has: page.getByRole('heading', { name: 'Browser story' }) })).not.toContainText('/ 10');
});
