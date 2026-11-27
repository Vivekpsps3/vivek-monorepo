import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '../../../tests/e2e/fixtures';
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

function poster(page: Page, title: string) {
  return page.locator('.theater-poster').filter({
    has: page.getByRole('link', { name: title, exact: true }),
  });
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

async function seedFilms(request: Parameters<typeof addItem>[0]) {
  const planned = await addItem(request, { kind: 'movie', title: 'Paper Lantern', status: 'want' });
  expect((await request.patch(`/media/api/entries/${planned.id}`, { data: { viewed_on: '2024-01-15' } })).ok()).toBeTruthy();
  const dated = await addItem(request, {
    kind: 'movie',
    title: 'Velvet Screening',
    status: 'completed',
    rating: 8,
    review: 'A synthetic aisle note',
  });
  expect((await request.patch(`/media/api/entries/${dated.id}`, { data: { viewed_on: '2024-03-02' } })).ok()).toBeTruthy();
  const undated = await addItem(request, { kind: 'movie', title: 'Quiet Projector', status: 'completed' });
  return { planned, dated, undated };
}

for (const [width, height, theme, pointer] of [
  [390, 844, 'light', 'keyboard'],
  [390, 844, 'dark', 'touch'],
  [1280, 800, 'light', 'touch'],
  [1280, 800, 'dark', 'keyboard'],
] as const) {
  test.describe(`theater rooms at ${width} ${theme} ${pointer}`, () => {
    test.use({ viewport: { width, height }, hasTouch: pointer === 'touch' });

    test('a poster opens the film, its date, and the personal ticket', async ({ page, request }, info) => {
      test.setTimeout(120_000);
      const violations: string[] = [];
      watchMediaConsole(page, violations);
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const seeded = await seedFilms(request);

      await page.goto('/media/library?kind=movie&sort=title');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('region', { name: 'Poster corridor' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Movie auditorium' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Ticket desk' })).toBeVisible();
      await expect(page.getByText('This theater does not play them.')).toHaveCount(1);
      await expect(page.locator('video')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /play/i })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Exit to Hub' })).toHaveAttribute('href', '/hub');

      const planned = poster(page, 'Paper Lantern');
      const dated = poster(page, 'Velvet Screening');
      const undated = poster(page, 'Quiet Projector');
      await expect(planned).toHaveAttribute('data-film', 'planned');
      await expect(planned.locator('.poster-fact')).toHaveText('Planned');
      await expect(planned.locator('.poster-date')).toHaveCount(0);
      await expect(planned).not.toContainText('2024');
      await expect(dated).toHaveAttribute('data-film', 'watched');
      await expect(dated.locator('.poster-fact')).toHaveText('Watched');
      await expect(dated.locator('.poster-date')).toContainText('Mar');
      await expect(dated.locator('.poster-date')).toContainText('2024');
      await expect(undated.locator('.poster-fact')).toHaveText('Watched');
      await expect(undated.locator('.poster-date')).toHaveCount(0);
      await expect(page.locator('.theater-poster')).toHaveCount(3);
      await expect(page.locator('media-card')).toHaveCount(0);

      const plannedScreen = page.getByRole('link', { name: 'Planned', exact: true });
      const openDated = dated.getByRole('button', { name: 'Open screening for Velvet Screening' });
      await expectTarget(plannedScreen);
      await expectTarget(openDated);
      await expectTarget(page.getByRole('link', { name: 'Exit to Hub' }));

      await activate(plannedScreen, pointer);
      await expect(page).toHaveURL(/status=want/);
      await expect(planned).toBeVisible();
      await expect(dated).toHaveCount(0);
      await expect(plannedScreen).toHaveAttribute('aria-current', 'page');
      await activate(page.getByRole('link', { name: 'All films', exact: true }), pointer);
      await expect(page).not.toHaveURL(/status=/);
      await expect(dated).toBeVisible();

      await activate(openDated, pointer);
      await expect(page.locator('#movie-auditorium-heading')).toBeFocused();
      const auditorium = page.locator('.movie-auditorium');
      await expect(auditorium.getByRole('heading', { name: 'Velvet Screening', exact: true })).toBeVisible();
      await expect(auditorium.locator('.poster-fact')).toHaveText('Watched');
      await expect(auditorium.locator('.recorded-date')).toContainText('Mar');
      await expect(auditorium.locator('.recorded-date')).toContainText('2024');
      await expect(auditorium).not.toContainText('does not play');
      const note = page.getByRole('textbox', { name: 'Note for Velvet Screening' });
      const rating = page.getByRole('combobox', { name: 'Rating for Velvet Screening' });
      const watchedOn = page.getByLabel('Watched on');
      await expect(note).toHaveValue('A synthetic aisle note');
      await expect(rating).toHaveValue('8');
      await expect(watchedOn).toHaveValue('2024-03-02');
      await expectTarget(page.getByRole('button', { name: 'Save ticket', exact: true }));
      await expectTarget(page.getByRole('link', { name: 'Open film entry', exact: true }));

      if (pointer === 'keyboard') await page.keyboard.press('Escape');
      else await activate(page.getByRole('button', { name: 'Close', exact: true }), pointer);
      await expect(openDated).toBeFocused();
      await expect(page.locator('#ticket-form-' + seeded.dated.id)).toHaveCount(0);

      await activate(openDated, pointer);
      await note.fill('Aisle note kept');
      await activate(page.getByRole('button', { name: 'Save ticket', exact: true }), pointer);
      await expect(page.locator('#ticket-form-' + seeded.dated.id)).toHaveCount(0);
      await expect(openDated).toBeFocused();
      const stored = await savedItem(request, seeded.dated.id);
      expect(stored.review).toBe('Aisle note kept');
      expect(stored.rating).toBe(8);
      expect(stored.viewed_on).toBe('2024-03-02');
      expect(stored.status).toBe('completed');

      await activate(undated.getByRole('button', { name: 'Open screening for Quiet Projector' }), pointer);
      await expect(page.locator('.movie-auditorium .recorded-date')).toHaveText('No viewing date recorded');
      await expect(page.getByLabel('Watched on')).toHaveValue('');
      await expect(page.locator('.movie-auditorium')).not.toContainText('Completed on');
      await activate(page.getByRole('button', { name: 'Close', exact: true }), pointer);

      await activate(planned.getByRole('button', { name: 'Open screening for Paper Lantern' }), pointer);
      await expect(page.locator('.movie-auditorium .poster-fact')).toHaveText('Planned');
      await expect(page.locator('.movie-auditorium .recorded-date')).toHaveText('No viewing date recorded');
      await expect(page.getByLabel('Watched on')).toHaveValue('2024-01-15');
      await expect(planned.locator('.poster-date')).toHaveCount(0);
      expect((await savedItem(request, seeded.planned.id)).status).toBe('want');

      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await expectCleanMediaPage(page, violations);
      const shot = info.outputPath(`theater-room-${width}-${theme}-${pointer}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      await info.attach(`theater-room-${width}-${theme}-${pointer}`, { path: shot, contentType: 'image/png' });
    });
  });
}

test('missing cover and a provider outage leave the rating and note editable', async ({ page, request }) => {
  test.setTimeout(90_000);
  const violations: string[] = [];
  watchMediaConsole(page, violations);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const bare = await addItem(request, {
    kind: 'movie',
    title: 'Bare Poster',
    status: 'completed',
    rating: 4,
    review: 'Kept on the ticket',
  });
  await page.goto('/media/library?kind=movie&sort=title');
  const origin = new URL(page.url()).origin;
  const torn = await addItem(request, {
    kind: 'movie',
    title: 'Torn Poster',
    status: 'want',
    rating: 2,
    review: 'Still the saved note',
    artwork_url: `${origin}/missing-poster.png`,
  });
  let refreshes = 0;
  await page.route('**/missing-poster.png', route => route.abort());
  await page.route('**/media/api/entries/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST' && path.endsWith('/refresh')) {
      refreshes += 1;
      await route.fulfill({ status: 503, json: { detail: 'Provider down' } });
      return;
    }
    await route.continue();
  });
  await page.reload();
  const barePoster = poster(page, 'Bare Poster');
  await expect(barePoster).toHaveAttribute('data-cover', 'missing');
  await expect(barePoster.locator('.poster-title-face')).toHaveText('Bare Poster');
  await barePoster.getByRole('button', { name: 'Open screening for Bare Poster' }).click();
  const bareNote = page.getByRole('textbox', { name: 'Note for Bare Poster' });
  await expect(bareNote).toHaveValue('Kept on the ticket');
  await expect(page.getByRole('combobox', { name: 'Rating for Bare Poster' })).toHaveValue('4');
  await bareNote.fill('Bare note edited');
  await page.getByRole('combobox', { name: 'Rating for Bare Poster' }).selectOption('6');
  await page.getByRole('button', { name: 'Save ticket', exact: true }).click();
  await expect(barePoster.getByRole('button', { name: 'Open screening for Bare Poster' })).toBeFocused();
  const bareStored = await savedItem(request, bare.id);
  expect(bareStored.review).toBe('Bare note edited');
  expect(bareStored.rating).toBe(6);
  expect(bareStored.status).toBe('completed');

  await page.setViewportSize({ width: 1280, height: 800 });
  const tornPoster = poster(page, 'Torn Poster');
  await expect(tornPoster).toHaveAttribute('data-cover', 'missing');
  await expect(tornPoster.locator('.poster-title-face')).toHaveText('Torn Poster');
  await tornPoster.getByRole('button', { name: 'Open screening for Torn Poster' }).click();
  const tornNote = page.getByRole('textbox', { name: 'Note for Torn Poster' });
  await expect(tornNote).toHaveValue('Still the saved note');
  await expect(page.getByRole('combobox', { name: 'Rating for Torn Poster' })).toHaveValue('2');
  await tornNote.fill('Torn note edited');
  await page.getByRole('button', { name: 'Save ticket', exact: true }).click();
  await expect(tornPoster.getByRole('button', { name: 'Open screening for Torn Poster' })).toBeFocused();
  const tornStored = await savedItem(request, torn.id);
  expect(tornStored.review).toBe('Torn note edited');
  expect(tornStored.rating).toBe(2);
  expect(tornStored.status).toBe('want');
  expect(refreshes).toBe(0);
  await expectCleanMediaPage(page, violations);
});

test('a library error is not an empty lobby, and a film error can be retried', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/media/api/library**', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 503, json: {} });
    }
    return route.continue();
  });
  await page.goto('/media/library?kind=movie');
  await expect(page.locator('.local-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry library' })).toBeVisible();
  await expect(page.getByText('No movies saved yet', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Poster corridor' })).toHaveCount(0);
  await page.unroute('**/media/api/library**');
  await page.getByRole('button', { name: 'Retry library' }).click();
  await expect(page.getByRole('region', { name: 'Poster corridor' })).toBeVisible();
  await expect(page.getByText('No movies saved yet', { exact: true })).toBeVisible();
  await expect(page.getByText('A planned film stays planned', { exact: false })).toBeVisible();
  await expect(page.getByText('This theater does not play them.')).toHaveCount(1);
  const emptyTheater = page.locator('media-theater');
  await expect(emptyTheater.getByRole('link', { name: 'All items', exact: true })).toBeVisible();
  await expect(emptyTheater.getByRole('link', { name: 'Search Media', exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  const film = await addItem(request, {
    kind: 'movie',
    title: 'Quiet Projector',
    status: 'completed',
    review: 'Kept after the error',
    rating: 5,
  });
  await page.goto('/media/library?kind=movie&status=want&sort=title');
  await expect(page.getByText('Nothing in this collection matches', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/status=/);
  const row = poster(page, 'Quiet Projector');
  await expect(row).toBeVisible();

  await page.route('**/media/api/entries/*', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 502, json: { detail: 'Bad gateway' } });
    }
    return route.continue();
  });
  await row.getByRole('button', { name: 'Open screening for Quiet Projector' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bad gateway' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Note for Quiet Projector' })).toHaveCount(0);
  await expect(row.locator('.poster-fact')).toHaveText('Watched');
  await page.unroute('**/media/api/entries/*');
  await page.getByRole('button', { name: 'Retry this film' }).click();
  await expect(page.getByRole('textbox', { name: 'Note for Quiet Projector' })).toHaveValue('Kept after the error');
  await expect(page.getByRole('combobox', { name: 'Rating for Quiet Projector' })).toHaveValue('5');
  expect((await savedItem(request, film.id)).review).toBe('Kept after the error');

  await page.getByRole('link', { name: 'Exit to Hub' }).click();
  await expect(page).toHaveURL(/\/hub$/);
  await page.goBack();
  await expect(page).toHaveURL(/kind=movie/);
  await expect(page.getByRole('region', { name: 'Poster corridor' })).toBeVisible();
  await expect(poster(page, 'Quiet Projector')).toBeVisible();
});

test('a newer ticket note survives the late save, and leaving drops a losing response', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const film = await addItem(request, {
    kind: 'movie',
    title: 'Velvet Screening',
    status: 'completed',
    review: 'A synthetic aisle note',
    rating: 8,
  });
  const other = await addItem(request, { kind: 'movie', title: 'Paper Lantern', status: 'want', review: 'Planned note' });
  await page.goto('/media/library?kind=movie&sort=title');

  const started = deferred();
  const release = deferred();
  await page.route('**/media/api/entries/*', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET' || path !== `/media/api/entries/${film.id}`) {
      await route.continue();
      return;
    }
    started.resolve();
    await release.promise;
    await route.continue();
  });
  const openDated = poster(page, 'Velvet Screening').getByRole('button', { name: 'Open screening for Velvet Screening' });
  await openDated.click();
  await started.promise;
  await poster(page, 'Paper Lantern').getByRole('button', { name: 'Open screening for Paper Lantern' }).click();
  await expect(page.getByRole('textbox', { name: 'Note for Paper Lantern' })).toHaveValue('Planned note');
  release.resolve();
  await expect(page.getByRole('textbox', { name: 'Note for Paper Lantern' })).toHaveValue('Planned note');
  await expect(page.getByRole('textbox', { name: 'Note for Velvet Screening' })).toHaveCount(0);
  await page.unroute('**/media/api/entries/*');

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await openDated.click();
  const note = page.getByRole('textbox', { name: 'Note for Velvet Screening' });
  await expect(note).toHaveValue('A synthetic aisle note');
  const held = deferred();
  const finish = deferred();
  await page.route('**/media/api/entries/*', async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    held.resolve();
    await finish.promise;
    await route.continue();
  });
  await note.fill('First aisle note');
  const saving = page.getByRole('button', { name: 'Save ticket', exact: true }).click();
  await held.promise;
  await note.fill('Newer aisle note');
  finish.resolve();
  await saving;
  await expect(page.getByText('newer edits', { exact: false })).toBeVisible();
  await expect(note).toHaveValue('Newer aisle note');
  expect((await savedItem(request, film.id)).review).toBe('First aisle note');
  expect((await savedItem(request, other.id)).review).toBe('Planned note');
  await page.unroute('**/media/api/entries/*');

  const lost = deferred();
  const drop = deferred();
  await page.route('**/media/api/entries/*', async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    lost.resolve();
    await drop.promise;
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...(await savedItem(request, film.id)),
          review: 'Lost aisle note',
        }),
      });
    } catch {
      /* Leaving the Theater aborts the in-flight save. */
    }
  });
  await note.fill('Leaving aisle note');
  const pending = page.getByRole('button', { name: 'Save ticket', exact: true }).click();
  await lost.promise;
  await page.getByRole('navigation', { name: 'Media sections' }).getByRole('link', { name: 'Series', exact: true }).click();
  drop.resolve();
  await pending.catch(() => undefined);
  await expect(page.locator('media-theater')).toHaveCount(0);
  await page.unroute('**/media/api/entries/*');
  expect((await savedItem(request, film.id)).review).toBe('First aisle note');
  await page.goto('/media/library?kind=movie&sort=title');
  await openDated.click();
  await expect(page.getByRole('textbox', { name: 'Note for Velvet Screening' })).toHaveValue('Leaving aisle note');
  await expect(page.getByRole('textbox', { name: 'Note for Velvet Screening' })).not.toHaveValue('Lost aisle note');
  expect((await savedItem(request, film.id)).review).toBe('First aisle note');
});

test('a failed ticket save keeps the typed note, and sign-out clears the draft', async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const film = await addItem(request, {
    kind: 'movie',
    title: 'Quiet Projector',
    status: 'completed',
    review: 'Original projector note',
    rating: 3,
  });
  await page.goto('/media/library?kind=movie&sort=title');
  await poster(page, 'Quiet Projector').getByRole('button', { name: 'Open screening for Quiet Projector' }).click();
  const note = page.getByRole('textbox', { name: 'Note for Quiet Projector' });
  const date = page.getByLabel('Watched on');
  await expect(date).toHaveValue('');
  await page.route('**/media/api/entries/*', route => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ status: 502, json: { detail: 'Bad gateway' } });
    }
    return route.continue();
  });
  await note.fill('Kept after the failed save');
  await date.fill('2024-04-05');
  await page.getByRole('button', { name: 'Save ticket', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Bad gateway' })).toBeVisible();
  await expect(note).toHaveValue('Kept after the failed save');
  await expect(date).toHaveValue('2024-04-05');
  const stored = await savedItem(request, film.id);
  expect(stored.review).toBe('Original projector note');
  expect(stored.viewed_on ?? null).toBeNull();
  expect(stored.rating).toBe(3);
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('media-item-draft:')))).toBe(true);
  await page.unroute('**/media/api/entries/*');

  const ended = await page.request.post('/api/auth/logout', {
    headers: { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin },
  });
  expect(ended.ok(), await ended.text()).toBeTruthy();
  await page.route('**/media/api/entries/' + film.id, route =>
    route.fulfill({ status: 401, json: { detail: 'Session expired' } }),
  );
  await page.getByRole('button', { name: 'Save ticket', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('media-item-draft:')))).toEqual([]);
});
