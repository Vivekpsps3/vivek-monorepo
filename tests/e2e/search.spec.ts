import { expect, test } from './fixtures';
import { syntheticVault } from '../../apps/finance/frontend/e2e/synthetic-vault';
import { openUserMenu } from './user-menu.mjs';

test('search debounces, keeps recent ids, and does not call a provider', async ({ page }) => {
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
