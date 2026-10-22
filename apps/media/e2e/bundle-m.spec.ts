import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('an empty add form explains itself and does not leave the page', async ({ page }) => {
  await page.goto('/media/#/new');
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('Enter a title.')).toBeVisible();
  await expect(page.getByLabel('Title')).toBeFocused();
  await expect(page).toHaveURL(/#\/new/);
  await page.getByLabel('Year').fill('99');
  await page.getByLabel('Title').fill('Synthetic Year');
  await page.getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByText('Year must be a number from 1000 to 3000.')).toBeVisible();
  await expect(page).toHaveURL(/#\/new/);
});

test('search tells the truth when movie and game catalogs are missing', async ({ page }) => {
  await page.route('**/api/search**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: url.searchParams.get('q'),
        results: [],
        providers: { tmdb: 'unconfigured', rawg: 'unconfigured', openlibrary: 'ok', musicbrainz: 'ok' },
      }),
    });
  });
  await page.goto('/media/#/search');
  await expect(page.getByText('Results come from public catalogs.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search' }).fill('d');
  await expect(page.getByText('Type at least 2 letters.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search' }).fill('dune');
  await expect(page.getByText("Movies, series and games can't be searched right now.")).toBeVisible();
  await expect(page.getByRole('heading', { name: /No public match for/ })).toBeVisible();
});

test('Now, Library, and Calendar use the spec headings and one library list', async ({ page }) => {
  await page.goto('/media/#/');
  await expect(page.getByRole('heading', { level: 1, name: 'Now' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find something to add' })).toBeVisible();
  await expect(page.locator('.grid .card').first()).toBeVisible();

  await page.goto('/media/#/library');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Library · \d+/);
  await expect(page.getByLabel('Search your library')).toBeVisible();
  await expect(page.locator('.grid .card').first()).toBeVisible();
  const libraryLoad = page.waitForResponse(response => (
    response.url().includes('/api/library') && response.request().method() === 'GET'
  ));
  await page.getByRole('link', { name: '★ Favorites' }).click();
  const response = await libraryLoad;
  expect(response.ok()).toBeTruthy();
  await expect(page).toHaveURL(/fav=1/);
  await expect(page.getByRole('link', { name: '★ Favorites' })).toHaveAttribute('aria-current', 'true');

  await page.goto('/media/#/calendar');
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Previous month' })).toBeVisible();
});

test('removing an item asks before it deletes, and cancel leaves it in place', async ({ page }) => {
  await page.goto('/media/#/library');
  await page.getByRole('link', { name: /Dune/ }).click();
  await page.getByRole('button', { name: 'Remove from library' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Remove Dune?' })).toBeVisible();
  await expect(dialog).toContainText('album and song scores');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();
});

test('a failed status save retires after the save succeeds and when the item changes', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const items = (await listed.json()).items;
  const dune = items.find((item: { title: string }) => item.title === 'Dune');
  const alpha = items.find((item: { title: string }) => item.title === 'Alpha');
  let failStatus = true;
  await page.route('**/api/entries/**', async route => {
    if (failStatus && route.request().method() === 'PATCH') {
      const body = route.request().postData() || '';
      if (body.includes('"status"')) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Status was not saved.' }) });
        return;
      }
    }
    await route.continue();
  });
  await page.goto(`/media/#/item/${dune.id}`);
  await page.getByRole('radio', { name: 'Paused' }).click();
  await expect(page.locator('[data-toast-key^="status:"]')).toBeVisible();
  await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(alpha.id));
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
  await expect(page.locator('[data-toast-key^="status:"]')).toHaveCount(0);
  await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(dune.id));
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();
  failStatus = false;
  await page.getByRole('radio', { name: 'Paused' }).click();
  await expect(page.getByRole('radio', { name: 'Paused' })).toHaveClass(/is-on/);
  await expect(page.locator('[data-toast-key^="status:"]')).toHaveCount(0);
});

test('a failed note or progress save retires when the item changes', async ({ page, request }) => {
  const listed = await request.get('/media/api/library');
  const items = (await listed.json()).items;
  const dune = items.find((item: { title: string }) => item.title === 'Dune');
  const alpha = items.find((item: { title: string }) => item.title === 'Alpha');
  let mode: 'note' | 'progress' = 'note';
  await page.route('**/api/entries/**', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postData() || '';
      const failNote = mode === 'note' && body.includes('"review"');
      const failProgress = mode === 'progress' && body.includes('"progress_value"');
      if (failNote || failProgress) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Not saved.' }),
        });
        return;
      }
    }
    await route.continue();
  });

  await page.goto(`/media/#/item/${dune.id}`);
  const note = page.locator('#note');
  await note.fill('A note that fails to save');
  await note.blur();
  await expect(page.locator('[data-toast-key^="note:"]')).toBeVisible();
  await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(alpha.id));
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
  await expect(page.locator('[data-toast-key^="note:"]')).toHaveCount(0);

  mode = 'progress';
  await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(dune.id));
  await expect(page.getByRole('heading', { name: 'Dune' })).toBeVisible();
  const progress = page.getByLabel('Progress', { exact: true });
  await progress.fill('120');
  await progress.press('Enter');
  await expect(page.locator('[data-toast-key^="progress:"]')).toBeVisible();
  await page.evaluate(id => { location.hash = `#/item/${id}`; }, String(alpha.id));
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
  await expect(page.locator('[data-toast-key^="progress:"]')).toHaveCount(0);
});

test('axe reports no serious or critical issues on the main screens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/media/');
  await page.evaluate(() => {
    localStorage.setItem('suite-theme', 'light');
    localStorage.setItem('media-theme', 'light');
  });
  const screens: Array<[string, string]> = [
    ['#/', 'now'],
    ['#/library', 'library'],
    ['#/search', 'search'],
    ['#/calendar', 'calendar'],
    ['#/item/1', 'item'],
    ['#/new', 'add'],
  ];
  for (const [hash, name] of screens) {
    await page.evaluate(value => { location.hash = value; }, hash);
    if (name === 'now') await expect(page.getByRole('heading', { name: 'Now' })).toBeVisible();
    if (name === 'library') await expect(page.locator('.grid .card').first()).toBeVisible();
    if (name === 'search') await expect(page.getByText('Results come from public catalogs.')).toBeVisible();
    if (name === 'calendar') await expect(page.getByRole('link', { name: 'Today' })).toBeVisible();
    if (name === 'item') await expect(page.locator('.opinion .status-mark').first()).toBeVisible();
    if (name === 'add') await expect(page.getByLabel('Title')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(row => row.impact === 'serious' || row.impact === 'critical');
    expect(serious, `${name}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
  }
});
