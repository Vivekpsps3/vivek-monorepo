import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

test.use({ hasTouch: true });

for (const width of [390, 1280]) for (const theme of ['light', 'dark']) {
  test(`crafted Finance controls correct and save at ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    const vault = await syntheticVault(page);
    await vault.open('/bills');
    const add = page.getByRole('button', { name: 'Add bill', exact: true });
    for (const motion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion: motion });
      await add.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Add bill', exact: true });
      const name = dialog.getByLabel('Name', { exact: true });
      await expect(name).toBeFocused();
      if (motion === 'reduce') await expect(dialog).toHaveCSS('animation-name', 'none');
      else await expect(dialog).toHaveCSS('animation-name', /ui-dialog-in$/);
      const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
      await cancel.focus();
      await page.keyboard.press('Tab');
      await expect(name).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(cancel).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(add).toBeFocused();
    }
    await add.focus();
    await add.tap();
    const dialog = page.getByRole('dialog', { name: 'Add bill', exact: true });
    const save = dialog.getByRole('button', { name: 'Save', exact: true });
    await save.focus();
    await page.keyboard.press('Enter');
    // Finance retains its existing multi-error summary and direct field links.
    const summary = dialog.locator('[data-error-summary]');
    await expect(summary).toBeFocused();
    await summary.getByRole('button', { name: 'Name', exact: true }).focus();
    await page.keyboard.press('Enter');
    const name = dialog.getByLabel('Name', { exact: true });
    await expect(name).toBeFocused();
    const errorId = (await name.getAttribute('aria-describedby'))!.split(/\s+/).find(id => id.endsWith('-error'));
    await expect(page.locator(`[id="${errorId}"]`)).toContainText('Enter a name.');
    await info.attach('linked-error', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await name.fill('Harbor rent');
    await dialog.getByLabel('Amount', { exact: true }).fill('12.50');
    for (const control of [name, save, dialog.getByLabel('Frequency', { exact: true })]) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    vault.failNextWrites();
    await save.tap();
    await expect(dialog.getByRole('alert').filter({ hasText: "Couldn't save" })).toBeFocused();
    await expect(name).toHaveValue('Harbor rent');
    await expect(dialog.getByLabel('Amount', { exact: true })).toHaveValue('12.50');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await info.attach('recoverable-save-error', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await save.tap();
    await expect(dialog).toBeHidden();
    await expect(add).toBeFocused();
    expect(vault.data('fixed_expenses').map(row => [row.name, row.amount])).toEqual([['Harbor rent', 12.5]]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const theme of ['light', 'dark']) {
  test(`selected growth preset keeps its label and target on hover in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    const vault = await syntheticVault(page, { holdings: [{ id: 1, symbol: 'VOO', shares: 2, current_price: 100, purchase_price: 80, purchase_date: '2026-10-01', price_source: 'manual' }] });
    await vault.open('/planning/projection');
    const preset = page.getByRole('button', { name: '5% annual growth preset', exact: true });
    await preset.focus();
    await page.keyboard.press('Enter');
    await expect(preset).toHaveAttribute('aria-pressed', 'true');
    await preset.hover();
    const box = await preset.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('a held bill save cannot restore its private editor after automatic lock', async ({ page }) => {
  const vault = await syntheticVault(page);
  await vault.open('/bills');
  await page.getByRole('button', { name: 'Add bill', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add bill', exact: true });
  await dialog.getByLabel('Name', { exact: true }).fill('PRIVATE_HELD_BILL');
  await dialog.getByLabel('Amount', { exact: true }).fill('12.50');
  vault.holdNextUpserts();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await vault.waitForHeldUpserts();
  await page.clock.fastForward('16:00');
  await expect(page).toHaveURL(/\/vault\/unlock/);
  vault.releaseHeldUpserts();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('PRIVATE_HELD_BILL')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.getByLabel('Vault passphrase', { exact: true }).fill('Synthetic finance test passphrase');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/bills$/);
  await vault.open('/bills');
  await page.getByRole('button', { name: 'Add bill', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).toHaveValue('');
});
