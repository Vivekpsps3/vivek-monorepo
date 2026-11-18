import { expect, test, type APIRequestContext, type Page } from '../../../tests/e2e/fixtures';
import { addItem, closeFilters, expectCleanMediaPage as expectCleanPage, expectSectionHeading, openFilters, resetMedia, watchMediaConsole } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

const theme = 'light';
const viewport = { width: 390, height: 844 };

async function openLibrary(page: Page, theme: string, violations: string[], url = '/media/library') {
  await page.addInitScript((t) => localStorage.setItem('suite-theme', t), theme);
  watchMediaConsole(page, violations);
  await page.goto(url);
  await expectSectionHeading(page);
}

async function tagItem(request: APIRequestContext, id: number, tags: string[]) {
  const response = await request.patch('/media/api/entries/' + id, { data: { tags } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.use({ viewport });

test('first result is above 450px at 390', async ({ page, request }) => {
  const violations: string[] = [];
  await addItem(request, { title: 'First result story' });
  await openLibrary(page, theme, violations);
  const card = page.locator('media-card').first();
  await expect(card).toBeVisible();
  await expect(page.getByText('Find something new')).toHaveCount(0);
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThan(450);
  await expectCleanPage(page, violations);
});

test('search filters live after typing', async ({ page, request }) => {
  const violations: string[] = [];
  await addItem(request, { title: 'Browser story' });
  await page.clock.install({ time: new Date('2026-10-15T12:00:00Z') });
  let requests = 0;
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/media/api/library')) requests++;
  });
  await openLibrary(page, theme, violations);
  await expect(page.locator('media-card')).toHaveCount(4);
  // Let Angular finish its initial render before pausing application timers.
  await page.clock.pauseAt(new Date('2026-10-15T12:01:00Z'));
  const before = requests;
  await page.locator('#library-q').fill('story');
  await page.clock.runFor(250);
  await expect(page.locator('media-card')).toHaveCount(1);
  await page.clock.runFor(1000);
  expect(requests).toBe(before + 1);
  await expectCleanPage(page, violations);
});

test('filters apply live and count updates', async ({ page, request }) => {
  const violations: string[] = [];
  await addItem(request, { kind: 'movie', title: 'A movie' });
  await addItem(request, { kind: 'book', title: 'A book' });
  await openLibrary(page, theme, violations);
  await openFilters(page);
  await page.getByRole('dialog').getByLabel('State').selectOption('want');
  await expect(page.locator('button[aria-controls="library-filters"]')).toHaveText('Filters (1)');
  await expect(page).toHaveURL(/status=want/);
  await expect(page).not.toHaveURL(/kind=/);
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

test('clear filters keeps search, sort, and the collection', async ({ page, request }) => {
  const violations: string[] = [];
  await addItem(request, { kind: 'movie', title: 'Story movie' });
  await openLibrary(page, theme, violations, '/media/library?kind=book&q=story&sort=title');
  await openFilters(page);
  await page.getByRole('dialog').getByLabel('State').selectOption('completed');
  await expect(page).toHaveURL(/kind=book/);
  await expect(page).toHaveURL(/status=completed/);
  await page.getByRole('dialog').getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/kind=book/);
  await expect(page).not.toHaveURL(/status=/);
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
  await expect(page.locator('button[aria-controls="library-filters"]')).toHaveText('Filters (1)');
  await openFilters(page);
  await expect(page.getByRole('dialog').getByRole('checkbox', { name: 'Favorites only' })).toBeChecked();
  await expectCleanPage(page, violations);
});

test('rapid typing sends one debounced library read', async ({ page, request }) => {
  const violations: string[] = [];
  await addItem(request, { title: 'Browser story' });
  await page.clock.install({ time: new Date('2026-10-15T12:00:00Z') });
  let requests = 0;
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/media/api/library')) requests++;
  });
  await openLibrary(page, theme, violations);
  await expect(page.locator('media-card')).toHaveCount(4);
  await page.clock.pauseAt(new Date('2026-10-15T12:01:00Z'));
  const before = requests;
  const search = page.locator('#library-q');
  for (const value of ['s', 'st', 'sto', 'stor', 'story']) await search.fill(value);
  expect(requests).toBe(before);
  await page.clock.runFor(250);
  await expect(page.locator('media-card')).toHaveCount(1);
  await expect(page).toHaveURL(/q=story/);
  await page.clock.runFor(1000);
  expect(requests).toBe(before + 1);
  await expectCleanPage(page, violations);
});

test('back and forward restore collection URL and results', async ({ page, request }) => {
  const violations: string[] = [];
  await addItem(request, { kind: 'movie', title: 'Filter movie' });
  await addItem(request, { kind: 'book', title: 'Filter book' });
  await openLibrary(page, theme, violations);
  const sections = page.getByRole('navigation', { name: 'Media sections' });
  await sections.getByRole('link', { name: 'Movies', exact: true }).click();
  await expect(page).toHaveURL(/kind=movie/);
  await expect(page.getByText('Filter movie')).toBeVisible();
  await expect(page.getByText('Filter book')).toHaveCount(0);
  await sections.getByRole('link', { name: 'Books', exact: true }).click();
  await expect(page).toHaveURL(/kind=book/);
  await expect(page.getByText('Filter book')).toBeVisible();
  await expect(page.getByText('Filter movie')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/kind=movie/);
  await expect(page).not.toHaveURL(/kind=book/);
  await expect(page.getByText('Filter movie')).toBeVisible();
  await expect(page.getByText('Filter book')).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(/kind=book/);
  await expect(page.getByText('Filter book')).toBeVisible();
  await expect(page.getByText('Filter movie')).toHaveCount(0);
  await expectCleanPage(page, violations);
});

test('Back drops a pending filter instead of applying it later', async ({ page, request }) => {
  const violations: string[] = [];
  await addItem(request, { kind: 'movie', title: 'Pending movie' });
  await page.clock.install({ time: new Date('2026-10-15T12:00:00Z') });
  let requests = 0;
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/media/api/library')) requests++;
  });
  await openLibrary(page, theme, violations);
  await openFilters(page);
  const state = page.getByRole('dialog').getByLabel('State');
  await state.selectOption('want');
  await expect(page).toHaveURL(/status=want/);
  await page.clock.pauseAt(new Date('2026-10-15T12:02:00Z'));
  const before = requests;
  await state.selectOption('completed');
  expect(requests).toBe(before);
  await page.goBack();
  await expect(page).not.toHaveURL(/status=/);
  // The paused clock must not apply the pending state. Zero-delay router work
  // can still be due, and the select stays stale until that work runs.
  await page.clock.runFor(0);
  await expect(state).toHaveValue('');
  const afterBack = requests;
  expect(afterBack).toBe(before + 1);
  await page.clock.runFor(1000);
  expect(requests).toBe(afterBack);
  await expect(page).not.toHaveURL(/status=completed/);
  await expect(state).toHaveValue('');
  await expect(page.getByText('Pending movie')).toBeVisible();
  await expectCleanPage(page, violations);
});

test('Escape flushes a pending filter and returns focus', async ({ page, request }) => {
  const violations: string[] = [];
  await addItem(request, { kind: 'movie', title: 'Escape movie' });
  let reads = 0;
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/media/api/library')) reads++;
  });
  await page.clock.install({ time: new Date('2026-10-15T12:00:00Z') });
  await openLibrary(page, theme, violations);
  await openFilters(page);
  await page.clock.pauseAt(new Date('2026-10-15T12:02:00Z'));
  const dialog = page.getByRole('dialog');
  const state = dialog.getByLabel('State');
  const before = reads;
  await state.selectOption('want');
  expect(reads).toBe(before);
  await expect(page).not.toHaveURL(/status=want/);
  // Leave the native state menu before Escape. A click on the heading does not
  // reliably do that while the menu is open, and then Escape closes the menu.
  await state.blur();
  await page.keyboard.press('Escape');
  // Event coalescing paints the closed sheet on the next timer. The clock is
  // paused, so run that callback without reaching the 250ms filter debounce.
  await page.clock.runFor(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('button[aria-controls="library-filters"]')).toBeFocused();
  await expect(page).toHaveURL(/status=want/);
  await expect(page.getByText('Escape movie')).toBeVisible();
  expect(reads).toBe(before + 1);
  await page.clock.runFor(1000);
  expect(reads).toBe(before + 1);
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
  await expect(page.getByText('No movies saved yet', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  await page.locator('main').getByRole('link', { name: 'All items', exact: true }).click();
  await expect(page).not.toHaveURL(/kind=/);
  await expect(page.locator('media-card')).toHaveCount(4);
  await expect(page.getByText('Only a book')).toBeVisible();
  await expectCleanPage(page, violations);
});
