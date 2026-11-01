import { chooseColorTheme, openUserMenu } from '../../../tests/e2e/user-menu.mjs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { addItem, openItem, resetMedia, savedItem } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

test('manual add requires a title and a valid year without losing the form', async ({ page }) => {
  await page.goto('/media/add');
  await expect(page.getByRole('button', { name: 'Add to library' })).toBeDisabled();
  await page.getByText('Optional details', { exact: true }).click();
  await page.getByLabel('Release year').fill('99');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Synthetic year');
  await expect(page.getByRole('button', { name: 'Add to library' })).toBeDisabled();
  await expect(page).toHaveURL(/\/media\/add$/);
  await page.getByLabel('Release year').fill('2026');
  await expect(page.getByRole('button', { name: 'Add to library' })).toBeEnabled();
});

test('search distinguishes unavailable, unconfigured and available source coverage', async ({ page }) => {
  let requests = 0;
  await page.route('**/media/api/search?**', route => {
    requests++;
    return route.fulfill({ json: { results: [], total: 0, offset: 0, has_more: false, partial: true, sources: [
      { id: 'rawg', state: 'unconfigured', kinds: ['game'], coverage: 'official', cached: false, reason: 'This source is not configured. Steam coverage remains available.', retryable: false },
      { id: 'steam', state: 'ok', kinds: ['game'], coverage: 'keyless', cached: false, reason: null, retryable: false },
      { id: 'tmdb', state: 'provider_auth', kinds: ['movie'], coverage: 'official', cached: false, reason: 'This source needs valid credentials.', retryable: true },
    ] } });
  });
  await page.goto('/media/search');
  await page.getByRole('searchbox').fill('d');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  expect(requests).toBe(0);
  await page.getByRole('searchbox').fill('dune');
  await expect(page.getByText('Search is incomplete.', { exact: true })).toBeVisible();
  await page.getByText('Source coverage · all types', { exact: true }).click();
  await expect(page.locator('.source-details')).toContainText('Steam coverage remains available');
  await expect(page.locator('.source-details')).toContainText('needs valid credentials');
  await expect(page.getByText('Available sources returned no matches', { exact: true })).toBeVisible();
  await openUserMenu(page);
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
});

test('library pages and favorites filter count only matching memberships and survive Back', async ({ page, request }) => {
  for (let number = 0; number < 26; number++) await addItem(request, { title: 'Paged ' + String(number).padStart(2, '0'), favorite: number % 2 === 0 });
  await page.goto('/media/library?sort=title');
  await expect(page.locator('media-card')).toHaveCount(24);
  await expect(page.getByText('29 saved items', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next items' }).click();
  await expect(page.locator('media-card')).toHaveCount(5);
  await expect(page).toHaveURL(/offset=24/);
  const name = await page.locator('media-card h2 a').first().innerText();
  await page.locator('media-card h2 a').first().click();
  await expect(page.locator('main h1')).toHaveText(name);
  await page.goBack();
  await expect(page.locator('media-card')).toHaveCount(5);
  await page.getByRole('checkbox', { name: 'Favorites only' }).check();
  await expect(page.getByText('13 saved items', { exact: true })).toBeVisible();
  await expect(page.locator('media-card')).toHaveCount(13);
  await expect(page).toHaveURL(/fav=1/);
});

test('artist expansion is saved-only, survives Back, and removing the artist preserves its music', async ({ page, request }) => {
  const artist = await addItem(request, { kind: 'artist', title: 'Saved artist', status: 'following' });
  let detail = await (await request.post('/media/api/entries/' + artist.id + '/albums', { data: { title: 'Saved album' } })).json();
  const album = detail.music.saved_children.find((child: any) => child.kind === 'album');
  detail = await (await request.post('/media/api/entries/' + artist.id + '/albums/' + album.id + '/tracks', { data: { title: 'Saved song' } })).json();
  await page.goto('/media/library?sort=title');
  const expansion = page.getByRole('button', { name: 'Show saved albums and songs (2)', exact: true });
  await expect(expansion).toHaveAttribute('aria-expanded', 'false');
  await expansion.click();
  const children = page.locator('#saved-' + artist.id);
  await expect(children.locator('media-card h2')).toHaveText(['Saved album', 'Saved song']);
  await page.getByRole('link', { name: 'Saved artist', exact: true }).click();
  await expect(page.locator('main h1')).toHaveText('Saved artist');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Hide saved albums and songs (2)' })).toHaveAttribute('aria-expanded', 'true');
  await expect(children.locator('media-card')).toHaveCount(2);
  await page.getByRole('link', { name: 'Saved artist', exact: true }).click();
  await page.getByRole('button', { name: 'Remove from library' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await request.get('/media/api/entries/' + artist.id)).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Remove from library' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove item' }).click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Saved album', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Saved song', exact: true })).toBeVisible();
});

test('manual artist, album and song can be added and edited independently', async ({ page, request }) => {
  const artist = await addItem(request, { kind: 'artist', title: 'Manual artist', status: 'following' });
  await openItem(page, artist.id, artist.title);
  await page.getByRole('button', { name: 'Add album manually' }).click();
  await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Manual album');
  await page.getByRole('dialog').getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Manual album', exact: true }).click();
  await page.getByRole('button', { name: 'Add song manually' }).click();
  await page.getByRole('dialog').getByLabel('Title', { exact: true }).fill('Manual song');
  await page.getByRole('dialog').getByRole('button', { name: 'Add to library' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Manual song', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Manual song', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('completed');
  await page.getByLabel('Rating').fill('0');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect((await savedItem(request, artist.id)).status).toBe('following');
  expect((await savedItem(request, artist.id)).rating).toBeNull();
});

test('season disclosures work with the keyboard and keep unknown dates separate from future dates', async ({ page, request }) => {
  const show = await addItem(request, { kind: 'tv', title: 'Keyboard series', status: 'in_progress' });
  for (const episode of [
    { season_number: 0, episode_number: 1, title: 'Special', air_date: '2000-01-01' },
    { season_number: 1, episode_number: 1, title: 'Aired', air_date: '2000-01-01' },
    { season_number: 2, episode_number: 1, title: 'Future', air_date: '2099-01-01' },
    { season_number: 2, episode_number: 2, title: 'Unknown' },
  ]) await request.post('/media/api/entries/' + show.id + '/episodes', { data: episode });
  await openItem(page, show.id, show.title);
  const season = page.locator('summary').filter({ hasText: /^Season 2/ });
  await season.focus();
  await expect(season).toBeFocused();
  await page.keyboard.press('Enter');
  const panel = season.locator('..');
  await expect(panel).toHaveAttribute('open', '');
  await expect(panel.getByText('Air date unknown', { exact: true })).toBeVisible();
  await expect(panel.locator('.episode-row').filter({ hasText: 'Future' }).getByRole('button', { name: 'Mark watched' })).toBeDisabled();
  await expect(panel.locator('.episode-row').filter({ hasText: 'Unknown' }).getByRole('button', { name: 'Mark watched' })).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(panel).not.toHaveAttribute('open', '');
});

test('calendar uses browser timezone, keeps imprecise dates in bands and refreshes only on request', async ({ page }) => {
  let refreshes = 0;
  const calendar = { month: '2026-10', today: '2026-10-26', partial: false, days: [], month_band: [
    { title: 'Month-only release', release_on: '2026-10', entry_id: null },
  ], year_band: [{ title: 'Year-only release', release_on: '2026', entry_id: null }], unknown: [{ title: 'Unknown release', release_on: null, entry_id: null }] };
  await page.route('**/media/api/calendar**', route => {
    expect(new URL(route.request().url()).searchParams.get('tz')).toBeTruthy();
    if (route.request().method() === 'POST') { refreshes++; return route.fulfill({ status: 502, json: { message: 'Release source unavailable' } }); }
    return route.fulfill({ json: calendar });
  });
  await page.goto('/media/calendar?month=2026-10');
  await expect(page.getByText('Today in your timezone: 2026-10-26')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This month', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This year', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Date to be announced', exact: true })).toBeVisible();
  await expect(page.getByText('No dated releases this month.', { exact: true })).toBeVisible();
  expect(refreshes).toBe(0);
  await page.getByRole('button', { name: 'Refresh release metadata' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('Release source unavailable');
  await expect(page.getByText('Month-only release · 2026-10', { exact: true })).toBeVisible();
  expect(refreshes).toBe(1);
});

test('a failed item save stays local and never appears on another item', async ({ page, request }) => {
  const first = await addItem(request, { title: 'First item' }), second = await addItem(request, { title: 'Second item' });
  await openItem(page, first.id, first.title);
  await page.route('**/media/api/entries/' + first.id, route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 502, json: { message: 'First item failure' } }) : route.continue());
  await page.getByLabel('Note').fill('First item draft');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('First item failure');
  await page.getByRole('link', { name: '← Library' }).click();
  await page.getByRole('button', { name: 'Leave item' }).click();
  await page.getByRole('link', { name: second.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: second.title, exact: true })).toBeVisible();
  await expect(page.locator('main [role=alert]')).toHaveCount(0);
  await expect(page.getByLabel('Note')).toHaveValue('');
});

test('broken photo candidates are disabled and a failed selection preserves the prior portrait', async ({ page, request }) => {
  const artist = await addItem(request, { kind: 'artist', title: 'Photo artist', status: 'following' });
  await page.route('https://upload.wikimedia.org/**', route => route.fulfill({ status: 404 }));
  await openItem(page, artist.id, artist.title);
  await page.getByRole('button', { name: 'Choose photo' }).click();
  await expect(page.getByRole('button', { name: 'Photo unavailable' })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await savedItem(request, artist.id)).portrait).toBeNull();
});

test('the main Media screens pass accessibility in both themes at phone and desktop widths', async ({ page, request }) => {
  test.setTimeout(180_000);
  // .ui-badge fades color/background over 200ms. Axe was sampling that blend
  // (contrast 2.91 and 2.69) before the dark theme finished.
  await page.addInitScript(() => {
    const apply = () => {
      const root = document.documentElement;
      if (!root || root.querySelector('style[data-ci2-motion]')) return;
      const style = document.createElement('style');
      style.setAttribute('data-ci2-motion', 'off');
      style.textContent = '*,*::before,*::after{animation:none !important;transition:none !important;}';
      root.appendChild(style);
    };
    apply();
    document.addEventListener('DOMContentLoaded', apply);
  });
  const artist = await addItem(request, { kind: 'artist', title: 'A very long synthetic artist name that must wrap', status: 'following' });
  const routes = ['/media', '/media/library', '/media/search', '/media/calendar', '/media/add', '/media/item/' + artist.id];
  for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      await chooseColorTheme(page, theme);
      await expect.poll(() => page.locator('body').evaluate(node => getComputedStyle(node).color)).toBe(theme === 'dark' ? 'rgb(246, 241, 234)' : 'rgb(28, 25, 22)');
      await page.evaluate(async () => {
        const finiteRunning = () => document.getAnimations().filter(animation => {
          const iterations = animation.effect?.getComputedTiming()?.iterations;
          return animation.playState === 'running' && iterations !== Infinity;
        });
        const started = performance.now();
        while (performance.now() - started < 1000) {
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const pending = finiteRunning();
          if (pending.length === 0) return;
          await Promise.race([
            Promise.all(pending.map(animation => animation.finished.catch(() => undefined))),
            new Promise(resolve => setTimeout(resolve, 250)),
          ]);
        }
      });
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations.filter(item => ['serious', 'critical'].includes(item.impact)), route + ' ' + width + ' ' + theme).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test('a real session expiry removes private drafts and returns to sign-in', async ({ page, request }) => {
  const item = await addItem(request);
  await openItem(page, item.id);
  await page.getByLabel('Note').fill('Private expired-session draft');
  const ended=await page.request.post('/api/auth/logout',{headers:{'X-CSRF-Token':'synthetic-csrf','Origin':new URL(page.url()).origin}});expect(ended.ok(),await ended.text()).toBeTruthy();expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.route('**/media/api/entries/' + item.id, route => route.fulfill({ status: 401, json: { detail: 'Session expired' } }));
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByLabel('Note')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('media-item-draft:')))).toEqual([]);
});
