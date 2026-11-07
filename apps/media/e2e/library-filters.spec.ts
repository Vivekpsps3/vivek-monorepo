import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { addItem, closeFilters, openFilters, resetMedia } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

const viewports = [
  { label: '390', width: 390, height: 844 },
  { label: '1280', width: 1280, height: 800 },
] as const;
const themes = ['light', 'dark'] as const;

async function openLibrary(page: Page, theme: string, violations: string[], url = '/media/library') {
  await page.addInitScript((t) => localStorage.setItem('suite-theme', t), theme);
  page.on('console', (msg) => {
    if (/Content Security Policy|Trusted Types/i.test(msg.text())) violations.push(msg.text());
  });
  page.on('pageerror', (err) => {
    if (/Content Security Policy|Trusted Types/i.test(err.message)) violations.push(err.message);
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
}

async function expectCleanPage(page: Page, violations: string[]) {
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function tagItem(request: APIRequestContext, id: number, tags: string[]) {
  const response = await request.patch('/media/api/entries/' + id, { data: { tags } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`[${viewport.label} ${theme}]`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      if (viewport.label === '390') {
        test('first result is above 450px at 390', async ({ page, request }) => {
          const violations: string[] = [];
          await addItem(request, { title: 'First result story' });
          await openLibrary(page, theme, violations);
          const card = page.locator('media-card').first();
          await expect(card).toBeVisible();
          const box = await card.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.y).toBeLessThan(450);
          await expectCleanPage(page, violations);
        });
      }

      test('no Find something new link in header', async ({ page, request }) => {
        const violations: string[] = [];
        await addItem(request);
        await openLibrary(page, theme, violations);
        await expect(page.getByText('Find something new')).toHaveCount(0);
        await expectCleanPage(page, violations);
      });

      test('search filters live after typing', async ({ page, request }) => {
        const violations: string[] = [];
        await addItem(request, { title: 'Browser story' });
        let requests = 0;
        page.on('request', (req) => {
          if (req.method() === 'GET' && req.url().includes('/media/api/library')) requests++;
        });
        await openLibrary(page, theme, violations);
        await expect(page.locator('media-card')).toHaveCount(4);
        await page.waitForTimeout(300);
        const before = requests;
        await page.locator('#library-q').fill('story');
        await expect.poll(() => requests, { timeout: 2000 }).toBe(before + 1);
        await page.waitForTimeout(500);
        expect(requests).toBe(before + 1);
        await expect(page.locator('media-card')).toHaveCount(1);
        await expectCleanPage(page, violations);
      });

      test('filters apply live and count updates', async ({ page, request }) => {
        const violations: string[] = [];
        await addItem(request, { kind: 'movie', title: 'A movie' });
        await addItem(request, { kind: 'book', title: 'A book' });
        await openLibrary(page, theme, violations);
        await openFilters(page);
        await page.getByRole('dialog').getByLabel('Type').selectOption('movie');
        await expect(page.locator('button[aria-controls="library-filters"]')).toHaveText('Filters (1)');
        await expect(page).toHaveURL(/kind=movie/);
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectCleanPage(page, violations);
      });

      test('tags multi-select uses AND', async ({ page, request }) => {
        const violations: string[] = [];
        const a = await addItem(request, { title: 'Alpha tale' });
        await tagItem(request, a.id, ['x', 'y']);
        const b = await addItem(request, { title: 'Beta tale' });
        await tagItem(request, b.id, ['x']);
        await openLibrary(page, theme, violations);
        await expect(page.locator('media-card')).toHaveCount(5);
        await openFilters(page);
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('checkbox', { name: 'x', exact: true }).check();
        await dialog.getByRole('checkbox', { name: 'y', exact: true }).check();
        await closeFilters(page);
        await expect(page.locator('media-card')).toHaveCount(1);
        await expect(page.getByText('Alpha tale')).toBeVisible();
        await expect(page.getByText('Beta tale')).toHaveCount(0);
        expect(page.url()).toContain('tag=x');
        expect(page.url()).toContain('tag=y');
        await expectCleanPage(page, violations);
      });

      test('clear filters keeps search and sort', async ({ page, request }) => {
        const violations: string[] = [];
        await addItem(request, { kind: 'movie', title: 'Story movie' });
        await openLibrary(page, theme, violations, '/media/library?q=story&sort=title');
        await openFilters(page);
        await page.getByRole('dialog').getByLabel('Type').selectOption('movie');
        await expect(page).toHaveURL(/kind=movie/);
        await page.getByRole('dialog').getByRole('button', { name: 'Clear filters' }).click();
        await expect(page).not.toHaveURL(/kind=/);
        expect(page.url()).toContain('q=story');
        expect(page.url()).toContain('sort=title');
        await expect(page.locator('button[aria-controls="library-filters"]')).toHaveText('Filters');
        await expectCleanPage(page, violations);
      });

      test('Done returns focus to Filters button', async ({ page, request }) => {
        const violations: string[] = [];
        await addItem(request);
        await openLibrary(page, theme, violations);
        await openFilters(page);
        await closeFilters(page);
        await expect(page.locator('button[aria-controls="library-filters"]')).toBeFocused();
        await expectCleanPage(page, violations);
      });

      test('old fav=1 link still works', async ({ page, request }) => {
        const violations: string[] = [];
        await addItem(request, { title: 'Favorite tale', favorite: true });
        await addItem(request, { title: 'Plain tale' });
        await openLibrary(page, theme, violations, '/media/library?fav=1');
        await expect(page.locator('media-card')).toHaveCount(1);
        await expect(page.getByText('Favorite tale')).toBeVisible();
        await expect(page.getByText('Plain tale')).toHaveCount(0);
        await expectCleanPage(page, violations);
      });

      test('no tags shows hint', async ({ page, request }) => {
        const violations: string[] = [];
        await addItem(request);
        await openLibrary(page, theme, violations);
        await openFilters(page);
        await expect(page.getByRole('dialog').getByText("No tags yet. Add tags from an item's page.")).toBeVisible();
        await expectCleanPage(page, violations);
      });

      test('empty filtered result shows clear button', async ({ page, request }) => {
        const violations: string[] = [];
        await addItem(request, { kind: 'book', title: 'Only a book' });
        await openLibrary(page, theme, violations, '/media/library?kind=movie');
        await expect(page.getByText('No saved items match these filters', { exact: true })).toBeVisible();
        const clear = page.getByRole('button', { name: 'Clear filters' });
        await expect(clear).toBeVisible();
        await clear.click();
        await expect(page.locator('media-card')).toHaveCount(4);
        await expect(page.getByText('Only a book')).toBeVisible();
        await expectCleanPage(page, violations);
      });
    });
  }
}
