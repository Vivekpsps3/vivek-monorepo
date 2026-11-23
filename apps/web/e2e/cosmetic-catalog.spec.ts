import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';
import { cosmeticCatalog } from '../src/app/town/cosmetic-catalog';

const CELL = 56;

async function openCatalog(page: Page, width: number, theme: 'light' | 'dark'): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
  expect((await page.request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
}

test.describe('Cosmetic catalog', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });

  for (const [width, theme, part] of [
    [390, 'light', 'day'],
    [390, 'dark', 'night'],
    [1280, 'light', 'day'],
    [1280, 'dark', 'night'],
  ] as const) {
    test(`renders every catalog id at ${width} ${theme} ${part}`, async ({ page }, info) => {
      const art: string[] = [];
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/town/cosmetics/') && url.pathname.endsWith('.svg')) art.push(url.pathname);
      });
      await openCatalog(page, width, theme);
      await page.goto('/hub');
      expect(art).toEqual([]);
      await page.goto('/town');
      const entrance = page.getByRole('link', { name: 'Cosmetic catalog' });
      await expect(entrance).toBeVisible();
      expect(art).toEqual([]);
      const touch = width === 390;
      if (touch) await entrance.tap();
      else {
        await entrance.focus();
        await page.keyboard.press('Enter');
      }
      const catalog = page.locator('app-town-cosmetic-catalog');
      await expect(catalog.getByRole('heading', { name: 'Cosmetic catalog', level: 1 })).toBeVisible();
      await expect(catalog.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
      if (part === 'night') {
        await catalog.getByRole('button', { name: 'Night' }).click();
        await expect(catalog.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');
      }

      for (const item of cosmeticCatalog) {
        const choice = catalog.getByRole('link', { name: new RegExp(`^${item.label},`) });
        const box = await choice.boundingBox();
        expect(box?.width, item.id).toBeGreaterThanOrEqual(44);
        expect(box?.height, item.id).toBeGreaterThanOrEqual(44);
        if (touch) await choice.tap();
        else {
          await choice.focus();
          await page.keyboard.press('Enter');
        }
        const preview = catalog.locator(`[data-preview="${item.id}"]`);
        await expect(preview).toBeVisible();
        const frame = await preview.boundingBox();
        expect(Math.round(frame?.width ?? 0), item.id).toBe(item.footprint.columns * CELL);
        expect(Math.round(frame?.height ?? 0), item.id).toBe(item.footprint.rows * CELL);
        const image = preview.locator('img');
        await expect(image).toBeVisible();
        await expect(image).toHaveAttribute('src', new RegExp(`/town/cosmetics/${item.id}-${part}\\.svg`));
        const natural = await image.evaluate(element => ({
          width: (element as HTMLImageElement).naturalWidth,
          height: (element as HTMLImageElement).naturalHeight,
        }));
        expect(natural, item.id).toEqual({
          width: item.footprint.columns * CELL,
          height: item.footprint.rows * CELL,
        });
        await expect(catalog.getByRole('heading', { name: item.label, level: 2 })).toBeVisible();
        await expect(catalog).toContainText(`${item.footprint.columns} by ${item.footprint.rows} cells`);
        await expect(catalog).toContainText(`Layer`);
        await expect(catalog).toContainText(String(item.layer));
        await expect(catalog).toContainText('Original artwork for Terraria-on-Sea');
        await expect(catalog).toContainText(item.priceStamps === 0 ? 'Free' : `${item.priceStamps} Stamps`);
      }

      const opposite = part === 'day' ? 'night' : 'day';
      await catalog.getByRole('button', { name: opposite === 'night' ? 'Night' : 'Day' }).click();
      await expect(catalog.locator('[data-preview="moon-clock"] img, [data-preview="oak-seat"] img').first()).toHaveAttribute('src', new RegExp(`-${opposite}\\.svg`));
      await expect(catalog.getByRole('list', { name: 'Saved layout' })).toContainText('Unsupported item');
      await expect(catalog.getByRole('list', { name: 'Saved layout' })).toContainText('missing-keepsake');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      expect(await catalog.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      const scan = await new AxeBuilder({ page }).include('app-town-cosmetic-catalog').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      const stamps = await page.evaluate(() => Object.keys(localStorage).some(key => /stamp/i.test(key)));
      expect(stamps).toBeFalsy();
      await info.attach(`catalog-${width}-${theme}-${part}`, { body: await catalog.screenshot(), contentType: 'image/png' });
    });
  }

  test('keeps an unsupported layout entry when artwork fails, then returns focus to Town', async ({ page }) => {
    await openCatalog(page, 1280, 'light');
    let failArt = true;
    await page.route('**/town/cosmetics/*.svg*', route => {
      if (failArt) return route.fulfill({ status: 503, body: '' });
      return route.continue();
    });
    await page.goto('/town/cosmetics?item=fern&part=day');
    const catalog = page.locator('app-town-cosmetic-catalog');
    const column = catalog.getByLabel('Column');
    await column.selectOption('6');
    await expect(catalog.getByText('Artwork is unavailable', { exact: true })).toBeVisible();
    await expect(column).toHaveValue('6');
    await expect(catalog.getByRole('list', { name: 'Saved layout' })).toContainText('missing-keepsake');
    await expect(catalog.getByRole('list', { name: 'Saved layout' }).locator('li')).toHaveCount(2);
    failArt = false;
    await catalog.getByRole('button', { name: 'Retry artwork' }).click();
    await expect(catalog.locator('[data-preview="fern"] img')).toBeVisible();
    await expect(column).toHaveValue('6');
    await catalog.getByRole('button', { name: 'Place free item' }).click();
    const saved = catalog.getByRole('list', { name: 'Saved layout' });
    await expect(saved).toContainText('fern');
    await expect(saved).toContainText('missing-keepsake');
    await expect(saved.locator('li')).toHaveCount(3);

    await page.goto('/town/cosmetics?item=missing-keepsake');
    await expect(catalog.getByRole('heading', { name: 'Unsupported item' })).toBeVisible();
    await expect(saved).toContainText('missing-keepsake');
    await expect(catalog.getByRole('button', { name: 'Place free item' })).toHaveCount(0);
    await expect(catalog.getByRole('button', { name: /Buy|Grant/ })).toHaveCount(0);

    let release = (): void => undefined;
    const hold = new Promise<void>(resolve => { release = resolve; });
    await page.unroute('**/town/cosmetics/*.svg*');
    await page.route('**/town/cosmetics/oak-seat-day.svg*', async route => {
      const response = await route.fetch();
      await hold;
      await route.fulfill({ response }).catch(() => undefined);
    }, { times: 1 });
    await page.goto('/town');
    await page.getByRole('link', { name: 'Cosmetic catalog' }).click();
    await expect(catalog.getByRole('heading', { name: 'Cosmetic catalog', level: 1 })).toBeVisible();
    await catalog.getByRole('link', { name: 'Back to Town' }).click();
    release();
    await expect(page.getByRole('heading', { level: 1, name: 'Terraria-on-Sea' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cosmetic catalog' })).toBeFocused();
    await expect(page.locator('img[src*="/town/cosmetics/"]')).toHaveCount(0);
  });
});
