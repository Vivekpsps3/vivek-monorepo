import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './frozen-clock';
import { openUserMenu } from '../../../../tests/e2e/user-menu.mjs';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from './synthetic-vault';

const PROJECTED = 'Projected. This does not change your current balances.';

const seed = {
  assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 2500, as_of_date: '2026-10-01' }],
  liabilities: [{ id: 2, name: 'Card', category: 'credit_card', balance_owed: 400, as_of_date: '2026-10-01' }],
  holdings: [{
    id: 10, symbol: 'VOO', shares: 3, purchase_price: 80, purchase_date: '2022-01-01',
    current_price: 100, price_source: 'manual',
  }],
};

const tools = [
  { path: '/planning/retirement', heading: 'Retirement', label: 'Extra annual expenses', value: '2400' },
  { path: '/planning/simulation', heading: 'Simulation', label: 'Horizon', value: '18' },
  { path: '/planning/savings', heading: 'Savings', label: 'Goal name', value: 'Cabin' },
  { path: '/planning/debt', heading: 'Debt', label: 'Extra payment', value: '80' },
  { path: '/planning/research', heading: 'Stock research', label: 'Ticker', value: 'AAPL' },
] as const;

test('each planning tool reloads its inputs and a projection leaves balances unchanged', async ({ page }) => {
  const vault = await syntheticVault(page, seed);
  vault.setQuote('VOO', { price: 100 });
  await vault.open('/planning');
  await expect(page.getByRole('heading', { level: 1, name: 'Planning' })).toBeVisible();
  const index = page.getByRole('navigation', { name: 'Planning tools' });
  for (const tool of tools) {
    await expect(index.getByRole('link', { name: tool.heading })).toBeVisible();
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  for (const tool of tools) {
    await vault.open(tool.path);
    await expect(page.getByRole('heading', { level: 1, name: tool.heading })).toBeVisible();
    await expect(page.getByRole('link', { name: tool.heading, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText(PROJECTED)).toBeVisible();
    const field = page.getByLabel(tool.label, { exact: true });
    await field.fill(tool.value);
    await field.blur();
    await vault.reload();
    await expect(page.getByRole('heading', { level: 1, name: tool.heading })).toBeVisible();
    await expect(page.getByLabel(tool.label, { exact: true })).toHaveValue(tool.value);
  }

  const before = {
    asset: vault.data('assets')[0].current_value,
    shares: vault.data('holdings')[0].shares,
    owed: vault.data('liabilities')[0].balance_owed,
  };
  await vault.open('/planning/projection');
  await expect(page.getByRole('heading', { level: 1, name: 'Projection' })).toBeVisible();
  await expect(page.getByText(PROJECTED)).toBeVisible();
  const contribution = page.getByRole('spinbutton', { name: 'Monthly contribution $', exact: true });
  await contribution.fill('125');
  await contribution.blur();
  expect(vault.data('assets')[0].current_value).toBe(before.asset);
  expect(vault.data('holdings')[0].shares).toBe(before.shares);
  expect(vault.data('liabilities')[0].balance_owed).toBe(before.owed);
  await vault.reload();
  await expect(page.getByRole('spinbutton', { name: 'Monthly contribution $', exact: true })).toHaveValue('125');
  expect(vault.data('assets')[0].current_value).toBe(before.asset);
  expect(vault.data('holdings')[0].shares).toBe(before.shares);
  expect(vault.data('liabilities')[0].balance_owed).toBe(before.owed);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('a failed stock lookup keeps the ticker, and lock clears a retirement draft', async ({ page }) => {
  await page.route('**/api/market/research/batch', route => route.fulfill({ status: 500, body: '{}' }));
  const vault = await syntheticVault(page, seed);
  await vault.open('/planning/research');
  const ticker = page.getByLabel('Ticker', { exact: true });
  await ticker.fill('MSFT');
  await ticker.blur();
  await page.getByRole('button', { name: 'Look up', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: "couldn't be loaded" })).toBeVisible();
  await expect(ticker).toHaveValue('MSFT');
  await vault.reload();
  await expect(page.getByLabel('Ticker', { exact: true })).toHaveValue('MSFT');

  await vault.open('/planning/retirement');
  const extra = page.getByLabel('Extra annual expenses', { exact: true });
  await extra.fill('2400');
  await extra.blur();
  const menu = await openUserMenu(page);
  await menu.getByRole('button', { name: 'Lock Finance', exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/unlock/);
  await page.getByLabel('Vault passphrase').fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Retirement' })).toBeVisible();
  await expect(page.getByLabel('Extra annual expenses', { exact: true })).toHaveValue('0');
});

test.describe('planning tools at phone size', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('touch, light theme, and reduced motion keep a 44px tool target', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'light'));
    const vault = await syntheticVault(page, seed);
    await vault.open('/planning');
    const savings = page.getByRole('navigation', { name: 'Planning tools' }).getByRole('link', { name: 'Savings' });
    const box = await savings.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const motion = await savings.evaluate(el => getComputedStyle(el).transitionDuration);
    expect(motion === '0s' || motion.startsWith('0s')).toBe(true);
    await savings.tap();
    await expect(page).toHaveURL(/\/finance\/planning\/savings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Savings' })).toBeVisible();
    await expect(page.getByText(PROJECTED)).toBeVisible();
    const goal = page.getByRole('textbox', { name: 'Goal name', exact: true });
    await expectInView(page, goal);
    await goal.tap();
    await expect(goal).toBeFocused();
  });
});

test.describe('planning tools at desktop size', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keyboard and night theme return focus to the tool, then to Planning', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'dark'));
    const vault = await syntheticVault(page, seed);
    await vault.open('/planning');
    const retirement = page.getByRole('navigation', { name: 'Planning tools' }).getByRole('link', { name: 'Retirement' });
    await retirement.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/finance\/planning\/retirement$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Retirement' })).toBeFocused();
    await page.getByRole('navigation', { name: 'Finance sections' })
      .getByRole('link', { name: 'Planning', exact: true }).click();
    await expect(page).toHaveURL(/\/finance\/planning$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Planning' })).toBeVisible();
    await expect(page.getByText('Your current facts')).toBeVisible();
  });
});

async function expectInView(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
  minHeight = 44,
): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(viewport!.height);
  expect(box!.height).toBeGreaterThanOrEqual(minHeight);
}

test('direct tools open on their first control in both viewports and themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const vault = await syntheticVault(page, seed);
  await vault.open('/planning');
  const tools = [
    { path: '/planning/retirement', minHeight: 44, focus: true, control: () => page.getByRole('combobox', { name: 'Spending basis', exact: true }) },
    { path: '/planning/simulation', minHeight: 44, focus: true, control: () => page.getByRole('spinbutton', { name: 'Horizon', exact: true }) },
    { path: '/planning/savings', minHeight: 44, focus: true, control: () => page.getByRole('textbox', { name: 'Goal name', exact: true }) },
    { path: '/planning/debt', minHeight: 44, focus: true, control: () => page.getByRole('combobox', { name: /Use a saved liability/ }) },
    { path: '/planning/projection', minHeight: 16, focus: false, control: () => page.locator('.insights-answer h2') },
    { path: '/planning/research', minHeight: 44, focus: true, control: () => page.getByRole('textbox', { name: 'Ticker', exact: true }) },
  ];
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(value => {
      localStorage.setItem('suite-theme', value);
      document.documentElement.setAttribute('data-theme', value);
      document.documentElement.style.colorScheme = value;
    }, theme);
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }] as const) {
      await page.setViewportSize(viewport);
      for (const tool of tools) {
        await vault.open(tool.path);
        await page.evaluate(value => {
          document.documentElement.setAttribute('data-theme', value);
          document.documentElement.style.colorScheme = value;
          window.scrollTo(0, 0);
          document.getElementById('main-content')?.scrollTo(0, 0);
        }, theme);
        const control = tool.control();
        await expectInView(page, control, tool.minHeight);
        if (tool.focus) {
          await control.focus();
          await expect(control).toBeFocused();
        }
      }
    }
  }

  await page.setViewportSize({ width: 320, height: 844 });
  await vault.open('/planning/retirement');
  await page.evaluate(() => window.scrollTo(0, 0));
  const narrow = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(narrow).toBeLessThanOrEqual(321);
  await expectInView(page, page.getByRole('combobox', { name: 'Spending basis', exact: true }));
});

test('a missing spending baseline is not a zero retirement target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const vault = await syntheticVault(page, seed);
  await vault.open('/planning/retirement');
  await expect(page.getByRole('status').filter({ hasText: 'Choose a basis' })).toBeVisible();
  await expect(page.getByText('FI target', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Spending basis', exact: true }).selectOption('manual');
  await expect(page.getByText('FI target', { exact: true })).toHaveCount(0);
  const manual = page.getByLabel('Manual annual spending', { exact: true });
  await manual.fill('0');
  await manual.blur();
  await expect(page.getByText('Using the $0 yearly spending you entered.')).toBeVisible();
  await expect(page.getByText('FI target', { exact: true })).toBeVisible();
  await manual.fill('40000');
  await manual.blur();
  await expect(page.getByLabel('Retirement estimate')).toContainText('1,000,000');
  await expect(page.getByText('you entered')).toHaveCount(0);

  await vault.open('/planning/savings');
  await vault.open('/planning/retirement');
  await expect(page.getByLabel('Manual annual spending', { exact: true })).toHaveValue('40000');
  await expect(page.getByText('FI target', { exact: true })).toBeVisible();
});

test('a stale holding date stays visible beside a known retirement target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const stale = {
    ...seed,
    holdings: [{ ...seed.holdings[0], quote_date: null, position_as_of: null, price_source: 'manual' }],
    fixed_expenses: [{ id: 3, name: 'Rent', annual_amount: 12000, is_active: true }],
  };
  const vault = await syntheticVault(page, stale);
  vault.failQuote('VOO', 503);
  await vault.open('/planning/retirement');
  await expect(page.getByText('1 holding has no price date.')).toBeVisible();
  await expect(page.getByText('FI target', { exact: true })).toBeVisible();
  await expect(page.getByText('Yearly spending is not recorded')).toHaveCount(0);
});
