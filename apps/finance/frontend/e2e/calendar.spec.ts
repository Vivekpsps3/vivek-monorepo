import { expect, test } from './frozen-clock';
import { syntheticVault } from './synthetic-vault';
import { moneyText } from './money-text';

// Suite UX v2 F13: the calendar leads with its grid, day cells carry one
// signed net and a scheduled dot under exact spoken labels, and the day
// detail is a panel that takes focus below desktop widths.
const calendarSeed = {
  subscriptions: [
    // $40, not $45: a bill within $1 of the day's $45.67 purchase would be
    // matched as already posted and never show as scheduled.
    { name: 'Streaming', amount: 40, category: 'Entertainment', frequency: 'monthly', next_bill_date: '2026-10-20', is_active: true },
  ],
  job_incomes: [
    {
      employer: 'Northwind', pay_frequency: 'annual', base_pay: 60000,
      payday_frequency: 'monthly', first_pay_date: '2026-10-01',
      is_active: true, effective_date: '2026-01-01',
    },
    // No pay dates: its pay lands as an undated estimate for the note.
    { employer: 'Side gig', pay_frequency: 'annual', base_pay: 14400, is_active: true, effective_date: '2026-01-01' },
  ],
  transactions: [
    { date: '2026-10-20', type: 'expense', category: 'Groceries', description: 'Corner market', merchant: 'Corner market', amount: 45.67, kind: 'purchase' },
    { date: '2026-10-05', type: 'expense', category: 'Shopping', description: 'Notebooks', merchant: 'Paper shop', amount: 14, kind: 'purchase' },
  ],
};

const combos = [
  { name: 'mobile-light', width: 390, height: 844, theme: 'light' },
  { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' },
  { name: 'desktop-light', width: 1280, height: 900, theme: 'light' },
  { name: 'desktop-dark', width: 1280, height: 900, theme: 'dark' },
] as const;

for (const combo of combos) {
  test(`calendar grid and day detail (${combo.name})`, async ({ page }) => {
    await page.setViewportSize({ width: combo.width, height: combo.height });
    await page.addInitScript((theme) => {
      localStorage.setItem('suite-theme', theme);
    }, combo.theme);
    const vault = await syntheticVault(page, calendarSeed);
    await vault.open('/finance/spending?t=calendar');

    const grid = page.locator('.calendar-grid');
    const categoryCard = page.locator('.month-charts .ui-card').first();
    await expect(grid).toBeVisible();
    const gridBox = await grid.boundingBox();
    const chartsBox = await categoryCard.boundingBox();
    expect(gridBox).not.toBeNull();
    expect(chartsBox).not.toBeNull();
    expect(gridBox!.y).toBeLessThan(chartsBox!.y);

    const heights = await page.locator('.day-btn').evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).getBoundingClientRect().height),
    );
    expect(heights.length).toBeGreaterThan(0);
    for (const height of heights) {
      expect(height).toBeLessThanOrEqual(combo.width <= 640 ? 52 : 72);
      if (combo.width <= 640) expect(height).toBeGreaterThanOrEqual(44);
    }

    const oct20 = page.getByRole('gridcell', { name: 'Tuesday, Oct 20: spent $45.67, 1 scheduled bill' });
    await expect(oct20).toContainText(moneyText('−$46'));
    await expect(oct20.locator('.cal-scheduled-dot')).toHaveCount(1);

    const detail = page.locator('.day-detail');
    await oct20.click();
    if (combo.width >= 1024) {
      const detailBox = await detail.boundingBox();
      expect(detailBox).not.toBeNull();
      expect(detailBox!.x).toBeGreaterThan(gridBox!.x + gridBox!.width);
      await expect(page.locator('#day-detail-heading')).toHaveText('Tuesday, Oct 20');
      await expect(oct20).toBeFocused();
    } else {
      await expect(page.locator('#day-detail-heading')).toBeFocused();
      await expect(page.locator('#day-detail-heading')).toHaveText('Tuesday, Oct 20');
      // Selecting a day scrolls the detail into view, so measure both boxes after that.
      const detailBox = await detail.boundingBox();
      const gridAfterSelect = await grid.boundingBox();
      expect(detailBox).not.toBeNull();
      expect(gridAfterSelect).not.toBeNull();
      expect(detailBox!.y).toBeGreaterThan(gridAfterSelect!.y + gridAfterSelect!.height - 1);
    }
    await expect(detail).toContainText('Streaming');
    await expect(detail).toContainText('Not posted');
    await page.screenshot({ path: `calendar-${combo.width}-${combo.theme}.png` });

    const oct2 = page.getByRole('gridcell', { name: 'Friday, Oct 2: no activity' });
    await oct2.click();
    await expect(detail).toContainText('Nothing on Oct 2.');
    await detail.getByRole('link', { name: 'Add transaction on Oct 2' }).click();
    await expect(page).toHaveURL(/\/finance\/spending/);
    await expect(page).toHaveURL(/date=2026-10-02/);
    await expect(page).toHaveURL(/add=1/);

    await vault.open('/finance/spending?t=calendar');
    const note = page.locator('.calendar-undated-note');
    await expect(note).toContainText(/of estimated pay has no date, so it isn't on the calendar\./);
    const noteBox = await note.boundingBox();
    const gridBoxAfter = await grid.boundingBox();
    expect(noteBox).not.toBeNull();
    expect(gridBoxAfter).not.toBeNull();
    expect(noteBox!.y).toBeGreaterThan(gridBoxAfter!.y + gridBoxAfter!.height - 1);
  });
}

test('calendar keyboard: arrows move by a day and Tab leaves the grid in one step', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const vault = await syntheticVault(page, calendarSeed);
  await vault.open('/finance/spending?t=calendar');
  // The category chart paints after the first view, and that refresh must not
  // be what the keyboard test races. Wait for it, then use the one tab stop.
  await expect(page.locator('.month-charts canvas').first()).toBeVisible();
  const today = page.locator('.day.today');
  await expect(async () => {
    await today.focus();
    await expect(today).toBeFocused({ timeout: 250 });
  }).toPass();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('gridcell', { name: /Friday, Oct 16/ })).toBeFocused();
  await page.keyboard.press('Tab');
  const focusedDate = await page.evaluate(() => document.activeElement?.getAttribute('data-date'));
  expect(focusedDate).toBeNull();
});
