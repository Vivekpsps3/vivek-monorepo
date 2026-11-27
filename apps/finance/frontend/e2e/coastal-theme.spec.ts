import AxeBuilder from '@axe-core/playwright';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { expect, type Page, test } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

test.use({ hasTouch: true });

async function sources(page: Page) {
  await page.route('**/travel/api/summary?*', route => route.fulfill({ json: {
    today: '2026-10-15', up_next: [], next_trip: { id: 12, title: 'Harbor tour', destination: 'Kyoto',
      start_date: '2026-10-16', end_date: '2026-10-20', phase: 'upcoming', days_until: 1,
      next_action: 'Leaves tomorrow', href: '/travel/trips/12' },
  } }));
  await page.route('**/media/api/summary', route => route.fulfill({ json: {
    currently: [{ id: 4, title: 'Coastal stories', kind: 'book', progress_label: 'Reading' }],
    recent_reviews: [], upcoming: [], next_episodes: [],
  } }));
  await page.route('**/media/api/calendar?*', route => route.fulfill({ json: { days: [] } }));
}

async function chooseTheme(page: Page, theme: 'light' | 'dark') {
  const menu = await openUserMenu(page);
  await menu.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('navigation', { name: 'Settings', exact: true }).getByRole('link', { name: 'Appearance' }).click();
  const radio = page.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true });
  await radio.focus();
  await page.keyboard.press('Space');
  await expect(radio).toBeChecked();
  await page.goBack();
  await page.goBack();
  await expect(page.locator('#hub-main h1')).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

for (const width of [320, 390, 1280]) {
  test(`coastal day/night preserves populated Hub and Finance at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sources(page);
    const vault = await syntheticVault(page, {
      assets: [{ id: 1, name: 'Harbor savings', category: 'cash', current_value: 1234.56, as_of_date: '2026-10-15' }],
    });
    await vault.open('/hub');
    const snapshot = vault.data('assets');
    for (const theme of ['light', 'dark'] as const) {
      await chooseTheme(page, theme);
      const finance = page.getByRole('region', { name: 'Net worth', exact: true });
      await expect(finance).toContainText(/\$\u2060?1,234\.56/);
      await expect(page.getByRole('region', { name: 'Next trip' })).toContainText('Kyoto');
      expect(await finance.locator('.quiet-title').evaluate(node => getComputedStyle(node).fontVariantNumeric)).toBe('tabular-nums');
      expect(await page.locator('.suite-header').evaluate(node => getComputedStyle(node).borderTopColor))
        .toBe(theme === 'light' ? 'rgb(118, 84, 34)' : 'rgb(230, 195, 126)');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await info.attach(`coastal-hub-${width}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await finance.locator('a.quiet-title').tap();
      await expect(page.locator('app-dashboard')).toContainText(/\$\u2060?1,234\.56/);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await info.attach(`coastal-finance-${width}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      expect(vault.data('assets')).toEqual(snapshot);
      await vault.open('/hub');
    }
  });
}

for (const mode of ['forced-colors', '200% text'] as const) {
  test(`coastal labels and keyboard remain usable with ${mode}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await sources(page);
    const vault = await syntheticVault(page, {
      assets: [{ id: 1, name: 'Harbor savings', category: 'cash', current_value: 1234.56, as_of_date: '2026-10-15' }],
    });
    await vault.open('/hub');
    if (mode === 'forced-colors') await page.emulateMedia({ forcedColors: 'active' });
    else await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    for (const theme of ['light', 'dark'] as const) {
      await chooseTheme(page, theme);
      await expect(page.getByRole('region', { name: 'Net worth', exact: true })).toContainText(/\$\u2060?1,234\.56/);
      if (mode === 'forced-colors') {
        const launch = page.getByRole('link', { name: 'Plan a trip', exact: true });
        for (const hover of [false, true]) {
          if (hover) await launch.hover();
          const paint = await launch.evaluate(node => {
            const probe = document.createElement('button');
            probe.style.color = 'ButtonText';
            probe.style.backgroundColor = 'ButtonFace';
            document.body.append(probe);
            const read = (element: Element) => {
              const style = getComputedStyle(element);
              return [style.color, style.backgroundColor];
            };
            const result = { actual: read(node), system: read(probe) };
            probe.remove();
            return result;
          });
          expect(paint.actual).toEqual(paint.system);
        }
      }
      const trigger = page.locator('.user-menu-toggle');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('navigation', { name: 'User options' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await info.attach(`coastal-${mode}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await page.getByRole('region', { name: 'Net worth', exact: true }).locator('a.quiet-title').tap();
      await expect(page.locator('app-dashboard')).toContainText(/\$\u2060?1,234\.56/);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await info.attach(`coastal-finance-${mode}-${theme}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await vault.open('/hub');
    }
  });
}
