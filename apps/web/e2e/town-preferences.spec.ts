import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';

async function audioCreated(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __sceneAudioCreated: { created: number } }).__sceneAudioCreated.created);
}

async function armAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const marker = { created: 0, notifications: 0 };
    const Original = window.AudioContext;
    function Wrapped(this: AudioContext): AudioContext {
      marker.created += 1;
      return new Original();
    }
    Wrapped.prototype = Original.prototype;
    Object.setPrototypeOf(Wrapped, Original);
    window.AudioContext = Wrapped as unknown as typeof AudioContext;
    try {
      const notify = window.Notification?.requestPermission?.bind(window.Notification);
      if (notify) {
        window.Notification.requestPermission = () => {
          marker.notifications += 1;
          return notify();
        };
      }
    } catch {
      // Some browsers expose a read-only permission method. The count stays at zero.
    }
    Object.defineProperty(window, '__sceneAudioCreated', { value: marker });
  });
}

test.describe('Game preferences at 1280', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('sound stays off, a volume change survives reload, and decoration off keeps rooms', async ({ page }, info) => {
    test.setTimeout(90_000);
    expect((await page.request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await armAudio(page);
    await page.clock.setFixedTime(new Date('2026-05-31T19:00:00Z'));
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'light'));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/settings/game');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const game = page.locator('app-game-section');
    const mute = game.getByRole('checkbox', { name: 'Mute' });
    const volume = game.getByRole('slider', { name: 'Volume' });
    const decoration = game.getByRole('checkbox', { name: 'Game decoration and feedback' });
    await expect(mute).toBeChecked();
    await expect(volume).toHaveValue('70');
    await expect(game.getByRole('radio', { name: 'Follow this device' })).toBeChecked();
    await expect(decoration).toBeChecked();
    await volume.focus();
    await volume.fill('40');
    await decoration.focus();
    await page.keyboard.press('Space');
    await game.getByRole('radio', { name: 'Reduce motion' }).focus();
    await page.keyboard.press('Space');
    await expect(game.getByRole('status')).toContainText('Saved on this device.');
    expect(await audioCreated(page)).toBe(0);
    await page.reload();
    await expect(mute).toBeChecked();
    await expect(volume).toHaveValue('40');
    await expect(decoration).not.toBeChecked();
    await expect(game.getByRole('radio', { name: 'Reduce motion' })).toBeChecked();
    const stored = await page.evaluate(() => localStorage.getItem('town.scene.v1.1'));
    expect(JSON.parse(stored!)).toEqual({
      season: 'automatic', sound: false, volume: 0.4, motion: 'reduce', decoration: false,
    });
    await expect(game.getByRole('link', { name: 'Open Town' })).toBeVisible();
    for (const name of ['Mute', 'Reduce motion', 'Game decoration and feedback']) {
      const box = await game.locator('label').filter({ hasText: name }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    expect((await volume.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const gameScan = await new AxeBuilder({ page }).include('app-game-section').analyze();
    expect(gameScan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

    await game.getByRole('link', { name: 'Open Town' }).focus();
    await page.keyboard.press('Enter');
    const viewport = page.locator('.viewport');
    await expect(viewport).toHaveAttribute('data-decoration', 'off');
    await expect(viewport).toHaveAttribute('data-motion', 'reduce');
    await expect(viewport).toHaveAttribute('data-ambience', 'still');
    await page.getByText('View controls', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.sound-status')).toContainText('Town sound is off');
    await page.getByRole('button', { name: 'Play Town sound' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.sound-status')).toContainText('Town sound is off');
    expect(await audioCreated(page)).toBe(0);
    expect(await page.locator('.idle-mark').evaluate(el => getComputedStyle(el).display)).toBe('none');
    const home = page.locator('[data-building="home"]');
    await home.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/town\/home\/living/);
    await page.goto('/town');
    await page.locator('[data-building="slot-1"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.inspector')).toContainText('Walk 30 minutes');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const townScan = await new AxeBuilder({ page }).include('app-town').analyze();
    expect(townScan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await page.getByRole('link', { name: 'Visit the Hall' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Hall', level: 1 })).toBeVisible();
    const hallScan = await new AxeBuilder({ page }).include('app-town-hall').analyze();
    expect(hallScan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    expect(await audioCreated(page)).toBe(0);
    const notifications = await page.evaluate(() => (window as unknown as { __sceneAudioCreated: { notifications: number } }).__sceneAudioCreated.notifications);
    expect(notifications).toBe(0);
    await info.attach('game-preferences-1280-light', { body: await page.screenshot(), contentType: 'image/png' });
  });
});

test.describe('Today with blocked storage at 390', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });

  test('keyboard and touch open Today with static feedback when sound, motion, and storage are blocked', async ({ page }, info) => {
    test.setTimeout(90_000);
    expect((await page.request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await armAudio(page);
    await page.addInitScript(() => {
      localStorage.setItem('suite-theme', 'dark');
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string): void {
        if (String(key).startsWith('town.scene.v1.')) throw new DOMException('blocked');
        original.call(this, key, value);
      };
    });
    await page.clock.setFixedTime(new Date('2026-10-30T06:00:00Z'));
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/town');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.viewport')).toHaveAttribute('data-day', 'night');
    await expect(page.locator('.viewport')).toHaveAttribute('data-motion', 'reduce');
    await expect(page.locator('.viewport')).toHaveAttribute('data-ambience', 'still');
    const today = page.getByRole('button', { name: 'Today', exact: true });
    await today.focus();
    await page.keyboard.press('Enter');
    await expect(today).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('#town-today');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button').first()).toBeFocused();
    const check = panel.getByRole('button', { name: /Walk 30 minutes/ });
    await expect(check).toBeEnabled();
    const checkBox = await check.boundingBox();
    expect(checkBox && checkBox.width >= 44 && checkBox.height >= 44).toBeTruthy();
    await check.tap();
    const feedback = panel.locator('.feedback');
    await expect(feedback).toContainText('Flower open');
    expect(await feedback.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    const mark = page.locator('[data-scene-object="slot-1"] [data-habit-feedback="garden"]');
    await expect(mark).toHaveCount(1);
    expect(await mark.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await page.locator('.today-drawer').press('Escape');
    await expect(today).toBeFocused();
    await expect(today).toHaveAttribute('aria-expanded', 'false');
    await today.tap();
    await expect(panel).toBeVisible();
    await expect(feedback).toBeVisible();
    await page.getByText('View controls', { exact: true }).tap();
    await expect(page.locator('.sound-status')).toContainText('Town sound is off');
    await page.getByRole('button', { name: 'Play Town sound' }).tap();
    await expect(page.locator('.sound-status')).toContainText('Town sound is off');
    expect(await audioCreated(page)).toBe(0);
    const notifications = await page.evaluate(() => (window as unknown as { __sceneAudioCreated: { notifications: number } }).__sceneAudioCreated.notifications);
    expect(notifications).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const scan = await new AxeBuilder({ page }).include('app-town').analyze();
    expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await info.attach('today-access-390-night', { body: await page.screenshot(), contentType: 'image/png' });
  });
});
