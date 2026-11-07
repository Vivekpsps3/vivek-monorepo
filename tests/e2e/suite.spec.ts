import { chooseColorTheme } from './user-menu.mjs';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public pages prerender meaningful HTML and never request private APIs', async ({ page, request }) => {
  const calls: string[] = [];
  page.on('request', r => { if (/\/(?:api|travel\/api|media\/api)\//.test(new URL(r.url()).pathname)) calls.push(r.url()); });
  for (const route of ['/', '/home', '/work', '/about', '/secrets']) {
    const source = await request.get(route);
    expect(source.status()).toBe(200);
    expect(await source.text()).toMatch(/<h1[\s>]/);
    await page.goto(route);
    await expect(page.locator('main').first()).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  expect(calls).toEqual([]);
  expect((await request.get('/missing-asset.js')).status()).toBe(404);
  expect((await request.get('/unknown-page')).status()).toBe(404);
});

for (const width of [320, 1440]) for (const theme of ['light', 'dark'] as const) test(`the persistent shell works at ${width}px ${theme} with a locked Finance vault`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/hub');
  await chooseColorTheme(page, theme);
  for (const route of ['/travel', '/travel/trips/new', '/travel/pto', '/travel/settings', '/media/library', '/media/search', '/media/add', '/media/calendar', '/hub']) {
    await page.goto(route);
    // Below 640px the four app links live in the closed compact switcher.
    if (width <= 640) {
      await page.locator('.app-switcher__toggle').click();
      await expect(page.locator('#app-switcher-menu')).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Hub', exact: true })).toHaveCount(1);
    if (width <= 640) {
      await page.keyboard.press('Escape');
      await expect(page.locator('#app-switcher-menu')).toHaveCount(0);
    }
    await expect(page.locator('main').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.screenshot({ path: test.info().outputPath('hub.png'), fullPage: true });
});

test('forced colors and reduced motion retain usable native controls and modal focus', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('/travel/trips/new');
  await page.getByLabel('Departure date').fill('2026-12-01');
  await page.getByLabel('Return date').fill('2026-12-03');
  await page.getByRole('textbox', { name: 'Destination city', exact: true }).fill('Kyoto');
  await page.getByRole('link', { name: 'Hub', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep planning', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Destination city', exact: true })).toHaveValue('Kyoto');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('200 percent content zoom and reduced transparency retain readable controls', async ({ page, request }) => {
  await request.post('/e2e/reset');
  const created = await request.post('/media/api/library', { data: { kind: 'book', title: 'A'.repeat(300), creator: 'A long creator name '.repeat(10) } });
  expect(created.ok(), await created.text()).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  for (const route of ['/hub', '/travel/trips/new', '/media/library', '/media/add']) {
    await page.goto(route);
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await expect(page.locator('.suite-header')).toHaveCSS('backdrop-filter', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.screenshot({ path: test.info().outputPath('zoomed-controls.png'), fullPage: true });
});
