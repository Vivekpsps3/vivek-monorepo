import { expect, type Page, test } from './frozen-clock';
import { chaseGood } from './fixtures/bank-csv';
import { moneyText } from './money-text';
import { syntheticVault } from './synthetic-vault';

// F14: Home states. The clock is frozen at noon PT on 2026-10-20.
test.use({ frozenInstant: Date.parse('2026-10-20T12:00:00-07:00') });

const widths = [390, 1280] as const;
const themes = ['light'] as const;

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
}

function seededSeed() {
  return {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 4200, as_of_date: '2026-10-22' }],
    holdings: [{
      id: 10, symbol: 'VOO', shares: 3, purchase_price: 600, purchase_date: '2022-01-01',
      current_price: 700.81, price_source: 'live', price_as_of: '2026-10-20T14:38:00Z',
      position_as_of: '2026-10-10', company_name: 'Vanguard 500',
    }],
    subscriptions: [{
      id: 20, name: 'Streaming', category: 'entertainment', amount: 15.49,
      frequency: 'monthly', next_bill_date: '2026-10-22', is_active: true,
    }],
  };
}

for (const width of widths) {
  for (const theme of themes) {
    const combo = `[${width} ${theme}]`;

    test(`${combo} empty vault`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, {});
      await vault.open('/');
      await expect(page.getByRole('heading', { name: 'Start with one number' })).toBeVisible();
      await expect(page.locator('.home-empty__primary', { hasText: 'Add a balance' })).toBeVisible();
      await expect(page.locator('.home-empty__secondary', { hasText: 'Import card activity' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'First steps' })).toBeVisible();
      await expect(page.locator('.first-steps')).toContainText('0 of 4 done');
      await expect(page.locator('.first-steps a', { hasText: 'Add a balance' })).toHaveCount(0);
      await expect(page.locator('.first-steps a', { hasText: 'Add activity' })).toHaveCount(0);
      await expect(page.locator('.first-steps a', { hasText: 'Add holdings' })).toBeVisible();
      await expect(page.locator('.home-tile')).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`home-empty-${width}-${theme}.png`), fullPage: true });

      await page.locator('.home-empty__secondary', { hasText: 'Import card activity' }).click();
      await expect(page).toHaveURL(/\/imports\?start=bank/);
      await expect(page.getByRole('heading', { level: 1, name: 'Imports', exact: true })).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'Import from bank', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'Activity', exact: true })).toHaveCount(0);
    });

    test(`${combo} seeded Home order`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, seededSeed());
      vault.setQuote('VOO', { price: 700.81 });
      await vault.open('/');

      const netWorth = page.locator('.home-tile--balance');
      const dueSoon = page.locator('.due-soon');
      const firstSteps = page.locator('.first-steps');
      await expect(netWorth).toBeVisible();
      await expect(dueSoon).toBeVisible();
      await expect(firstSteps).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Start with one number' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Import card activity', exact: true })).toHaveCount(0);
      await expect(page.locator('.first-steps a')).toHaveText('Add activity');
      await expect(page.locator('.first-steps a')).toHaveAttribute('href', /\/finance\/imports\?start=bank/);
      const manual = page.locator('.home-tile--activity a', { hasText: 'Add a transaction' });
      await expect(manual).toHaveAttribute('href', /add=1/);
      await expect(manual).toHaveAttribute('href', /date=/);
      await expect(manual).not.toHaveAttribute('href', /imports/);
      const boxes = await page.evaluate(() => {
        const y = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
        return { tile: y('.home-tile--balance'), activity: y('.home-tile--activity'), due: y('.due-soon'), steps: y('.first-steps') };
      });
      expect(boxes.tile).toBeGreaterThanOrEqual(0);
      expect(boxes.due).toBeGreaterThan(boxes.tile);
      expect(boxes.steps).toBeGreaterThan(boxes.due);
      if (width === 1280) {
        expect(Math.abs(boxes.activity - boxes.tile)).toBeLessThanOrEqual(1);
      } else {
        expect(boxes.activity).toBeGreaterThan(boxes.tile);
      }
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: testInfo.outputPath(`home-seeded-${width}-${theme}.png`), fullPage: true });
    });

    test(`${combo} as-of line`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, seededSeed());
      vault.setQuote('VOO', { price: 700.81 });
      await vault.open('/');
      await expect(page.locator('.home-asof')).toContainText('Balances Oct 22');
      await expect(page.locator('.home-asof')).toContainText(/Prices as of .+ PT/);
    });

    test(`${combo} due soon`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, seededSeed());
      vault.setQuote('VOO', { price: 700.81 });
      await vault.open('/');
      const card = page.locator('.due-soon');
      await expect(card).toContainText('Streaming');
      await expect(card).toContainText(moneyText('$15.49'));
    });

    test(`${combo} first steps progress and hide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, seededSeed());
      vault.setQuote('VOO', { price: 700.81 });
      await vault.open('/');
      await expect(page.locator('.first-steps')).toContainText('3 of 4 done');
      await page.getByRole('button', { name: 'Hide', exact: true }).click();
      await expect(page.locator('.first-steps')).toHaveCount(0);
      await vault.reload();
      await expect(page.locator('.first-steps')).toHaveCount(0);
    });

    test(`${combo} error state`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, seededSeed());
      await vault.open('/');
      await page.route('**/vault/records**', route => route.abort());
      await page.reload();
      await expect(page.getByRole('heading', { name: "Couldn't load Home." })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }
}

const importJourneys = [
  { width: 390, height: 844, theme: 'dark' as const, touch: true },
  { width: 390, height: 844, theme: 'light' as const, touch: true },
  { width: 1280, height: 800, theme: 'light' as const, touch: false },
  { width: 1280, height: 800, theme: 'dark' as const, touch: false },
];

for (const journey of importJourneys) {
  test.describe(`FIXUP-13 ${journey.width} ${journey.theme}`, () => {
    test.use({
      viewport: { width: journey.width, height: journey.height },
      hasTouch: journey.touch,
      reducedMotion: 'reduce',
      colorScheme: journey.theme === 'dark' ? 'dark' : 'light',
    });

    test('cancels Import card activity on Imports, matching the Imports button', async ({ page }) => {
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), journey.theme);
      const vault = await syntheticVault(page, {});
      await vault.open('/');
      const opener = page.locator('.home-empty__secondary', { hasText: 'Import card activity' });
      const box = await opener.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalScroll(page);
      if (journey.touch) await opener.tap();
      else {
        await opener.focus();
        await page.keyboard.press('Enter');
      }
      const dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
      await expect(page).toHaveURL(/\/finance\/imports\?start=bank/);
      await expect(dialog).toBeVisible();
      if (journey.touch) {
        await dialog.locator('#import-file').setInputFiles({
          name: 'chase.csv', mimeType: 'text/csv', buffer: Buffer.from(chaseGood),
        });
        await dialog.getByLabel('Bank for chase.csv', { exact: true }).selectOption('chase');
        await dialog.getByLabel('Account name', { exact: true }).fill('Chase card');
        await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
        await expect(dialog.locator('.import-summary').first()).toContainText('new');
        expect(vault.data('transactions')).toHaveLength(0);
        expect(vault.data('import_batches')).toHaveLength(0);
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).tap();
      } else {
        expect(vault.data('transactions')).toHaveLength(0);
        await page.keyboard.press('Escape');
      }
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/\/finance\/imports\/?$/);
      await expect(page).not.toHaveURL(/start=bank/);
      await expect(page.getByRole('heading', { level: 1, name: 'Imports', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Import history \(0\)/ })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'Activity', exact: true })).toHaveCount(0);
      if (!journey.touch) {
        await expect(page.locator('app-transactions .header-actions').getByRole('button', { name: 'Import', exact: true })).toBeFocused();
      }

      const again = page.locator('app-transactions .header-actions').getByRole('button', { name: 'Import', exact: true });
      if (journey.touch) await again.tap();
      else await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/start=bank/);
      await expect(dialog).toBeVisible();
      if (journey.touch) await dialog.getByRole('button', { name: 'Cancel', exact: true }).tap();
      else await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/\/finance\/imports\/?$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Activity', exact: true })).toHaveCount(0);
      expect(vault.data('transactions')).toHaveLength(0);
    });
  });
}

test('FIXUP-13 previews, confirms a receipt, and returns to Home facts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), 'light');
  const vault = await syntheticVault(page, {});
  await vault.open('/');
  await page.locator('.home-empty__secondary', { hasText: 'Import card activity' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  await dialog.locator('#import-file').setInputFiles({
    name: 'chase.csv', mimeType: 'text/csv', buffer: Buffer.from(chaseGood),
  });
  await dialog.getByLabel('Bank for chase.csv', { exact: true }).selectOption('chase');
  await dialog.getByLabel('Account name', { exact: true }).fill('Chase card');
  await dialog.getByRole('button', { name: 'Preview all files', exact: true }).click();
  await expect(dialog.locator('.import-summary').first()).toContainText('new');
  await expect(dialog).toContainText('GROCER');
  expect(vault.data('transactions')).toHaveLength(0);
  expect(vault.data('import_batches')).toHaveLength(0);
  await dialog.getByRole('button', { name: /Import \d+ transaction/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: /Import history \(1\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await expect.poll(() => vault.data('transactions').length).toBe(3);

  await page.getByRole('navigation', { name: 'Finance sections' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Home overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start with one number' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Import card activity', exact: true })).toHaveCount(0);
  const order = await page.evaluate(() => {
    const y = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return { tile: y('.home-tile--balance'), activity: y('.home-tile--activity'), steps: y('.first-steps') };
  });
  expect(order.tile).toBeGreaterThanOrEqual(0);
  expect(order.activity).toBeGreaterThanOrEqual(0);
  expect(order.steps).toBeGreaterThan(order.tile);
  await expect(page.locator('.home-tile--balance')).toContainText('Add a balance');
  await expect(page.locator('.first-steps a', { hasText: 'Add a balance' })).toHaveCount(0);
  await expect(page.locator('.first-steps')).toContainText('Done');
  await expect(page.locator('.first-steps')).toContainText('Add activity');
  await expect(page.locator('.home-tile--activity .home-tile__value')).toBeVisible();
});

test('FIXUP-13 keeps a legacy import URL distinct from a dated manual add', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), 'dark');
  const vault = await syntheticVault(page, {});
  await vault.open('/spending?add=1');
  await expect(page).toHaveURL(/\/spending\?add=1/);
  await expect(page.getByRole('heading', { level: 1, name: 'Activity', exact: true })).toBeVisible();
  const bank = page.getByRole('dialog', { name: 'Import from bank', exact: true });
  await expect(bank).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Add transaction', exact: true })).toHaveCount(0);
  await bank.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(bank).toBeHidden();
  await expect(page).toHaveURL(/\/spending/);
  await expect(page).not.toHaveURL(/imports/);
  await expect(page.getByRole('heading', { level: 1, name: 'Activity', exact: true })).toBeVisible();

  await vault.open('/spending?date=2026-10-20&add=1');
  await expect(page.getByRole('dialog', { name: 'Add transaction', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Import from bank', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/date=2026-10-20/);
  await expect(page).toHaveURL(/add=1/);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).not.toHaveURL(/imports/);
  await expect(page.getByRole('heading', { level: 1, name: 'Activity', exact: true })).toBeVisible();
});
