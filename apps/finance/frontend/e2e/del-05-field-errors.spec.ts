import { chooseColorTheme } from '../../../../tests/e2e/user-menu.mjs';
import { expect, type Locator, type Page, test } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

test('bill and subscription editors share field errors across viewport, theme, and zoom', async ({ page }) => {
  const vault = await syntheticVault(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await vault.open('/recurring?t=spend');

  const bill = await openEditor(page, 'Add bill');
  await bill.getByRole('button', { name: 'Save', exact: true }).click();
  const billSummary = bill.locator('[data-error-summary]');
  await expect(billSummary).toBeFocused();
  const billName = bill.getByLabel('Name', { exact: true });
  await expect(billName).toHaveAttribute('aria-invalid', 'true');
  await expect(billName).toHaveAttribute('data-field-invalid', 'true');
  const billDescribed = await describedError(billName);
  expect(billDescribed).toContain('Enter a name.');
  expect(billDescribed).toContain('⚠');
  await billSummary.getByRole('button', { name: 'Name', exact: true }).click();
  await expect(billName).toBeFocused();
  await billName.fill('Rent');
  await billName.blur();
  await expect(billName).not.toHaveAttribute('aria-invalid', 'true');
  await expect(bill.getByLabel('Amount', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await bill.getByLabel('Amount', { exact: true }).fill('12.50');
  vault.failNextWrites(1);
  await bill.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bill).toBeVisible();
  await expect(bill.getByRole('alert').filter({ hasText: "Couldn't save" })).toBeFocused();
  await expect(billName).toHaveValue('Rent');
  await expect(bill.getByLabel('Amount', { exact: true })).toHaveValue('12.50');
  await page.keyboard.press('Escape');
  await expect(bill).toBeHidden();
  expect(vault.data('fixed_expenses')).toHaveLength(0);

  const subscription = await openEditor(page, 'Add subscription');
  await subscription.getByLabel('Name', { exact: true }).fill('Stream');
  await subscription.getByLabel('Amount', { exact: true }).fill('-40');
  await subscription.getByRole('button', { name: 'Save', exact: true }).click();
  const subscriptionSummary = subscription.locator('[data-error-summary]');
  await expect(subscriptionSummary).toBeFocused();
  const amount = subscription.getByLabel('Amount', { exact: true });
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  const amountError = await describedError(amount);
  expect(amountError).toContain('Enter an amount above $0.');
  await expect(subscription.getByLabel('Name', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
  await subscriptionSummary.getByRole('button', { name: 'Amount', exact: true }).click();
  await expect(amount).toBeFocused();
  await expectDangerBorder(amount);
  await amount.hover();
  await expectDangerBorder(amount);
  await amount.fill('8');
  await amount.blur();
  await expect(amount).not.toHaveAttribute('aria-invalid', 'true');
  await expect(subscription.getByLabel('Name', { exact: true })).toHaveValue('Stream');

  await page.setViewportSize({ width: 390, height: 844 });
  await assertActionUsable(page, subscription);
  await subscription.evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
  await assertActionUsable(page, subscription);

  await page.setViewportSize({ width: 1280, height: 800 });
  await chooseColorTheme(page, 'dark');
  await vault.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const darkSubscription = await openEditor(page, 'Add subscription');
  await darkSubscription.getByLabel('Amount', { exact: true }).fill('-1');
  await darkSubscription.getByRole('button', { name: 'Save', exact: true }).click();
  const darkAmount = darkSubscription.getByLabel('Amount', { exact: true });
  await expect(darkAmount).toHaveAttribute('aria-invalid', 'true');
  await expectDangerBorder(darkAmount);
  await darkAmount.hover();
  await expectDangerBorder(darkAmount);
  await assertActionUsable(page, darkSubscription);

  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await assertActionUsable(page, darkSubscription);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(overflow).toBe(true);
  await page.keyboard.press('Escape');
  await expect(darkSubscription).toBeHidden();
  expect(vault.data('subscriptions')).toHaveLength(0);
});

async function openEditor(page: Page, name: 'Add bill' | 'Add subscription'): Promise<Locator> {
  await page.getByRole('button', { name, exact: true }).click();
  const title = name === 'Add bill' ? 'Add bill' : 'Add subscription';
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function describedError(control: Locator): Promise<string> {
  return control.evaluate(element => {
    const id = element.getAttribute('aria-describedby')?.split(' ').at(-1);
    return (id ? document.getElementById(id)?.textContent : '') ?? '';
  });
}

async function expectDangerBorder(control: Locator): Promise<void> {
  const colors = await control.evaluate(element => {
    const probe = document.createElement('div');
    probe.style.borderColor = 'var(--danger)';
    document.body.appendChild(probe);
    const danger = getComputedStyle(probe).borderColor;
    probe.remove();
    return { border: getComputedStyle(element).borderColor, danger };
  });
  expect(colors.border).toBe(colors.danger);
}

async function assertActionUsable(page: Page, dialog: Locator): Promise<void> {
  const save = dialog.getByRole('button', { name: 'Save', exact: true });
  await save.scrollIntoViewIfNeeded();
  const box = await save.boundingBox();
  expect(box).not.toBeNull();
  const metrics = await save.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      width: rect.width,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      visibility: style.visibility,
      pointerEvents: style.pointerEvents,
    };
  });
  expect(metrics.visibility).toBe('visible');
  expect(metrics.pointerEvents).not.toBe('none');
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.width).toBeGreaterThanOrEqual(44);
  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  await expect(page.locator('.toast')).toHaveCount(0);
}
