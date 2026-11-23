import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Locator, type Page } from '../../../tests/e2e/fixtures';
import {
  addItem,
  deferred,
  expectCleanMediaPage,
  resetMedia,
  savedItem,
  watchMediaConsole,
} from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));
test.use({ reducedMotion: 'reduce' });

async function addEpisode(
  request: APIRequestContext,
  entryId: number,
  episode: { season_number: number; episode_number: number; title: string; air_date: string },
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

async function episodeWatched(
  request: APIRequestContext,
  entryId: number,
  season: number,
  episode: number,
) {
  const detail = await savedItem(request, entryId);
  const found = detail.show.episodes.find(
    (row: { season_number: number; episode_number: number; watched: boolean }) =>
      row.season_number === season && row.episode_number === episode,
  );
  return found?.watched === true;
}

async function seedShelf(request: APIRequestContext) {
  const planned = await addItem(request, { kind: 'movie', title: 'Paper Lantern', status: 'want' });
  expect((await request.patch(`/media/api/entries/${planned.id}`, { data: { viewed_on: '2024-01-15' } })).ok()).toBeTruthy();
  const dated = await addItem(request, { kind: 'movie', title: 'Velvet Screening', status: 'completed' });
  expect((await request.patch(`/media/api/entries/${dated.id}`, { data: { viewed_on: '2024-03-02' } })).ok()).toBeTruthy();
  const undated = await addItem(request, { kind: 'movie', title: 'Quiet Projector', status: 'completed' });
  const blank = await addItem(request, {
    kind: 'tv',
    title: 'Blank Season',
    status: 'in_progress',
    extra: { lifecycle: 'ended' },
  });
  const lantern = await addItem(request, {
    kind: 'tv',
    title: 'Lantern Hour',
    status: 'in_progress',
    extra: { lifecycle: 'ongoing' },
  });
  await addEpisode(request, lantern.id, {
    season_number: 1,
    episode_number: 1,
    title: 'Pilot',
    air_date: '2020-01-01',
  });
  await markNext(request, lantern.id);
  const ended = await addItem(request, {
    kind: 'tv',
    title: 'Last Reel',
    status: 'completed',
    extra: { lifecycle: 'Ended' },
  });
  await addEpisode(request, ended.id, {
    season_number: 1,
    episode_number: 1,
    title: 'Finale',
    air_date: '2020-01-01',
  });
  await markNext(request, ended.id);
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
  await addItem(request, { kind: 'book', title: 'Margin Notes', status: 'want' });
  return { planned, dated, undated, blank, lantern, ended, glass };
}

function card(page: Page, title: string) {
  return page.locator('media-card, .theater-poster, .lounge-row').filter({
    has: page.getByRole('link', { name: title, exact: true }),
  });
}

async function openCollection(page: Page, kind: 'movie' | 'tv') {
  await page.goto(`/media/library?kind=${kind}&sort=title`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', /.+/);
  if (kind === 'movie') {
    await expect(page.locator('media-theater')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Lobby' })).toBeVisible();
  } else {
    await expect(page.locator('media-episode-lounge')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Episode lounge' })).toBeVisible();
  }
}

async function activate(control: Locator, pointer: 'keyboard' | 'touch') {
  await control.scrollIntoViewIfNeeded();
  if (pointer === 'touch') {
    await control.tap();
    return;
  }
  await control.focus();
  await control.press('Enter');
}

async function expectTarget(control: Locator) {
  const box = await control.boundingBox();
  expect(box).toBeTruthy();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
}

for (const [width, height, theme, pointer] of [
  [390, 844, 'light', 'keyboard'],
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'touch'],
  [1280, 800, 'dark', 'keyboard'],
] as const) {
  test.describe(`theater shelf at ${width} ${theme} ${pointer}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch' });

    test('films and series keep recorded progress', async ({ page, request }, info) => {
      test.setTimeout(120_000);
      const violations: string[] = [];
      watchMediaConsole(page, violations);
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const shelf = await seedShelf(request);

      await openCollection(page, 'movie');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByText('Movies. Films you want to watch', { exact: false })).toBeVisible();
      const planned = card(page, 'Paper Lantern');
      const dated = card(page, 'Velvet Screening');
      const undated = card(page, 'Quiet Projector');
      await expect(planned).toHaveAttribute('data-film', 'planned');
      await expect(planned.locator('.poster-fact')).toHaveText('Planned');
      await expect(planned.locator('.poster-date')).toHaveCount(0);
      await expect(planned).not.toContainText('2024');
      await expect(dated.locator('.poster-fact')).toHaveText('Watched');
      await expect(dated.locator('.poster-date')).toContainText('Mar');
      await expect(dated.locator('.poster-date')).toContainText('2024');
      await expect(undated.locator('.poster-fact')).toHaveText('Watched');
      await expect(undated.locator('.poster-date')).toHaveCount(0);
      await expect(page.locator('.theater-poster')).toHaveCount(3);
      await expect(page.locator('media-card')).toHaveCount(0);
      await expect(page.getByRole('progressbar')).toHaveCount(0);
      const filmLink = planned.getByRole('link', { name: 'Paper Lantern', exact: true });
      await expectTarget(filmLink);

      await openCollection(page, 'tv');
      await expect(page.getByText('Series. Shows and the episodes', { exact: false })).toBeVisible();
      const blank = card(page, 'Blank Season');
      await expect(blank.locator('.poster-fact')).toHaveText('No episodes logged');
      await expect(blank.locator('.poster-lifecycle')).toHaveText('Ended');
      await expect(blank.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
      await expect(blank.getByText('Waiting for the next episode')).toHaveCount(0);

      const lantern = card(page, 'Lantern Hour');
      await expect(lantern.locator('.poster-fact')).toHaveText('Caught up');
      await expect(lantern.locator('.poster-lifecycle')).toHaveText('Ongoing');
      await expect(lantern.getByText('Waiting for the next episode', { exact: true })).toBeVisible();
      await expect(lantern.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
      await expect(lantern.locator('.poster-fact')).not.toHaveText('Ended');

      await addEpisode(request, shelf.lantern.id, {
        season_number: 1,
        episode_number: 2,
        title: 'Later',
        air_date: '2099-01-01',
      });
      await page.reload();
      await expect(lantern.locator('.poster-fact')).toHaveText('Caught up');
      await expect(lantern.locator('.poster-lifecycle')).toHaveText('Ongoing');
      await expect(lantern.locator('.poster-air')).toContainText('2099');
      await expect(lantern.getByText('Waiting for the next episode', { exact: true })).toBeVisible();

      await addEpisode(request, shelf.lantern.id, {
        season_number: 1,
        episode_number: 3,
        title: 'Return',
        air_date: '2020-06-01',
      });
      await page.reload();
      await expect(lantern.locator('.poster-fact')).toHaveText('Next S1E3');
      await expect(lantern.locator('.poster-lifecycle')).toHaveText('Ongoing');
      await expect(lantern.locator('.poster-air')).toHaveCount(0);
      const nextButton = lantern.getByRole('button', { name: /Watched S1E3/ });
      await expect(nextButton).toBeVisible();
      await expectTarget(nextButton);

      const ended = card(page, 'Last Reel');
      await expect(ended.locator('.poster-fact')).toHaveText('Caught up');
      await expect(ended.locator('.poster-lifecycle')).toHaveText('Ended');
      await expect(ended.getByText('Waiting for the next episode')).toHaveCount(0);
      await expect(ended.getByRole('button', { name: /Watched S/ })).toHaveCount(0);

      const title = lantern.getByRole('link', { name: 'Lantern Hour', exact: true });
      await activate(nextButton, pointer);
      await expect(page.locator('.toast').filter({ hasText: 'Marked S1E3 watched' })).toBeVisible();
      await expect(lantern.locator('.poster-fact')).toHaveText('Caught up');
      await expect(lantern.locator('.poster-lifecycle')).toHaveText('Ongoing');
      await expect(lantern.getByText('Waiting for the next episode', { exact: true })).toBeVisible();
      await expect(title).toBeFocused();
      expect(await episodeWatched(request, shelf.lantern.id, 1, 3)).toBe(true);
      const toast = page.locator('.toast').filter({ hasText: 'Marked S1E3 watched' });
      await activate(toast.getByRole('button', { name: 'Undo' }), pointer);
      await expect(page.locator('.toast').filter({ hasText: 'S1E3 is next again.' })).toBeVisible();
      await expect(lantern.getByRole('button', { name: /Watched S1E3/ })).toBeVisible();
      await expect(title).toBeFocused();
      expect(await episodeWatched(request, shelf.lantern.id, 1, 3)).toBe(false);

      const openSeating = lantern.getByRole('button', { name: 'Open seating for Lantern Hour' });
      await expectTarget(openSeating);
      await activate(openSeating, pointer);
      await expect(page.locator('#seating-diagram-heading')).toBeFocused();
      const hall = page.locator('#seating-diagram');
      await expect(hall.locator('[data-seat="watched"][data-code="S1E1"]')).toBeVisible();
      await expect(hall.locator('[data-seat="future"][data-code="S1E2"]')).toContainText('2099');
      await expect(hall.locator('[data-seat="next"][data-code="S1E3"]')).toBeVisible();
      await expect(hall.locator('.poster-lifecycle')).toHaveText('Ongoing');
      await expect(hall.locator('.poster-fact')).toHaveText('Next S1E3');
      await expect(page.locator('video')).toHaveCount(0);
      await expectTarget(page.getByRole('link', { name: 'See where these dates sit' }));
      const closeSeating = hall.getByRole('button', { name: 'Close seating' });
      await expectTarget(closeSeating);
      await activate(closeSeating, pointer);
      await expect(openSeating).toBeFocused();

      await page.route('**/media/api/entries/*/episodes/next', route =>
        route.fulfill({ status: 502, json: { detail: 'Bad gateway' } }),
      );
      const glass = card(page, 'Glass Hour');
      const glassButton = glass.getByRole('button', { name: /Watched S1E1/ });
      await activate(glassButton, pointer);
      await expect(glass.locator('.next-episode-error')).toHaveText(
        "Can't reach Media. Your progress hasn't changed. Try again.",
      );
      await expect(glassButton).toBeEnabled();
      expect(await episodeWatched(request, shelf.glass.id, 1, 1)).toBe(false);
      await page.unroute('**/media/api/entries/*/episodes/next');

      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await expectCleanMediaPage(page, violations);
      const shot = info.outputPath(`theater-${width}-${theme}-${pointer}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      await info.attach(`theater-${width}-${theme}-${pointer}`, { path: shot, contentType: 'image/png' });
    });
  });
}

test('empty shelves say what is missing and other collections stay rows', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/media/library?kind=movie');
  await expect(page.getByText('No movies saved yet', { exact: true })).toBeVisible();
  await expect(page.getByText('A planned film stays planned', { exact: false })).toBeVisible();
  await page.goto('/media/library?kind=tv');
  await expect(page.getByText('No series saved yet', { exact: true })).toBeVisible();
  await expect(page.getByText('Caught up is where you are', { exact: false })).toBeVisible();

  await addItem(request, { kind: 'movie', title: 'Paper Lantern', status: 'want' });
  await addItem(request, { kind: 'book', title: 'Margin Notes', status: 'want' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/media/library?kind=book&sort=title');
  await expect(page.locator('media-book-shelf')).toBeVisible();
  await expect(page.locator('media-card, .media-card--poster')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'To read', exact: true })).toBeVisible();
  await page.goto('/media/library?sort=title');
  await expect(page.locator('.media-card--poster')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Paper Lantern', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Margin Notes', exact: true })).toBeVisible();
});

test('movie and series URLs keep sort and filters', async ({ page, request }) => {
  await seedShelf(request);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/media/library?kind=movie&sort=title&status=want');
  await expect(page.getByRole('link', { name: 'Paper Lantern', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Velvet Screening', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/kind=movie/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(/status=want/);
  await page.getByRole('navigation', { name: 'Media sections' }).getByRole('link', { name: 'Series', exact: true }).click();
  await expect(page).toHaveURL(/kind=tv/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(/status=want/);
  await expect(page.getByRole('link', { name: 'Lantern Hour', exact: true })).toHaveCount(0);
  await page.goto('/media/library?kind=tv&sort=title');
  await expect(card(page, 'Lantern Hour').locator('.poster-lifecycle')).toHaveText('Ongoing');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page).toHaveURL(/kind=tv/);
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).not.toHaveURL(/status=/);
  await expect(card(page, 'Lantern Hour').locator('.poster-fact')).toHaveText('Caught up');
});

test('a stale library response cannot undo a mark, and Movies ignore a late series save', async ({ page, request }) => {
  test.setTimeout(90_000);
  const late = await addItem(request, {
    kind: 'tv',
    title: 'Late Reel',
    status: 'in_progress',
    extra: { lifecycle: 'ongoing' },
  });
  await addEpisode(request, late.id, {
    season_number: 1,
    episode_number: 1,
    title: 'Pilot',
    air_date: '2020-01-01',
  });
  await addEpisode(request, late.id, {
    season_number: 1,
    episode_number: 2,
    title: 'Second',
    air_date: '2020-02-01',
  });
  await addItem(request, { kind: 'movie', title: 'Lobby Card', status: 'want' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/media/library?kind=tv&sort=title');
  const show = card(page, 'Late Reel');
  await expect(show.getByRole('button', { name: /Watched S1E1/ })).toBeVisible();

  const started = deferred();
  const release = deferred();
  let captured = false;
  await page.route('**/media/api/library**', async route => {
    if (route.request().method() !== 'GET' || captured) {
      await route.continue();
      return;
    }
    captured = true;
    const response = await route.fetch();
    const body = await response.text();
    started.resolve();
    await release.promise;
    await route.fulfill({
      status: response.status(),
      contentType: 'application/json',
      body,
    });
  });
  await page.getByLabel('Search your library').fill('Late');
  await started.promise;
  await show.getByRole('button', { name: /Watched S1E1/ }).click();
  await expect(show.getByRole('button', { name: /Watched S1E2/ })).toBeVisible();
  release.resolve();
  await expect(show.getByRole('button', { name: /Watched S1E2/ })).toBeVisible();
  expect(await episodeWatched(request, late.id, 1, 1)).toBe(true);
  await page.unroute('**/media/api/library**');
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/media/api/library') && response.request().method() === 'GET'),
    page.getByLabel('Search your library').fill(''),
  ]);
  await expect(page).not.toHaveURL(/q=/);
  await expect(show.getByRole('button', { name: /Watched S1E2/ })).toBeVisible();

  const held = deferred();
  const finish = deferred();
  await page.route('**/media/api/entries/*/episodes/next', async route => {
    held.resolve();
    await finish.promise;
    try {
      await route.continue();
    } catch {
      /* Leaving the series shelf can abort the in-flight mark. */
    }
  });
  const pending = show.getByRole('button', { name: /Watched S1E2/ }).click();
  await held.promise;
  await page.getByRole('navigation', { name: 'Media sections' }).getByRole('link', { name: 'Movies', exact: true }).click();
  await expect(card(page, 'Lobby Card').locator('.poster-fact')).toHaveText('Planned');
  await expect(page.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
  await expect(page.getByText('Next S1E2', { exact: true })).toHaveCount(0);
  finish.resolve();
  await pending.catch(() => undefined);
  await expect(card(page, 'Lobby Card').locator('.poster-fact')).toHaveText('Planned');
  await expect(page.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
  await page.unroute('**/media/api/entries/*/episodes/next');
  await page.goto('/media/library?kind=tv&sort=title');
  const watched = await episodeWatched(request, late.id, 1, 2);
  if (watched) {
    await expect(card(page, 'Late Reel').locator('.poster-fact')).toHaveText('Caught up');
  } else {
    await expect(card(page, 'Late Reel').getByRole('button', { name: /Watched S1E2/ })).toBeVisible();
  }
});

test('a failed film date stays on the form and sign-out clears the draft', async ({ page, request }) => {
  test.setTimeout(90_000);
  const film = await addItem(request, { kind: 'movie', title: 'Quiet Projector', status: 'completed' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/media/item/' + film.id);
  await expect(page.getByRole('heading', { name: 'Quiet Projector', exact: true })).toBeVisible();
  const date = page.getByLabel('Watched on');
  await expect(date).toHaveValue('');
  const started = deferred();
  const release = deferred();
  await page.route('**/media/api/entries/*', async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    started.resolve();
    await release.promise;
    await route.continue();
  });
  await date.fill('2024-03-02');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await started.promise;
  await date.fill('2024-04-05');
  release.resolve();
  await expect(page.getByText('newer edits', { exact: false })).toBeVisible();
  await expect(date).toHaveValue('2024-04-05');
  expect((await savedItem(request, film.id)).viewed_on).toBe('2024-03-02');
  await page.unroute('**/media/api/entries/*');

  await page.route('**/media/api/entries/*', route => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ status: 502, json: { detail: 'Bad gateway' } });
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bad gateway' })).toBeVisible();
  await expect(date).toHaveValue('2024-04-05');
  expect((await savedItem(request, film.id)).viewed_on).toBe('2024-03-02');
  expect(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('media-item-draft:')))).toBe(true);
  await page.unroute('**/media/api/entries/*');

  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await page.route('**/media/api/entries/' + film.id, route =>
    route.fulfill({ status: 401, json: { detail: 'Session expired' } }),
  );
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('media-item-draft:')))).toEqual([]);
});
