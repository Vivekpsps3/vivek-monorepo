import { test, expect } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${width} ${theme}: saved-inputs failure stays in its card and keyboard retry clears it`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(choice => localStorage.setItem('suite-theme', choice), theme);
      const vault = await syntheticVault(page, {
        assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 10000, as_of_date: '2026-10-01' }],
      });
      await vault.open('/planning?tool=simulation');
      const card = page.locator('ui-card').filter({
        has: page.getByRole('heading', { name: 'Saved inputs', exact: true }),
      });
      const name = card.getByRole('textbox', { name: 'Name', exact: true });
      const save = card.getByRole('button', { name: 'Save', exact: true });
      await name.fill('Recovery inputs');
      vault.failWriteIn('planning_profiles');
      await name.press('Tab');
      await expect(save).toBeFocused();
      await save.press('Enter');

      const alert = card.getByRole('alert');
      await expect(alert).toContainText("Couldn't save");
      await expect(alert).toContainText('⚠');
      await expect(alert).toHaveAttribute('tabindex', '-1');
      await expect(alert).toBeFocused();
      await expect(name).toHaveValue('Recovery inputs');
      expect(vault.data('planning_profiles')).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('saved-inputs-error.png'), fullPage: true });

      await save.press('Enter');
      await expect(alert).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
      expect(vault.data('planning_profiles')).toHaveLength(1);
      expect(vault.data('planning_profiles')[0].name).toBe('Recovery inputs');
    });
  }
}
