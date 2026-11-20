import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '../../../tests/e2e/fixtures';

// Year and Life atlas. Seeds and the town domain come from the shared web Playwright harness.
// Records are synthetic. The journey keeps one selected day and does not bulk-load images.
const FORBIDDEN = ['death', 'died', 'unlived', 'dead', 'end of life', 'you will die'];

for (const [width, height, theme, mode] of [
  [1280, 800, 'light', 'keyboard'],
  [390, 844, 'dark', 'touch'],
] as const) {
  test.describe(`Pixels atlas at ${width} ${theme}`, () => {
    test.describe.configure({ timeout: 180_000 });
    test.use({
      viewport: { width, height },
      hasTouch: mode === 'touch',
      timezoneId: 'America/Los_Angeles',
    });

    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset?seed=pixels-facts')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
      await page.addInitScript(value => {
        localStorage.setItem('suite-theme', value);
        localStorage.removeItem('pixels.view');
        localStorage.removeItem('pixels.colorBy');
      }, theme);
    });

    test('grid and table agree on the leap day, and coverage stays factual', async ({ page }) => {
      const dayReads: string[] = [];
      const images: string[] = [];
      page.on('request', req => {
        const url = req.url();
        if (url.includes('/api/pixels/day')) dayReads.push(url);
        if (/thumbnail|immich/i.test(url)) images.push(url);
      });

      await page.goto('/pixels?year=2024');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('grid', { name: '2024' })).toBeVisible();
      const summary = page.getByText('How activity colors work', { exact: true });
      await expect(summary).toBeVisible();
      expect((await summary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect(page.locator('app-pixels-year')).toContainText('Recorded since');
      await expect(page.locator('app-pixels-year')).toContainText('lived time with no suite data');
      await expect(page.locator('app-pixels-year')).toContainText('not a predicted end');
      await expectNoEndClaim(page.locator('.pixels'));
      expect(await page.locator('.atlas-note').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
      expect(await fits(page)).toBeTruthy();
      await expectAxe(page);

      await page.goto('/pixels?year=2024&day=2024-02-25');
      await expect(page.locator('[data-sunday-span]')).toHaveAttribute('data-sunday-span', '2024-02-25/2024-03-02');
      await expect(page.locator('[data-iso-span]')).toHaveAttribute('data-iso-span', '2024-02-19/2024-02-25');

      await page.goto('/pixels?year=2024&day=2024-02-26');
      await expect(page.locator('[data-sunday-span]')).toHaveAttribute('data-sunday-span', '2024-02-25/2024-03-02');
      await expect(page.locator('[data-iso-span]')).toHaveAttribute('data-iso-span', '2024-02-26/2024-03-03');

      await page.goto('/pixels?year=2024');
      const leap = page.locator('button[data-date="2024-02-29"]');
      await leap.scrollIntoViewIfNeeded();
      await press(page, leap, mode);
      await expect(page).toHaveURL(/day=2024-02-29/);
      await expect(page.locator('[data-sunday-span]')).toHaveAttribute('data-sunday-span', '2024-02-25/2024-03-02');
      await expect(page.locator('[data-iso-span]')).toHaveAttribute('data-iso-span', '2024-02-26/2024-03-03');
      const preview = page.locator('[data-memory-preview]');
      await expect(preview).toHaveAttribute('data-thumbnails', 'no');
      await expect(preview.locator('img')).toHaveCount(0);
      await expect(preview).toContainText('Read synthetic');
      await expect(preview).toContainText('Leap harbor');
      const vector = await page.locator('.day-detail').getAttribute('data-score-vector');
      expect(vector).toContain('"date":"2024-02-29"');

      await activateCovered(page, page.getByRole('button', { name: 'View as table' }), mode);
      await expect(page.getByRole('table', { name: 'Year in a table' })).toBeVisible();
      await expect(page).toHaveURL(/day=2024-02-29/);
      await expect(page.locator('[data-sunday-span]')).toHaveAttribute('data-sunday-span', '2024-02-25/2024-03-02');
      await expect(page.locator('tr[data-date="2024-02-29"]')).toBeVisible();
      await activateCovered(page, page.getByRole('button', { name: 'View as grid' }), mode);
      await expect(page.locator('button[data-date="2024-02-29"]')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.day-detail')).toHaveAttribute('data-score-vector', vector ?? '');

      if (mode === 'keyboard') {
        await page.getByRole('radio', { name: 'Activity' }).focus();
        await page.keyboard.press('ArrowRight');
      } else {
        await activateCovered(page, page.getByRole('radio', { name: 'By app' }), mode);
      }
      await expect(page.getByRole('radio', { name: 'By app' })).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.day-detail')).toHaveAttribute('data-score-vector', vector ?? '');
      if (mode === 'keyboard') await page.keyboard.press('ArrowLeft');
      else await activateCovered(page, page.getByRole('radio', { name: 'Activity' }), mode);
      await expect(page.getByRole('radio', { name: 'Activity' })).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.day-detail')).toHaveAttribute('data-score-vector', vector ?? '');

      const lifeLink = page.getByRole('link', { name: 'Life', exact: true });
      await expect(lifeLink).toHaveAttribute('href', /\/pixels\/life\?focus=2024-02-29$/);
      await activateCovered(page, lifeLink, mode);
      await expect(page.locator('[data-life-span]')).toHaveAttribute('data-life-span', '2024-02-29/2024-03-06');
      await expect(page.locator('app-life-week [data-sunday-span]')).toHaveAttribute('data-sunday-span', '2024-02-25/2024-03-02');
      await expect(page.locator('app-life-week [data-iso-span]')).toHaveAttribute('data-iso-span', '2024-02-26/2024-03-03');
      await expect(page.locator('[data-preview-date]')).toHaveAttribute('data-preview-date', '2024-02-29');
      const lifePreview = page.locator('app-life-week [data-memory-preview]');
      await expect(lifePreview).toHaveAttribute('data-thumbnails', 'no');
      await expect(lifePreview.locator('img')).toHaveCount(0);
      await expect(lifePreview).toContainText('Photos are not connected.');
      await expect(lifePreview).toContainText('Notes are not connected.');
      await expect(page.locator('app-pixels-life')).toContainText('not a lifespan');
      await expect(page.locator('app-pixels-life')).toContainText('Recorded since');
      await expect(page.locator('app-pixels-life')).toContainText('Ahead of today');
      await expect(page.locator('app-pixels-life')).toContainText('Age is hidden');
      const lifeText = await page.locator('app-pixels-life').innerText();
      expect(lifeText).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(lifeText).not.toMatch(/Age \d/);
      expect(lifeText).not.toContain('Other trip');
      expect(lifeText).not.toContain('Other habit');
      expect(lifeText).not.toContain('Foreign concept');
      expect(lifeText).not.toContain('4,680');
      expect(lifeText).not.toContain('4680');
      assertNoEndClaimText(lifeText);
      expect(await fits(page)).toBeTruthy();
      const lifeSummary = page.locator('app-pixels-life').getByText('How activity colors work', { exact: true });
      expect((await lifeSummary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expectAxe(page);

      await press(page, page.getByRole('button', { name: 'View as table' }), mode);
      await expect(page.getByRole('table')).toBeVisible();
      await expect(page).toHaveURL(/span=2024-02-29/);
      await expect(page.locator('[data-life-span]')).toHaveAttribute('data-life-span', '2024-02-29/2024-03-06');
      await press(page, page.getByRole('button', { name: 'View as poster' }), mode);
      await expect(page.locator('app-pixels-life svg')).toBeVisible();
      await expect(page).toHaveURL(/span=2024-02-29/);

      const yearLink = page.getByRole('link', { name: 'Year', exact: true });
      await expect(yearLink).toHaveAttribute('href', /day=2024-02-29/);
      await press(page, yearLink, mode);
      await expect(page).toHaveURL(/\/pixels\?year=2024&day=2024-02-29/);
      await expect(page.locator('[data-iso-span]')).toHaveAttribute('data-iso-span', '2024-02-26/2024-03-03');
      await page.goBack();
      await expect(page.locator('[data-life-span]')).toHaveAttribute('data-life-span', '2024-02-29/2024-03-06');

      await press(page, page.getByRole('link', { name: 'Open Thu, Feb 29, 2024' }), mode);
      await expect(page).toHaveURL(url => url.pathname === '/pixels/day'
        && url.searchParams.get('date') === '2024-02-29'
        && url.searchParams.get('from') === 'life'
        && url.searchParams.get('span') === '2024-02-29');
      await expect(page.locator('.day-detail')).toHaveAttribute('data-origin-span', '2024-02-29');
      await expect(page.locator('[data-sunday-span]')).toHaveAttribute('data-sunday-span', '2024-02-25/2024-03-02');
      const dayText = await page.locator('app-day-detail').innerText();
      expect(dayText).not.toContain('Other trip');
      expect(dayText).not.toContain('Foreign concept');
      assertNoEndClaimText(dayText);
      await press(page, page.getByRole('link', { name: /Back to week of/ }), mode);
      await expect(page).toHaveURL(url => url.pathname === '/pixels/life' && url.searchParams.get('span') === '2024-02-29');
      await page.reload();
      await expect(page.locator('[data-life-span]')).toHaveAttribute('data-life-span', '2024-02-29/2024-03-06');
      await expect(page.locator('[data-preview-date]')).toHaveAttribute('data-preview-date', '2024-02-29');
      expect(await fits(page)).toBeTruthy();

      await page.goto('/pixels?year=2026&day=2026-12-31');
      await expect(page.locator('[data-memory-preview]')).toContainText('Ahead of today');
      await expect(page.locator('[data-memory-preview]')).toContainText('still ahead');
      await expect(page.locator('app-pixels-year')).toContainText('not a predicted end');
      await expect(page.locator('[data-memory-preview] img')).toHaveCount(0);
      await expectNoEndClaim(page.locator('.pixels'));
      expect(await fits(page)).toBeTruthy();

      expect(images).toEqual([]);
      expect(dayReads.length).toBeGreaterThan(0);
      expect(dayReads.length).toBeLessThanOrEqual(12);
    });
  });
}

async function press(page: Page, target: Locator, mode: 'keyboard' | 'touch'): Promise<void> {
  if (mode === 'touch') await target.tap();
  else {
    await target.focus();
    await page.keyboard.press('Enter');
  }
}

/** The phone day sheet covers the year toolbar, so a tap lands on the sheet. */
async function activateCovered(page: Page, target: Locator, mode: 'keyboard' | 'touch'): Promise<void> {
  if (mode === 'keyboard') {
    await target.focus();
    await page.keyboard.press('Enter');
    return;
  }
  await target.evaluate(element => {
    if (element instanceof HTMLElement) element.click();
  });
}

async function fits(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

async function expectAxe(page: Page): Promise<void> {
  const scan = await new AxeBuilder({ page }).include('.pixels').analyze();
  expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
}

async function expectNoEndClaim(root: Locator): Promise<void> {
  assertNoEndClaimText(await root.innerText());
}

function assertNoEndClaimText(text: string): void {
  const lower = text.toLowerCase();
  for (const word of FORBIDDEN) expect(lower).not.toContain(word);
}
