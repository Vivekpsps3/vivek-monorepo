import AxeBuilder from '@axe-core/playwright';
import type { Locator } from '@playwright/test';
import { expect, test } from '../../../tests/e2e/fixtures';

// Day panel, phone sheet, and the persisted By app choice. The year page
// owns ?year/?day and passes phone from the viewport.
test.describe('Pixels day detail', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels-facts')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });

  test('390 opens the Portland day in a bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pixels?year=2026&day=2026-08-15');
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Portland, day 2 of 4');
    await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.locator('[data-date="2026-08-15"]')).toBeFocused();
  });

  test('1280 shows the same day in a side panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pixels?year=2026&day=2026-08-15');
    const panel = page.locator('app-day-detail');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Portland, day 2 of 4');
    await expect(panel).toContainText('Sat, Aug 15, 2026');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.locator('[data-date="2026-08-15"]')).toBeFocused();
  });

  test('By app persists across a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/pixels?year=2026');
    const colour = page.getByRole('radiogroup', { name: 'Colour' });
    await colour.getByRole('radio', { name: 'By app' }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('pixels.colorBy'))).toBe('app');
    await page.reload();
    await expect(colour.getByRole('radio', { name: 'By app' })).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => localStorage.getItem('pixels.colorBy'))).toBe('app');
  });

  for (const [width, height] of [[390, 844], [1280, 800]] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`axe with the day open at ${width} [${theme}]`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
        await page.goto('/pixels?year=2026&day=2026-08-15');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('app-day-detail')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Synthetic concept' })).toBeVisible();
        const scan = await new AxeBuilder({ page }).analyze();
        expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      });
    }
  }

  test('1280 light keyboard archives a learning annotation and keeps the score', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), 'light');
    await page.goto('/pixels?year=2026&day=2026-08-15');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const panel = page.locator('app-day-detail');
    await expect(panel.getByRole('heading', { name: 'Synthetic concept' })).toBeVisible();
    const vector = AUG_15_VECTOR;
    await expect(panel.locator('.day-detail')).toHaveAttribute('data-score-vector', vector);
    await expect(panel.locator('[data-difference="concept-not-score"]')).toContainText('does not change the Pixels score');
    await expect(panel.locator('[data-annotation-id]')).toContainText('does not change the Pixels score');
    const text = await panel.innerText();
    expect(text).not.toContain('Foreign concept');
    expect(text).not.toContain('Other habit');
    expect(text).not.toContain('Other trip');
    expect(text).not.toContain('synthetic private note');
    expect(text).not.toContain('1990-05-04');
    await expect(panel.getByRole('link', { name: 'Open Town check-in · Read synthetic' })).toHaveAttribute('href', '/town');
    await expect(panel.getByRole('link', { name: 'Open Trip span · Portland' })).toHaveAttribute('href', /\/travel\/trips\/\d+$/);
    const factIds = await factIdsOf(panel);
    expect(factIds.length).toBeGreaterThan(1);
    await page.reload();
    await expect(panel.getByRole('heading', { name: 'Synthetic concept' })).toBeVisible();
    expect(await factIdsOf(panel)).toEqual(factIds);
    await expect(panel.locator('.day-detail')).toHaveAttribute('data-score-vector', vector);
    const archive = panel.getByRole('button', { name: 'Archive Synthetic concept' });
    const box = await archive.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await archive.focus();
    await page.keyboard.press('Enter');
    await expect(panel.getByRole('heading', { name: 'Synthetic concept' })).toHaveCount(0);
    await expect(page.locator('#day-learning-heading')).toBeFocused();
    expect(await factIdsOf(panel)).toEqual(factIds);
    await expect(panel.locator('.day-detail')).toHaveAttribute('data-score-vector', vector);
    await page.reload();
    await expect(panel.getByRole('heading', { name: 'Synthetic concept' })).toHaveCount(0);
    expect(await factIdsOf(panel)).toEqual(factIds);
    await expect(panel.locator('.day-detail')).toHaveAttribute('data-score-vector', vector);
  });

  test('a held day response does not publish on the day opened later', async ({ page }) => {
    let release = (): void => undefined;
    await page.route('**/api/pixels/day**', async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('date') === '2026-08-15') {
        await new Promise<void>(resolve => {
          release = resolve;
        });
      }
      await route.continue().catch(() => undefined);
    });
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/pixels?year=2026&day=2026-08-15');
      await expect(page.getByRole('heading', { name: 'Sat, Aug 15, 2026' })).toBeVisible();
      await page.locator('[data-date="2026-08-14"]').click();
      await expect(page).toHaveURL(/day=2026-08-14/);
      await expect(page.locator('[data-fact-date="2026-08-14"]')).toHaveCount(1);
      await expect(page.locator('.day-detail')).toHaveAttribute('data-score-vector', AUG_14_VECTOR);
      await expect(page.getByRole('heading', { name: 'Synthetic concept' })).toHaveCount(0);
    } finally {
      release();
    }
    await expect(page.locator('[data-fact-date="2026-08-15"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Synthetic concept' })).toHaveCount(0);
    await expect(page.locator('[data-fact-date="2026-08-14"]')).toHaveCount(1);
    await expect(page.getByText('Other trip')).toHaveCount(0);
    await expect(page.locator('.day-detail')).toHaveAttribute('data-score-vector', AUG_14_VECTOR);
  });
});

test.describe('Pixels day detail on a phone', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true, viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=pixels-facts')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  });

  test('390 night touch redates an annotation and keeps the score', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), 'dark');
    await page.goto('/pixels?year=2026&day=2026-08-15');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Synthetic concept' })).toBeVisible();
    await expect(sheet).toHaveAttribute('data-score-vector', AUG_15_VECTOR);
    const motion = await sheet.evaluate(node => {
      const style = getComputedStyle(node);
      return { animation: style.animationDuration, transition: style.transitionDuration };
    });
    expect(motion.transition).toBe('0s');
    expect(Number.parseFloat(motion.animation)).toBeLessThanOrEqual(0.01);
    const redate = sheet.getByRole('button', { name: 'Redate Synthetic concept' });
    const box = await redate.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await sheet.getByLabel('New understood date').fill('2026-08-16');
    await redate.tap();
    await expect(sheet.getByRole('heading', { name: 'Synthetic concept' })).toHaveCount(0);
    await expect(page.locator('#day-learning-heading')).toBeFocused();
    await expect(sheet).toHaveAttribute('data-score-vector', AUG_15_VECTOR);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-date="2026-08-15"]')).toBeFocused();
    await page.locator('[data-date="2026-08-16"]').tap();
    await expect(page.getByRole('heading', { name: 'Synthetic concept' })).toBeVisible();
    await expect(page.locator('.day-detail')).toHaveAttribute('data-score-vector', AUG_16_VECTOR);
    await expect(page.getByText('synthetic private note')).toHaveCount(0);
    await expect(page.getByText('Foreign concept')).toHaveCount(0);
  });
});

const AUG_15_VECTOR = '{"date":"2026-08-15","town":1,"media":0,"trip":1,"fin":null,"score":3,"level":2,"dominant":"travel"}';
const AUG_14_VECTOR = '{"date":"2026-08-14","town":0,"media":0,"trip":1,"fin":null,"score":2,"level":1,"dominant":"travel"}';
const AUG_16_VECTOR = '{"date":"2026-08-16","town":0,"media":0,"trip":1,"fin":null,"score":2,"level":1,"dominant":"travel"}';

function factIdsOf(panel: Locator): Promise<string[]> {
  return panel.locator('[data-fact-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-fact-id') ?? '').sort());
}
