import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { addItem, resetMedia } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

const viewports = [
  { label: '390', width: 390, height: 844 },
  { label: '1280', width: 1280, height: 800 },
] as const;
const themes = ['light', 'dark'] as const;

async function openNow(page: Page, theme: string, violations: string[]) {
  await page.addInitScript((t) => localStorage.setItem('suite-theme', t), theme);
  page.on('console', (msg) => {
    if (/Content Security Policy|Trusted Types/i.test(msg.text())) violations.push(msg.text());
  });
  page.on('pageerror', (err) => {
    if (/Content Security Policy|Trusted Types/i.test(err.message)) violations.push(err.message);
  });
  await page.goto('/media');
  await expect(page.getByRole('heading', { name: 'Now', exact: true })).toBeVisible();
}

async function expectCleanPage(page: Page, violations: string[]) {
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** The e2e reset seeds three books; remove them for a truly empty library. */
async function clearLibrary(request: APIRequestContext) {
  const response = await request.get('/media/api/library?limit=100');
  expect(response.ok()).toBeTruthy();
  const { items } = await response.json();
  for (const item of items) {
    const deleted = await request.delete('/media/api/entries/' + item.id);
    expect(deleted.ok()).toBeTruthy();
  }
}

async function seedShow(request: APIRequestContext, title: string) {
  const show = await addItem(request, { kind: 'tv', title, status: 'in_progress' });
  const response = await request.post('/media/api/entries/' + show.id + '/episodes', {
    data: { season_number: 1, episode_number: 1, title: 'Pilot', air_date: '2000-01-01' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return show;
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`[${viewport.label} ${theme}]`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test('empty library shows exactly one empty state', async ({ page, request }) => {
        const violations: string[] = [];
        await clearLibrary(request);
        await openNow(page, theme, violations);
        await expect(page.locator('ui-empty-state')).toHaveCount(1);
        await expect(page.getByText('A place for your favorites', { exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Start your library' })).toBeVisible();
        await expect(page.getByText(/Nothing in progress/)).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'In progress' })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Favorites' })).toHaveCount(0);
        await expectCleanPage(page, violations);
      });

      test('library with nothing in progress shows the link', async ({ page, request }) => {
        const violations: string[] = [];
        await clearLibrary(request);
        await addItem(request, { kind: 'book', title: 'Someday book', status: 'want' });
        await openNow(page, theme, violations);
        await expect(page.getByText('Nothing in progress.', { exact: false })).toBeVisible();
        const link = page.getByRole('link', { name: 'Pick something from your library.' });
        await expect(link).toBeVisible();
        await link.click();
        await expect(page).toHaveURL(/\/media\/library$/);
        await expectCleanPage(page, violations);
      });

      test('favorites shelf shows top 8 favorites by rating', async ({ page, request }) => {
        const violations: string[] = [];
        for (let rating = 1; rating <= 9; rating++) {
          await addItem(request, {
            kind: 'book',
            title: 'Fav ' + rating,
            status: 'want',
            favorite: true,
            rating,
          });
        }
        await openNow(page, theme, violations);
        const shelf = page.locator('section', {
          has: page.getByRole('heading', { name: 'Favorites', exact: true }),
        });
        await expect(shelf.locator('media-card')).toHaveCount(8);
        await expect(shelf.locator('media-card h2 a').first()).toHaveText('Fav 9');
        await expect(shelf.getByText('Fav 1', { exact: true })).toHaveCount(0);
        await expectCleanPage(page, violations);
      });

      test('favorites failure is contained', async ({ page }) => {
        const violations: string[] = [];
        await page.route('**/media/api/library*', (route) => {
          if (route.request().url().includes('favorite=true')) {
            return route.fulfill({ status: 500, json: { detail: 'Favorites unavailable' } });
          }
          return route.continue();
        });
        await openNow(page, theme, violations);
        await expect(page.getByText("Favorites didn't load.", { exact: false })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
        // The seeded in-progress book still renders.
        await expect(page.getByRole('heading', { name: 'In progress' })).toBeVisible();
        await expect(page.locator('media-card').filter({ hasText: 'Dune' })).toBeVisible();
        await expectCleanPage(page, violations);
      });

      test('each show appears once', async ({ page, request }) => {
        const violations: string[] = [];
        await seedShow(request, 'Solo show');
        await openNow(page, theme, violations);
        await expect(page.locator('media-card').filter({ hasText: 'Solo show' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Solo show', exact: true })).toHaveCount(1);
        await expect(page.getByRole('heading', { name: 'Next episodes' })).toHaveCount(0);
        await expectCleanPage(page, violations);
      });

      test('one h1 and dates are formatted', async ({ page, request }) => {
        const violations: string[] = [];
        const show = await seedShow(request, 'Dated show');
        const future = await request.post('/media/api/entries/' + show.id + '/episodes', {
          data: { season_number: 2, episode_number: 1, title: 'Later', air_date: '2099-01-01' },
        });
        expect(future.ok(), await future.text()).toBeTruthy();
        await openNow(page, theme, violations);
        await expect(page.locator('main h1')).toHaveCount(1);
        const text = await page.locator('main').innerText();
        expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        await expectCleanPage(page, violations);
      });
    });
  }
}
