import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './frozen-clock';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

const LABELS = ['Home', 'Accounts', 'Holdings', 'Activity', 'Calendar', 'Bills', 'Pay', 'Planning', 'Imports'];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;
const THEMES = ['light', 'dark'] as const;

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`navigation [${viewport.width} ${theme}]`, () => {
      test.use({ viewport, hasTouch: viewport.width === 390 });

      test.beforeEach(async ({ page }) => {
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      });

      test('Home opens Holdings with one action and keeps all destinations visible', async ({ page }, info) => {
        const vault = await syntheticVault(page, { holdings: [{
          id: 1, symbol: 'HBR', company_name: 'Harbor Index', shares: 2,
          purchase_price: 100, current_price: 125, price_source: 'manual', position_as_of: '2026-10-10',
        }] });
        await vault.open('/');
        const nav = page.getByRole('navigation', { name: 'Finance sections' });
        await expect(page.locator('.mobile-tabbar')).toHaveCount(0);
        await expect(nav.getByRole('link')).toHaveText(LABELS);
        for (const link of await nav.getByRole('link').all()) {
          const box = (await link.boundingBox())!;
          expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        }
        const holdings = nav.getByRole('link', { name: 'Holdings', exact: true });
        if (viewport.width === 390) await holdings.tap();
        else {
          await holdings.focus();
          await page.keyboard.press('Enter');
        }
        await expect(page).toHaveURL(/\/finance\/have\?t=holdings$/);
        await expect(holdings).toHaveAttribute('aria-current', 'page');
        await expect(page.getByRole('heading', { level: 1, name: 'Holdings' })).toBeFocused();
        const position = page.getByRole('row').filter({ hasText: 'Harbor Index' });
        await expect(position).toContainText(/\$\u2060?250\.00/);
        if (viewport.width === 1280) await position.hover();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await info.attach('finance-holdings', { body: await page.screenshot(), contentType: 'image/png' });
        await page.goBack();
        await expect(nav.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
      });

      test('document title matches the section', async ({ page }) => {
        const vault = await syntheticVault(page);
        for (const [path, label] of [
          ['/', 'Home'],
          ['/have', 'Net worth'],
          ['/spending', 'Spending'],
          ['/recurring', 'Recurring'],
          ['/planning', 'Planning'],
        ] as const) {
          await vault.open(path);
          await expect(page).toHaveTitle(`${label} · Finance`);
        }
      });

      test('direct destinations keep canonical links and one active item', async ({ page }) => {
        const vault = await syntheticVault(page);
        await vault.open('/');
        const nav = page.getByRole('navigation', { name: 'Finance sections' });
        for (const [label, href] of [
          ['Holdings', '/finance/have?t=holdings'],
          ['Accounts', '/finance/have'],
          ['Calendar', '/finance/spending?t=calendar'],
          ['Activity', '/finance/spending'],
          ['Bills', '/finance/recurring?t=spend'],
          ['Pay', '/finance/recurring'],
          ['Imports', '/finance/spending?receipts=1'],
        ]) {
          const link = nav.getByRole('link', { name: label, exact: true });
          await expect(link).toHaveAttribute('href', href);
          await link.click();
          await expect(page).toHaveURL(new URL(href, page.url()).href);
          await expect(link).toHaveAttribute('aria-current', 'page');
          await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
        }
        const receipts = page.locator('details.import-history');
        await expect(receipts).toHaveJSProperty('open', true);
        await expect(receipts).toBeInViewport();
        await expect(page.locator('ui-page-header').getByRole('button', { name: 'Import', exact: true })).toBeVisible();

        await vault.open('/planning');
        await page.getByRole('link', { name: 'Portfolio projection', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/planning\?t=growth$/);
        await page.getByRole('link', { name: 'Retirement and goals', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/planning$/);
        await expect(page.locator('.hub-tabs a[aria-current="page"]')).toHaveCount(1);
      });

      test('legacy params still resolve', async ({ page }) => {
        const vault = await syntheticVault(page);
        await vault.open('/have?t=assets');
        await expect(page.getByRole('link', { name: 'Accounts', exact: true })).toHaveAttribute('aria-current', 'page');

        await vault.open('/spending?t=pay', page, '/spending?t=activity&v=income');
        await expect(page).toHaveURL(/v=income/);

        await vault.open('/recurring?t=pay');
        await expect(page.getByRole('link', { name: 'Pay', exact: true })).toHaveAttribute('aria-current', 'page');

        await vault.open('/planning?t=path');
        await expect(page.getByRole('link', { name: 'Retirement and goals', exact: true })).toHaveAttribute('aria-current', 'page');
      });

      test('guide', async ({ page }) => {
        const vault = await syntheticVault(page, {
          assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 100, as_of_date: '2026-10-01' }],
        });
        await vault.open('/');
        const menu = await openUserMenu(page);
        await menu.getByRole('button', { name: 'Guide', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'How Finance works' });
        await expect(dialog).toBeVisible();
        await expect(page).toHaveURL(/\/finance\/?$/);
        await expect(dialog.getByRole('heading', { name: 'How Finance works' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();

        const menuAgain = await openUserMenu(page);
        await menuAgain.getByRole('button', { name: 'Guide', exact: true }).click();
        await expect(dialog).toBeVisible();
        await dialog.getByRole('link', { name: 'Open Spending', exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/\/finance\/spending/);

        await vault.open('/');
        const menuThird = await openUserMenu(page);
        await menuThird.getByRole('button', { name: 'Guide', exact: true }).click();
        await expect(dialog).toBeVisible();
        if (viewport.width <= 640) {
          for (const button of await dialog.locator('.tutorial-footer button').all()) {
            const box = await button.boundingBox();
            expect(box?.width ?? 0).toBeGreaterThanOrEqual(300);
          }
        }
        await dialog.getByRole('button', { name: 'Show first steps on Home', exact: true }).click();
        await expect(page).toHaveURL(/\/finance\/?$/);
        await expect(page.getByRole('heading', { name: 'First steps', exact: true })).toBeVisible();
      });
    });
  }
}

test('an app switcher link to Holdings goes through the locked vault and preserves the destination', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const vault = await syntheticVault(page, { holdings: [{
    id: 12, symbol: 'HBR', company_name: 'Private Harbor Fund', shares: 3,
    current_price: 125, price_source: 'manual',
  }] });
  await vault.open('/');
  await (await openUserMenu(page)).getByRole('button', { name: 'Lock Finance', exact: true }).click();
  const unlock = page.getByRole('textbox', { name: 'Vault passphrase', exact: true });
  await expect(unlock).toBeVisible();

  const apps = page.getByRole('navigation', { name: 'Apps', exact: true });
  const menu = apps.getByRole('group', { name: 'App destinations' });
  await apps.getByRole('button', { name: /Switch apps and destinations.*Finance/ }).click();
  await menu.getByRole('link', { name: 'Travel', exact: true }).click();
  await expect(page).toHaveURL(/\/travel$/);

  await apps.getByRole('button', { name: /Switch apps and destinations.*Travel/ }).click();
  await menu.getByRole('group', { name: 'Finance', exact: true }).getByRole('link', { name: 'Holdings', exact: true }).click();
  await expect(unlock).toBeVisible();
  expect(new URL(page.url()).searchParams.get('next')).toBe('/finance/have?t=holdings');
  await expect(page.getByRole('navigation', { name: 'Finance sections' })).toHaveCount(0);
  await expect(page.getByText('Private Harbor Fund', { exact: true })).toHaveCount(0);

  await unlock.fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/have\?t=holdings$/);
  await expect(page.getByRole('row').filter({ hasText: 'Private Harbor Fund' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Finance sections' }).locator('[aria-current="page"]')).toHaveText('Holdings');
});
