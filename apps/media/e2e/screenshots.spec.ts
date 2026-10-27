import path from 'node:path';
import { expect, test } from '@playwright/test';
import { addItem, resetMedia } from './media-test';

const dir = process.env.SCREENSHOT_DIR || 'test-results/artifacts/media-ux';
test.use({ reducedMotion: 'reduce' });
for (const width of [390, 768, 1280]) for (const theme of ['light', 'dark']) {
  test('Media empty, populated, photo, progress and error scenes at ' + width + ' ' + theme, async ({ page, request }) => {
    test.setTimeout(120_000);
    await resetMedia(request);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/media/library');
    await page.getByRole('combobox', { name: 'Color theme' }).selectOption(theme);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const shot = async (name: string) => {
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect.poll(() => page.locator('body').evaluate(node => getComputedStyle(node).color)).toBe(theme === 'dark' ? 'rgb(246, 241, 234)' : 'rgb(28, 25, 22)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: path.join(dir, name + '-' + width + '-' + theme + '.png'), fullPage: true });
    };
    const existing = (await (await request.get('/media/api/library')).json()).items;
    for (const item of existing) await request.delete('/media/api/entries/' + item.id);
    for (const [name, route] of [['now-empty', '/media'], ['library-empty', '/media/library'], ['calendar-empty', '/media/calendar'], ['add-empty', '/media/add']]) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      await shot(name);
    }
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('A long title that wraps naturally on a narrow screen');
    await page.getByText('Optional details', { exact: true }).click();
    await page.getByLabel('Release year').fill('99');
    await expect(page.getByRole('button', { name: 'Add to library' })).toBeDisabled();
    await shot('add-invalid-year');
    await page.getByLabel('Release year').fill('2026');
    await page.getByLabel('Note').fill('A few words to remember this story.');
    await page.getByLabel('Note').focus();
    await shot('add-filled-focused');
    await page.getByRole('button', { name: 'Add to library' }).click();
    await expect(page.getByRole('heading', { name: 'A long title that wraps naturally on a narrow screen', exact: true })).toBeVisible();
    const artist = await addItem(request, { kind: 'artist', title: 'A long synthetic artist name', status: 'following', artwork_url: new URL(page.url()).origin + '/synthetic-cover.png' });
    await request.post('/media/api/entries/' + artist.id + '/albums', { data: { title: 'Only this saved album', year: 2024 } });
    await page.goto('/media/library?sort=title');
    await expect(page.getByRole('link', { name: artist.title, exact: true })).toBeVisible();
    await shot('library-populated');
    await page.getByRole('button', { name: 'Show saved albums and songs (1)' }).click();
    await expect(page.locator('#saved-' + artist.id + ' media-card')).toHaveCount(1);
    await shot('library-expanded');
    await page.getByRole('link', { name: artist.title, exact: true }).click();
    await expect(page.getByRole('heading', { name: artist.title, exact: true })).toBeVisible();
    await shot('artist-detail');
    await page.getByRole('button', { name: 'Add album manually' }).click();
    await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Another album draft');
    await shot('manual-album-editor');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.route('https://upload.wikimedia.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') }));
    await page.getByRole('button', { name: 'Choose photo' }).click();
    await expect(page.getByRole('button', { name: 'File:Synthetic portrait.jpg' })).toBeVisible();
    await page.getByRole('button', { name: 'File:Synthetic portrait.jpg' }).click();
    await shot('artist-photo-choice');
    await page.getByRole('button', { name: 'Use this photo' }).click();
    await expect(page.getByRole('link', { name: 'Photo source' })).toBeVisible();
    await shot('artist-photo-selected');
    const show = await addItem(request, { kind: 'tv', title: 'A continuing series', status: 'in_progress', review: 'A saved series note' });
    for (const episode of [
      { season_number: 0, episode_number: 1, title: 'Special', air_date: '2000-01-01' },
      { season_number: 1, episode_number: 1, title: 'The first chapter', air_date: '2000-01-01' },
      { season_number: 1, episode_number: 2, title: 'The second chapter', air_date: '2000-01-02' },
      { season_number: 2, episode_number: 1, title: 'Future chapter', air_date: '2099-01-01' },
      { season_number: 2, episode_number: 2, title: 'Unannounced chapter' },
    ]) await request.post('/media/api/entries/' + show.id + '/episodes', { data: episode });
    await page.goto('/media/item/' + show.id);
    await expect(page.getByRole('heading', { name: show.title, exact: true })).toBeVisible();
    for (const summary of await page.locator('details.season summary').all()) await summary.click();
    await shot('series-episodes');
    await page.getByRole('button', { name: 'Mark caught up', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo catch-up' })).toBeVisible();
    await shot('series-caught-up');
    await page.getByRole('button', { name: 'Undo catch-up' }).click();
    await expect(page.getByRole('button', { name: 'Mark caught up', exact: true })).toBeEnabled();
    await page.route('**/media/api/entries/' + show.id, route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 502, json: { message: 'Temporary save outage. Your changes remain here.' } }) : route.continue());
    await page.getByLabel('Note').fill('A retained note through a provider outage.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('main [role=alert]')).toBeVisible();
    await shot('detail-save-error');
    await page.unroute('**/media/api/entries/' + show.id);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
    await shot('detail-save-success');
    await page.route('**/media/api/search?**', route => route.fulfill({ json: {
      results: [{ kind: 'movie', source: 'tmdb', source_id: 'movie:522627', title: 'The Gentlemen', year: 2019 }, { kind: 'tv', source: 'tvmaze', source_id: 'tv:62221', title: 'The Gentlemen', year: 2024 }],
      sources: [{ id: 'tmdb', state: 'ok', kinds: ['movie'], coverage: 'official', cached: false }, { id: 'musicbrainz', state: 'partial', kinds: ['album','artist','track'], coverage: 'official', cached: false, reason: 'Some song searches could not finish.' }],
      partial: true, total: 2, offset: 0, has_more: false,
    } }));
    await page.goto('/media/search?q=The%20Gentlemen&kind=all');
    await expect(page.getByRole('heading', { name: 'The Gentlemen', exact: true })).toHaveCount(2);
    await page.getByText('Source coverage · all types', { exact: true }).click();
    await shot('search-partial');
    await page.goto('/media/library?sort=title');
    await page.getByRole('checkbox', { name: 'Favorites only' }).check();
    await expect(page.getByRole('heading', { name: 'No saved items match these filters' })).toBeVisible();
    await shot('library-filter-empty');
    expect(errors).toEqual([]);
  });
}
