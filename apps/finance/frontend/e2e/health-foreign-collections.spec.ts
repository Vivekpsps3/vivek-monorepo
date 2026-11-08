import { test, expect } from './frozen-clock';
import { moneyText } from './money-text';
import { syntheticVault } from './synthetic-vault';

/**
 * AC-H3: health ciphertext in the vault is foreign to Finance. The Finance
 * pages load exactly as if it were not there, and the health rows are
 * never read into a Finance bag, rewritten or deleted by Finance.
 */
test('Finance loads unchanged with health collections present', async ({ page }) => {
  const vault = await syntheticVault(page, {
    assets: [{ id: 1, name: 'Checking', category: 'cash', current_value: 1000, as_of_date: '2026-10-01' }],
    health_stats: [
      { id: 1, v: 1, kind: 'weight', measured_on: '2026-10-28', logged_on: '2026-10-28', kg: 80 },
    ],
    health_prs: [
      { id: 2, v: 1, kind: 'lift', measured_on: '2026-10-28', logged_on: '2026-10-28', exercise: 'Squat', kg: 100, reps: 5 },
    ],
  });

  await vault.open('/');
  await expect(
    page.locator('.home-tile').filter({ hasText: 'Net worth' }),
  ).toContainText(moneyText('$1,000.00'));

  await vault.open('/have');
  await expect(page.locator('app-have-hub')).toBeVisible();

  // The health rows survive untouched, payload for payload.
  expect(vault.data('health_stats')).toHaveLength(1);
  expect(vault.data('health_stats')[0]).toMatchObject({ kind: 'weight', kg: 80 });
  expect(vault.data('health_prs')).toHaveLength(1);
  expect(vault.data('health_prs')[0]).toMatchObject({ kind: 'lift', exercise: 'Squat', kg: 100 });
  const healthWrites = vault.mutations.filter(mutation =>
    JSON.stringify(mutation.body).includes('health_'),
  );
  expect(healthWrites).toEqual([]);
});
