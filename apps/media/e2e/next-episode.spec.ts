import { expect, test, type APIRequestContext, type Page } from '../../../tests/e2e/fixtures';
import { addItem, deferred, expectCleanMediaPage as expectCleanPage, expectSectionHeading, resetMedia, savedItem, watchMediaConsole } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

const theme = 'light';
const viewport = { width: 390, height: 844 };

async function openNow(page: Page, theme: string, violations: string[]) {
  await page.addInitScript((t) => localStorage.setItem('suite-theme', t), theme);
  watchMediaConsole(page, violations);
  await page.goto('/media');
  await expectSectionHeading(page, 'Now');
}

async function seedShow(request: APIRequestContext, title = 'Matrix show') {
  const show = await addItem(request, { kind: 'tv', title, status: 'in_progress' });
  for (const episode of [
    { season_number: 0, episode_number: 1, title: 'Special', air_date: '2000-01-01' },
    { season_number: 1, episode_number: 1, title: 'Pilot', air_date: '2000-01-01' },
    { season_number: 1, episode_number: 2, title: 'Second', air_date: '2000-01-01' },
    { season_number: 2, episode_number: 1, title: 'Finale', air_date: '2099-01-01' },
  ]) {
    const response = await request.post('/media/api/entries/' + show.id + '/episodes', { data: episode });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  return show;
}

async function markNextViaApi(request: APIRequestContext, entryId: number) {
  const response = await request.post('/media/api/entries/' + entryId + '/episodes/next', { data: {} });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function episodeWatched(request: APIRequestContext, entryId: number, season: number, episode: number) {
  const detail = await savedItem(request, entryId);
  const found = detail.show.episodes.find(
    (e: { season_number: number; episode_number: number; watched: boolean }) =>
      e.season_number === season && e.episode_number === episode,
  );
  return found?.watched === true;
}

test.use({ viewport });

test('marking the next episode advances the card and Undo restores it', async ({ page, request }) => {
  const violations: string[] = [];
  const show = await seedShow(request);
  await openNow(page, theme, violations);
  const card = page.locator('media-card').filter({ hasText: 'Matrix show' });
  // Specials are never offered: the first button is S1E1, not S0E1.
  await expect(card.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
  await card.getByRole('button', { name: /Watched S1E1/ }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' })).toBeVisible();
  await expect(card.getByRole('button', { name: /Watched S1E2/ })).toBeVisible();
  expect(await episodeWatched(request, show.id, 1, 1)).toBe(true);
  const toast = page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'S1E1 is next again.' })).toBeVisible();
  await expect(card.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
  expect(await episodeWatched(request, show.id, 1, 1)).toBe(false);
  await expectCleanPage(page, violations);
});

test('double tap sends one request', async ({ page, request }) => {
  const violations: string[] = [];
  await seedShow(request);
  const pending = deferred();
  let posts = 0;
  await page.route('**/media/api/entries/*/episodes/next', async (route) => {
    posts++;
    await pending.promise;
    await route.continue();
  });
  await openNow(page, theme, violations);
  const card = page.locator('media-card').filter({ hasText: 'Matrix show' });
  const button = card.getByRole('button', { name: /Watched S1E1/ });
  await expect(button).toBeVisible();
  try {
    await button.evaluate((el) => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await expect(button).toBeDisabled();
    await expect.poll(() => posts).toBe(1);
  } finally {
    pending.resolve();
  }
  await expect(page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' })).toBeVisible();
  await expect(card.getByRole('button', { name: /Watched S1E2/ })).toBeVisible();
  expect(posts).toBe(1);
  await expectCleanPage(page, violations);
});

test('stale episode shows the server copy and refreshes', async ({ page, request }) => {
  const violations: string[] = [];
  const show = await seedShow(request);
  const refresh = deferred();
  let summaryGets = 0;
  await page.route('**/media/api/summary', async (route) => {
    summaryGets++;
    // Hold the silent refetch so the inline 409 copy can be read first.
    if (summaryGets > 1) await refresh.promise;
    await route.continue();
  });
  await openNow(page, theme, violations);
  const card = page.locator('media-card').filter({ hasText: 'Matrix show' });
  await expect(card.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
  // Another tab advances the show behind this page's back.
  await markNextViaApi(request, show.id);
  await card.getByRole('button', { name: /Watched S1E1/ }).click();
  try {
    await expect(card.locator('.next-episode-error')).toHaveText(
      'That episode is no longer next. Refresh to see your progress.',
    );
  } finally {
    refresh.resolve();
  }
  await expect(card.getByRole('button', { name: /Watched S1E2/ })).toBeVisible();
  await expectCleanPage(page, violations);
});

test('provider outage keeps progress', async ({ page, request }) => {
  const violations: string[] = [];
  const show = await seedShow(request);
  await page.route('**/media/api/entries/*/episodes/next', (route) =>
    route.fulfill({ status: 502, json: { detail: 'Bad gateway' } }),
  );
  await openNow(page, theme, violations);
  const card = page.locator('media-card').filter({ hasText: 'Matrix show' });
  await card.getByRole('button', { name: /Watched S1E1/ }).click();
  await expect(card.locator('.next-episode-error')).toHaveText(
    "Can't reach Media. Your progress hasn't changed. Try again.",
  );
  await expect(card.getByRole('button', { name: /Watched S1E1/ })).toBeEnabled();
  expect(await episodeWatched(request, show.id, 1, 1)).toBe(false);
  await expectCleanPage(page, violations);
});

test('caught up shows waiting copy and no button', async ({ page, request }) => {
  const violations: string[] = [];
  const show = await seedShow(request);
  await markNextViaApi(request, show.id);
  await markNextViaApi(request, show.id);
  await openNow(page, theme, violations);
  const card = page.locator('media-card').filter({ hasText: 'Matrix show' });
  await expect(card.getByText('Waiting for the next episode', { exact: true })).toBeVisible();
  await expect(card.getByText(/Next: S2E1 · airs .*2099/)).toBeVisible();
  await expect(card.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
  await expectCleanPage(page, violations);
});
