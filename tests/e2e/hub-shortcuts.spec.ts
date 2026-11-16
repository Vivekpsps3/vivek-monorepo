import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

for (const width of [390, 1280]) for (const theme of ['light', 'dark'] as const) {
  test(`Quick add routes, keyboard guards, help and focus at ${width} ${theme}`, async ({page, request}, info) => {
    expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
    await page.setViewportSize({width, height: 900});
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    await page.goto('/hub');
    const quick = page.getByRole('button', {name: 'Quick add', exact: true});
    await expect(quick).toBeVisible();
    await quick.focus();
    await page.keyboard.press('n');
    const menu = page.getByRole('menu', {name: 'Quick add'});
    await expect(menu.getByRole('menuitem', {name: 'Plan a trip'})).toBeFocused();
    await expect(menu.getByRole('menuitem', {name: 'Plan a trip'})).toHaveAttribute('href', '/travel/trips/new');
    await expect(menu.getByRole('menuitem', {name: 'Add media'})).toHaveAttribute('href', '/media/search');
    await expect(menu.getByRole('menuitem', {name: 'Add transaction'})).toHaveAttribute('href', /date=\d{4}-\d{2}-\d{2}.*add=1/);
    await page.keyboard.press('ArrowUp');
    await expect(menu.getByRole('menuitem', {name: 'Add transaction'})).toBeFocused();
    await page.keyboard.press('Home');
    await expect(menu.getByRole('menuitem', {name: 'Plan a trip'})).toBeFocused();
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await page.screenshot({path: info.outputPath('quick-add.png')});
    await page.keyboard.press('Escape');
    await expect(quick).toBeFocused();
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', {name: 'Keyboard shortcuts'});
    await expect(help).toContainText('Search');
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await page.keyboard.press('n');
    await expect(menu).toBeHidden();
    await page.keyboard.press('Control+k');
    await expect(help).toBeVisible();
    await help.getByRole('button', {name: 'Close'}).click();
    await expect(quick).toBeFocused();
    await page.keyboard.press('Control+k');
    const search = page.getByRole('combobox');
    await search.fill('n?');
    await expect(menu).toBeHidden();
    await expect(help).toBeHidden();
    await page.keyboard.press('Escape');
    await quick.click();
    await expect(menu).toBeVisible();
    await page.getByRole('heading', {level: 1}).click();
    await expect(menu).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect((await quick.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
}

test('health chip is admin-only and its outage does not disable the Hub', async ({page, request}) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
  let healthReads = 0;
  await page.route('**/{travel,media}/api/health', route => { healthReads++; return route.fulfill({status: 503, json: {status: 'down'}}); });
  await page.goto('/hub');
  await expect(page.getByRole('button', {name: 'Quick add', exact: true})).toBeVisible();
  expect(healthReads).toBe(0);
  await page.route('**/api/auth/me', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.user.role = 'admin';
    await route.fulfill({response, json: body});
  });
  await page.reload();
  await expect(page.getByRole('link', {name: 'Travel and Media degraded'})).toBeVisible();
  expect(healthReads).toBe(2);
  await expect(page.getByRole('button', {name: 'Quick add', exact: true})).toBeEnabled();
});
