import { expect, test, type APIRequestContext, type Page } from '../../../tests/e2e/fixtures';
import { addItem, resetMedia, deferred, watchMediaConsole, expectCleanMediaPage as expectCleanPage } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

const theme = 'light';
const viewport = { width: 390, height: 844 };

async function openHub(page: Page, theme: string, violations: string[]) {
  await page.addInitScript((t) => localStorage.setItem('suite-theme', t), theme);
  watchMediaConsole(page, violations);
  await page.goto('/hub');
  await expect(page.locator('section[aria-labelledby="media-heading"]')).toBeVisible();
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

test.use({ viewport });

test('Hub advances the next episode and Undo restores it', async ({ page, request }) => {
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
  const toast = page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'S1E1 is next again.' })).toBeVisible();
  await expect(row).toContainText('S1 E1');
  await expect(card.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
  await expectCleanPage(page, violations);
});

test('undo restores the final episode after its Hub row is removed', async ({ page, request }) => {
  const violations: string[] = [];
  const show = await seedShow(request, 'Final episode show');
  await markNextViaApi(request, show.id);
  await openHub(page, theme, violations);
  const card = mediaCard(page);
  await card.getByRole('button', { name: /Watched S1E2/ }).click();
  await expect(card.getByRole('button', { name: /Watched S1E/ })).toHaveCount(0);
  const toast = page.locator('.toast').filter({ hasText: 'Marked S1E2 watched' });
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'S1E2 is next again.' })).toBeVisible();
  await expect(card.getByRole('button', { name: /Watched S1E2/ })).toBeVisible();
  await expectCleanPage(page, violations);
});

test('episode Undo survives navigation away from the Hub', async ({ page, request }) => {
  const violations: string[] = [];
  await seedShow(request, 'Navigation show');
  await openHub(page, theme, violations);
  await mediaCard(page).getByRole('button', { name: /Watched S1E1/ }).click();
  await page.getByRole('link', { name: 'Open Media', exact: true }).click();
  await expect(page).toHaveURL(/\/media\/?$/);
  await page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' }).getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'S1E1 is next again.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
  await expectCleanPage(page, violations);
});

test('Undo refreshes an open Detail without losing its unsaved note', async ({ page, request }) => {
  const violations: string[] = [];
  await seedShow(request, 'Detail undo show');
  await openHub(page, theme, violations);
  await mediaCard(page).getByRole('button', { name: /Watched S1E1/ }).click();
  await mediaCard(page).getByRole('link', { name: 'Detail undo show', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Detail undo show', exact: true })).toBeVisible();
  const note = page.getByLabel('Note (optional)', { exact: true });
  await note.fill('Keep this unsaved note');
  await page.locator('summary').filter({ hasText: 'Season 1' }).click();
  const pilot = page.locator('.episode-row').filter({ hasText: 'Pilot' });
  await expect(pilot.getByRole('button', { name: 'Unwatch', exact: true })).toBeVisible();
  await page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' }).getByRole('button', { name: 'Undo' }).click();
  await expect(pilot.getByRole('button', { name: 'Mark watched', exact: true })).toBeVisible();
  await expect(note).toHaveValue('Keep this unsaved note');
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
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
  const refresh = deferred();
  let summaryGets = 0;
  await page.route('**/media/api/summary', async (route) => {
    summaryGets++;
    // Hold the reload so the inline 409 copy can be read first.
    if (summaryGets > 1) await refresh.promise;
    await route.continue();
  });
  await openHub(page, theme, violations);
  const card = mediaCard(page);
  const row = card.locator('li.next-episode-row').filter({ hasText: 'Hub show' });
  await expect(card.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
  // Another tab advances the show behind this page's back.
  await markNextViaApi(request, show.id);
  await card.getByRole('button', { name: /Watched S1E1/ }).click();
  try {
    await expect(row.locator('.next-episode-error')).toHaveText(
      'That episode is no longer next. Refresh to see your progress.',
    );
  } finally {
    refresh.resolve();
  }
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
