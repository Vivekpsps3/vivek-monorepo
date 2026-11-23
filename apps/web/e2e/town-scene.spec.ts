import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '../../../tests/e2e/fixtures';

async function townFacts(page: Page): Promise<{ xp: number; level: number; today: string }> {
  const body = await (await page.request.get('/api/town?tz=America%2FLos_Angeles')).json();
  return { xp: body.town.xp, level: body.town.level, today: body.town.today };
}

async function audioCreated(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __sceneAudioCreated: { created: number } }).__sceneAudioCreated.created);
}

test.describe('Town season and ambience', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.addInitScript(() => {
      const marker = { created: 0 };
      const Original = window.AudioContext;
      function Wrapped(this: AudioContext): AudioContext {
        marker.created += 1;
        return new Original();
      }
      Wrapped.prototype = Original.prototype;
      Object.setPrototypeOf(Wrapped, Original);
      window.AudioContext = Wrapped as unknown as typeof AudioContext;
      Object.defineProperty(window, '__sceneAudioCreated', { value: marker });
    });
  });

  test('previews, saves, and reloads a season across a month boundary and an owner key', async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.clock.setFixedTime(new Date('2026-05-31T19:00:00Z'));
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'light'));
    await page.setViewportSize({ width: 1280, height: 800 });
    const writes: string[] = [];
    page.on('request', request => {
      const url = request.url();
      if (request.method() !== 'GET' && (/\/api\/town/.test(url) || /\/api\/pixels/.test(url))) writes.push(`${request.method()} ${url}`);
    });
    const before = await townFacts(page);
    await page.goto('/settings/appearance');
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.user.id).toBe(1);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const season = page.locator('[data-town-season]');
    await expect(season.getByRole('radio', { name: 'Automatic' })).toBeChecked();
    await expect(season.locator('[data-season-preview]')).toContainText('Automatic, Spring');
    await expect(season.locator('[data-season-preview]')).toContainText('Day');
    await expect(season).toContainText('March through May');
    await expect(season).toContainText('does not change today’s Town date');

    await season.getByRole('radio', { name: 'Winter' }).focus();
    await page.keyboard.press('Space');
    await expect(season.getByText('Unsaved preview')).toBeVisible();
    await expect(season.locator('[data-season-preview]')).toContainText('Winter');
    await page.getByRole('button', { name: 'Discard preview' }).press('Enter');
    await expect(season.getByRole('radio', { name: 'Automatic' })).toBeChecked();
    await expect(season.getByText('Unsaved preview')).toHaveCount(0);

    await season.getByRole('radio', { name: 'Winter' }).focus();
    await page.keyboard.press('Space');
    await page.getByRole('link', { name: 'See on Town' }).click();
    await expect(page).toHaveURL(/\/town$/);
    const viewport = page.locator('.viewport');
    await expect(viewport).toHaveAttribute('data-season', 'winter');
    await expect(viewport).toHaveAttribute('data-day', 'day');
    await expect(viewport).toHaveAttribute('data-ambience', 'still');
    await expect(page.locator('[data-scene-presentation]')).toContainText('Unsaved preview');
    await expect(page.locator('[data-scene-presentation]')).toContainText('Presentation only');
    await page.reload();
    await expect(viewport).toHaveAttribute('data-season', 'spring');
    await expect(page.locator('[data-scene-presentation]')).not.toContainText('Unsaved preview');

    await page.goto('/settings/appearance');
    await season.getByRole('radio', { name: 'Winter' }).click();
    const saveSeason = page.getByRole('button', { name: 'Save season' });
    await expect(saveSeason).toBeEnabled();
    await saveSeason.press('Enter');
    await expect(page.getByText('Season saved on this device.')).toBeFocused();
    for (const name of ['Winter', 'Save season', 'See on Town']) {
      const box = await page.locator('[data-town-season]').locator('label, button, a').filter({ hasText: name }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.clock.setFixedTime(new Date('2026-06-01T19:00:00Z'));
    await page.reload();
    await expect(season.getByRole('radio', { name: 'Winter' })).toBeChecked();
    await expect(season.locator('[data-season-preview]')).toContainText('Winter');
    await expect(season.locator('[data-season-preview]')).not.toContainText('Summer');
    const stored = await page.evaluate(() => ({
      owner: localStorage.getItem('town.scene.v1.1'),
      other: localStorage.getItem('town.scene.v1.2'),
    }));
    expect(JSON.parse(stored.owner!)).toEqual({ season: 'winter', sound: false });
    await page.evaluate(() => localStorage.setItem('town.scene.v1.2', JSON.stringify({ season: 'spring', sound: true })));
    await page.reload();
    await expect(season.getByRole('radio', { name: 'Winter' })).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('town.scene.v1.2'))).toContain('spring');

    await page.getByRole('link', { name: 'See on Town' }).click();
    await expect(viewport).toHaveAttribute('data-season', 'winter');
    await expect(viewport).toHaveAttribute('data-ambience', 'still');
    expect(await page.locator('.idle-mark').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await audioCreated(page)).toBe(0);
    await expect(page.locator('.sound-status')).toContainText('Town sound is off');
    await page.getByRole('button', { name: 'Play Town sound' }).click();
    await expect(page.locator('.sound-status')).toContainText('Town sound is off');
    expect(await audioCreated(page)).toBe(0);
    const after = await townFacts(page);
    expect(after).toEqual(before);
    expect(writes).toEqual([]);
    for (const name of ['Town season', 'Play Town sound'] as const) {
      const box = await page.getByRole(name === 'Town season' ? 'link' : 'button', { name }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const appearanceScan = await new AxeBuilder({ page }).include('app-town').analyze();
    expect(appearanceScan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await info.attach('town-scene-1280-light', { body: await page.screenshot(), contentType: 'image/png' });
  });

});

test.describe('Town season at 390', () => {
  test.use({ timezoneId: 'America/Los_Angeles', hasTouch: true });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.addInitScript(() => {
      const marker = { created: 0 };
      const Original = window.AudioContext;
      function Wrapped(this: AudioContext): AudioContext {
        marker.created += 1;
        return new Original();
      }
      Wrapped.prototype = Original.prototype;
      Object.setPrototypeOf(Wrapped, Original);
      window.AudioContext = Wrapped as unknown as typeof AudioContext;
      Object.defineProperty(window, '__sceneAudioCreated', { value: marker });
    });
  });

  test('saves summer at 390 night with touch and reduced motion', async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.clock.setFixedTime(new Date('2026-10-30T06:00:00Z'));
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'dark'));
    await page.setViewportSize({ width: 390, height: 844 });
    const before = await townFacts(page);
    await page.goto('/settings/appearance');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const season = page.locator('[data-town-season]');
    await expect(season.locator('[data-season-preview]')).toContainText('Night');
    await expect(season.locator('[data-season-preview]')).toContainText('Autumn');
    await season.getByRole('radio', { name: 'Summer' }).tap();
    await season.getByRole('checkbox', { name: 'Town sound' }).tap();
    await expect(season.getByText('Unsaved preview')).toBeVisible();
    const save = page.getByRole('button', { name: 'Save season' });
    expect((await save.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await save.tap();
    await expect(page.getByText('Season saved on this device.')).toBeVisible();
    const settingsScan = await new AxeBuilder({ page }).include('app-appearance-section').analyze();
    expect(settingsScan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await info.attach('town-scene-390-appearance', { body: await page.screenshot(), contentType: 'image/png' });

    await page.getByRole('link', { name: 'See on Town' }).tap();
    const viewport = page.locator('.viewport');
    await expect(viewport).toHaveAttribute('data-season', 'summer');
    await expect(viewport).toHaveAttribute('data-day', 'night');
    await expect(viewport).toHaveAttribute('data-ambience', 'still');
    await expect(page.locator('.sound-status')).toContainText('Town sound is on');
    expect(await audioCreated(page)).toBe(0);
    await page.getByRole('button', { name: 'Play Town sound' }).tap();
    await expect(page.locator('.sound-status')).toContainText('stays quiet');
    expect(await audioCreated(page)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const scan = await new AxeBuilder({ page }).include('app-town').analyze();
    expect(scan.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    expect(await townFacts(page)).toEqual(before);
    await info.attach('town-scene-390-night', { body: await page.screenshot(), contentType: 'image/png' });
  });
});

test.describe('Town scene live ambience', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page, request }) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.addInitScript(() => {
      const marker = { created: 0 };
      const Original = window.AudioContext;
      function Wrapped(this: AudioContext): AudioContext {
        marker.created += 1;
        return new Original();
      }
      Wrapped.prototype = Original.prototype;
      Object.setPrototypeOf(Wrapped, Original);
      window.AudioContext = Wrapped as unknown as typeof AudioContext;
      Object.defineProperty(window, '__sceneAudioCreated', { value: marker });
    });
  });

  test('plays one tone only while the scene is visible and on screen', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'light'));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/settings/appearance');
    await page.locator('[data-town-season]').getByRole('checkbox', { name: 'Town sound' }).check();
    await page.getByRole('button', { name: 'Save season' }).click();
    await page.getByRole('link', { name: 'See on Town' }).click();
    const viewport = page.locator('.viewport');
    await expect(viewport).toHaveAttribute('data-ambience', 'live');
    expect(await page.locator('.idle-mark').evaluate(el => getComputedStyle(el).animationName)).toContain('scene-idle');
    expect(await audioCreated(page)).toBe(0);
    await viewport.evaluate(el => { el.style.marginTop = '3000px'; });
    await expect(viewport).toHaveAttribute('data-ambience', 'still');
    await page.getByRole('button', { name: 'Play Town sound' }).click();
    expect(await audioCreated(page)).toBe(0);
    await viewport.evaluate(el => { el.style.marginTop = ''; });
    await expect(viewport).toHaveAttribute('data-ambience', 'live');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(viewport).toHaveAttribute('data-ambience', 'still');
    await page.getByRole('button', { name: 'Play Town sound' }).click();
    expect(await audioCreated(page)).toBe(0);
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'visibilityState');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(viewport).toHaveAttribute('data-ambience', 'live');
    await page.getByRole('button', { name: 'Play Town sound' }).click();
    await expect(page.locator('.sound-status')).toContainText('Played one Town tone.');
    await expect.poll(() => audioCreated(page)).toBe(1);
    await page.waitForTimeout(400);
    expect(await audioCreated(page)).toBe(1);
  });
});
