import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';
import { starterHomeLayout } from '../src/app/town/home-rooms';

async function prepare(page: Page, width: number, theme: 'light' | 'dark'): Promise<void> {
  await page.setViewportSize({ width, height: width <= 390 ? 844 : 800 });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
  expect((await page.request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
}

async function activate(page: Page, control: ReturnType<Page['locator']>, touch: boolean): Promise<void> {
  await expect(control).toBeEnabled();
  if (touch) await control.tap();
  else {
    await control.focus();
    await page.keyboard.press('Enter');
  }
}

test.describe('Furniture catalog bookmarks', () => {
  test.use({ hasTouch: true });

  for (const [width, theme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']] as const) {
    test(`starter bookmarks and Town entrances share the saved editor at ${width} ${theme}`, async ({ page }, info) => {
      await prepare(page, width, theme);
      const touch = width === 390;
      const part = theme === 'light' ? 'night' : 'day';
      const home = page.locator('app-town-home');
      const puts: string[] = [];
      page.on('request', request => {
        if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/town/layouts/living') {
          puts.push(request.postData() ?? '');
        }
      });

      await page.goto('/town');
      const townHome = page.getByRole('link', { name: 'Visit Home', exact: true });
      const townWorkshop = page.getByRole('link', { name: 'Workshop', exact: true });
      await expect(townWorkshop).toBeVisible();
      await expect(page.getByRole('link', { name: 'Cosmetic catalog' })).toHaveCount(0);
      await activate(page, townHome, touch);
      const decorate = home.getByRole('button', { name: 'Decorate room' });
      await activate(page, decorate, touch);
      const inventory = home.getByLabel('Add furniture');
      await expect(inventory).toBeFocused();
      await expect(inventory.locator('option[value]:not([value=""])')).toHaveCount(12);
      await activate(page, home.getByRole('button', { name: 'Cancel editing' }), touch);
      await expect(decorate).toBeFocused();

      await page.goto(`/town/cosmetics?item=oak-seat&part=${part}`);
      await expect(page).toHaveURL(new RegExp(`/town/home/living\\?item=oak-seat&part=${part}$`));
      const open = home.getByRole('button', { name: 'Place Oak seat' });
      await expect(open).toBeInViewport({ ratio: 1 });
      const hit = await open.boundingBox();
      expect(hit?.width).toBeGreaterThanOrEqual(44);
      expect(hit?.height).toBeGreaterThanOrEqual(44);

      await activate(page, open, touch);
      await expect(home.getByRole('heading', { name: 'Oak seat', exact: true })).toBeFocused();
      await home.getByLabel('Column', { exact: true }).selectOption({ value: '5' });
      await home.getByLabel('Row', { exact: true }).selectOption({ value: '10' });
      const place = home.getByRole('button', { name: 'Place item' });
      await expect(place).toBeDisabled();
      await expect(home.locator('[data-placement-status]')).toHaveText('Keep the doorway clear.');
      await home.getByLabel('Column', { exact: true }).selectOption({ value: '6' });
      await home.getByLabel('Row', { exact: true }).selectOption({ value: '1' });
      const item = home.locator('[data-scene-object^="piece-"] img');
      await expect(item).toHaveAttribute('src', new RegExp(`oak-seat-${part}\\.svg`));
      await expect(item).toBeVisible();
      await info.attach(`place-${width}-${theme}`, { body: await home.screenshot(), contentType: 'image/png' });

      await activate(page, place, touch);
      expect(puts).toEqual([]);
      const save = home.getByRole('button', { name: 'Save layout', exact: true });
      await activate(page, save, touch);
      await expect(home.locator('[data-layout-status]')).toHaveText('Layout saved · Revision 1');
      expect(puts).toHaveLength(1);
      const confirmed = await (await page.request.get('/api/town/layouts/living')).json();
      expect(confirmed.items.at(-1)).toMatchObject({ catalog_id: 'oak-seat', column: 6, row: 1 });

      await page.reload();
      await expect(home.locator(`[data-scene-object="${confirmed.items.at(-1).instance_id}"] img`)).toBeVisible();
      await expect(open).toBeEnabled();
      await expect(home.locator('[data-placement-grid]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      expect(await home.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      const scan = await new AxeBuilder({ page }).include('app-town-home').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await info.attach(`saved-${width}-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });

      await activate(page, home.getByRole('link', { name: 'Back to Town' }), touch);
      await expect(townHome).toBeFocused();
    });
  }

  test('reapplies a catalog placement after another tab saves and supports Undo', async ({ page }) => {
    await prepare(page, 1280, 'light');
    await page.goto('/town/cosmetics?item=fern');
    const home = page.locator('app-town-home');
    await activate(page, home.getByRole('button', { name: 'Place Fern' }), false);
    await expect(home.getByRole('heading', { name: 'Fern', exact: true })).toBeFocused();
    await home.getByLabel('Column', { exact: true }).selectOption({ value: '6' });
    await home.getByLabel('Row', { exact: true }).selectOption({ value: '1' });
    await home.getByRole('button', { name: 'Place item' }).click();
    const other = starterHomeLayout('living').map(item => item.instance_id === 'living-table' ? { ...item, palette: 1 } : item);
    const headers = { 'X-CSRF-Token': 'synthetic-csrf', Origin: new URL(page.url()).origin };
    const response = await page.request.put('/api/town/layouts/living', { headers, data: { expected_revision: 0, items: other } });
    expect(response.status()).toBe(201);
    const save = home.getByRole('button', { name: 'Save layout', exact: true });
    await save.click();
    await home.getByRole('button', { name: 'Reapply my changes' }).click();
    await expect(home.locator('[data-layout-status]')).toHaveText('Review your reapplied changes before saving.');
    await save.click();
    await expect(home.locator('[data-layout-status]')).toHaveText('Layout saved · Revision 2');
    let confirmed = await (await page.request.get('/api/town/layouts/living')).json();
    expect(confirmed.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ instance_id: 'living-table', palette: 1 }),
      expect.objectContaining({ catalog_id: 'fern', column: 6, row: 1 }),
    ]));

    await home.getByRole('button', { name: 'Undo last save' }).click();
    await expect(home.locator('[data-layout-status]')).toHaveAttribute('data-layout-revision', '3');
    confirmed = await (await page.request.get('/api/town/layouts/living')).json();
    expect(confirmed.items).toEqual(other);
  });

  test('opens the exact Workshop item and handles missing art and unsupported bookmarks', async ({ page }, info) => {
    await prepare(page, 320, 'dark');
    await page.route('**/town/cosmetics/tile-fountain-day.svg*', route => route.fulfill({ status: 503, body: '' }));
    await page.goto('/town/cosmetics?item=tile-fountain&part=day&note=private');
    const workshop = page.locator('app-town-workshop');
    await expect(page).toHaveURL(/\/town\/workshop\?item=tile-fountain&part=day$/);
    await expect(workshop.getByRole('heading', { name: 'Tile fountain' })).toBeVisible();
    await expect(workshop.getByLabel('Furniture')).toHaveValue('tile-fountain');
    await expect(workshop.locator('.price')).toHaveText('10 Stamps');
    await expect(workshop.getByText('Preview unavailable')).toBeVisible();
    await expect(workshop.getByRole('link', { name: 'Place in Home' })).toHaveCount(0);

    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%'));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    const fallback = await workshop.getByText('Preview unavailable').boundingBox();
    const art = await workshop.locator('.art').boundingBox();
    expect(fallback && art && fallback.x >= art.x && fallback.x + fallback.width <= art.x + art.width).toBeTruthy();
    await info.attach('workshop-missing-art-320-night', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    await page.goto('/town/cosmetics?item=missing-keepsake&part=dusk');
    await expect(page).toHaveURL(/\/town\/workshop\?item=missing-keepsake$/);
    await expect(workshop.getByRole('heading', { name: 'Unsupported item' })).toBeVisible();
    await expect(workshop.getByText('missing-keepsake', { exact: true })).toBeVisible();
    await expect(workshop.getByRole('button', { name: 'Unlock', exact: true })).toHaveCount(0);
    await expect(workshop.getByRole('link', { name: 'Place in Home' })).toHaveCount(0);
    await workshop.getByLabel('Furniture').selectOption('globe');
    await expect(workshop.getByRole('heading', { name: 'Globe' })).toBeVisible();
    await expect(workshop.locator('img')).toHaveAttribute('src', /globe-night\.svg/);
    expect((await (await page.request.get('/api/town/stamps')).json()).entitlements).toEqual([]);
  });

  test('keeps a locked shop piece out of the Home draft', async ({ page }) => {
    await prepare(page, 390, 'light');
    await page.goto('/town/home/living?item=shell-stool');
    const home = page.locator('app-town-home');
    await activate(page, home.getByRole('button', { name: 'Place Shell stool' }), true);
    const workshop = home.getByRole('link', { name: 'Open Shell stool in Workshop' });
    await expect(workshop).toBeVisible();
    await expect(home.getByRole('button', { name: 'Save layout' })).toBeDisabled();
    await expect(home.getByLabel('Add furniture').locator('option[value="shell-stool"]')).toHaveCount(0);
    await activate(page, workshop, true);
    await expect(page).toHaveURL(/\/town\/workshop\?item=shell-stool$/);
    await expect(page.getByRole('heading', { name: 'Shell stool' })).toBeVisible();
  });
});
