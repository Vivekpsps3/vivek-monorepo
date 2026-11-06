import { expect, test } from '@playwright/test';

// TH1 owns the town server, clock and seeds. Enable with apps/web/e2e/playwright.config.ts.
test.describe('Town dialogs', () => {
  test.fixme(true, 'Waiting for TH1 Town harness and fixtures to merge');
  test.use({ timezoneId: 'America/Los_Angeles' });
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.goto('/town');
  });

  test('1: a suggestion chip founds the town without a toast', async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Found Terraria-on-Sea' })).toBeVisible();
    await page.getByRole('button', { name: 'Read 20 pages' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('img[src="/town/forge-1.svg"], img[src="/town/forge-2.svg"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark Read 20 pages done for today' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /reached Lv|Level up!/ })).toHaveCount(0);
  });

  test('4: history marks yesterday for Walk only', async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.reload();
    await page.getByRole('button', { name: 'History' }).click();
    const dialog = page.getByRole('dialog');
    const read = dialog.locator('section', { has: page.getByRole('heading', { name: 'Read 20 pages' }) });
    const walk = dialog.locator('section', { has: page.getByRole('heading', { name: 'Walk 30 minutes' }) });
    await expect(read.getByRole('button', { name: 'Mark yesterday' })).toHaveCount(0);
    await walk.getByRole('button', { name: 'Mark yesterday' }).click();
    await expect(page.getByText('3/3 this week')).toBeVisible();
  });

  test('6: rename ellipsizes, archive keeps town XP, and history lists it', async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.reload();
    const before = await page.locator('header p').textContent();
    await page.getByRole('button', { name: '+ New habit' }).click();
    const name = 'A'.repeat(40);
    await page.locator('#habit-name').fill(name);
    await page.getByRole('button', { name: 'Save' }).click();
    const tile = page.getByRole('button', { name: new RegExp(name) });
    await expect(tile).toBeVisible();
    expect(await tile.locator('.name').evaluate(node => getComputedStyle(node).textOverflow)).toBe('ellipsis');
    await tile.click();
    await page.getByRole('button', { name: 'Archive habit' }).click();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.locator('header p')).toHaveText(before ?? '');
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('dialog')).toContainText(name);
    await expect(page.getByText(/Archived /)).toBeVisible();
  });

  test('8: a cadence change names next Monday and keeps this week target', async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.reload();
    await page.getByRole('button', { name: /Walk 30 minutes/ }).first().click();
    await page.locator('#habit-cadence').selectOption('4');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText(/\/3 this week/)).toBeVisible();
    await expect(page.getByText(/\/4 this week/)).toHaveCount(0);
    await page.getByRole('button', { name: /Walk 30 minutes/ }).first().click();
    await expect(page.getByText('Changes to 4× a week from Mon 2 Nov')).toBeVisible();
  });
});
