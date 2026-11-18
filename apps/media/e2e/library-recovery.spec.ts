import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';
import { addItem, expectSectionHeading, resetMedia } from './media-test';

test.beforeEach(async ({ request }) => resetMedia(request));

test('a failed library load returns focus to the heading when retry succeeds', async ({ page }) => {
  let failed = false;
  await page.route('**/media/api/library**', route => {
    if (!failed && route.request().method() === 'GET') {
      failed = true;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Library offline' }) });
    }
    return route.continue();
  });
  await page.goto('/media/library');
  const retry = page.getByRole('button', { name: 'Retry library' });
  await expect(retry).toBeVisible();
  await retry.click();
  const heading = await expectSectionHeading(page, 'Library');
  await expect(heading).toBeFocused();
  await expect(page.getByRole('button', { name: 'Retry library' })).toHaveCount(0);
});

test('returning from an item restores the library scroll position', async ({ page, request }) => {
  for (let index = 0; index < 18; index += 1) {
    await addItem(request, { title: 'Scroll story ' + String(index).padStart(2, '0') });
  }
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/media/library?sort=title');
  await expectSectionHeading(page, 'Library');
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(800);
  const scrolled = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('h2 a')].find(anchor => anchor.textContent?.trim() === 'Zebra');
    if (!(link instanceof HTMLAnchorElement)) throw new Error('Zebra link missing');
    link.click();
  });
  await expect(page).toHaveURL(/\/media\/item\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Zebra', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/media\/library/);
  await expectSectionHeading(page, 'Library');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled - 80);
});

for (const [width, height, theme] of [[390, 844, 'dark'], [1280, 800, 'light']] as const) {
  test.describe(`source return at ${width}`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390, reducedMotion: 'reduce' });

    test('restores filtered artist page, selection, focus and scroll', async ({ page, request }, info) => {
      test.setTimeout(60_000);
      for (let index = 0; index < 44; index += 1) {
        await addItem(request, { kind: 'artist', status: 'following', title: `Harbor Artist ${String(index).padStart(2, '0')}` });
      }
      const artist = await addItem(request, { kind: 'artist', status: 'following', title: 'Harbor Artist Return' });
      expect((await request.post(`/media/api/entries/${artist.id}/albums`, { data: { title: 'Harbor Return Album' } })).ok()).toBeTruthy();
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.goto('/media/library?kind=artist&status=following&sort=title');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.getByRole('button', { name: 'Next items' }).click();
      await expect(page).toHaveURL(/offset=24/);
      const artistSection = page.locator('.media-grid section').filter({ has: page.getByRole('link', { name: 'Harbor Artist Return', exact: true }) });
      await artistSection.getByRole('button', { name: /Show saved albums/ }).click();
      const link = page.getByRole('link', { name: 'Harbor Return Album', exact: true });
      await link.scrollIntoViewIfNeeded();
      const start = await page.evaluate(() => ({ path: location.pathname + location.search, top: scrollY, length: history.length }));
      expect(start.top).toBeGreaterThan(150);
      expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (width === 390) await link.tap();
      else await link.press('Enter');
      await expect(page.locator('main h1')).toHaveText('Harbor Return Album');
      expect(new URL(page.url()).search).toBe('');
      const back = page.getByRole('link', { name: '← Library' });
      expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      if (width === 390) await back.tap();
      else await page.goBack();
      await expect(page).toHaveURL(url => url.pathname + url.search === start.path);
      await expect(artistSection.getByRole('button', { name: /Hide saved albums/ })).toHaveAttribute('aria-expanded', 'true');
      await expect(link).toBeFocused();
      await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - start.top)).toBeLessThan(10);
      expect(await page.evaluate(() => history.length)).toBe(start.length + 1);
      const scan = await new AxeBuilder({ page }).include('main').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      const screenshot = info.outputPath('restored-artist.png');
      await page.screenshot({ path: screenshot });
      await info.attach('restored-artist', { path: screenshot, contentType: 'image/png' });
      await page.goForward();
      await expect(page.locator('main h1')).toHaveText('Harbor Return Album');
    });
  });
}
