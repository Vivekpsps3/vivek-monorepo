import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Locator, type Page } from '../../../tests/e2e/fixtures';
import { addItem, expectCleanMediaPage, resetMedia, savedItem, watchMediaConsole } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

const faces = [
  [390, 844, 'light', 'keyboard'],
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'touch'],
  [1280, 800, 'dark', 'keyboard'],
] as const;

async function seedShow(request: APIRequestContext, title: string, episodes: Record<string, unknown>[]) {
  const show = await addItem(request, { kind: 'tv', title, status: 'in_progress' });
  for (const episode of episodes) {
    const response = await request.post('/media/api/entries/' + show.id + '/episodes', { data: episode });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  return show;
}

async function markNext(request: APIRequestContext, id: number, times = 1) {
  for (let index = 0; index < times; index += 1) {
    const response = await request.post('/media/api/entries/' + id + '/episodes/next', { data: {} });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
}

function watchProviders(page: Page) {
  const hits: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/tmdb|tvmaze|wikidata|musicbrainz|openlibrary|rawg/i.test(url)) hits.push(url);
    if (/\/media\/api\/entries\/\d+\/refresh|\/media\/api\/search|\/media\/api\/calendar\/refresh/.test(url)) hits.push(url);
  });
  return hits;
}

async function theme(page: Page, choice: 'light' | 'dark') {
  await page.addInitScript((value) => {
    localStorage.setItem('suite-theme', value);
    document.documentElement.setAttribute('data-theme', value);
  }, choice);
}

async function activate(control: Locator, pointer: 'keyboard' | 'touch') {
  await control.scrollIntoViewIfNeeded();
  if (pointer === 'touch') {
    await control.tap();
    return;
  }
  await control.focus();
  await expect(control).toBeFocused();
  await control.press('Enter');
}

async function expectInView(page: Page, control: Locator) {
  const box = await control.boundingBox();
  expect(box).toBeTruthy();
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
  return box!;
}

async function expectAxe(page: Page) {
  const scan = await new AxeBuilder({ page }).include('main').analyze();
  expect(scan.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
}

for (const [width, height, mode, pointer] of faces) {
  test.describe(`saved series resume ${width} ${mode} ${pointer}`, () => {
    test.use({
      viewport: { width, height },
      hasTouch: pointer === 'touch',
      reducedMotion: 'reduce',
    });

    test('direct, Now, and Series show the next episode before metadata edits', async ({ page, request }) => {
      test.setTimeout(120_000);
      const violations: string[] = [];
      const providers = watchProviders(page);
      watchMediaConsole(page, violations);
      await theme(page, mode);
      const show = await seedShow(request, 'Resume Signal', [
        { season_number: 1, episode_number: 1, title: 'Pilot', air_date: '2000-01-01' },
        { season_number: 1, episode_number: 2, title: 'Second', air_date: '2000-01-08' },
      ]);

      await page.goto('/media/item/' + show.id);
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await expect(page.getByRole('heading', { name: 'Resume Signal', exact: true })).toBeVisible();
      const action = page.getByRole('button', { name: 'Watched S1E1', exact: true });
      const actionBox = await expectInView(page, action);
      await expect(page.getByText(/Next: S1E1 · Pilot/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mark next watched', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Watched S1E1/ })).toHaveCount(1);
      await expect(page.getByLabel('Progress', { exact: true })).toBeHidden();
      const episodeHeading = page.getByRole('heading', { name: 'Episode progress', exact: true });
      const episodeBox = await episodeHeading.boundingBox();
      expect(episodeBox).toBeTruthy();
      expect(actionBox.y).toBeLessThan(episodeBox!.y);
      const back = page.getByRole('link', { name: '← Library', exact: true });
      await expect(back).toHaveAttribute('href', /\/media\/library\?kind=tv$/);
      await expect(page.getByRole('link', { name: '← Calendar' })).toHaveCount(0);
      await expectAxe(page);

      await page.getByRole('button', { name: 'Edit rating and note', exact: true }).click();
      const note = page.getByLabel('Note (optional)', { exact: true });
      await expect(note).toBeFocused();
      await note.fill('Keep the harbor note');
      await page.getByRole('radio', { name: '4 out of 10', exact: true }).click();
      await activate(action, pointer);
      await expect(page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Watched S1E2', exact: true })).toBeVisible();
      expect((await savedItem(request, show.id)).show.episodes.find((episode: { title: string }) => episode.title === 'Pilot').watched).toBe(true);
      await expect(note).toHaveValue('Keep the harbor note');
      await expect(page.getByRole('radio', { name: '4 out of 10', exact: true })).toBeChecked();
      await page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' }).getByRole('button', { name: 'Undo' }).click();
      await expect(page.locator('.toast').filter({ hasText: 'S1E1 is next again.' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Watched S1E1', exact: true })).toBeVisible();
      await expect(note).toHaveValue('Keep the harbor note');
      expect((await savedItem(request, show.id)).show.episodes.find((episode: { title: string }) => episode.title === 'Pilot').watched).toBe(false);
      expect(providers).toEqual([]);

      page.once('dialog', (dialog) => dialog.accept());
      await page.goto('/media');
      const nowCard = page.locator('media-card').filter({ hasText: 'Resume Signal' });
      const nowLink = nowCard.getByRole('link', { name: 'Resume Signal', exact: true });
      await activate(nowLink, pointer);
      await expect(page.getByRole('heading', { name: 'Resume Signal', exact: true })).toBeVisible();
      await expectInView(page, page.getByRole('button', { name: 'Watched S1E1', exact: true }));
      const nowBack = page.getByRole('link', { name: '← Now', exact: true });
      await expect(nowBack).toHaveAttribute('href', /\/media$/);
      await activate(nowBack, pointer);
      await page.getByRole('button', { name: 'Leave item', exact: true }).click();
      await expect(page).toHaveURL(/\/media\/?$/);
      await expect(nowLink).toBeFocused();

      await page.goto('/media/library?kind=tv&sort=title');
      const seriesLink = page.locator('.lounge-row').getByRole('link', { name: 'Resume Signal', exact: true });
      await activate(seriesLink, pointer);
      await expect(page.getByRole('heading', { name: 'Resume Signal', exact: true })).toBeVisible();
      await expectInView(page, page.getByRole('button', { name: 'Watched S1E1', exact: true }));
      await expect(page.getByRole('link', { name: '← Library', exact: true })).toBeVisible();
      await activate(page.getByRole('link', { name: '← Library', exact: true }), pointer);
      await page.getByRole('button', { name: 'Leave item', exact: true }).click();
      await expect(page).toHaveURL(/\/media\/library\?kind=tv/);
      await expect(seriesLink).toBeFocused();
      expect(providers).toEqual([]);
      await expectCleanMediaPage(page, violations);
    });
  });
}

test.describe('series action changes', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('catch-up, unreleased, no detail, and an unavailable source change the action', async ({ page, request }) => {
    test.setTimeout(90_000);
    const violations: string[] = [];
    const providers = watchProviders(page);
    watchMediaConsole(page, violations);
    await theme(page, 'light');
    const caught = await seedShow(request, 'Caught Signal', [
      { season_number: 1, episode_number: 1, title: 'One', air_date: '2000-01-01' },
      { season_number: 1, episode_number: 2, title: 'Two', air_date: '2000-01-08' },
    ]);
    await markNext(request, caught.id, 2);
    const future = await seedShow(request, 'Future Signal', [
      { season_number: 1, episode_number: 1, title: 'Later', air_date: '2099-08-01' },
    ]);
    const empty = await addItem(request, { kind: 'tv', title: 'Empty Signal', status: 'in_progress' });
    const pending = await addItem(request, { kind: 'tv', title: 'Pending Signal', status: 'in_progress' });
    await page.route('**/media/api/entries/' + pending.id, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const body = await response.json();
      body.catalog.extra = { ...(body.catalog.extra || {}), metadata_pending: true, metadata_retries: 0 };
      await route.fulfill({ json: body });
    });

    for (const [width, height] of [[390, 844], [1280, 800]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/media/item/' + caught.id);
      await expect(page.getByText('Caught up', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Waiting for the next episode', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
      const waiting = page.getByText('Waiting for the next episode', { exact: true });
      const waitingBox = await waiting.boundingBox();
      expect(waitingBox).toBeTruthy();
      expect(waitingBox!.y + waitingBox!.height).toBeLessThanOrEqual(height + 1);

      await page.goto('/media/item/' + future.id);
      await expect(page.getByText(/Next: S1E1 · airs .*2099/)).toBeVisible();
      await expect(page.getByText('Waiting for the next episode', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /Watched S/ })).toHaveCount(0);

      await page.goto('/media/item/' + empty.id);
      await expect(page.getByText('No episode detail', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
      await expect(page.getByText('Waiting for the next episode', { exact: true })).toHaveCount(0);

      await page.goto('/media/item/' + pending.id);
      await expect(page.getByText('Episode source unavailable', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /Watched S/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Edit rating and note', exact: true })).toBeVisible();
    }
    expect(providers).toEqual([]);
    await expectCleanMediaPage(page, violations);
  });
});

test.describe('calendar month return', () => {
  for (const [width, height, mode, pointer] of [
    [390, 844, 'dark', 'touch'],
    [1280, 800, 'light', 'keyboard'],
  ] as const) {
    test.describe(`${width} ${mode} ${pointer}`, () => {
      test.use({
        viewport: { width, height },
        hasTouch: pointer === 'touch',
        reducedMotion: 'reduce',
      });

      test('an August episode returns to that month and link', async ({ page, request }) => {
        test.setTimeout(90_000);
        const violations: string[] = [];
        const providers = watchProviders(page);
        watchMediaConsole(page, violations);
        await theme(page, mode);
        const show = await seedShow(request, 'August Signal', [
          { season_number: 1, episode_number: 1, title: 'August Lantern', air_date: '2026-08-15' },
          { season_number: 1, episode_number: 2, title: 'September Lantern', air_date: '2026-09-01' },
        ]);
        await page.goto('/media/calendar?month=2026-08');
        await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
        await expect(page.getByLabel('Month')).toHaveValue('2026-08');
        const source = page.getByRole('link', { name: 'August Lantern', exact: true });
        await expect(source).toBeVisible();
        await activate(source, pointer);
        await expect(page.getByRole('heading', { name: 'August Signal', exact: true })).toBeVisible();
        await expectInView(page, page.getByRole('button', { name: 'Watched S1E1', exact: true }));
        await expect(page.getByText(/Next: S1E1 · August Lantern/)).toBeVisible();
        const back = page.getByRole('link', { name: '← Calendar', exact: true });
        await expect(back).toHaveAttribute('href', /\/media\/calendar\?month=2026-08$/);
        await activate(back, pointer);
        await expect(page).toHaveURL(/\/media\/calendar\?month=2026-08$/);
        await expect(page.getByLabel('Month')).toHaveValue('2026-08');
        await expect(source).toBeFocused();
        await expect(page.getByRole('link', { name: '← Library' })).toHaveCount(0);
        expect((await savedItem(request, show.id)).show.next_episode.episode_number).toBe(1);
        expect(providers).toEqual([]);
        await expectCleanMediaPage(page, violations);
      });
    });
  }
});
