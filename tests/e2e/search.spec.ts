import type { Route } from '@playwright/test';
import { expect, test, type Locator, type Page } from './fixtures';
import { syntheticVault } from '../../apps/finance/frontend/e2e/synthetic-vault';
import { chooseColorTheme, openUserMenu } from './user-menu.mjs';

test('search debounces, keeps recent ids, and does not call a provider', async ({ page, request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  const urls: string[] = [];
  page.on('request', request => urls.push(request.url()));
  await page.goto('/hub');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const input = page.getByRole('combobox', { name: 'Search' });
  await input.fill('D');
  await page.waitForTimeout(250);
  expect(urls.some(url => url.includes('/api/search'))).toBe(false);
  const searchResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/search' && url.searchParams.get('q') === 'Du';
  });
  await input.fill('Du');
  const response = await searchResponse;
  expect(response.headers()['cache-control']).toContain('no-store');
  const option = page.getByRole('option', { name: /Dune/ });
  await expect(option).toBeVisible();
  expect(urls.some(url => /tmdb|themoviedb|rawg\.io|musicbrainz|openlibrary|flightaware|wikimedia|nominatim/i.test(url))).toBe(false);
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/media\/item\/\d+/);
  const stored = await page.evaluate(() => localStorage.getItem('suite-search-recent'));
  expect(stored).not.toContain('Dune');
  const refs = JSON.parse(stored ?? '[]') as { app: string; kind: string; id: number }[];
  expect(refs).toEqual([{ app: 'media', kind: 'media', id: expect.any(Number) }]);
  expect(Object.keys(refs[0]).sort()).toEqual(['app', 'id', 'kind']);
});

test('unlocked search shows a loaded finance name and lock removes it', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Harbor Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' }],
  });
  await vault.open('/hub');
  const card = page.locator('.finance-bar');
  await expect.poll(async () => card.evaluate(el => el.textContent || '')).toMatch(/\$[\s\u2060]*\d/);
  // The synthetic vault answers every /api route. Names are already in memory;
  // the real search route has to answer the Travel/Media query.
  await page.context().unroute('**/api/**');
  const duringSearch: string[] = [];
  const onRequest = (request: { url(): string }) => duringSearch.push(new URL(request.url()).pathname);
  page.on('request', onRequest);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const input = page.getByRole('combobox', { name: 'Search' });
  await input.fill('Ha');
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await expect(dialog.getByRole('option', { name: 'Harbor Checking' })).toBeVisible();
  await expect(dialog).not.toContainText('1500');
  await expect(dialog).not.toContainText('1,500');
  expect(duringSearch.some(path => path.includes('/market') || path.includes('/vault/records'))).toBe(false);
  page.off('request', onRequest);
  await page.keyboard.press('Escape');
  const menu = await openUserMenu(page);
  await menu.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Finance', exact: true }).click();
  await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await page.locator('.app-switcher__bar').getByRole('link', { name: 'Hub', exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search' }).fill('Ha');
  await expect(page.getByRole('dialog', { name: 'Search' })).not.toContainText('Harbor');
});

function searchFor(query: string) {
  return (url: URL) => url.pathname === '/api/search' && url.searchParams.get('q') === query;
}

async function holdSearch(page: Page, query: string) {
  let held: Route | undefined;
  await page.route(searchFor(query), route => { held = route; }, { times: 1 });
  return async () => {
    await expect.poll(() => held !== undefined, { message: `Hold the "${query}" search request` }).toBe(true);
    return held!;
  };
}

async function expectActive(input: Locator, option: Locator) {
  await expect(option).toHaveAttribute('aria-selected', 'true');
  const id = await option.getAttribute('id');
  expect(id).toBeTruthy();
  await expect(input).toHaveAttribute('aria-activedescendant', id!);
  await expect(input).toBeFocused();
}

async function searchInput(page: Page) {
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const input = page.getByRole('combobox', { name: 'Search' });
  await expect(input).toBeFocused();
  return input;
}

const searchViews = [
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 1280, height: 800, theme: 'light' },
  { width: 1280, height: 800, theme: 'dark' },
] as const;

for (const { width, height, theme } of searchViews) {
  test.describe(`query ownership at ${width} ${theme}`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390 });

    test('never opens a stale result and activates the exact visible match', async ({ page, request }, info) => {
      expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
      const trip = await request.post('/travel/api/trips', {
        data: { title: 'Harbor Crossing', start_date: '2026-12-12', end_date: '2026-12-15' },
      });
      expect(trip.ok()).toBeTruthy();
      const { id } = await trip.json() as { id: number };
      await page.goto('/hub');
      await chooseColorTheme(page, theme);
      const input = await searchInput(page);

      const portlandResponse = page.waitForResponse(response => searchFor('Portland')(new URL(response.url())));
      await input.fill('Portland');
      const oldPayload = await (await portlandResponse).json();
      const portland = page.getByRole('option', { name: /^Portland\b/ });
      await expectActive(input, portland);
      const formerBounds = await portland.boundingBox();
      expect(formerBounds).toBeTruthy();

      await page.clock.install();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      const previous = await holdSearch(page, 'Port');
      await input.fill('Port');
      await page.clock.runFor(150);
      const previousResponse = await previous();

      await input.fill('Harbor');
      await expect(portland).toHaveCount(0);
      await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/);
      await expect(input).toHaveAttribute('aria-expanded', 'false');
      await input.press('Enter');
      if (width === 390 && formerBounds) {
        await page.touchscreen.tap(formerBounds.x + formerBounds.width / 2, formerBounds.y + formerBounds.height / 2);
      }
      await expect(page).toHaveURL(/\/hub$/);
      await expect(input).toHaveValue('Harbor');
      await page.screenshot({ path: info.outputPath('retired-options.png') });

      // The debounce proof is complete. Let Angular render real network responses.
      await page.clock.resume();
      const current = page.getByRole('option', { name: /^Harbor Crossing\b/ });
      const second = page.getByRole('option', { name: /^Leap harbor\b/ });
      await expect(current).toBeVisible();
      await previousResponse.fulfill({ json: { ...oldPayload, q: 'Port' } });
      await expect(portland).toHaveCount(0);
      await expect(current).toBeVisible();
      if (width === 390) {
        await current.tap();
      } else {
        await expectActive(input, current);
        await input.press('ArrowDown');
        await expectActive(input, second);
        await expect(second).toBeInViewport();
        await input.press('ArrowUp');
        await expectActive(input, current);
        await input.press('Enter');
      }
      await expect(page).toHaveURL(new RegExp(`/travel/trips/${id}$`));
      await expect(page.getByRole('heading', { name: 'Harbor Crossing', exact: true })).toBeVisible();
      const refs = await page.evaluate(() => JSON.parse(localStorage.getItem('suite-search-recent') ?? '[]'));
      expect(refs).toEqual([{ app: 'travel', kind: 'trip', id }]);
    });

    test('preserves Finance through remote failure and retry, then clears on lock and sign-out', async ({ page, request }, info) => {
      expect((await request.post('/e2e/reset?seed=pixels')).ok()).toBeTruthy();
      const publicResponse = await request.get('/api/search?q=Harbor');
      expect(publicResponse.ok()).toBeTruthy();
      const publicMatches = await publicResponse.json();
      const vault = await syntheticVault(page, {
        assets: [{ id: 1, name: 'Harbor Checking', category: 'cash', current_value: 1500, as_of_date: '2026-10-01' }],
      });
      await vault.open('/hub');
      await chooseColorTheme(page, theme);
      await expect.poll(async () => page.locator('.finance-bar').textContent()).toMatch(/\$[\s\u2060]*\d/);
      await page.route(searchFor('Harbor'), route => route.fulfill({ status: 503, json: {} }), { times: 1 });
      const input = await searchInput(page);
      await input.fill('Harbor');
      const dialog = page.getByRole('dialog', { name: 'Search' });
      const finance = dialog.getByRole('option', { name: 'Harbor Checking', exact: true });
      const server = dialog.getByRole('option', { name: /^Leap harbor\b/ });
      const retry = dialog.getByRole('button', { name: 'Retry', exact: true });
      await expect(retry).toBeVisible();
      await expect(dialog).toContainText("Couldn't load Travel and Media results.");
      await expectActive(input, finance);
      await expect(dialog).not.toContainText(/1,?500/);
      await page.screenshot({ path: info.outputPath('finance-and-retry.png') });

      if (width === 390 && theme === 'light') {
        await page.setViewportSize({ width: 320, height });
        await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
        await expect(retry).toBeInViewport();
        await expect(finance).toBeInViewport();
        expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath('finance-and-retry-320-200.png') });
        await page.evaluate(() => { document.documentElement.style.removeProperty('font-size'); });
        await page.setViewportSize({ width, height });
      }

      const retryRequest = await holdSearch(page, 'Harbor');
      if (width === 390) await retry.tap();
      else {
        await input.press('Tab');
        await expect(retry).toBeFocused();
        await page.keyboard.press('Enter');
      }
      const retryResponse = await retryRequest();
      await expectActive(input, finance);
      await expect(server).toHaveCount(0);
      await retryResponse.fulfill({ json: publicMatches });
      await expect(server).toBeVisible();
      await expect(finance).toBeVisible();
      await expect(retry).toHaveCount(0);

      const peer = await page.context().newPage();
      await vault.open('/hub', peer);
      const peerMenu = await openUserMenu(peer);
      await peerMenu.getByRole('link', { name: 'Settings', exact: true }).click();
      await peer.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Finance', exact: true }).click();
      const lock = peer.getByRole('button', { name: 'Lock Finance', exact: true });
      await expect(lock).toBeVisible();
      await page.route(searchFor('Check'), route => route.fulfill({ json: { q: 'Check', results: [], truncated: false } }));
      const beforeLock = await holdSearch(page, 'Check');
      await input.fill('Check');
      const lockResponse = await beforeLock();
      await expectActive(input, finance);
      await lock.click();
      await expect(finance).toHaveCount(0);
      await expect(peer.getByText('Finance is locked. Unlock to see settings.')).toBeVisible();
      await expect(dialog).toContainText('No matches for "Check".');
      await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/);
      await lockResponse.fulfill({ json: { ...publicMatches, q: 'Check' } });
      await expect(server).toHaveCount(0);
      await expect(finance).toHaveCount(0);

      const beforeSignOut = await holdSearch(page, 'Harbor');
      await input.fill('Harbor');
      const signOutResponse = await beforeSignOut();
      const menu = await openUserMenu(peer);
      await menu.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL(/\/auth\/login/);
      await expect(dialog).toHaveCount(0);
      await signOutResponse.fulfill({ json: publicMatches });
      await expect(page.locator('body')).not.toContainText(/Harbor Checking|Leap harbor/);
      // The test context closes both tabs after their sign-out redirects.
    });
  });
}
