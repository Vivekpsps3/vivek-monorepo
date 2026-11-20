import AxeBuilder from '@axe-core/playwright';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from '../../../tests/e2e/synthetic-vault-harness';
import { expect, test } from '../../../tests/e2e/fixtures';

const LEAP = '/pixels/day?date=2024-02-29&from=year&year=2024';
const LIFE = '/pixels/life?span=2024-02-29';

function dayNext(url: URL): boolean {
  if (url.pathname !== '/finance/vault/unlock') return false;
  const next = url.searchParams.get('next') ?? '';
  const target = new URL(next, url.origin);
  return target.pathname === '/pixels/day'
    && target.searchParams.get('date') === '2024-02-29'
    && target.searchParams.get('from') === 'year'
    && target.searchParams.get('year') === '2024';
}

for (const [width, height, theme] of [[1280, 800, 'light'], [390, 844, 'dark']] as const) {
  test.describe(`named leap day at ${width} ${theme}`, () => {
    test.describe.configure({ timeout: 180_000 });
    test.use({
      viewport: { width, height },
      hasTouch: width === 390,
      timezoneId: 'America/Los_Angeles',
    });

    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset?seed=pixels-facts')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    });

    test('restores the year origin after unlock, back, and reload', async ({ page }) => {
      await page.goto('/pixels?year=2024');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const cell = page.locator('[data-date="2024-02-29"]');
      await cell.scrollIntoViewIfNeeded();
      if (width === 390) await cell.tap();
      else {
        await cell.focus();
        await page.keyboard.press('Enter');
      }
      const open = page.getByRole('link', { name: 'Open this day' });
      await expect(open).toBeVisible();
      expect((await open.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (width === 390) await open.tap();
      else {
        await open.focus();
        await page.keyboard.press('Enter');
      }
      await expect(page).toHaveURL(/\/pixels\/day\?/);
      const here = new URL(page.url());
      expect(here.searchParams.get('date')).toBe('2024-02-29');
      expect(here.searchParams.get('from')).toBe('year');
      expect(here.searchParams.get('year')).toBe('2024');
      const day = page.locator('app-day-detail');
      await expect(day).toContainText('Thu, Feb 29, 2024');
      await expect(day).toContainText('Read synthetic');
      await expect(day).toContainText('Leap harbor, day 2 of 3');
      await expect(day.getByRole('link', { name: 'Open Town check-in · Read synthetic' })).toHaveAttribute('href', '/town');
      await expect(day.getByRole('link', { name: 'Open Trip span · Leap harbor' })).toHaveAttribute('href', /\/travel\/trips\/\d+$/);
      const recap = day.locator('[data-recap]');
      await expect(recap).toContainText('Weekly review is not available.');
      await expect(recap).toContainText('Read synthetic');
      await expect(recap.locator('a')).toHaveCount(0);
      await expect(day.locator('[data-source="photos"]')).toHaveAttribute('data-source-state', 'absent');
      await expect(day.locator('[data-source="notes"]')).toHaveAttribute('data-source-state', 'absent');
      await expect(day.locator('[data-source="photos"] a, [data-source="notes"] a')).toHaveCount(0);
      const text = await day.innerText();
      expect(text).not.toContain('synthetic private note');
      expect(text).not.toContain('foreign private note');
      expect(text).not.toContain('Foreign concept');
      expect(text).not.toContain('Other habit');
      expect(text).not.toContain('Other trip');
      expect(text).not.toContain('1990-05-04');
      const vector = await day.locator('.day-detail').getAttribute('data-score-vector');
      expect(vector).toContain('"date":"2024-02-29"');
      expect(vector).not.toContain('Read synthetic');
      const motion = await day.locator('.day-detail').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');
      const scan = await new AxeBuilder({ page }).include('.pixels').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

      const finance = day.locator('[data-source="finance"]');
      await expect(finance).toHaveAttribute('data-source-state', 'locked');
      await expect(finance).toContainText('Finance is locked. Unlock to include budget kept.');
      await expect(finance).not.toContainText('no data');
      await syntheticVault(page);
      await page.route(/\/api\/pixels/, route => route.continue());
      await page.route('**/travel/api/home', route => route.continue());
      const unlock = finance.getByRole('link', { name: /Finance is locked/ });
      expect((await unlock.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await unlock.click();
      await expect(page).toHaveURL(url => dayNext(url));
      await page.goBack();
      await page.reload();
      await expect(page).toHaveURL(url => url.pathname === '/pixels/day'
        && url.searchParams.get('date') === '2024-02-29'
        && url.searchParams.get('from') === 'year'
        && url.searchParams.get('year') === '2024');
      await expect(day).toContainText('Thu, Feb 29, 2024');
      await expect(day).toContainText('Leap harbor, day 2 of 3');
      expect(await day.locator('.day-detail').getAttribute('data-origin')).toBe('year');
      expect(await day.locator('.day-detail').getAttribute('data-origin-year')).toBe('2024');
      await expect(day.locator('.day-detail')).toHaveAttribute('data-score-vector', vector ?? '');
      await unlock.click();
      await expect(page).toHaveURL(url => dayNext(url));
      // Fail the first record read after unlock. A later read uses the loaded cache and would look empty.
      await page.route('**/api/vault/records**', route => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        }
        return route.fallback();
      });
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === '/pixels/day' && url.searchParams.get('date') === '2024-02-29');
      await expect(day.locator('[data-source="finance"]')).toHaveAttribute('data-source-state', 'unavailable');
      await expect(day.locator('[data-source="finance"]')).toContainText('Finance is unavailable.');
      await expect(day.locator('[data-source="finance"]')).not.toContainText('no data');

      const back = day.getByRole('link', { name: 'Back to 2024' });
      expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (width === 390) await back.tap();
      else await back.click();
      await expect(page).toHaveURL(/\/pixels\?year=2024&day=2024-02-29/);
      await expect(page.locator('[data-source="finance"]')).toHaveAttribute('data-source-state', 'unavailable');
      await expect(page.locator('[data-source="finance"]')).toContainText('Finance is unavailable.');
      await expect(page.locator('[data-source="finance"]')).not.toContainText('no data');
      await expect(page.locator('app-day-detail')).toContainText('Read synthetic');
      await expect(page.locator('app-day-detail')).toContainText('Leap harbor, day 2 of 3');
    });

    test('returns to the originating life span', async ({ page }) => {
      await page.goto(LIFE);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const open = page.getByRole('link', { name: 'Open Thu, Feb 29, 2024' });
      await expect(open).toBeVisible();
      expect((await open.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (width === 390) await open.tap();
      else {
        await open.focus();
        await page.keyboard.press('Enter');
      }
      await expect(page).toHaveURL(url => url.pathname === '/pixels/day'
        && url.searchParams.get('date') === '2024-02-29'
        && url.searchParams.get('from') === 'life'
        && url.searchParams.get('span') === '2024-02-29');
      const day = page.locator('app-day-detail');
      await expect(day).toContainText('Leap harbor, day 2 of 3');
      await expect(day).toContainText('Read synthetic');
      expect(await day.locator('.day-detail').getAttribute('data-origin')).toBe('life');
      expect(await day.locator('.day-detail').getAttribute('data-origin-span')).toBe('2024-02-29');
      await expect(day.locator('[data-recap]')).toContainText('Weekly review is not available.');
      await expect(day.locator('[data-recap] a')).toHaveCount(0);
      await expect(page.getByText('synthetic private note')).toHaveCount(0);
      const back = day.getByRole('link', { name: /Back to week of/ });
      expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (width === 390) await back.tap();
      else await back.click();
      await expect(page).toHaveURL(/\/pixels\/life\?span=2024-02-29/);
      await expect(page.getByRole('link', { name: 'Open Thu, Feb 29, 2024' })).toBeVisible();
      await page.goBack();
      await page.reload();
      await expect(page).toHaveURL(url => url.searchParams.get('date') === '2024-02-29'
        && url.searchParams.get('span') === '2024-02-29');
      await expect(page.locator('app-day-detail')).toContainText('Thu, Feb 29, 2024');
      await expect(page.locator('.day-detail')).toHaveAttribute('data-origin', 'life');
      await expect(page.locator('.day-detail')).toHaveAttribute('data-origin-span', '2024-02-29');
    });
  });
}

test.describe('direct day route', () => {
  test.use({ viewport: { width: 1280, height: 800 }, timezoneId: 'America/Los_Angeles' });

  test('direct leap day route is the same named record', async ({ page, request }) => {
  expect((await request.post('/e2e/reset?seed=pixels-facts')).ok()).toBeTruthy();
  await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
  await page.goto(LEAP);
  await expect(page.locator('app-day-detail')).toContainText('Leap harbor, day 2 of 3');
  await expect(page.locator('[data-source="finance"]')).toHaveAttribute('data-source-state', 'locked');
  await expect(page.locator('[data-source="finance"]')).not.toContainText('no data');
  });
});
