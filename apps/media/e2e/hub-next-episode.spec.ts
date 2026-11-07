import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { addItem, resetMedia } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

const viewports = [
  { label: '390', width: 390, height: 844 },
  { label: '1280', width: 1280, height: 800 },
] as const;
const themes = ['light', 'dark'] as const;

async function openHub(page: Page, theme: string, violations: string[]) {
  await page.addInitScript((t) => localStorage.setItem('suite-theme', t), theme);
  page.on('console', (msg) => {
    if (/Content Security Policy|Trusted Types/i.test(msg.text())) violations.push(msg.text());
  });
  page.on('pageerror', (err) => {
    if (/Content Security Policy|Trusted Types/i.test(err.message)) violations.push(err.message);
  });
  await page.goto('/hub');
  await expect(page.locator('section[aria-labelledby="media-heading"]')).toBeVisible();
}

async function expectCleanPage(page: Page, violations: string[]) {
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

function mediaCard(page: Page) {
  return page.locator('section[aria-labelledby="media-heading"]');
}

async function seedShow(request: APIRequestContext, title: string) {
  const show = await addItem(request, { kind: 'tv', title, status: 'in_progress' });
  for (const episode of [
    { season_number: 1, episode_number: 1, title: 'Pilot', air_date: '2000-01-01' },
    { season_number: 1, episode_number: 2, title: 'Second', air_date: '2000-01-01' },
  ]) {
    const response = await request.post('/media/api/entries/' + show.id + '/episodes', { data: episode });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  return show;
}

async function markNextViaApi(request: APIRequestContext, entryId: number) {
  const response = await request.post('/media/api/entries/' + entryId + '/episodes/next', { data: {} });
  expect(response.ok(), await response.text()).toBeTruthy();
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`[${viewport.label} ${theme}]`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test('hub top item marks the next episode and advances', async ({ page, request }) => {
        const violations: string[] = [];
        await seedShow(request, 'Hub show');
        await openHub(page, theme, violations);
        const card = mediaCard(page);
        const row = card.locator('li.next-episode-row').filter({ hasText: 'Hub show' });
        await expect(row).toContainText('S1 E1');
        await card.getByRole('button', { name: /Watched S1E1/ }).click();
        await expect(page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' })).toBeVisible();
        await expect(row).toContainText('S1 E2');
        await expect(card.getByRole('button', { name: /Watched S1E2/ })).toBeVisible();
        await expectCleanPage(page, violations);
      });

      test('hub undo restores', async ({ page, request }) => {
        const violations: string[] = [];
        await seedShow(request, 'Hub show');
        await openHub(page, theme, violations);
        const card = mediaCard(page);
        const row = card.locator('li.next-episode-row').filter({ hasText: 'Hub show' });
        await card.getByRole('button', { name: /Watched S1E1/ }).click();
        const toast = page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' });
        await expect(toast).toBeVisible();
        await toast.getByRole('button', { name: 'Undo' }).click();
        await expect(page.locator('.toast').filter({ hasText: 'S1E1 is next again.' })).toBeVisible();
        await expect(row).toContainText('S1 E1');
        await expect(card.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
        await expectCleanPage(page, violations);
      });

      test('hub shows only one next-episode button', async ({ page, request }) => {
        const violations: string[] = [];
        await seedShow(request, 'First show');
        await seedShow(request, 'Second show');
        await openHub(page, theme, violations);
        const card = mediaCard(page);
        await expect(card.locator('media-next-episode')).toHaveCount(1);
        await expect(card.getByRole('button', { name: /Watched S/ })).toHaveCount(1);
        await expectCleanPage(page, violations);
      });

      test('hub 409 shows the inline error and reloads', async ({ page, request }) => {
        const violations: string[] = [];
        const show = await seedShow(request, 'Hub show');
        let summaryGets = 0;
        await page.route('**/media/api/summary', async (route) => {
          summaryGets++;
          // Hold the reload so the inline 409 copy can be read first.
          if (summaryGets > 1) await new Promise((resolve) => setTimeout(resolve, 1000));
          await route.continue();
        });
        await openHub(page, theme, violations);
        const card = mediaCard(page);
        const row = card.locator('li.next-episode-row').filter({ hasText: 'Hub show' });
        await expect(card.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
        // Another tab advances the show behind this page's back.
        await markNextViaApi(request, show.id);
        await card.getByRole('button', { name: /Watched S1E1/ }).click();
        await expect(row.locator('.next-episode-error')).toHaveText(
          'That episode is no longer next. Refresh to see your progress.',
        );
        await expect(card.getByRole('button', { name: /Watched S1E2/ })).toBeVisible();
        await expectCleanPage(page, violations);
      });

      test('stale hub snapshot shows no button', async ({ page, request }) => {
        const violations: string[] = [];
        const show = await seedShow(request, 'Hub show');
        let summaryGets = 0;
        await page.route('**/media/api/summary', async (route) => {
          summaryGets++;
          if (summaryGets > 1) {
            return route.fulfill({ status: 500, json: { detail: 'Summary unavailable' } });
          }
          return route.continue();
        });
        await openHub(page, theme, violations);
        const card = mediaCard(page);
        await expect(card.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
        // Advance the show elsewhere, then tap: the 409 forces a reload,
        // the reload fails, and the card drops to its stale snapshot.
        await markNextViaApi(request, show.id);
        await card.getByRole('button', { name: /Watched S1E1/ }).click();
        await expect(card.getByText(/Updated/)).toBeVisible();
        await expect(card.locator('media-next-episode')).toHaveCount(0);
        await expect(card.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
        await expectCleanPage(page, violations);
      });
    });
  }
}
