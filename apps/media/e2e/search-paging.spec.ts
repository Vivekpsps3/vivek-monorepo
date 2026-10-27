import { expect, test } from '@playwright/test';
import { resetMedia } from './media-test';

test('search More results and Previous move between result windows', async ({ page, request }) => {
  await resetMedia(request);
  const windows: Record<string, object> = {
    '0': pageOf('First window', '1', 0, true),
    '20': pageOf('Second window', '2', 20, false),
  };
  await page.route('**/media/api/search?**', route => {
    const offset = new URL(route.request().url()).searchParams.get('offset') || '0';
    return route.fulfill({ json: windows[offset] });
  });
  await page.goto('/media/search?q=window&offset=0');
  await expect(page.getByRole('heading', { name: 'First window' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More results' }).click();
  await expect(page.getByRole('heading', { name: 'Second window' })).toBeVisible();
  await expect(page).toHaveURL(/offset=20/);
  await expect(page.getByRole('heading', { name: 'First window' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByRole('heading', { name: 'First window' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More results' })).toBeVisible();
  await expect(page).toHaveURL(/offset=0/);
});

function pageOf(title: string, sourceId: string, offset: number, hasMore: boolean) {
  return {
    results: [{ kind: 'movie', title, source: 'fixture', source_id: sourceId, creator: 'Fixture', artwork_url: null, already_saved: false }],
    sources: [],
    partial: false,
    total: 21,
    offset,
    has_more: hasMore,
  };
}
