import { expect, test, type APIRequestContext, type Page } from '../../../tests/e2e/fixtures';
import { addItem, deferred, resetMedia, savedItem } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));
test.use({ reducedMotion: 'reduce' });

async function addEpisode(
  request: APIRequestContext,
  entryId: number,
  episode: { season_number: number; episode_number: number; title: string; air_date?: string },
) {
  const response = await request.post(`/media/api/entries/${entryId}/episodes`, { data: episode });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function markNext(request: APIRequestContext, entryId: number) {
  const response = await request.post(`/media/api/entries/${entryId}/episodes/next`, { data: {} });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

function row(page: Page, title: string) {
  return page.locator('.lounge-row').filter({
    has: page.getByRole('link', { name: title, exact: true }),
  });
}

test('future and unknown episodes stay distinct from ended and ongoing', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('suite-theme', 'light'));
  const ended = await addItem(request, {
    kind: 'tv',
    title: 'Ended Lantern',
    status: 'in_progress',
    extra: { lifecycle: 'Ended' },
  });
  await addEpisode(request, ended.id, {
    season_number: 1,
    episode_number: 1,
    title: 'Finale',
    air_date: '2020-01-01',
  });
  await markNext(request, ended.id);
  const future = await addItem(request, {
    kind: 'tv',
    title: 'Future Lantern',
    status: 'in_progress',
    extra: { lifecycle: 'ongoing' },
  });
  await addEpisode(request, future.id, {
    season_number: 1,
    episode_number: 1,
    title: 'Pilot',
    air_date: '2020-01-01',
  });
  await markNext(request, future.id);
  await addEpisode(request, future.id, {
    season_number: 1,
    episode_number: 2,
    title: 'Later',
    air_date: '2099-04-01',
  });
  const undated = await addItem(request, {
    kind: 'tv',
    title: 'Undated Lantern',
    status: 'in_progress',
    extra: { lifecycle: 'ongoing' },
  });
  await addEpisode(request, undated.id, {
    season_number: 1,
    episode_number: 1,
    title: 'Pilot',
    air_date: '2020-02-01',
  });
  await addEpisode(request, undated.id, {
    season_number: 1,
    episode_number: 2,
    title: 'Unannounced',
  });

  await page.goto('/media/library?kind=tv&sort=title');
  await expect(page.locator('video')).toHaveCount(0);
  const endedRow = row(page, 'Ended Lantern');
  await expect(endedRow.locator('.poster-fact')).toHaveText('Caught up');
  await expect(endedRow.locator('.poster-lifecycle')).toHaveText('Ended');
  await expect(endedRow.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
  await expect(endedRow.getByText('Waiting for the next episode')).toHaveCount(0);
  await endedRow.getByRole('button', { name: 'Open seating for Ended Lantern' }).click();
  const hall = page.locator('#seating-diagram');
  await expect(hall.getByRole('heading', { name: 'Ended Lantern', exact: true })).toBeVisible();
  await expect(hall.locator('[data-seat="watched"][data-code="S1E1"]')).toBeVisible();
  await expect(hall.locator('[data-seat="future"], [data-seat="unknown"], [data-seat="next"]')).toHaveCount(0);
  expect((await savedItem(request, ended.id)).status).toBe('in_progress');

  const futureRow = row(page, 'Future Lantern');
  await expect(futureRow.locator('.poster-fact')).toHaveText('Caught up');
  await expect(futureRow.locator('.poster-lifecycle')).toHaveText('Ongoing');
  await expect(futureRow.locator('.poster-air')).toContainText('2099');
  await expect(futureRow.getByText('Waiting for the next episode', { exact: true })).toBeVisible();
  await expect(futureRow.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
  await futureRow.getByRole('button', { name: 'Open seating for Future Lantern' }).click();
  await expect(hall.getByRole('heading', { name: 'Future Lantern', exact: true })).toBeVisible();
  await expect(hall.locator('[data-seat="watched"][data-code="S1E1"]')).toBeVisible();
  await expect(hall.locator('[data-seat="future"][data-code="S1E2"]')).toContainText('Future');
  await expect(hall.locator('[data-seat="future"][data-code="S1E2"]')).toContainText('2099');
  const futureSaved = await savedItem(request, future.id);
  expect(futureSaved.status).toBe('in_progress');
  expect(futureSaved.show.episodes.find((episode: { episode_number: number }) => episode.episode_number === 2).watched).toBe(false);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('suite-theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const undatedRow = row(page, 'Undated Lantern');
  await expect(undatedRow.locator('.poster-fact')).toHaveText('Next S1E1');
  await expect(undatedRow.locator('.poster-lifecycle')).toHaveText('Ongoing');
  await expect(undatedRow.locator('.poster-fact')).not.toHaveText('Ended');
  await undatedRow.getByRole('button', { name: 'Open seating for Undated Lantern' }).click();
  await expect(hall.locator('[data-seat="next"][data-code="S1E1"]')).toBeVisible();
  await expect(hall.locator('[data-seat="unknown"][data-code="S1E2"]')).toContainText('Air date unknown');
  await undatedRow.getByRole('button', { name: /Watched S1E1/ }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' })).toBeVisible();
  await expect(hall.locator('[data-seat="watched"][data-code="S1E1"]')).toBeVisible();
  await expect(hall.locator('[data-seat="unknown"][data-code="S1E2"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Watched S1E2/ })).toHaveCount(0);
  const after = await savedItem(request, undated.id);
  expect(after.status).toBe('in_progress');
  expect(after.show.caught_up).toBe(false);
  const episodes = after.show.episodes as { episode_number: number; watched: boolean }[];
  expect(episodes.find((episode) => episode.episode_number === 1)?.watched).toBe(true);
  expect(episodes.find((episode) => episode.episode_number === 2)?.watched).toBe(false);
  await page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' }).getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'S1E1 is next again.' })).toBeVisible();
  await expect(undatedRow.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();
  await expect(hall.locator('[data-seat="next"][data-code="S1E1"]')).toBeVisible();
  await expect(hall.locator('[data-seat="unknown"][data-code="S1E2"]')).toBeVisible();
  expect((await savedItem(request, undated.id)).show.episodes.find(
    (episode: { episode_number: number; watched: boolean }) => episode.episode_number === 1,
  ).watched).toBe(false);
  await expect(page.locator('video')).toHaveCount(0);
});

test('a late seating read cannot replace the series on screen', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const glass = await addItem(request, {
    kind: 'tv',
    title: 'Glass Hour',
    status: 'in_progress',
    extra: { lifecycle: 'ongoing' },
  });
  await addEpisode(request, glass.id, {
    season_number: 1,
    episode_number: 1,
    title: 'Pane',
    air_date: '2020-01-01',
  });
  const brass = await addItem(request, {
    kind: 'tv',
    title: 'Brass Hour',
    status: 'in_progress',
    extra: { lifecycle: 'ongoing' },
  });
  await addEpisode(request, brass.id, {
    season_number: 1,
    episode_number: 1,
    title: 'Bell',
    air_date: '2020-01-01',
  });
  await page.goto('/media/library?kind=tv&sort=title');

  const releaseGlass = deferred();
  let seen = 0;
  await page.route('**/media/api/entries/*', async (route) => {
    const url = route.request().url().split('?')[0];
    if (route.request().method() !== 'GET' || !/\/entries\/\d+$/.test(url)) {
      await route.continue();
      return;
    }
    seen += 1;
    if (seen === 1) {
      const response = await route.fetch();
      await releaseGlass.promise;
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  const glassOpen = row(page, 'Glass Hour').getByRole('button', { name: 'Open seating for Glass Hour' });
  await glassOpen.click();
  await expect.poll(() => seen).toBe(1);
  await row(page, 'Brass Hour').getByRole('button', { name: 'Open seating for Brass Hour' }).click();
  const hall = page.locator('#seating-diagram');
  await expect(hall.getByRole('heading', { name: 'Brass Hour', exact: true })).toBeVisible();
  releaseGlass.resolve();
  await expect(hall.getByRole('heading', { name: 'Brass Hour', exact: true })).toBeVisible();
  await expect(hall.getByRole('heading', { name: 'Glass Hour', exact: true })).toHaveCount(0);
  await page.unroute('**/media/api/entries/*');

  await page.route('**/media/api/entries/*/episodes/next', (route) =>
    route.fulfill({ status: 502, json: { detail: 'Bad gateway' } }),
  );
  const brassButton = row(page, 'Brass Hour').getByRole('button', { name: /Watched S1E1/ });
  await brassButton.click();
  await expect(row(page, 'Brass Hour').locator('.next-episode-error')).toHaveText(
    "Can't reach Media. Your progress hasn't changed. Try again.",
  );
  await expect(brassButton).toBeEnabled();
  await expect(hall.locator('[data-seat="next"][data-code="S1E1"]')).toBeVisible();
  expect((await savedItem(request, brass.id)).show.episodes[0].watched).toBe(false);
  await page.unroute('**/media/api/entries/*/episodes/next');

  await page.route('**/media/api/entries/*', async (route) => {
    const url = route.request().url().split('?')[0];
    if (route.request().method() === 'GET' && /\/entries\/\d+$/.test(url)) {
      await route.fulfill({ status: 502, json: { detail: 'Bad gateway' } });
      return;
    }
    await route.continue();
  });
  await row(page, 'Glass Hour').getByRole('button', { name: 'Open seating for Glass Hour' }).click();
  await expect(hall.getByRole('heading', { name: 'Glass Hour', exact: true })).toBeVisible();
  await expect(hall.getByRole('alert')).toContainText('Bad gateway');
  await page.unroute('**/media/api/entries/*');
  await hall.getByRole('button', { name: 'Retry this series' }).click();
  await expect(hall.locator('[data-seat="next"][data-code="S1E1"]')).toBeVisible();
  await expect(hall.getByRole('alert')).toHaveCount(0);

  const held = deferred();
  let releaseHeld = false;
  await page.route('**/media/api/entries/*', async (route) => {
    const url = route.request().url().split('?')[0];
    if (route.request().method() === 'GET' && /\/entries\/\d+$/.test(url) && !releaseHeld) {
      await held.promise;
      try {
        await route.continue();
      } catch {
        /* Leaving the lounge can abort the in-flight seating read. */
      }
      return;
    }
    await route.continue();
  });
  await row(page, 'Brass Hour').getByRole('button', { name: 'Open seating for Brass Hour' }).click();
  await page.getByRole('navigation', { name: 'Media sections' }).getByRole('link', { name: 'Movies', exact: true }).click();
  await expect(page.locator('media-theater')).toBeVisible();
  releaseHeld = true;
  held.resolve();
  await expect(page.locator('#seating-diagram')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Brass Hour', exact: true })).toHaveCount(0);

  await page.goto('/media/library?kind=tv&sort=title');
  await row(page, 'Brass Hour').getByRole('button', { name: 'Open seating for Brass Hour' }).click();
  await expect(page.locator('#seating-diagram [data-seat="next"]')).toBeVisible();
  await page.locator('#seating-diagram').getByRole('button', { name: 'Close seating' }).click();
  await page.unroute('**/media/api/entries/*');
  await page.route('**/media/api/entries/*', async (route) => {
    const url = route.request().url().split('?')[0];
    if (route.request().method() === 'GET' && /\/entries\/\d+$/.test(url)) {
      await route.fulfill({ status: 401, json: { detail: 'Session expired' } });
      return;
    }
    await route.continue();
  });
  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await row(page, 'Brass Hour').getByRole('button', { name: 'Open seating for Brass Hour' }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('media-item-draft:')))).toEqual([]);
});
