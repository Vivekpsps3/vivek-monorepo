import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '../../../tests/e2e/fixtures';
import { RHYTHM_CHART } from '../src/app/town/harbor-rhythm';

async function prepare(page: Page, width: number, theme: 'light' | 'dark', reduced = true): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript(value => {
    localStorage.setItem('suite-theme', value);
    const win = window as Window & { __rhythmAudio?: number; __rhythmClosed?: number };
    win.__rhythmAudio = 0;
    win.__rhythmClosed = 0;
    const Original = window.AudioContext;
    if (!Original) return;
    const Wrapped = function (this: AudioContext): AudioContext {
      win.__rhythmAudio = (win.__rhythmAudio ?? 0) + 1;
      const context = new Original();
      const close = context.close.bind(context);
      context.close = () => {
        win.__rhythmClosed = (win.__rhythmClosed ?? 0) + 1;
        return close();
      };
      return context;
    };
    Wrapped.prototype = Original.prototype;
    window.AudioContext = Wrapped as unknown as typeof AudioContext;
  }, theme);
  expect((await page.request.post('/e2e/reset?seed=town-empty')).ok()).toBeTruthy();
}

async function activate(page: Page, locator: Locator, touch: boolean): Promise<void> {
  if (touch) await locator.tap();
  else {
    await locator.focus();
    await page.keyboard.press('Enter');
  }
}

async function solveUntimed(page: Page, game: Locator, touch: boolean): Promise<void> {
  for (const beat of RHYTHM_CHART) {
    if (touch) await game.locator(`[data-lane="${beat.lane}"]`).tap();
    else await page.keyboard.press(String(beat.lane + 1));
  }
}

async function finishTimed(page: Page, game: Locator, touch: boolean): Promise<void> {
  const first = game.locator('[data-lane="0"][data-due="true"]');
  await expect(first).toBeVisible({ timeout: 5_000 });
  if (touch) await game.getByRole('button', { name: 'Pause', exact: true }).tap();
  else await page.keyboard.press('p');
  await expect(game.getByRole('status')).toContainText('Paused.');
  await expect(game.locator('main')).toHaveAttribute('data-clock', 'off');
  const elapsed = await game.locator('main').getAttribute('data-elapsed');
  await page.waitForTimeout(1_200);
  await expect(game.locator('main')).toHaveAttribute('data-elapsed', elapsed ?? '');
  if (touch) await game.getByRole('button', { name: 'Resume', exact: true }).tap();
  else await page.keyboard.press('p');
  await expect(game.locator('main')).toHaveAttribute('data-clock', 'on');
  for (const beat of RHYTHM_CHART) {
    const lane = game.locator(`[data-lane="${beat.lane}"][data-due="true"]`);
    await expect(lane).toBeVisible({ timeout: 5_000 });
    if (touch) await lane.tap();
    else await page.keyboard.press(String(beat.lane + 1));
  }
  await expect(game.getByRole('status')).toHaveText('Win. 30-second chart complete. Accuracy 100%.', { timeout: 5_000 });
  await expect(game.locator('main')).toHaveAttribute('data-clock', 'off');
}

test.describe('Harbor Rhythm', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });

  for (const [width, theme, touch] of [
    [390, 'light', true],
    [390, 'dark', true],
    [1280, 'light', false],
    [1280, 'dark', false],
  ] as const) {
    test(`finishes the untimed sequence at ${width} ${theme}`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const writes: string[] = [];
      page.on('request', request => {
        if (request.method() === 'GET' || request.method() === 'HEAD') return;
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      await prepare(page, width, theme);
      await page.goto('/town/rhythm');
      const game = page.locator('app-harbor-rhythm');
      await expect(game.getByRole('heading', { name: 'Harbor Rhythm', level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(game.locator('[data-motion="reduce"]')).toBeVisible();
      await expect(game.locator('[data-sound="off"]')).toBeVisible();
      await expect(game.locator('[data-clock="off"]')).toBeVisible();
      await expect(game.getByRole('status')).toHaveText('Play the 30-second chart or the untimed sequence. This game does not award Stamps.');
      await expect(game).toContainText('does not play recorded music');
      await expect(game.getByRole('button', { name: /Buy|Grant/ })).toHaveCount(0);
      await expect(game.locator('audio, video, iframe')).toHaveCount(0);

      for (const name of ['Play 30-second chart', 'Play untimed sequence']) {
        const box = await game.getByRole('button', { name }).boundingBox();
        expect(box?.width, name).toBeGreaterThanOrEqual(44);
        expect(box?.height, name).toBeGreaterThanOrEqual(44);
      }
      const sound = await game.getByRole('checkbox', { name: 'Original tones' }).boundingBox();
      expect(sound?.width).toBeGreaterThanOrEqual(44);
      expect(sound?.height).toBeGreaterThanOrEqual(44);

      await activate(page, game.getByRole('button', { name: 'Play untimed sequence' }), touch);
      await expect(game.getByRole('status')).toHaveText('0 of 16. Next Bell. Accuracy not scored yet.');
      await expect(game.locator('main')).toHaveAttribute('data-clock', 'off');
      await expect(game.locator('.note')).toHaveCount(0);
      for (const name of ['Pause', 'Restart', 'Quit']) {
        const box = await game.getByRole('button', { name, exact: true }).boundingBox();
        expect(box?.width, name).toBeGreaterThanOrEqual(44);
        expect(box?.height, name).toBeGreaterThanOrEqual(44);
      }
      const laneBox = await game.locator('[data-lane="0"]').boundingBox();
      expect(laneBox?.width).toBeGreaterThanOrEqual(44);
      expect(laneBox?.height).toBeGreaterThanOrEqual(44);

      if (touch) await game.getByRole('button', { name: 'Pause', exact: true }).tap();
      else await page.keyboard.press('p');
      await expect(game.getByRole('status')).toHaveText('Paused. 0 of 16. Next Bell. Accuracy not scored yet.');
      await expect(game.locator('[data-lane="0"]')).toBeDisabled();
      await game.locator('[data-lane="0"]').click({ force: true });
      await expect(game.getByRole('status')).toHaveText('Paused. 0 of 16. Next Bell. Accuracy not scored yet.');
      if (touch) await game.getByRole('button', { name: 'Resume', exact: true }).tap();
      else await page.keyboard.press('p');

      if (touch) await game.locator('[data-lane="1"]').tap();
      else await page.keyboard.press('2');
      await expect(game.getByRole('status')).toHaveText('0 of 16. Next Bell. Accuracy 0%.');
      if (touch) await game.getByRole('button', { name: 'Restart', exact: true }).tap();
      else await page.keyboard.press('r');
      await expect(game.getByRole('status')).toHaveText('0 of 16. Next Bell. Accuracy not scored yet.');
      if (!touch) {
        await expect(game.locator('[data-lane="0"]')).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(game.locator('[data-lane="1"]')).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(game.locator('[data-lane="0"]')).toBeFocused();
      }

      await solveUntimed(page, game, touch);
      await expect(game.getByRole('status')).toHaveText('Win. Untimed sequence complete. Accuracy 100%.');
      await expect(game.locator('[data-lane="0"]')).toBeDisabled();
      await expect(game.locator('main')).toHaveAttribute('data-clock', 'off');
      const scan = await new AxeBuilder({ page }).include('app-harbor-rhythm').analyze();
      expect(scan.violations.filter(item => item.id === 'color-contrast' || item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

      if (touch) await game.getByRole('button', { name: 'Quit', exact: true }).tap();
      else await page.keyboard.press('q');
      await expect(game.locator('[data-lane]')).toHaveCount(0);
      await expect(game.getByRole('status')).toHaveText('Last untimed sequence finished at 100% accuracy. This game does not award Stamps.');
      await expect(game.getByRole('button', { name: 'Play untimed sequence' })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
      expect(await game.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      expect(await page.evaluate(() => (window as Window & { __rhythmAudio?: number }).__rhythmAudio ?? 0)).toBe(0);
      expect(writes.filter(item => /\/api\/(town|media|pixels|health)|stamp/i.test(item))).toEqual([]);
      await info.attach(`rhythm-${width}-${theme}`, { body: await game.screenshot(), contentType: 'image/png' });
    });
  }

  for (const [width, theme, touch] of [
    [390, 'light', true],
    [1280, 'dark', false],
  ] as const) {
    test(`finishes the 30-second chart at ${width} ${theme}`, async ({ page }, info) => {
      test.setTimeout(120_000);
      await prepare(page, width, theme);
      await page.goto('/town/rhythm');
      const game = page.locator('app-harbor-rhythm');
      await activate(page, game.getByRole('button', { name: 'Play 30-second chart' }), touch);
      await expect(game.locator('main')).toHaveAttribute('data-mode', 'timed');
      await expect(game.locator('main')).toHaveAttribute('data-clock', 'on');
      await expect(game.locator('.note')).toHaveCount(0);
      await finishTimed(page, game, touch);
      expect(await game.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      expect(await page.evaluate(() => (window as Window & { __rhythmAudio?: number }).__rhythmAudio ?? 0)).toBe(0);
      await info.attach(`rhythm-timed-${width}-${theme}`, { body: await game.screenshot(), contentType: 'image/png' });
    });
  }

  test('pauses the chart when the page is hidden', async ({ page }) => {
    await prepare(page, 1280, 'light');
    await page.goto('/town/rhythm');
    const game = page.locator('app-harbor-rhythm');
    await game.getByRole('button', { name: 'Play 30-second chart' }).click();
    await expect(game.locator('main')).toHaveAttribute('data-clock', 'on');
    await expect(game.locator('main')).not.toHaveAttribute('data-elapsed', '0');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(game.getByRole('status')).toContainText('Paused.');
    await expect(game.locator('main')).toHaveAttribute('data-clock', 'off');
    const elapsed = await game.locator('main').getAttribute('data-elapsed');
    await page.waitForTimeout(1_200);
    await expect(game.locator('main')).toHaveAttribute('data-elapsed', elapsed ?? '');
    await expect(game.locator('main')).toHaveAttribute('data-clock', 'off');
    expect(await game.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  });

  test('plays one original tone after opting in and stays silent for reduced motion', async ({ page }) => {
    await prepare(page, 1280, 'light', false);
    await page.goto('/town/rhythm');
    const game = page.locator('app-harbor-rhythm');
    await expect(game.locator('[data-motion="ok"]')).toBeVisible();
    await game.getByRole('checkbox', { name: 'Original tones' }).check();
    await expect(game.locator('main')).toHaveAttribute('data-sound', 'on');
    await game.getByRole('button', { name: 'Play untimed sequence' }).click();
    await expect(game.locator('.note')).toHaveCount(0);
    await page.keyboard.press('1');
    await expect(game.getByRole('status')).toHaveText('1 of 16. Next Glass. Accuracy 100%.');
    await expect.poll(() => page.evaluate(() => (window as Window & { __rhythmAudio?: number }).__rhythmAudio ?? 0)).toBe(1);
    await page.keyboard.press('p');
    await expect.poll(() => page.evaluate(() => (window as Window & { __rhythmClosed?: number }).__rhythmClosed ?? 0)).toBeGreaterThan(0);
    expect(await game.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(game.locator('audio, video, iframe')).toHaveCount(0);

    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('town.harbor-rhythm.v1.')) sessionStorage.removeItem(key);
      }
    });
    await prepare(page, 390, 'dark');
    await page.goto('/town/rhythm');
    const reduced = page.locator('app-harbor-rhythm');
    await reduced.getByRole('checkbox', { name: 'Original tones' }).check();
    await expect(reduced.locator('main')).toHaveAttribute('data-sound', 'on');
    await reduced.getByRole('button', { name: 'Play untimed sequence' }).tap();
    await reduced.locator('[data-lane="0"]').tap();
    await expect(reduced.getByRole('status')).toHaveText('1 of 16. Next Glass. Accuracy 100%.');
    await expect(reduced.locator('.note')).toHaveCount(0);
    expect(await page.evaluate(() => (window as Window & { __rhythmAudio?: number }).__rhythmAudio ?? 0)).toBe(0);
    expect(await reduced.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  });

  test('keeps the sequence when Town, Media, and Pixels reads fail', async ({ page }) => {
    await prepare(page, 390, 'dark');
    for (const path of ['**/api/town**', '**/api/media**', '**/api/pixels**']) {
      await page.route(path, route => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Town is unavailable right now.' }),
      }));
    }
    await page.goto('/town/rhythm');
    const game = page.locator('app-harbor-rhythm');
    await game.getByRole('button', { name: 'Play untimed sequence' }).tap();
    await solveUntimed(page, game, true);
    await expect(game.getByRole('status')).toHaveText('Win. Untimed sequence complete. Accuracy 100%.');
  });

  test('returns to Town and restores the open lane', async ({ page }) => {
    await prepare(page, 1280, 'light');
    await page.goto('/town');
    const entrance = page.getByRole('link', { name: 'Harbor Rhythm', exact: true });
    const entranceBox = await entrance.boundingBox();
    expect(entranceBox?.height).toBeGreaterThanOrEqual(44);
    await entrance.click();
    await expect(page).toHaveURL(/\/town\/rhythm$/);
    const game = page.locator('app-harbor-rhythm');
    await game.getByRole('button', { name: 'Play untimed sequence' }).click();
    await page.keyboard.press('1');
    await expect(game.getByRole('status')).toHaveText('1 of 16. Next Glass. Accuracy 100%.');
    await game.getByRole('navigation', { name: 'Current place' }).getByRole('link', { name: 'Town' }).click();
    await expect(page).toHaveURL(/\/town$/);
    await expect(page.getByRole('link', { name: 'Harbor Rhythm', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Harbor Rhythm', exact: true }).click();
    await expect(game.getByRole('status')).toHaveText('1 of 16. Next Glass. Accuracy 100%.');
    await expect(game.locator('[data-lane="1"]')).toHaveAttribute('data-due', 'true');
  });

  test('clears the round when the session ends', async ({ page }) => {
    await prepare(page, 390, 'light');
    await page.goto('/town/rhythm');
    const game = page.locator('app-harbor-rhythm');
    await game.getByRole('button', { name: 'Play untimed sequence' }).tap();
    await game.locator('[data-lane="0"]').tap();
    await expect(game.getByRole('status')).toContainText('1 of 16.');
    await page.getByRole('banner').getByRole('button', { name: 'synthetic', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('town.harbor-rhythm.v1.')))).toEqual([]);
  });
});
