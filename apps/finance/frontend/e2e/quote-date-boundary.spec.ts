import { test, expect } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';

/**
 * CI3: the synthetic quote mock must be driven by the page clock on the
 * Los Angeles trading calendar. Both instants below are 17:30 in
 * America/Los_Angeles, when UTC is already the next day. A mock reading the
 * Node-side noon clock (2026-10-15) or the UTC calendar day would stamp a
 * different quote_date, so these assertions fail if the mock ignores the
 * page clock.
 */

const seed = {
  holdings: [{ id: 12, symbol: 'VOO', shares: 1, purchase_price: 80, purchase_date: '2026-01-01', current_price: 100, price_source: 'manual' }],
};

test.describe('Monday 17:30 Los Angeles (Tuesday 00:30 UTC)', () => {
  test.use({ frozenInstant: Date.parse('2026-10-12T17:30:00-07:00') });

  test('quote_date is Friday, the last completed Los Angeles trading day', async ({ page }) => {
    const vault = await syntheticVault(page, seed);
    await vault.open('/');
    await expect.poll(() => vault.data('holdings')[0]?.quote_date).toBe('2026-10-09');
    expect(vault.data('holdings')[0].quote_date).not.toBe('2026-10-13');
  });
});

test.describe('Thursday 17:30 Los Angeles (Friday 00:30 UTC)', () => {
  test.use({ frozenInstant: Date.parse('2026-10-15T17:30:00-07:00') });

  test('quote_date stays on the Los Angeles day instead of rolling to the UTC day', async ({ page }) => {
    const vault = await syntheticVault(page, seed);
    await vault.open('/');
    await expect.poll(() => vault.data('holdings')[0]?.quote_date).toBe('2026-10-15');
    expect(vault.data('holdings')[0].quote_date).not.toBe('2026-10-16');
  });
});
