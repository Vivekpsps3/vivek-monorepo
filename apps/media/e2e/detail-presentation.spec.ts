import { expect, test, type APIRequestContext, type Page } from '../../../tests/e2e/fixtures';
import AxeBuilder from '@axe-core/playwright';
import { addItem, openItem, resetMedia, savedItem } from './media-test';
import { episodeDateLine, kindIcon, placeholderLetter } from '../frontend/src/detail-meta.mjs';
import { nextEpisodeError } from '../frontend/src/next-episode.mjs';

test.beforeEach(async ({ request }) => resetMedia(request));

test.use({ viewport: { width: 390, height: 844 } });

async function seedShow(request: APIRequestContext) {
  const show = await addItem(request, { kind: 'tv', title: 'Draft show', status: 'in_progress' });
  for (const episode of [
    { season_number: 1, episode_number: 1, title: 'Pilot', air_date: '2000-01-01' },
    { season_number: 1, episode_number: 2, title: 'Second', air_date: '2000-01-08' },
    { season_number: 2, episode_number: 1, title: 'Undated' },
  ]) {
    const response = await request.post('/media/api/entries/' + show.id + '/episodes', { data: episode });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  return show;
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => {
    localStorage.setItem('suite-theme', value);
    document.documentElement.setAttribute('data-theme', value);
    document.documentElement.setAttribute('data-theme-choice', value);
    document.documentElement.style.colorScheme = value;
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

function note(page: Page) {
  return page.getByLabel('Note (optional)', { exact: true });
}

function rating(page: Page) {
  return page.getByRole('radio', { name: '4 out of 10', exact: true });
}

test('DET1 fallback, dates, pressed targets and drafts survive mark-next, failure and Undo', async ({ page, request }) => {
  test.setTimeout(90_000);
  const show = await seedShow(request);
  await openItem(page, show.id, 'Draft show');

  const art = page.locator('.hero-art');
  const fallback = page.locator('[data-art-fallback]');
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute('data-kind-icon', kindIcon('tv'));
  await expect(fallback.locator('.art-letter')).toHaveText(placeholderLetter('Draft show'));
  await expect(art).not.toContainText('DR');
  await expect(page.locator('.ui-page-header__eyebrow')).toHaveCount(0);
  const chips = page.locator('.meta-chips');
  await expect(chips).toContainText('Series');
  await expect(chips).toContainText('Watching');
  await expect(page.getByRole('button', { name: 'Mark next watched', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Progress', { exact: true })).toBeHidden();
  const nextMark = page.getByRole('button', { name: 'Watched S1E1', exact: true });
  await expect(nextMark).toBeVisible();
  await expect(page.getByText(/Next: S1E1 · Pilot/)).toBeVisible();
  const nextBox = await nextMark.boundingBox();
  expect(nextBox).toBeTruthy();
  expect(nextBox!.height).toBeGreaterThanOrEqual(44);
  expect(nextBox!.width).toBeGreaterThanOrEqual(44);
  const progressHeading = page.getByRole('heading', { name: 'Episode progress', exact: true });
  const progressBox = await progressHeading.boundingBox();
  expect(progressBox).toBeTruthy();
  expect(nextBox!.y).toBeLessThan(progressBox!.y);
  expect(nextBox!.y + nextBox!.height).toBeLessThanOrEqual(844);

  const box = await art.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.height / box!.width).toBeGreaterThan(1.45);
  expect(box!.height / box!.width).toBeLessThan(1.55);

  const season = page.locator('summary').filter({ hasText: /^Season 1/ });
  await season.focus();
  await page.keyboard.press('Enter');
  const panel = season.locator('..');
  await expect(panel).toHaveAttribute('open', '');
  const pilot = panel.locator('.episode-row').filter({ hasText: 'Pilot' });
  await expect(pilot).toContainText(episodeDateLine('Jan 1, 2000', '').replace('Jan 1, 2000', 'Jan'));
  await expect(pilot).toContainText('2000');
  await expect(pilot).not.toContainText('2000-01-01');
  const watch = pilot.getByRole('button', { name: 'Mark watched', exact: true });
  await expect(watch).toHaveAttribute('aria-pressed', 'false');
  const watchBox = await watch.boundingBox();
  expect(watchBox).toBeTruthy();
  expect(watchBox!.height).toBeGreaterThanOrEqual(44);
  expect(watchBox!.width).toBeGreaterThanOrEqual(44);
  await watch.focus();
  await expect(watch).toBeFocused();

  const undated = page.locator('summary').filter({ hasText: /^Season 2/ });
  await undated.click();
  await expect(undated.locator('..').getByText('Air date unknown', { exact: true })).toBeVisible();

  const remove = page.getByRole('button', { name: 'Remove from library', exact: true });
  await expect(remove).toHaveClass(/ui-btn--danger-ghost/);
  const removeBox = await remove.boundingBox();
  expect(removeBox).toBeTruthy();
  expect(removeBox!.height).toBeGreaterThanOrEqual(44);

  await page.getByRole('button', { name: 'Edit rating and note', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Tags', exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Rating', exact: true })).toBeVisible();
  await expect(page.getByLabel('Progress', { exact: true })).toBeVisible();
  await expect(page.getByText('Anticipation', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Anticipated', exact: true })).toBeHidden();
  await note(page).fill('Keep this note');
  await rating(page).click();
  await page.getByText('Anticipation', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Anticipated', exact: true })).toBeVisible();
  await page.getByText('Anticipation', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Anticipated', exact: true })).toBeHidden();
  await expect(note(page)).toHaveValue('Keep this note');
  await expect(rating(page)).toBeChecked();

  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter((item) => ['serious', 'critical'].includes(item.impact || '')), theme).toEqual([]);
  }

  await nextMark.click();
  await expect(page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' })).toBeVisible();
  await expect(note(page)).toHaveValue('Keep this note');
  await expect(rating(page)).toBeChecked();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await expect(pilot.getByRole('button', { name: 'Unwatch', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await savedItem(request, show.id)).toMatchObject({ review: null, rating: null });

  await page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' }).getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'S1E1 is next again.' })).toBeVisible();
  await expect(note(page)).toHaveValue('Keep this note');
  await expect(rating(page)).toBeChecked();
  await expect(pilot.getByRole('button', { name: 'Mark watched', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await page.route('**/media/api/entries/*/episodes/next', (route) =>
    route.fulfill({ status: 502, json: { detail: 'Bad gateway' } }),
  );
  await nextMark.click();
  await expect(page.locator('main [role=alert]')).toContainText(nextEpisodeError(502, 'Bad gateway').message);
  await expect(note(page)).toHaveValue('Keep this note');
  await expect(rating(page)).toBeChecked();
  await expect(pilot.getByRole('button', { name: 'Mark watched', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect((await savedItem(request, show.id)).show.episodes.find((episode: { title: string }) => episode.title === 'Pilot').watched).toBe(false);
  await page.unroute('**/media/api/entries/*/episodes/next');

  await pilot.getByRole('button', { name: 'Mark watched', exact: true }).click();
  await expect(pilot.getByRole('button', { name: 'Unwatch', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(note(page)).toHaveValue('Keep this note');
  await expect(rating(page)).toBeChecked();
  await pilot.getByRole('button', { name: 'Unwatch', exact: true }).click();
  await expect(note(page)).toHaveValue('Keep this note');
  await expect(rating(page)).toBeChecked();

  await nextMark.click();
  await expect(page.locator('.toast').filter({ hasText: 'Marked S1E1 watched' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Draft show', exact: true })).toBeVisible();
  await expect(note(page)).toHaveValue('Keep this note');
  await expect(rating(page)).toBeChecked();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  const draft = JSON.parse(await page.evaluate((id) => sessionStorage.getItem('media-item-draft:1:' + id) || 'null', show.id));
  expect(draft.fields.review).toBe('Keep this note');
  expect(draft.fields.rating).toBe(4);
});

test('kind disclosure keeps book and movie progress visible and anticipation folded', async ({ page, request }) => {
  const book = await addItem(request, { kind: 'book', title: 'Compact book' });
  await openItem(page, book.id, 'Compact book');
  await expect(page.locator('[data-art-fallback]')).toHaveAttribute('data-kind-icon', kindIcon('book'));
  await expect(page.locator('.art-letter')).toHaveText(placeholderLetter('Compact book'));
  await expect(page.locator('.meta-chips')).toContainText('Book');
  await expect(page.getByRole('heading', { name: 'Your book', exact: true })).toBeVisible();
  await expect(page.getByLabel('Progress', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Unit', exact: true })).toBeVisible();
  await expect(page.getByText('Anticipation', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Anticipated', exact: true })).toBeHidden();
  await expect(page.getByRole('checkbox', { name: 'Favorite', exact: true })).toBeVisible();
  await note(page).fill('Book note stays');
  await page.getByText('Anticipation', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Anticipated', exact: true })).toBeVisible();
  await expect(note(page)).toHaveValue('Book note stays');

  const movie = await addItem(request, { kind: 'movie', title: 'Compact film', creator: 'Ada Lovelace' });
  await openItem(page, movie.id, 'Compact film');
  await expect(page.locator('[data-art-fallback]')).toHaveAttribute('data-kind-icon', kindIcon('movie'));
  await expect(page.locator('.meta-chips')).toContainText('Movie');
  await expect(page.locator('.meta-chips')).toContainText('Ada Lovelace');
  await expect(page.getByLabel('Note (optional)', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Progress', { exact: true })).toBeVisible();
  await expect(page.getByText('Anticipation', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Anticipated', exact: true })).toBeHidden();
  await page.getByText('Anticipation', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Anticipated', exact: true })).toBeVisible();
  await expect(page.getByLabel('Progress', { exact: true })).toBeVisible();
});
