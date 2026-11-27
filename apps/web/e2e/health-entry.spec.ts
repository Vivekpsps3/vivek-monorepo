import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { scenePreferenceKey } from '../src/app/platform/scene-appearance';
import { displayWeight, lbToKg, milesToMetres } from '../src/app/town/health/health-units';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from '../../../tests/e2e/synthetic-vault-harness';
import { expect, test, type Locator, type Page } from '../../../tests/e2e/fixtures';

const WEIGHT_ID = 'hlt_SyntheticWeightEntryAB';
const LIFT_ID = 'hlt_SyntheticLiftEntryABCD';
const CORRUPT_ID = 'hlt_CorruptRowNoticeABCDEF';
const CLINIC = `/town/clinic?entry=${WEIGHT_ID}`;
const DAY = '2026-10-28';

const SEED = {
  health_stats: [
    {
      client_id: WEIGHT_ID,
      v: 1,
      kind: 'weight',
      measured_on: DAY,
      logged_on: DAY,
      kg: 80,
    },
    {
      client_id: CORRUPT_ID,
      schema_version: 1,
      v: 1,
      kind: 'weight',
      measured_on: DAY,
      logged_on: DAY,
      kg: 64.25,
    },
  ],
  health_prs: [
    {
      client_id: LIFT_ID,
      v: 1,
      kind: 'lift',
      measured_on: DAY,
      logged_on: DAY,
      exercise: 'Squat',
      kg: 100,
      reps: 5,
    },
  ],
};

async function target(locator: Locator): Promise<void> {
  await expect.poll(async () => (await locator.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function activate(page: Page, locator: Locator, touch: boolean): Promise<void> {
  await expect(locator).toBeVisible();
  if (touch) {
    await locator.tap();
    return;
  }
  await locator.focus();
  await page.keyboard.press('Enter');
}

async function fromQuickAdd(page: Page, label: string, touch: boolean): Promise<void> {
  const quickAdd = page.getByRole('button', { name: 'Quick add', exact: true });
  const menu = page.getByRole('menu', { name: 'Quick add' });
  const action = menu.getByRole('menuitem', { name: label });
  if (touch) {
    await quickAdd.tap();
    await action.tap();
    return;
  }
  await quickAdd.focus();
  await page.keyboard.press('n');
  await expect(menu.getByRole('menuitem', { name: 'Plan a trip' })).toBeFocused();
  await page.keyboard.press(label[0].toLowerCase());
  await expect(action).toBeFocused();
  await page.keyboard.press('Enter');
}

// Setup writes a real synthetic vault. Give this case its own worker server.
const firstVaultTest = test.extend<{}, { serverURL: string }>({
  serverURL: [async ({ serverURL }, use) => { await use(serverURL); }, { scope: 'worker' }],
});

firstVaultTest.describe('Health Quick add with a new vault', () => {
  firstVaultTest.use({ viewport: { width: 390, height: 844 }, hasTouch: true, timezoneId: 'America/Los_Angeles' });
  firstVaultTest('Quick add starts a workout after setup and resumes the same saved draft after lock', async ({ page, request }, info) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.addInitScript(() => localStorage.setItem('suite-theme', 'dark'));
    await page.goto('/hub');
    await fromQuickAdd(page, 'Start or resume a workout', true);
    const room = page.locator('app-health-room');
    await expect(room).toHaveAttribute('data-health-state', 'setup');
    await activate(page, room.getByRole('link', { name: 'Set up Finance' }), true);
    await expect(page).toHaveURL(url => url.pathname === '/finance/vault/setup' && url.searchParams.get('next') === '/town/gym');
    await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
    await page.getByRole('textbox', { name: 'Confirm passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
    await activate(page, page.getByRole('button', { name: 'Create vault' }), true);
    const editor = page.getByRole('dialog', { name: 'Add session' });
    await expect(editor).toBeVisible({ timeout: 90_000 });
    await editor.locator('#health-workout-measured-on').fill(DAY);
    await editor.locator('#health-workout-name').fill('Synthetic harbor press');
    await editor.locator('#health-workout-load').fill('30');
    await editor.locator('#health-workout-reps').fill('5');
    await editor.getByRole('button', { name: 'Add set' }).click();
    await editor.locator('#health-workout-state').selectOption('draft');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    const draft = (await collectionCipher(page)).health_workouts;
    expect(draft).toHaveLength(1);

    await page.goto('/settings/finance');
    await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
    await expect(page.getByText('Finance locked.')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/hub');
    await fromQuickAdd(page, 'Start or resume a workout', false);
    await expect(room).toHaveAttribute('data-health-state', 'locked');
    await expect(room).not.toContainText('Synthetic harbor press');
    await expect(room.locator('#health-workout-name')).toHaveCount(0);
    await activate(page, room.getByRole('link', { name: 'Unlock' }), false);
    await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
    await activate(page, page.getByRole('button', { name: 'Unlock', exact: true }), false);
    const resumed = page.getByRole('dialog', { name: 'Resume session' });
    await expect(resumed.locator('#health-workout-name')).toHaveValue('Synthetic harbor press', { timeout: 90_000 });
    await expect(resumed.locator('[data-entered-set]')).toHaveCount(1);
    await info.attach('workout-resumed', { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/hub$/);
    expect((await collectionCipher(page)).health_workouts).toEqual(draft);
  });
});

function noMeasurementDigits(text: string): void {
  expect(text).not.toContain('176.4');
  expect(text).not.toContain('220.5');
  expect(text).not.toContain('64.25');
  expect(text).not.toContain('80.0');
  expect(text).not.toContain('Squat');
  expect(text).not.toMatch(/\d/);
}


async function firstScreen(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const bounds = await locator.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {
      fullHeight: (node as HTMLElement).offsetHeight,
      fits: rect.top >= 0 && rect.bottom <= window.innerHeight
        && rect.left >= 0 && rect.right <= window.innerWidth,
    };
  });
  expect(bounds.fullHeight).toBeGreaterThanOrEqual(44);
  expect(bounds.fits).toBe(true);
}

async function neutralPreview(room: Locator): Promise<void> {
  const scene = room.locator('#health-scene');
  await expect(scene).toBeVisible();
  await expect(scene.locator('.viewport[inert]')).toHaveCount(1);
  await expect(scene.getByRole('button')).toHaveCount(0);
  await expect(room.locator('main > .gate[role="status"]')).toHaveCount(1);
  await expect(room.locator('.notice, [data-health-series], [data-progress-key], [data-trophy]')).toHaveCount(0);
  await expect(room.locator('input, textarea, [data-gym-up]')).toHaveCount(0);
  noMeasurementDigits(await room.innerText());
}

for (const [width, height, theme] of [[390, 844, 'light'], [390, 844, 'dark'], [1280, 800, 'light'], [1280, 800, 'dark']] as const) {
  test.describe(`Health first screen ${width} ${theme}`, () => {
    const touch = width === 390;
    test.use({ viewport: { width, height }, hasTouch: touch });
    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    });

    test('shows the correct gate and preserves room coordinates for two synthetic owners', async ({ page }, info) => {
      await syntheticVault(page, SEED);
      await page.route('**/api/town**', route => route.continue());
      const room = page.locator('app-health-room');
      const gym = '/town/gym?entry=' + LIFT_ID + '&object=desk&up=cabinet';
      await page.goto('/town');
      const wellness = page.getByRole('button', { name: 'Wellness', exact: true });
      await activate(page, wellness, touch);
      await activate(page, page.getByRole('list', { name: 'Town buildings' })
        .getByRole('link', { name: /^Clinic/ }), touch);
      await expect(page).toHaveURL(/\/town\/clinic$/);
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      await firstScreen(room.getByRole('link', { name: 'Unlock' }));
      await neutralPreview(room);
      await info.attach('clinic-locked-after', { body: await page.screenshot(), contentType: 'image/png' });

      let statusCalls = 0;
      await page.route('**/api/vault/status', async route => {
        statusCalls += 1;
        if (statusCalls === 1) await route.fulfill({ status: 503, json: { detail: 'Fixture unavailable' } });
        else await route.fallback();
      });
      await page.goto(gym);
      await expect(room).toHaveAttribute('data-health-state', 'unavailable');
      await neutralPreview(room);
      const retry = room.getByRole('button', { name: 'Retry' });
      await firstScreen(retry);
      await activate(page, retry, touch);
      await expect(page).toHaveURL(url => url.pathname + url.search === gym);
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      const unlock = room.getByRole('link', { name: 'Unlock' });
      await firstScreen(unlock);
      await neutralPreview(room);
      await activate(page, unlock, touch);
      await expect(page).toHaveURL(url => url.pathname === '/finance/vault/unlock' && url.searchParams.get('next') === gym);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname + url.search === gym);
      await expect(room).toHaveAttribute('data-health-state', 'ready');
      await expect(room.getByRole('list', { name: 'Gym floor' }).getByRole('button', { name: 'Routine desk' }))
        .toHaveAttribute('aria-current', 'true');
      await expect(room.locator('#gym-up-object-title')).toHaveText('Record cabinet');
      await expect(room).toContainText('Squat');

      await page.route('**/api/auth/me', route => route.fulfill({
        json: { user: { id: 988, username: 'member', display_name: 'Synthetic member', role: 'user', is_active: true } },
      }));
      await page.route('**/api/vault/status', route => route.fulfill({ json: { exists: false } }));
      await page.reload();
      await expect(room).toHaveAttribute('data-health-state', 'setup');
      await neutralPreview(room);
      const setup = room.getByRole('link', { name: 'Set up Finance' });
      await firstScreen(setup);
      await info.attach('gym-other-owner-setup-after', { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, setup, touch);
      await expect(page).toHaveURL(url => url.pathname === '/finance/vault/setup' && url.searchParams.get('next') === gym);
    });

    test('opens the canonical editors before scrolling and keeps scene and records in reach', async ({ page }, info) => {
      const vault = await syntheticVault(page, { health_prs: SEED.health_prs });
      const room = page.locator('app-health-room');
      await page.goto('/town/clinic');
      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready');
      const add = room.getByRole('button', { name: 'Add weight', exact: true });
      await firstScreen(add);
      await info.attach('clinic-ready-after', { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, add, touch);
      const weight = page.getByRole('dialog', { name: 'Add weight', exact: true });
      await expect(weight.locator('#health-measured-on')).toBeFocused();
      await weight.locator('#health-weight').fill('155');
      await activate(page, weight.getByRole('button', { name: 'Cancel' }), touch);
      await expect(add).toBeFocused();

      await activate(page, room.getByRole('button', { name: 'Explore room' }), touch);
      await expect(room.locator('#health-scene')).toBeFocused();
      await activate(page, room.getByRole('list', { name: 'Clinic places' }).getByRole('button', { name: 'Weight station' }), touch);
      const station = room.getByRole('button', { name: 'Record weight' });
      await activate(page, station, touch);
      await expect(weight.locator('#health-weight')).toHaveValue('155');
      await activate(page, weight.getByRole('button', { name: 'Cancel' }), touch);
      await expect(station).toBeFocused();
      await activate(page, room.getByRole('button', { name: 'Clinic records' }), touch);
      await expect(room.getByRole('region', { name: 'Clinic records' })).toBeFocused();

      await activate(page, room.getByRole('link', { name: 'Gym' }), touch);
      await expect(room).toHaveAttribute('data-health-room', 'gym');
      await expect(room).toHaveAttribute('data-health-state', 'ready');
      const start = room.getByRole('button', { name: 'Start workout', exact: true });
      await firstScreen(start);
      await info.attach('gym-ready-after', { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, start, touch);
      const editor = page.getByRole('dialog', { name: 'Add session', exact: true });
      await editor.locator('#health-workout-name').fill('Synthetic first screen');
      await editor.locator('#health-workout-load').fill('30');
      await editor.locator('#health-workout-reps').fill('5');
      await activate(page, editor.getByRole('button', { name: 'Add set' }), touch);
      const set = editor.locator('[data-entered-set]');
      const setId = await set.getAttribute('data-entered-set');
      expect(setId).toMatch(/^wst_/);
      await editor.locator('#health-workout-state').selectOption('draft');
      vault.failNextWrites();
      const save = editor.getByRole('button', { name: 'Save', exact: true });
      await activate(page, save, touch);
      await expect(editor.getByRole('alert')).toContainText('Could not save this workout');
      await expect(set).toHaveAttribute('data-entered-set', setId!);
      await activate(page, editor.getByRole('button', { name: 'Cancel' }), touch);
      const resume = room.getByRole('button', { name: 'Resume workout', exact: true });
      await expect(resume).toBeFocused();
      await firstScreen(resume);
      await activate(page, resume, touch);
      await expect(set).toHaveAttribute('data-entered-set', setId!);
      await activate(page, save, touch);
      await expect(editor).toHaveCount(0);
      await expect(resume).toBeFocused();
      const stored = (await collectionCipher(page)).health_workouts;
      expect(stored).toHaveLength(1);

      await activate(page, room.getByRole('button', { name: 'Workouts', exact: true }), touch);
      await expect(room.getByRole('heading', { name: 'Workouts' })).toBeFocused();
      await expect(room.getByRole('button', { name: 'New session' })).toBeVisible();
      await activate(page, room.getByRole('button', { name: 'Records and trophies' }), touch);
      await expect(room.locator('#health-cabinet-title')).toBeFocused();
      await activate(page, room.getByRole('button', { name: 'Progress', exact: true }), touch);
      await expect(room.locator('#health-progress-title')).toBeFocused();
      await activate(page, room.getByRole('list', { name: 'Gym floor' }).getByRole('button', { name: 'Exercise station' }), touch);
      const record = room.getByRole('button', { name: 'Record sets' });
      await activate(page, record, touch);
      const resumed = page.getByRole('dialog', { name: 'Resume session' });
      await expect(resumed.locator('[data-entered-set]')).toHaveAttribute('data-entered-set', setId!);
      await activate(page, resumed.getByRole('button', { name: 'Cancel' }), touch);
      await expect(record).toBeFocused();
      expect((await collectionCipher(page)).health_workouts).toEqual(stored);
    });
  });
}

test.describe('Health first screen with enlarged text', () => {
  test.use({ viewport: { width: 320, height: 844 }, hasTouch: true });

  test('keeps setup and ready actions in bounds at 200% text', async ({ page, request }, info) => {
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => document.documentElement.style.fontSize = '200%');
    });
    const room = page.locator('app-health-room');
    await page.goto('/town/clinic');
    await expect(room).toHaveAttribute('data-health-state', 'setup');
    await expect.poll(() => page.locator('html').evaluate(node => getComputedStyle(node).fontSize)).toBe('32px');
    await firstScreen(room.getByRole('link', { name: 'Set up Finance' }));
    await neutralPreview(room);

    await syntheticVault(page, SEED);
    await page.goto('/town/gym');
    await expect(room).toHaveAttribute('data-health-state', 'locked');
    const unlock = room.getByRole('link', { name: 'Unlock' });
    await firstScreen(unlock);
    await unlock.tap();
    await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(room).toHaveAttribute('data-health-state', 'ready');
    await firstScreen(room.getByRole('button', { name: 'Start workout' }));
    expect(await page.locator('html').evaluate(node => node.scrollWidth)).toBeLessThanOrEqual(320);
    await info.attach('gym-enlarged-after', { body: await page.screenshot(), contentType: 'image/png' });
  });
});

for (const [width, height, theme] of [[1280, 800, 'light'], [390, 844, 'dark']] as const) {
  test.describe(`health entry at ${width} ${theme}`, () => {
    test.describe.configure({ timeout: 180_000 });
    test.use({
      viewport: { width, height },
      hasTouch: width === 390,
      timezoneId: 'America/Los_Angeles',
    });

    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    });

    test('Quick add carries a locked measurement through unlock and returns to the exact Hub', async ({ page }, info) => {
      const vault = await syntheticVault(page, SEED);
      const hub = '/hub/agenda?date=2026-10-28&sources=travel';
      await page.goto(hub);
      await fromQuickAdd(page, 'Record a measurement', width === 390);
      const room = page.locator('app-health-room');
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      await expect(room.getByRole('dialog')).toHaveCount(0);
      await expect(room).not.toContainText('176.4 lb');
      await info.attach('measurement-locked', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await page.reload();
      await activate(page, room.getByRole('link', { name: 'Unlock' }), width === 390);
      await expect(page).toHaveURL(url => url.pathname === '/finance/vault/unlock' && url.searchParams.get('next') === '/town/clinic');
      await page.reload();
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await activate(page, page.getByRole('button', { name: 'Unlock', exact: true }), width === 390);
      const dialog = page.getByRole('dialog', { name: 'Add weight' });
      await expect(dialog.locator('#health-measured-on')).toBeFocused();
      await info.attach('measurement-open', { body: await page.screenshot(), contentType: 'image/png' });
      await activate(page, dialog.getByRole('button', { name: 'Cancel' }), width === 390);
      await expect(page).toHaveURL(url => url.pathname + url.search === hub);
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

      await fromQuickAdd(page, 'Record a measurement', width === 390);
      await expect(dialog).toBeVisible();
      await dialog.locator('#health-measured-on').fill(DAY);
      const weight = dialog.locator('#health-weight');
      await weight.fill('155');
      const save = dialog.getByRole('button', { name: 'Save', exact: true });
      vault.failNextWrites();
      await activate(page, save, width === 390);
      await expect(dialog.getByRole('alert')).toHaveText('Could not save this entry. Try again.');
      await expect(weight).toHaveValue('155');
      await activate(page, save, width === 390);
      await expect(page).toHaveURL(url => url.pathname + url.search === hub);
      expect((await collectionCipher(page)).health_stats).toHaveLength(3);
      await page.goto('/town/clinic?healthQuickAdd=true');
      await expect(room).toHaveAttribute('data-health-state', 'ready');
      await expect(room.getByRole('dialog')).toHaveCount(0);
    });

    test('unlocks a locked measurement, keeps a failed draft, and shows the corrupt row', async ({ page }) => {
      const touch = width === 390;
      await syntheticVault(page, SEED);
      await page.goto(CLINIC);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const room = page.locator('app-health-room');
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      await expect(page).toHaveURL(url => url.pathname === '/town/clinic' && url.searchParams.get('entry') === WEIGHT_ID);
      expect(page.url().split('?')[1] ?? '').not.toMatch(/\d/);
      const locked = await room.evaluate(node => ({
        text: (node as HTMLElement).innerText,
        inputs: [...node.querySelectorAll('input, textarea')].map(item => (item as HTMLInputElement).value),
      }));
      noMeasurementDigits(locked.text);
      expect(locked.inputs.join('')).not.toMatch(/\d/);
      const unlock = room.getByRole('link', { name: 'Unlock' });
      await target(unlock);
      await target(room.getByRole('link', { name: 'Hub' }));
      await target(room.getByRole('link', { name: 'Clinic' }));
      await target(room.getByRole('link', { name: 'Gym' }));
      const motion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');
      await activate(page, unlock, touch);
      await expect(page).toHaveURL(url => url.pathname === '/finance/vault/unlock'
        && url.searchParams.get('next') === CLINIC);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === '/town/clinic' && url.searchParams.get('entry') === WEIGHT_ID, { timeout: 90_000 });
      await expect(room).toHaveAttribute('data-health-state', 'ready');
      await expect(room).toContainText('176.4 lb');
      await expect(room).toContainText('1 saved entry could not be read. It stays in the vault.');
      await expect(room).not.toContainText('64.25');
      await expect(room).not.toContainText('Squat');
      await expect(room.locator(`#health-entry-${WEIGHT_ID}`)).toHaveAttribute('aria-current', 'true');
      const row = room.locator(`#health-entry-${WEIGHT_ID}`);
      await target(row);
      expect((await row.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);
      await target(room.getByRole('radio', { name: 'Pounds' }));
      await target(room.getByRole('radio', { name: 'Kilograms' }));
      const readyMotion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(readyMotion).toBe('0s');
      const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

      const add = room.getByRole('button', { name: 'Add weight' });
      await target(add);
      await activate(page, add, touch);
      const dialog = page.getByRole('dialog', { name: 'Add weight' });
      await expect(dialog).toBeVisible();
      const date = dialog.locator('#health-measured-on');
      const weight = dialog.locator('#health-weight');
      await expect(date).toBeFocused();
      await target(date);
      await target(weight);
      if (touch) {
        await date.tap();
        await date.fill(DAY);
        await weight.tap();
        await weight.fill('1');
        await dialog.getByRole('button', { name: 'Save' }).tap();
      } else {
        await date.fill(DAY);
        // Chromium's date field keeps Tab inside its month, day, and year stops.
        for (let step = 0; step < 6 && await weight.evaluate(node => node !== document.activeElement); step += 1) {
          await page.keyboard.press('Tab');
        }
        await expect(weight).toBeFocused();
        await page.keyboard.type('1');
        await page.keyboard.press('Enter');
      }
      await expect(weight).toBeFocused();
      await expect(weight).toHaveValue('1');
      await expect(weight).toHaveAttribute('aria-invalid', 'true');
      await expect(dialog).toContainText('That value is outside the allowed range.');
      await expect(dialog).not.toContainText('64.25');
      const invalid = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(invalid.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(add).toBeFocused();
      await activate(page, add, touch);
      await expect(weight).toHaveValue('1');
      await expect(date).toHaveValue(DAY);
      await page.keyboard.press('Escape');
      await expect(add).toBeFocused();

      const gym = room.getByRole('link', { name: 'Gym' });
      await activate(page, gym, touch);
      await expect(page).toHaveURL(/\/town\/gym$/);
      await expect(room).toHaveAttribute('data-health-room', 'gym');
      await expect(room).toHaveAttribute('data-health-state', 'ready');
      await expect(room).toContainText('220.5 lb');
      await expect(room).toContainText('Squat');
      await expect(room).not.toContainText('176.4');
      await expect(room).not.toContainText('64.25');
      await expect(room.locator('#health-weight')).toHaveCount(0);
      await target(room.locator(`#health-entry-${LIFT_ID}`));
    });

    test('opens Finance setup for the same clinic entry', async ({ page }) => {
      await syntheticVault(page, SEED);
      await page.route('**/api/vault/status', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ exists: false }),
      }));
      await page.goto(CLINIC);
      const room = page.locator('app-health-room');
      await expect(room).toHaveAttribute('data-health-state', 'setup');
      const locked = await room.evaluate(node => (node as HTMLElement).innerText);
      noMeasurementDigits(locked);
      const setup = room.getByRole('link', { name: 'Set up Finance' });
      await target(setup);
      if (width === 390) await setup.tap();
      else await setup.click();
      await expect(page).toHaveURL(url => url.pathname === '/finance/vault/setup' && url.searchParams.get('next') === CLINIC);
    });

    test('corrects vitals from clinic stations without rewriting a display-unit change', async ({ page }) => {
      test.setTimeout(180_000);
      const touch = width === 390;
      const older = '2026-10-01';
      const olderId = historyId('W', 1);
      const rhrId = historyId('R', 1);
      const bpId = historyId('B', 1);
      const sleepId = historyId('S', 1);
      await syntheticVault(page, {
        health_stats: [
          ...SEED.health_stats,
          { client_id: olderId, v: 1, kind: 'weight', measured_on: older, logged_on: older, kg: 75 },
          { client_id: rhrId, v: 1, kind: 'rhr', measured_on: DAY, logged_on: DAY, bpm: 62 },
          { client_id: bpId, v: 1, kind: 'bp', measured_on: DAY, logged_on: DAY, sys: 118, dia: 76 },
          { client_id: sleepId, v: 1, kind: 'sleep', measured_on: DAY, logged_on: DAY, hours: 7.25 },
          {
            client_id: historyId('L', 1),
            v: 1,
            kind: 'lab',
            measured_on: DAY,
            logged_on: DAY,
            lab: { name: 'Omega marker', value: 15, unit: 'u', ref_low: 10, ref_high: 20 },
          },
        ],
        health_prs: SEED.health_prs,
      });
      const room = page.locator('app-health-room');
      const stations = ['reception', 'weight', 'rhr', 'bp', 'labs', 'checkups', 'sleep'];
      for (const station of stations) {
        await page.goto(CLINIC + '&object=' + station);
        await expect(room).toHaveAttribute('data-health-state', 'locked');
        await expect(room.locator('app-clinic-room')).toHaveAttribute('data-clinic-room', 'locked');
        await neutralPreview(room);
        await expect(room.locator('[data-clinic-history]')).toHaveCount(0);
      }
      await expect(page).toHaveURL(url => url.searchParams.get('object') === 'sleep');
      expect(page.url()).not.toMatch(/scale=|[?&]x=|[?&]y=/);

      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(page).toHaveURL(url => url.pathname + url.search === CLINIC + '&object=sleep');
      await expect(room.locator('#clinic-object-title')).toHaveText('Sleep station');
      const choose = async (name: string, objectId: string) => {
        const choice = room.locator('.clinic-objects').getByRole('button', { name, exact: true });
        await target(choice);
        await activate(page, choice, touch);
        await expect(room.locator('#clinic-object-title')).toContainText(name);
        await expect(page).toHaveURL(url => url.searchParams.get('object') === objectId);
      };
      const snapshot = async (clientId: string) => page.evaluate(async id => {
        const response = await fetch('/api/vault/records?collection=health_stats');
        const rows = await response.json() as Array<{ client_id: string; ciphertext_b64: string; revision: number }>;
        return rows.find(item => item.client_id === id) ?? null;
      }, clientId);

      await choose('Weight station', 'weight');
      await expect(room.locator('[data-clinic-date="weight"]')).toHaveText(`Measured on ${DAY}`);
      await expect(room.locator('[data-clinic-unit="weight"]')).toHaveText('Shown in pounds. Stored in kilograms.');
      await expect(room.locator('[data-clinic-history="weight"] [data-health-latest="weight"]')).toContainText('176.4 lb');
      await expect(room.locator('[data-clinic-history="weight"]')).toContainText(older);
      await expect(room.locator('[data-health-group="health-group-measurements"] [data-health-series="weight"]')).toHaveCount(0);
      await expect(room.locator('[data-health-sparkline="lab"]')).toContainText('in range');
      const stored = await snapshot(WEIGHT_ID);
      const olderStored = await snapshot(olderId);
      expect(stored?.revision).toBe(1);
      await activate(page, room.getByRole('radio', { name: 'Kilograms' }), touch);
      await expect(room.locator('[data-clinic-history="weight"] [data-health-latest="weight"]')).toContainText('80.0 kg');
      await expect(room.locator('[data-clinic-unit="weight"]')).toHaveText('Shown in kilograms. Stored in kilograms.');
      await expect(room.locator('[data-clinic-date="weight"]')).toHaveText(`Measured on ${DAY}`);
      expect(await snapshot(WEIGHT_ID)).toEqual(stored);
      expect(await snapshot(olderId)).toEqual(olderStored);
      await activate(page, room.getByRole('button', { name: 'Zoom in', exact: true }), touch);
      await expect(page).toHaveURL(url => url.searchParams.get('object') === 'weight' && url.searchParams.get('scale') == null);

      const edit = room.locator('[data-clinic-history="weight"]').getByRole('button', { name: 'Edit Weight · 80.0 kg · 2026-10-28' });
      await target(edit);
      await activate(page, edit, touch);
      const editor = page.getByRole('dialog', { name: 'Edit weight' });
      await expect(editor).toBeVisible();
      await enter(page, editor.locator('#health-weight'), '70', touch);
      if (touch) await editor.getByRole('button', { name: 'Save' }).tap();
      else await editor.getByRole('button', { name: 'Save' }).click();
      await expect(editor).toHaveCount(0);
      await expect(room.locator('[data-clinic-history="weight"]')).toContainText(`Weight · 70.0 kg · ${DAY}`);
      const corrected = await snapshot(WEIGHT_ID);
      expect(corrected?.revision).toBe(2);
      expect(corrected?.ciphertext_b64).not.toBe(stored?.ciphertext_b64);
      expect(await snapshot(olderId)).toEqual(olderStored);
      await activate(page, room.getByRole('radio', { name: 'Pounds' }), touch);
      await expect(room.locator('[data-clinic-history="weight"]')).toContainText(`${displayWeight(70, 'lb')} lb`);
      expect(await snapshot(WEIGHT_ID)).toEqual(corrected);
      expect(await snapshot(olderId)).toEqual(olderStored);

      await choose('Heart rate station', 'rhr');
      await expect(room.locator('[data-clinic-unit="rhr"]')).toHaveText('Shown in beats per minute.');
      await expect(room.locator('[data-clinic-date="rhr"]')).toHaveText(`Measured on ${DAY}`);
      await expect(room.locator('[data-clinic-history="rhr"]')).toContainText('62 bpm');
      const heart = room.locator('[data-clinic-history="rhr"]').getByRole('button', { name: `Edit Resting heart rate · 62 bpm · ${DAY}` });
      await activate(page, heart, touch);
      const heartDialog = page.getByRole('dialog', { name: 'Edit resting heart rate' });
      await enter(page, heartDialog.locator('#health-bpm'), '64', touch);
      if (touch) await heartDialog.getByRole('button', { name: 'Save' }).tap();
      else await heartDialog.getByRole('button', { name: 'Save' }).click();
      await expect(room.locator('[data-clinic-history="rhr"]')).toContainText(`Resting heart rate · 64 bpm · ${DAY}`);
      expect((await snapshot(rhrId))?.revision).toBe(2);
      expect(await snapshot(WEIGHT_ID)).toEqual(corrected);

      await choose('Blood pressure station', 'bp');
      await expect(room.locator('[data-clinic-unit="bp"]')).toContainText('millimetres of mercury');
      await expect(room.locator('[data-clinic-history="bp"]')).toContainText('118/76');
      const pressure = room.locator('[data-clinic-history="bp"]').getByRole('button', { name: `Edit Blood pressure · 118/76 · ${DAY}` });
      await activate(page, pressure, touch);
      const pressureDialog = page.getByRole('dialog', { name: 'Edit blood pressure' });
      await enter(page, pressureDialog.locator('#health-systolic'), '120', touch);
      await enter(page, pressureDialog.locator('#health-diastolic'), '80', touch);
      if (touch) await pressureDialog.getByRole('button', { name: 'Save' }).tap();
      else await pressureDialog.getByRole('button', { name: 'Save' }).click();
      await expect(room.locator('[data-clinic-history="bp"]')).toContainText(`Blood pressure · 120/80 · ${DAY}`);
      expect((await snapshot(bpId))?.revision).toBe(2);
      expect(await snapshot(WEIGHT_ID)).toEqual(corrected);

      await choose('Sleep station', 'sleep');
      await expect(room.locator('[data-clinic-unit="sleep"]')).toHaveText('Shown in hours.');
      await expect(room.locator('[data-clinic-history="sleep"]')).toContainText('7.25 h');
      const sleep = room.locator('[data-clinic-history="sleep"]').getByRole('button', { name: `Edit Sleep · 7.25 h · ${DAY}` });
      await activate(page, sleep, touch);
      const sleepDialog = page.getByRole('dialog', { name: 'Edit sleep' });
      await enter(page, sleepDialog.locator('#health-sleep'), '7.5', touch);
      if (touch) await sleepDialog.getByRole('button', { name: 'Save' }).tap();
      else await sleepDialog.getByRole('button', { name: 'Save' }).click();
      await expect(room.locator('[data-clinic-history="sleep"]')).toContainText(`Sleep · 7.5 h · ${DAY}`);
      expect((await snapshot(sleepId))?.revision).toBe(2);
      expect(await snapshot(WEIGHT_ID)).toEqual(corrected);
      expect(await snapshot(olderId)).toEqual(olderStored);

      await choose('Reception', 'reception');
      await expect(room.locator('[data-clinic-reception="weight"]')).toContainText(`${displayWeight(70, 'lb')} lb`);
      await expect(room.locator('[data-clinic-reception="weight"]')).toContainText(`Measured on ${DAY}`);
      await expect(room.locator('[data-clinic-reception="rhr"]')).toContainText('64 bpm');
      await expect(room.locator('[data-clinic-reception="bp"]')).toContainText('120/80');
      await expect(room.locator('[data-clinic-reception="sleep"]')).toContainText('7.5 h');
      await expect(room.locator('[data-clinic-history]')).toHaveCount(0);
      const motion = await room.locator('app-clinic-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');
      const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });

    test('saves, reopens, and deletes each vital in both units', async ({ page }) => {
      test.setTimeout(240_000);
      const touch = width === 390;
      const writes: Array<{ expected: number | null }> = [];
      let failUpsert = false;
      let failDelete = false;
      await page.route('**/api/vault/records/upsert', async route => {
        const body = route.request().postDataJSON() as { records?: Array<{ collection?: string; expected_revision?: number | null }> };
        const health = (body.records ?? []).filter(record => record.collection === 'health_stats');
        if (failUpsert && health.length > 0) {
          failUpsert = false;
          writes.push({ expected: health[0].expected_revision ?? null });
          await route.fulfill({ status: 409, contentType: 'application/json', body: '{"detail":"Revision conflict"}' });
          return;
        }
        for (const record of health) writes.push({ expected: record.expected_revision ?? null });
        await route.fallback();
      });
      await page.route('**/api/vault/records/delete', async route => {
        if (failDelete) {
          failDelete = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Synthetic delete failed"}' });
          return;
        }
        await route.fallback();
      });
      await syntheticVault(page, SEED);
      await page.goto(CLINIC);
      const room = page.locator('app-health-room');
      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(room).toContainText('176.4 lb');

      const snapshot = async () => page.evaluate(async () => {
        const response = await fetch('/api/vault/records?collection=health_stats');
        const rows = await response.json() as Array<{ client_id: string; ciphertext_b64: string; revision: number }>;
        return rows.find(item => item.client_id === 'hlt_SyntheticWeightEntryAB') ?? null;
      });
      const saved = await snapshot();
      expect(saved?.revision).toBe(1);
      const ciphertext = saved?.ciphertext_b64;
      await activate(page, room.getByRole('radio', { name: 'Kilograms' }), touch);
      await expect(room).toContainText('80.0 kg');
      expect(await snapshot()).toEqual(saved);
      await activate(page, room.getByRole('radio', { name: 'Pounds' }), touch);
      await expect(room).toContainText('176.4 lb');
      expect(writes).toEqual([]);

      const edit = room.getByRole('button', { name: 'Edit Weight · 176.4 lb · 2026-10-28' });
      await target(edit);
      await activate(page, edit, touch);
      const editor = page.getByRole('dialog', { name: 'Edit weight' });
      await expect(editor).toBeVisible();
      await expect(editor.locator('#health-logged-on')).toContainText(DAY);
      await expect(editor.locator('#health-weight')).toHaveValue('176.4');
      if (touch) await editor.getByRole('button', { name: 'Save' }).tap();
      else await editor.getByRole('button', { name: 'Save' }).click();
      await expect(editor).toHaveCount(0);
      expect(writes).toEqual([]);
      expect(await snapshot()).toEqual(saved);

      const createdLb = displayWeight(lbToKg(200), 'lb');
      const createdKg = displayWeight(lbToKg(200), 'kg');
      const seventyLb = displayWeight(70, 'lb');
      await saveVital(page, room, touch, 'Add resting heart rate', 'Add resting heart rate', async dialog => {
        await enter(page, dialog.locator('#health-bpm'), '62', touch);
      }, `Resting heart rate · 62 bpm · ${DAY}`);
      await saveVital(page, room, touch, 'Add blood pressure', 'Add blood pressure', async dialog => {
        await enter(page, dialog.locator('#health-systolic'), '80', touch);
        await enter(page, dialog.locator('#health-diastolic'), '90', touch);
        if (touch) await dialog.getByRole('button', { name: 'Save' }).tap();
        else {
          await dialog.locator('#health-diastolic').focus();
          await page.keyboard.press('Enter');
        }
        await expect(dialog.locator('#health-systolic')).toBeFocused();
        await expect(dialog).toContainText('Systolic must be higher than diastolic.');
        await enter(page, dialog.locator('#health-systolic'), '118', touch);
        await enter(page, dialog.locator('#health-diastolic'), '76', touch);
      }, `Blood pressure · 118/76 · ${DAY}`);
      await saveVital(page, room, touch, 'Add sleep', 'Add sleep', async dialog => {
        await enter(page, dialog.locator('#health-sleep'), '7.3', touch);
        if (touch) await dialog.getByRole('button', { name: 'Save' }).tap();
        else await page.keyboard.press('Enter');
        await expect(dialog.locator('#health-sleep')).toBeFocused();
        await expect(dialog).toContainText('Use a quarter-hour step.');
        await enter(page, dialog.locator('#health-sleep'), '7.25', touch);
      }, `Sleep · 7.25 h · ${DAY}`);
      await saveVital(page, room, touch, 'Add weight', 'Add weight', async dialog => {
        await expect(dialog.locator('#health-logged-on')).toContainText('2026-10-29');
        await enter(page, dialog.locator('#health-weight'), '200', touch);
      }, `Weight · ${createdLb} lb · ${DAY}`);
      expect(writes.every(item => item.expected === null)).toBe(true);
      expect((await snapshot())?.ciphertext_b64).toBe(ciphertext);

      await activate(page, room.getByRole('radio', { name: 'Kilograms' }), touch);
      await expect(room).toContainText('80.0 kg');
      await expect(room).toContainText(`Weight · ${createdKg} kg · ${DAY}`);
      expect((await snapshot())?.ciphertext_b64).toBe(ciphertext);
      await saveVital(page, room, touch, 'Add weight', 'Add weight', async dialog => {
        await enter(page, dialog.locator('#health-weight'), '70', touch);
      }, `Weight · 70.0 kg · ${DAY}`);
      await activate(page, room.getByRole('radio', { name: 'Pounds' }), touch);
      await expect(room).toContainText('176.4 lb');
      await expect(room).toContainText(`Weight · ${createdLb} lb · ${DAY}`);
      await expect(room).toContainText(`Weight · ${seventyLb} lb · ${DAY}`);

      const heart = room.getByRole('button', { name: `Edit Resting heart rate · 62 bpm · ${DAY}` });
      await activate(page, heart, touch);
      const heartDialog = page.getByRole('dialog', { name: 'Edit resting heart rate' });
      await enter(page, heartDialog.locator('#health-bpm'), '64', touch);
      if (touch) await heartDialog.getByRole('button', { name: 'Save' }).tap();
      else await heartDialog.getByRole('button', { name: 'Save' }).click();
      await expect(room).toContainText(`Resting heart rate · 64 bpm · ${DAY}`);
      await expect(room).not.toContainText('62 bpm');
      const revised = await snapshot();
      expect(revised?.revision).toBe(1);
      expect(revised?.ciphertext_b64).toBe(ciphertext);

      await activate(page, room.getByRole('button', { name: 'Edit Weight · 176.4 lb · 2026-10-28' }), touch);
      const weightDialog = page.getByRole('dialog', { name: 'Edit weight' });
      await enter(page, weightDialog.locator('#health-weight'), '150', touch);
      failUpsert = true;
      if (touch) await weightDialog.getByRole('button', { name: 'Save' }).tap();
      else await weightDialog.getByRole('button', { name: 'Save' }).click();
      await expect(weightDialog.locator('#health-form-error')).toBeFocused();
      await expect(weightDialog).toContainText('This entry changed in another tab. Reload and try again.');
      await expect(weightDialog.locator('#health-weight')).toHaveValue('150');
      await expect(room).toContainText('176.4 lb');
      expect(writes.at(-1)?.expected).toBe(1);
      expect(await snapshot()).toEqual(revised);
      await page.keyboard.press('Escape');
      await expect(weightDialog).toHaveCount(0);

      const sleepDelete = room.getByRole('button', { name: `Delete Sleep · 7.25 h · ${DAY}` });
      await target(sleepDelete);
      await activate(page, sleepDelete, touch);
      const confirm = page.getByRole('dialog', { name: 'Delete this measurement?' });
      await expect(confirm).toContainText('DELETE SLEEP');
      await confirm.locator('#confirm-phrase-field').fill('DELETE');
      const blocked = confirm.getByRole('button', { name: 'Delete measurement' });
      await expect(blocked).toHaveAttribute('aria-disabled', 'true');
      await expect(confirm).toBeVisible();
      await expect(room).toContainText(`Sleep · 7.25 h · ${DAY}`);
      await confirm.locator('#confirm-phrase-field').fill('DELETE SLEEP');
      if (touch) await confirm.getByRole('button', { name: 'Delete measurement' }).tap();
      else await page.keyboard.press('Enter');
      await expect(confirm).toHaveCount(0);
      await expect(room).not.toContainText('7.25 h');

      failDelete = true;
      await activate(page, room.getByRole('button', { name: `Delete Resting heart rate · 64 bpm · ${DAY}` }), touch);
      const failed = page.getByRole('dialog', { name: 'Delete this measurement?' });
      await failed.locator('#confirm-phrase-field').fill('DELETE HEART RATE');
      if (touch) await failed.getByRole('button', { name: 'Delete measurement' }).tap();
      else await failed.getByRole('button', { name: 'Delete measurement' }).click();
      await expect(failed).toContainText('Could not delete this entry. It is still saved. Try again.');
      await expect(failed.locator('#confirm-phrase-field')).toBeFocused();
      await expect(room).toContainText('64 bpm');
      if (touch) await failed.getByRole('button', { name: 'Keep measurement' }).tap();
      else await failed.getByRole('button', { name: 'Keep measurement' }).click();
      await expect(room.getByRole('button', { name: `Delete Resting heart rate · 64 bpm · ${DAY}` })).toBeFocused();

      const readyMotion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(readyMotion).toBe('0s');
      await target(room.getByRole('button', { name: 'Add sleep' }));
      await target(room.getByRole('button', { name: 'Add blood pressure' }));
      const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

      await page.reload();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(room).toContainText('176.4 lb');
      await expect(room).toContainText(`Weight · ${createdLb} lb · ${DAY}`);
      await expect(room).toContainText(`Weight · ${seventyLb} lb · ${DAY}`);
      await expect(room).toContainText('64 bpm');
      await expect(room).toContainText('118/76');
      await expect(room).not.toContainText('7.25 h');
      await expect(room).not.toContainText('62 bpm');
    });

    test('saves each lab range and a checkup without putting the name on Town requests', async ({ page }) => {
      test.setTimeout(240_000);
      const touch = width === 390;
      const marker = 'Ω-marker';
      const other = 'Ω-other';
      const held = 'Ω-held';
      const town: string[] = [];
      const vaultBodies: string[] = [];
      page.on('request', request => {
        const url = new URL(request.url());
        const body = request.postData() ?? '';
        if (url.pathname.startsWith('/api/town')) town.push(`${request.method()} ${url.pathname}${url.search}\n${body}`);
        if (url.pathname.startsWith('/api/vault/records')) vaultBodies.push(body);
      });
      let failUpsert = false;
      await page.route('**/api/vault/records/upsert', async route => {
        if (failUpsert) {
          failUpsert = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Synthetic save failed"}' });
          return;
        }
        await route.fallback();
      });
      const labId = 'hlt_SyntheticLabEntryABCD';
      await syntheticVault(page, {
        ...SEED,
        health_stats: [
          ...SEED.health_stats,
          {
            client_id: labId,
            v: 1,
            kind: 'lab',
            measured_on: DAY,
            logged_on: DAY,
            lab: { name: marker, value: 9, unit: 'u', ref_low: 10, ref_high: 20 },
          },
        ],
      });
      await page.goto(CLINIC);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const room = page.locator('app-health-room');
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      const locked = await room.evaluate(node => ({
        text: (node as HTMLElement).innerText,
        fields: [...node.querySelectorAll('input, textarea')].map(item => (item as HTMLInputElement).value).join(''),
      }));
      expect(locked.text).not.toContain(marker);
      expect(locked.text).not.toContain('below range');
      expect(locked.fields).not.toContain('Ω');
      noMeasurementDigits(locked.text);
      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      const seeded = `Lab · ${marker} · 9 u · below range · 10 to 20 u · ${DAY}`;
      await expect(room.getByRole('heading', { name: 'Lab results' })).toBeVisible();
      await expect(room.getByRole('heading', { name: marker })).toBeVisible();
      await expect(room).toContainText(seeded);

      const addLab = room.getByRole('button', { name: 'Add lab result', exact: true });
      await target(addLab);
      await activate(page, addLab, touch);
      const draft = page.getByRole('dialog', { name: 'Add lab result' });
      await expect(draft.locator('#health-measured-on')).toBeFocused();
      await target(draft.locator('#health-lab-name'));
      await target(draft.locator('#health-lab-value'));
      await target(draft.locator('#health-lab-unit'));
      await target(draft.locator('#health-lab-ref-low'));
      await target(draft.locator('#health-lab-ref-high'));
      if (touch) await draft.locator('#health-measured-on').tap();
      await draft.locator('#health-measured-on').fill(DAY);
      await enter(page, draft.locator('#health-lab-name'), marker, touch);
      await enter(page, draft.locator('#health-lab-value'), '8', touch);
      await enter(page, draft.locator('#health-lab-unit'), 'u', touch);
      await enter(page, draft.locator('#health-lab-ref-low'), '20', touch);
      await enter(page, draft.locator('#health-lab-ref-high'), '10', touch);
      if (touch) await draft.getByRole('button', { name: 'Save' }).tap();
      else await draft.getByRole('button', { name: 'Save' }).click();
      await expect(draft.locator('#health-lab-ref-high')).toBeFocused();
      await expect(draft).toContainText('The high end of the range must be above the low end.');
      await enter(page, draft.locator('#health-lab-ref-low'), '10', touch);
      await enter(page, draft.locator('#health-lab-ref-high'), '20', touch);
      if (touch) await draft.getByRole('button', { name: 'Save' }).tap();
      else await draft.getByRole('button', { name: 'Save' }).click();
      await expect(draft).toHaveCount(0);
      await expect(room).toContainText(`Lab · ${marker} · 8 u · below range · 10 to 20 u · ${DAY}`);

      await saveLab(page, room, touch, marker, '15', '10', '20', `Lab · ${marker} · 15 u · in range · 10 to 20 u · ${DAY}`);
      await saveLab(page, room, touch, marker, '21', '10', '20', `Lab · ${marker} · 21 u · above range · 10 to 20 u · ${DAY}`);
      await saveLab(page, room, touch, other, '4', '', '', `Lab · ${other} · 4 u · no range · ${DAY}`);
      await expect(room.getByRole('heading', { name: marker })).toBeVisible();
      await expect(room.getByRole('heading', { name: other })).toBeVisible();
      await saveVital(page, room, touch, 'Add checkup', 'Add checkup', async dialog => {
        await target(dialog.locator('#health-checkup-note'));
        await enter(page, dialog.locator('#health-checkup-note'), 'Synthetic visit note', touch);
      }, `Checkup · Synthetic visit note · ${DAY}`);
      await expect(room.getByRole('heading', { name: 'Checkups' })).toBeVisible();

      const edit = room.getByRole('button', { name: `Edit Lab · ${other} · 4 u · no range · ${DAY}` });
      await target(edit);
      await activate(page, edit, touch);
      const editor = page.getByRole('dialog', { name: 'Edit lab result' });
      await enter(page, editor.locator('#health-lab-name'), held, touch);
      failUpsert = true;
      if (touch) await editor.getByRole('button', { name: 'Save' }).tap();
      else await editor.getByRole('button', { name: 'Save' }).click();
      await expect(editor.locator('#health-form-error')).toBeFocused();
      await expect(editor).toContainText('Could not save this entry. Try again.');
      await expect(editor.locator('#health-lab-name')).toHaveValue(held);
      await expect(room).toContainText(`Lab · ${other} · 4 u · no range · ${DAY}`);
      await page.keyboard.press('Escape');
      await expect(editor).toHaveCount(0);
      await expect(edit).toBeFocused();
      await expect(room).not.toContainText(held);

      const readyMotion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(readyMotion).toBe('0s');
      await target(room.getByRole('button', { name: 'Add checkup', exact: true }));
      await target(room.getByRole('button', { name: `Delete Lab · ${other} · 4 u · no range · ${DAY}` }));
      const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

      const privateText = [marker, other, held];
      for (const entry of town) {
        for (const secret of privateText) expect(entry).not.toContain(secret);
      }
      for (const body of vaultBodies) {
        for (const secret of privateText) expect(body).not.toContain(secret);
      }
      const townUrls = await page.evaluate(() => performance.getEntriesByType('resource')
        .map(entry => entry.name)
        .filter(name => name.includes('/api/town')));
      for (const name of townUrls) {
        for (const secret of privateText) expect(name).not.toContain(secret);
      }
      await page.reload();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(room).toContainText(seeded);
      await expect(room).toContainText(`Lab · ${marker} · 15 u · in range · 10 to 20 u · ${DAY}`);
      await expect(room).toContainText(`Lab · ${marker} · 21 u · above range · 10 to 20 u · ${DAY}`);
      await expect(room).toContainText(`Lab · ${other} · 4 u · no range · ${DAY}`);
      await expect(room).toContainText(`Checkup · Synthetic visit note · ${DAY}`);
      await expect(room).not.toContainText(held);
    });

    test('pages weight history and keeps stored values when units or theme change', async ({ page }) => {
      test.setTimeout(240_000);
      const touch = width === 390;
      const count = 101;
      const newestIndex = count - 1;
      const newestDay = historyDay(newestIndex);
      const oldestDay = historyDay(0);
      const newestLb = `Weight · ${displayWeight(140, 'lb')} lb · ${newestDay}`;
      const oldestLb = `Weight · ${displayWeight(40, 'lb')} lb · ${oldestDay}`;
      const sparkStart = historyDay(89);
      await syntheticVault(page, {
        health_stats: [
          ...Array.from({ length: count }, (_, index) => ({
            client_id: historyId('W', index),
            v: 1,
            kind: 'weight',
            measured_on: historyDay(index),
            logged_on: historyDay(index),
            kg: 40 + index,
          })),
          { client_id: historyId('R', 1), v: 1, kind: 'rhr', measured_on: newestDay, logged_on: newestDay, bpm: 62 },
          { client_id: historyId('B', 1), v: 1, kind: 'bp', measured_on: newestDay, logged_on: newestDay, sys: 118, dia: 76 },
          { client_id: historyId('S', 1), v: 1, kind: 'sleep', measured_on: newestDay, logged_on: newestDay, hours: 7.25 },
          {
            client_id: historyId('L', 1),
            v: 1,
            kind: 'lab',
            measured_on: newestDay,
            logged_on: newestDay,
            lab: { name: 'Ω-marker', value: 9, unit: 'u', ref_low: 10, ref_high: 20 },
          },
          {
            client_id: historyId('C', 1),
            v: 1,
            kind: 'checkup',
            measured_on: newestDay,
            logged_on: newestDay,
            note: 'Synthetic visit note',
          },
          {
            client_id: CORRUPT_ID,
            schema_version: 1,
            v: 1,
            kind: 'weight',
            measured_on: newestDay,
            logged_on: newestDay,
            kg: 64.25,
          },
        ],
        health_prs: SEED.health_prs,
      });
      await page.goto('/town/clinic');
      const room = page.locator('app-health-room');
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      noMeasurementDigits(await room.evaluate(node => (node as HTMLElement).innerText));
      await expect(room).not.toContainText('Ω-marker');
      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(room.locator('[data-health-latest="weight"]')).toHaveText(`Latest · ${newestLb}`);
      await expect(room.locator('[data-health-series="weight"]')).toHaveAttribute('data-health-shown', '100');
      await expect(room.locator('[data-health-series="weight"]')).toHaveAttribute('data-health-total', '101');
      const spark = room.locator('[data-health-sparkline="weight"]');
      await expect(spark.locator('li')).toHaveCount(12);
      await expect(spark.locator('li').first()).toContainText(sparkStart);
      await expect(spark.locator('li').last()).toHaveText(newestLb);
      await expect(spark).not.toContainText(oldestDay);
      await expect(room.locator(`#health-entry-${historyId('W', 0)}`)).toHaveCount(0);
      await expect(room.locator('[data-health-latest="rhr"]')).toContainText('62 bpm');
      await expect(room.locator('[data-health-sparkline="bp"]')).toContainText('118/76');
      await expect(room.locator('[data-health-sparkline="sleep"]')).toContainText('7.25 h');
      await expect(room.locator('[data-health-sparkline="lab"]')).toContainText('Ω-marker');
      await expect(room.locator('[data-health-sparkline="lab"]')).toContainText('below range');
      await expect(room.locator('[data-health-sparkline="checkup"]')).toContainText('Synthetic visit note');
      await expect(room).toContainText('1 saved entry could not be read. It stays in the vault.');
      await expect(room).not.toContainText('64.25');
      const overflow = await room.evaluate(node => (node as HTMLElement).scrollWidth - node.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      const motion = await spark.locator('svg').evaluate(node => {
        const style = getComputedStyle(node);
        return {
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
        };
      });
      expect(motion.animationName).toBe('none');
      expect(motion.transitionDuration).toBe('0s');
      expect(Number.parseFloat(motion.animationDuration)).toBeLessThanOrEqual(0.001);

      const snapshot = async (clientId: string) => page.evaluate(async id => {
        const response = await fetch('/api/vault/records?collection=health_stats');
        const rows = await response.json() as Array<{ client_id: string; ciphertext_b64: string; revision: number }>;
        return rows.find(item => item.client_id === id) ?? null;
      }, clientId);
      const newestStored = await snapshot(historyId('W', newestIndex));
      const oldestStored = await snapshot(historyId('W', 0));
      const labStored = await snapshot(historyId('L', 1));
      expect(newestStored?.revision).toBe(1);
      expect(oldestStored?.revision).toBe(1);

      const more = room.getByRole('button', { name: 'Show more weight' });
      await target(more);
      await activate(page, more, touch);
      await expect(room.locator(`#health-entry-${historyId('W', 0)}`)).toContainText(oldestLb);
      await expect(room.locator(`#health-entry-${historyId('W', newestIndex)}`)).toContainText(newestLb);
      await expect(room.locator(`#health-entry-${historyId('W', 0)}`)).toBeFocused();
      await expect(more).toHaveCount(0);
      await target(room.locator(`#health-entry-${historyId('W', 0)}`));
      expect(await snapshot(historyId('W', newestIndex))).toEqual(newestStored);
      expect(await snapshot(historyId('W', 0))).toEqual(oldestStored);

      await activate(page, room.getByRole('radio', { name: 'Kilograms' }), touch);
      await expect(room.locator('[data-health-latest="weight"]')).toContainText('140.0 kg');
      await expect(room.locator(`#health-entry-${historyId('W', 0)}`)).toContainText('40.0 kg');
      await expect(spark.locator('li').last()).toContainText('140.0 kg');
      expect(await snapshot(historyId('W', newestIndex))).toEqual(newestStored);
      expect(await snapshot(historyId('W', 0))).toEqual(oldestStored);
      expect(await snapshot(historyId('L', 1))).toEqual(labStored);
      await activate(page, room.getByRole('radio', { name: 'Pounds' }), touch);
      await expect(spark.locator('li').last()).toHaveText(newestLb);

      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      const themeLabel = nextTheme === 'dark' ? 'Dark' : 'Light';
      await activate(page, page.getByRole('button', { name: 'synthetic', exact: true }), touch);
      await activate(page, page.getByRole('link', { name: 'Settings', exact: true }), touch);
      await expect(page).toHaveURL(/\/settings$/);
      // The shell keeps moving focus to the new heading for a short time.
      // Settings links sit outside main, so Enter before that settles hits the heading.
      await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeFocused();
      const appearance = page.getByRole('navigation', { name: 'Settings', exact: true }).getByRole('link', { name: 'Appearance', exact: true });
      await expect(appearance).toHaveAttribute('href', /\/settings\/appearance$/);
      await activate(page, appearance, touch);
      await expect(page).toHaveURL(/\/settings\/appearance$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Appearance', exact: true })).toBeFocused();
      const themeRadio = page.getByRole('radio', { name: themeLabel, exact: true });
      await expect(themeRadio).toBeVisible();
      if (touch) await themeRadio.tap();
      else {
        await themeRadio.focus();
        await page.keyboard.press('Space');
      }
      await expect(themeRadio).toBeChecked();
      await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
      await page.goBack();
      await page.goBack();
      await expect(page).toHaveURL(/\/town\/clinic$/);
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
      await expect(spark.locator('li').last()).toHaveText(newestLb);
      await expect(room.locator('[data-health-latest="rhr"]')).toContainText('62 bpm');
      await expect(room.locator('[data-health-sparkline="lab"]')).toContainText('below range');
      expect(await snapshot(historyId('W', newestIndex))).toEqual(newestStored);
      expect(await snapshot(historyId('W', 0))).toEqual(oldestStored);
      expect(await snapshot(historyId('L', 1))).toEqual(labStored);
      const returned = room.getByRole('button', { name: 'Show more weight' });
      await activate(page, returned, touch);
      await expect(room.locator(`#health-entry-${historyId('W', 0)}`)).toContainText(oldestLb);
      await expect(room.locator(`#health-entry-${historyId('W', newestIndex)}`)).toContainText(newestLb);
      const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });

    test('saves a workout, restores it with the existing backup, and rejects an oversized record', async ({ page }) => {
      test.setTimeout(240_000);
      const touch = width === 390;
      const today = '2026-10-29';
      const storedKg = lbToKg(100);
      const pounds = displayWeight(storedKg, 'lb');
      const kilos = displayWeight(storedKg, 'kg');
      const sessionLabel = `Session · Synthetic press · ${today} · ${pounds} lb · 5 reps`;
      const kiloLabel = `Session · Synthetic press · ${today} · ${kilos} kg · 5 reps`;
      await syntheticVault(page, SEED);
      await page.goto('/town/gym');
      const room = page.locator('app-health-room');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      const locked = await room.evaluate(node => ({
        text: (node as HTMLElement).innerText,
        inputs: [...node.querySelectorAll('input, textarea')].map(item => (item as HTMLInputElement).value),
      }));
      noMeasurementDigits(locked.text);
      expect(locked.text).not.toContain('Synthetic press');
      expect(locked.inputs.join('')).not.toMatch(/\d/);
      expect(await room.locator('#health-workout-name').count()).toBe(0);
      const motion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');

      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(room).toContainText('Squat');
      await expect(room).toContainText('220.5 lb');
      await expect(room).toContainText('No workouts yet.');
      const before = await collectionCipher(page);
      const add = room.locator('#health-add-session button');
      await target(add);
      await activate(page, add, touch);
      const dialog = page.getByRole('dialog', { name: 'Add session' });
      await expect(dialog).toBeVisible();
      const name = dialog.locator('#health-workout-name');
      const load = dialog.locator('#health-workout-load');
      const reps = dialog.locator('#health-workout-reps');
      await expect(dialog.locator('#health-workout-measured-on')).toBeFocused();
      await target(name);
      await target(load);
      await target(reps);
      await target(dialog.getByRole('button', { name: 'Save' }));
      await target(dialog.getByRole('button', { name: 'Cancel' }));
      if (touch) {
        await name.tap();
        await name.fill('Synthetic press');
      } else {
        await focusControl(page, '#health-workout-name');
        await page.keyboard.type('Synthetic press');
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(add).toBeFocused();
      await activate(page, add, touch);
      await expect(name).toHaveValue('Synthetic press');
      await name.fill('');
      if (touch) await dialog.getByRole('button', { name: 'Save' }).tap();
      else await page.keyboard.press('Enter');
      await expect(name).toBeFocused();
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect(name).toHaveValue('');
      expect(await collectionCipher(page)).toEqual(before);

      if (touch) {
        await name.tap();
        await name.fill('Synthetic press');
        await load.tap();
        await load.fill('100');
        await reps.tap();
        await reps.fill('5');
        await dialog.getByRole('button', { name: 'Save' }).tap();
      } else {
        await name.fill('Synthetic press');
        await focusControl(page, '#health-workout-load');
        await page.keyboard.type('100');
        await focusControl(page, '#health-workout-reps');
        await page.keyboard.type('5');
        await page.keyboard.press('Enter');
      }
      await expect(dialog).toHaveCount(0);
      await expect(room).toContainText(sessionLabel);
      const workoutRow = room.locator('[data-workout-kind="session"] .entry-label');
      await target(workoutRow);
      const saved = await collectionCipher(page);
      expect(saved.health_prs).toEqual(before.health_prs);
      expect(saved.health_stats).toEqual(before.health_stats);
      expect(saved.health_workouts).toHaveLength(1);

      await activate(page, room.getByRole('radio', { name: 'Kilograms' }), touch);
      await expect(room).toContainText(kiloLabel);
      await expect(room).toContainText('100.0 kg');
      expect(await collectionCipher(page)).toEqual(saved);
      const backup = await vaultCall(page, '/api/vault/recovery-snapshot');
      const workoutId = saved.health_workouts[0].client_id;
      await vaultCall(page, '/api/vault/records/delete', {
        method: 'POST',
        body: { records: [{ collection: 'health_workouts', client_id: workoutId, expected_revision: saved.health_workouts[0].revision }] },
      });
      await page.reload();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(room).not.toContainText('Synthetic press');
      await expect(room).toContainText('Squat');
      await expect(room).toContainText('100.0 kg');
      const removed = await collectionCipher(page);
      expect(removed.health_workouts).toEqual([]);
      expect(removed.health_prs).toEqual(saved.health_prs);

      const current = await vaultCall(page, '/api/vault/recovery-snapshot');
      const counts: Record<string, number> = {};
      for (const row of current.collections as Array<{ collection: string }>) {
        counts[row.collection] = (backup.records as Array<{ collection: string }>).filter(item => item.collection === row.collection).length;
      }
      const stage = await vaultCall(page, '/api/vault/restore/stages', {
        method: 'POST',
        body: {
          source_hash: 'a'.repeat(64),
          base_fingerprint: current.fingerprint,
          mode: 'replace',
          key_version: 1,
          expected_counts: counts,
          batch_count: 1,
        },
      });
      await vaultCall(page, `/api/vault/restore/stages/${stage.id}/batches`, {
        method: 'PUT',
        body: {
          batch_index: 0,
          records: (backup.records as Array<Record<string, unknown>>).map(row => ({
            collection: row['collection'],
            client_id: row['client_id'],
            ciphertext_b64: row['ciphertext_b64'],
            schema_version: row['schema_version'],
            key_version: row['key_version'],
            expected_revision: null,
            indexes: [],
          })),
        },
      });
      await vaultCall(page, `/api/vault/restore/stages/${stage.id}/activate`, {
        method: 'POST',
        body: { confirmation: 'REPLACE' },
      });
      await page.reload();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(room).toContainText(kiloLabel);
      await expect(room).toContainText('Squat');
      const restored = await collectionCipher(page);
      expect(cipherOnly(restored.health_stats)).toEqual(cipherOnly(cipherOf(backup, 'health_stats')));
      expect(cipherOnly(restored.health_prs)).toEqual(cipherOnly(cipherOf(backup, 'health_prs')));
      expect(cipherOnly(restored.health_workouts)).toEqual(cipherOnly(cipherOf(backup, 'health_workouts')));

      await activate(page, room.locator('#health-add-session button'), touch);
      const again = page.getByRole('dialog', { name: 'Add session' });
      await again.locator('#health-workout-name').fill('Synthetic press');
      await again.locator('#health-workout-load').fill('40');
      await again.locator('#health-workout-reps').fill('5');
      await again.locator('#health-workout-note').fill('x'.repeat(40_000));
      const save = again.getByRole('button', { name: 'Save' });
      await target(save);
      if (touch) await save.tap();
      else {
        await save.focus();
        await page.keyboard.press('Enter');
      }
      await expect(again).toContainText('This workout is too large to save. Shorten it and try again.');
      await expect(again.locator('#health-workout-note')).toHaveValue('x'.repeat(40_000));
      await expect(again.locator('#health-workout-note')).toBeFocused();
      const rejected = await collectionCipher(page);
      expect(rejected.health_workouts).toEqual(restored.health_workouts);
      expect(rejected.health_prs).toEqual(restored.health_prs);
      expect(rejected.health_stats).toEqual(restored.health_stats);
      const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });

    test('saves a partial session, reloads the entered sets, and keeps a losing draft', async ({ page }) => {
      test.setTimeout(240_000);
      const touch = width === 390;
      const measured = '2026-10-29';
      const first = displayWeight(lbToKg(100), 'lb');
      const second = displayWeight(lbToKg(80), 'lb');
      const losing = displayWeight(lbToKg(60), 'lb');
      await syntheticVault(page, SEED);
      await page.goto('/town/gym');
      const room = page.locator('app-health-room');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      const motion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');
      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });

      await activate(page, room.locator('#health-add-session button'), touch);
      const dialog = page.getByRole('dialog', { name: 'Add session' });
      await expect(dialog.locator('#health-workout-measured-on')).toBeFocused();
      const addSet = dialog.getByRole('button', { name: 'Add set' });
      await target(addSet);
      await target(dialog.getByRole('button', { name: 'Save' }));
      await target(dialog.getByRole('button', { name: 'Cancel' }));
      if (touch) {
        await dialog.locator('#health-workout-name').tap();
        await dialog.locator('#health-workout-name').fill('Synthetic press');
        await dialog.locator('#health-workout-load').tap();
        await dialog.locator('#health-workout-load').fill('100');
        await dialog.locator('#health-workout-reps').tap();
        await dialog.locator('#health-workout-reps').fill('5');
        await addSet.tap();
      } else {
        await focusControl(page, '#health-workout-name');
        await page.keyboard.type('Synthetic press');
        await focusControl(page, '#health-workout-load');
        await page.keyboard.type('100');
        await focusControl(page, '#health-workout-reps');
        await page.keyboard.type('5');
        await addSet.focus();
        await page.keyboard.press('Enter');
      }
      await expect(dialog.locator('[data-entered-set]')).toHaveCount(1);
      await expect(dialog.locator('[data-entered-set]')).toContainText(`${first} lb`);
      await expect(dialog.locator('[data-entered-set]')).toContainText('5 reps');
      await expect(dialog.locator('#health-workout-load')).toHaveValue('');
      await expect(dialog.locator('#health-workout-reps')).toHaveValue('');
      const entered = dialog.locator('[data-entered-set]');
      const box = await entered.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await dialog.locator('#health-workout-state').selectOption('draft');
      if (touch) await dialog.getByRole('button', { name: 'Save' }).tap();
      else {
        await dialog.getByRole('button', { name: 'Save' }).focus();
        await page.keyboard.press('Enter');
      }
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('#health-add-session button')).toBeFocused();
      const draftRow = room.locator('[data-workout-state="draft"]');
      await expect(draftRow).toHaveAttribute('data-set-count', '1');
      await expect(draftRow).toContainText('Draft session');
      await expect(draftRow).toContainText(`${first} lb`);
      await expect(draftRow).toContainText('5 reps');

      await page.reload();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(room.locator('[data-workout-state="draft"]')).toHaveAttribute('data-set-count', '1');
      await expect(room.locator('[data-entered-set]')).toHaveCount(0);
      const resume = room.getByRole('button', { name: /^Resume Draft session/ });
      await target(resume);
      await activate(page, resume, touch);
      const resumed = page.getByRole('dialog', { name: 'Resume session' });
      await expect(resumed.locator('[data-entered-set]')).toHaveCount(1);
      await expect(resumed.locator('[data-entered-set]')).toContainText(`${first} lb`);
      await expect(resumed.locator('[data-entered-set]')).toContainText('5 reps');
      await expect(resumed.locator('#health-workout-load')).toHaveValue('');
      await expect(resumed.locator('#health-workout-reps')).toHaveValue('');
      await expect(resumed.locator('#health-workout-measured-on')).toHaveValue(measured);
      await expect(resumed.locator('.logged-on time')).toHaveAttribute('datetime', measured);
      const fits = await resumed.evaluate(node => node.scrollWidth <= node.clientWidth + 1);
      expect(fits).toBe(true);
      if (touch) await resumed.getByRole('button', { name: 'Cancel' }).tap();
      else {
        await resumed.getByRole('button', { name: 'Cancel' }).focus();
        await page.keyboard.press('Enter');
      }
      await expect(resumed).toHaveCount(0);
      await expect(resume).toBeFocused();

      const pageB = await page.context().newPage();
      await pageB.clock.setFixedTime(new Date('2026-11-20T19:00:00Z'));
      await pageB.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
      await pageB.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await pageB.goto('/town/gym');
      const roomB = pageB.locator('app-health-room');
      await expect(roomB).toHaveAttribute('data-health-state', /locked|ready/, { timeout: 90_000 });
      if (await roomB.getAttribute('data-health-state') === 'locked') {
        await activate(pageB, roomB.getByRole('link', { name: 'Unlock' }), touch);
        await pageB.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
        await pageB.getByRole('button', { name: 'Unlock', exact: true }).click();
        await expect(roomB).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      }
      await activate(pageB, roomB.getByRole('button', { name: /^Resume Draft session/ }), touch);
      const other = pageB.getByRole('dialog', { name: 'Resume session' });
      await expect(other.locator('[data-entered-set]')).toHaveCount(1);
      await expect(other.locator('#health-workout-measured-on')).toHaveValue(measured);
      await expect(other.locator('.logged-on time')).toHaveAttribute('datetime', measured);
      await expect(other.locator('#health-workout-measured-on')).toHaveAttribute('max', '2026-11-20');

      await activate(page, resume, touch);
      const winnerDialog = page.getByRole('dialog', { name: 'Resume session' });
      if (touch) {
        await winnerDialog.locator('#health-workout-load').tap();
        await winnerDialog.locator('#health-workout-load').fill('80');
        await winnerDialog.locator('#health-workout-reps').tap();
        await winnerDialog.locator('#health-workout-reps').fill('3');
        await winnerDialog.getByRole('button', { name: 'Add set' }).tap();
      } else {
        await focusControl(page, '#health-workout-load');
        await page.keyboard.type('80');
        await focusControl(page, '#health-workout-reps');
        await page.keyboard.type('3');
        await winnerDialog.getByRole('button', { name: 'Add set' }).focus();
        await page.keyboard.press('Enter');
      }
      await expect(winnerDialog.locator('[data-entered-set]')).toHaveCount(2);
      if (touch) await winnerDialog.getByRole('button', { name: 'Save' }).tap();
      else {
        await winnerDialog.getByRole('button', { name: 'Save' }).focus();
        await page.keyboard.press('Enter');
      }
      await expect(winnerDialog).toHaveCount(0);
      await expect(room.locator('[data-workout-state="draft"]')).toHaveAttribute('data-set-count', '2');
      const winner = await collectionCipher(page);

      if (touch) {
        await other.locator('#health-workout-load').tap();
        await other.locator('#health-workout-load').fill('60');
        await other.locator('#health-workout-reps').tap();
        await other.locator('#health-workout-reps').fill('4');
        await other.getByRole('button', { name: 'Save' }).tap();
      } else {
        await other.locator('#health-workout-load').focus();
        await pageB.keyboard.type('60');
        await other.locator('#health-workout-reps').focus();
        await pageB.keyboard.type('4');
        await other.getByRole('button', { name: 'Save' }).focus();
        await pageB.keyboard.press('Enter');
      }
      await expect(other).toContainText('This entry changed in another tab. Reload and try again.');
      await expect(other.locator('#health-workout-load')).toHaveValue('60');
      await expect(other.locator('#health-workout-reps')).toHaveValue('4');
      await expect(other.locator('[data-entered-set]')).toHaveCount(1);
      expect(await collectionCipher(page)).toEqual(winner);
      if (touch) await other.getByRole('button', { name: 'Save' }).tap();
      else {
        await other.getByRole('button', { name: 'Save' }).focus();
        await pageB.keyboard.press('Enter');
      }
      await expect(other.locator('#health-workout-load')).toHaveValue('60');
      await expect(other.locator('#health-workout-reps')).toHaveValue('4');
      expect(await collectionCipher(page)).toEqual(winner);
      expect(winner.health_workouts).toHaveLength(1);
      expect(winner.health_workouts[0].revision).toBe(2);

      await pageB.reload();
      await expect(roomB).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      const reloadedRow = roomB.locator('[data-workout-state="draft"]');
      await expect(reloadedRow).toHaveAttribute('data-set-count', '2');
      await expect(reloadedRow).toContainText('Draft session');
      await expect(reloadedRow).not.toContainText(`${losing} lb`);
      await activate(pageB, roomB.getByRole('button', { name: /^Resume Draft session/ }), touch);
      const reloaded = pageB.getByRole('dialog', { name: 'Resume session' });
      await expect(reloaded.locator('[data-entered-set]')).toHaveCount(2);
      await expect(reloaded).toContainText(`${first} lb`);
      await expect(reloaded).toContainText('5 reps');
      await expect(reloaded).toContainText(`${second} lb`);
      await expect(reloaded).toContainText('3 reps');
      await expect(reloaded).not.toContainText(`${losing} lb`);
      await expect(reloaded).not.toContainText('4 reps');
      await expect(reloaded.locator('.logged-on time')).toHaveAttribute('datetime', measured);
      await pageB.close();

      const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });

    test('logs a lift, a bodyweight set, and a run, then edits and deletes the session', async ({ page }) => {
      test.setTimeout(240_000);
      const touch = width === 390;
      const measured = '2026-10-29';
      const later = '2026-11-20';
      const liftKg = lbToKg(100).toFixed(2);
      const workKg = lbToKg(80).toFixed(2);
      const metres = milesToMetres(1).toFixed(2);
      let failWorkoutUpsert = false;
      let failWorkoutDelete = false;
      await page.route('**/api/vault/records/upsert', async route => {
        const body = route.request().postDataJSON() as { records?: Array<{ collection?: string }> };
        const workouts = (body.records ?? []).filter(record => record.collection === 'health_workouts');
        if (failWorkoutUpsert && workouts.length > 0) {
          failWorkoutUpsert = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Synthetic save failed"}' });
          return;
        }
        await route.fallback();
      });
      await page.route('**/api/vault/records/delete', async route => {
        const body = route.request().postDataJSON() as { records?: Array<{ collection?: string }> };
        const workouts = (body.records ?? []).filter(record => record.collection === 'health_workouts');
        if (failWorkoutDelete && workouts.length > 0) {
          failWorkoutDelete = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Synthetic delete failed"}' });
          return;
        }
        await route.fallback();
      });
      // The date jumps ahead three weeks to check logged-on history. That
      // wall-clock change must not represent real idle time in this fixture.
      await page.addInitScript(() => localStorage.setItem('finance-auto-lock', 'off'));
      await syntheticVault(page, SEED);
      await page.goto('/town/gym');
      const room = page.locator('app-health-room');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      const locked = await room.evaluate(node => ({
        text: (node as HTMLElement).innerText,
        inputs: [...node.querySelectorAll('input, textarea')].map(item => (item as HTMLInputElement).value),
      }));
      expect(locked.text).not.toContain('Synthetic press');
      expect(locked.text).not.toContain('Synthetic pull');
      expect(locked.text).not.toContain('Synthetic run');
      expect(locked.inputs.join('')).not.toMatch(/\d/);
      const motion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');
      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(room).toContainText('Squat');
      const before = await collectionCipher(page);

      await activate(page, room.locator('#health-add-session button'), touch);
      const dialog = page.getByRole('dialog', { name: 'Add session' });
      await expect(dialog.locator('#health-workout-measured-on')).toBeFocused();
      await fillControl(page, dialog, '#health-workout-name', 'Synthetic press', touch);
      await dialog.locator('#health-workout-set-type').selectOption('warmup');
      await fillControl(page, dialog, '#health-workout-load', '100', touch);
      await fillControl(page, dialog, '#health-workout-reps', '5', touch);
      await expect(dialog.locator('[data-open-preview]')).toContainText(`Stored as ${liftKg} kg · 5 reps`);
      const addSet = dialog.getByRole('button', { name: 'Add set' });
      await target(addSet);
      await activate(page, addSet, touch);
      await expect(dialog.locator('#health-workout-load')).toHaveValue('');
      await fillControl(page, dialog, '#health-workout-load', '80', touch);
      await fillControl(page, dialog, '#health-workout-reps', '3', touch);
      await activate(page, dialog.getByRole('button', { name: 'Add set' }), touch);
      await expect(dialog.locator('#health-workout-load')).toHaveValue('');
      await fillControl(page, dialog, '#health-workout-load', '60', touch);
      await fillControl(page, dialog, '#health-workout-reps', '1', touch);
      await activate(page, dialog.getByRole('button', { name: 'Add set' }), touch);
      await expect(dialog.locator('[data-entered-set]')).toHaveCount(3);
      const earlier = dialog.getByRole('button', { name: 'Move set 3 on exercise 1 earlier' });
      await target(earlier);
      await target(dialog.getByRole('button', { name: 'Remove set 2 on exercise 1' }));
      await activate(page, earlier, touch);
      await expect(dialog.locator('[data-entered-set]').nth(1)).toContainText('1 reps');
      await activate(page, dialog.getByRole('button', { name: 'Remove set 2 on exercise 1' }), touch);
      await expect(dialog.locator('[data-entered-set]')).toHaveCount(2);
      await expect(dialog).not.toContainText('1 reps');
      await expect(dialog.locator('[data-canonical-preview]').nth(0)).toContainText(`Stored as ${liftKg} kg · 5 reps`);
      await expect(dialog.locator('[data-canonical-preview]').nth(1)).toContainText(`Stored as ${workKg} kg · 3 reps`);
      await dialog.locator('[data-entered-set]').nth(1).getByRole('combobox', { name: 'Set 2 role on exercise 1' }).selectOption('drop');
      await expect(dialog.locator('[data-entered-set]').nth(1)).toHaveAttribute('data-set-role', 'drop');
      await dialog.locator('[data-entered-set]').nth(1).getByRole('combobox', { name: 'Set 2 role on exercise 1' }).selectOption('work');
      await expect(dialog.locator('[data-entered-set]').nth(1)).toHaveAttribute('data-set-role', 'work');

      await activate(page, dialog.getByRole('button', { name: 'Add exercise' }), touch);
      await expect(dialog.locator('#health-workout-name')).toHaveValue('');
      await fillControl(page, dialog, '#health-workout-name', 'Synthetic pull', touch);
      await dialog.locator('#health-workout-type').selectOption('bodyweight-reps');
      await fillControl(page, dialog, '#health-workout-reps', '8', touch);
      const pullPreview = dialog.locator('[data-open-preview]');
      await expect(pullPreview).toContainText('Stored as 8 reps');
      await expect(pullPreview).not.toContainText('kg');
      await activate(page, dialog.getByRole('button', { name: 'Add set' }), touch);
      const pull = dialog.locator('[data-exercise-type="bodyweight-reps"]');
      await expect(pull).toContainText('Stored as 8 reps');
      await expect(pull).not.toContainText('kg');

      await activate(page, dialog.getByRole('button', { name: 'Add exercise' }), touch);
      await expect(dialog.locator('#health-workout-name')).toHaveValue('');
      await fillControl(page, dialog, '#health-workout-name', 'Synthetic run', touch);
      await dialog.locator('#health-workout-type').selectOption('time-distance');
      await dialog.locator('#health-workout-set-type').selectOption('drop');
      await fillControl(page, dialog, '#health-workout-seconds', '1200', touch);
      await fillControl(page, dialog, '#health-workout-distance', '1', touch);
      await expect(dialog.locator('[data-open-preview]')).toContainText(`Stored as 1200 s · ${metres} m`);
      await activate(page, dialog.getByRole('button', { name: 'Add set' }), touch);
      await expect(dialog.locator('[data-entered-set]')).toHaveCount(4);
      await expect(dialog.locator('[data-floor-line]')).toHaveCount(3);
      await activate(page, dialog.getByRole('button', { name: 'Switch to exercise 1' }), touch);
      await expect(dialog.locator('#health-workout-name')).toHaveValue('Synthetic press');
      await expect(dialog.locator('[data-entered-set]')).toHaveCount(4);
      await fillControl(page, dialog, '#health-workout-note', 'Synthetic floor', touch);
      const fits = await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1);
      expect(fits).toBe(true);
      const openScan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(openScan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

      failWorkoutUpsert = true;
      await activate(page, dialog.getByRole('button', { name: 'Save' }), touch);
      await expect(dialog).toContainText('Could not save this workout. Try again.');
      await expect(dialog.locator('#health-workout-note')).toHaveValue('Synthetic floor');
      await expect(dialog.locator('[data-entered-set]')).toHaveCount(4);
      expect(await collectionCipher(page)).toEqual(before);
      await target(dialog.getByRole('button', { name: 'Save' }));
      await activate(page, dialog.getByRole('button', { name: 'Save' }), touch);
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('#health-add-session button')).toBeFocused();
      const sessionRow = room.locator('[data-workout-kind="session"]');
      await expect(sessionRow).toHaveAttribute('data-set-count', '4');
      await expect(sessionRow).toHaveAttribute('data-workout-state', 'completed');
      await expect(sessionRow).toContainText(`Session · 3 exercises · ${measured} · 4 sets`);
      const saved = await collectionCipher(page);
      expect(saved.health_prs).toEqual(before.health_prs);
      expect(saved.health_stats).toEqual(before.health_stats);
      expect(saved.health_workouts).toHaveLength(1);
      expect(saved.health_workouts[0].revision).toBe(1);
      const sessionId = saved.health_workouts[0].client_id;

      await page.clock.setFixedTime(new Date('2026-11-20T19:00:00Z'));
      const edit = room.locator(`#health-edit-${sessionId} button`);
      await target(edit);
      await activate(page, edit, touch);
      const editor = page.getByRole('dialog', { name: 'Edit session' });
      await expect(editor.locator('.logged-on time')).toHaveAttribute('datetime', measured);
      await expect(editor.locator('#health-workout-measured-on')).toHaveAttribute('max', later);
      await expect(editor.locator('[data-entered-set]')).toHaveCount(4);
      await expect(editor.locator('[data-canonical-preview]').nth(0)).toContainText(`Stored as ${liftKg} kg · 5 reps`);
      await expect(editor.locator('[data-exercise-type="bodyweight-reps"]')).toContainText('Stored as 8 reps');
      await expect(editor.locator('[data-exercise-type="time-distance"]')).toContainText(`Stored as 1200 s · ${metres} m`);
      await expect(editor).not.toContainText('1 reps');
      await fillControl(page, editor, '#health-workout-note', 'Synthetic floor edited', touch);
      failWorkoutUpsert = true;
      await activate(page, editor.getByRole('button', { name: 'Save' }), touch);
      await expect(editor).toContainText('Could not save this workout. Try again.');
      await expect(editor.locator('#health-workout-note')).toHaveValue('Synthetic floor edited');
      expect(await collectionCipher(page)).toEqual(saved);
      await activate(page, editor.getByRole('button', { name: 'Save' }), touch);
      await expect(editor).toHaveCount(0);
      await expect(page.locator(`#health-edit-${sessionId} button`)).toBeFocused();
      const revised = await collectionCipher(page);
      expect(revised.health_workouts).toHaveLength(1);
      expect(revised.health_workouts[0].client_id).toBe(sessionId);
      expect(revised.health_workouts[0].revision).toBe(2);
      expect(revised.health_workouts[0].ciphertext_b64).not.toBe(saved.health_workouts[0].ciphertext_b64);
      expect(revised.health_prs).toEqual(before.health_prs);

      await page.reload();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await activate(page, room.locator(`#health-edit-${sessionId} button`), touch);
      const reopened = page.getByRole('dialog', { name: 'Edit session' });
      await expect(reopened.locator('#health-workout-note')).toHaveValue('Synthetic floor edited');
      await expect(reopened.locator('.logged-on time')).toHaveAttribute('datetime', measured);
      await expect(reopened.locator('[data-entered-set]')).toHaveCount(4);
      await expect(reopened.locator('[data-canonical-preview]').first()).toContainText(`Stored as ${liftKg} kg`);
      if (touch) await reopened.getByRole('button', { name: 'Cancel' }).tap();
      else {
        await reopened.getByRole('button', { name: 'Cancel' }).focus();
        await page.keyboard.press('Enter');
      }
      await expect(reopened).toHaveCount(0);

      const remove = room.locator(`#health-delete-${sessionId} button`);
      await target(remove);
      await activate(page, remove, touch);
      const confirm = page.getByRole('dialog', { name: 'Delete this session?' });
      await expect(confirm).toContainText('DELETE SESSION');
      await expect(confirm).toContainText(`measured on ${measured}`);
      await confirm.locator('#confirm-phrase-field').fill('DELETE');
      await expect(confirm.getByRole('button', { name: 'Delete session' })).toHaveAttribute('aria-disabled', 'true');
      await expect(room.locator('[data-workout-kind="session"]')).toHaveCount(1);
      failWorkoutDelete = true;
      await confirm.locator('#confirm-phrase-field').fill('DELETE SESSION');
      if (touch) await confirm.getByRole('button', { name: 'Delete session' }).tap();
      else await confirm.getByRole('button', { name: 'Delete session' }).click();
      await expect(confirm).toContainText('Could not delete this session. It is still saved. Try again.');
      await expect(confirm.locator('#confirm-phrase-field')).toBeFocused();
      expect(await collectionCipher(page)).toEqual(revised);
      if (touch) await confirm.getByRole('button', { name: 'Delete session' }).tap();
      else await page.keyboard.press('Enter');
      await expect(confirm).toHaveCount(0);
      await expect(room.locator('[data-workout-kind="session"]')).toHaveCount(0);
      await expect(room).toContainText('Squat');
      await expect(room).not.toContainText('Synthetic floor');
      await expect(page.locator('#health-add-session button')).toBeFocused();
      const removed = await collectionCipher(page);
      expect(removed.health_workouts).toEqual([]);
      expect(removed.health_prs).toEqual(before.health_prs);
      expect(removed.health_stats).toEqual(before.health_stats);
      const readyMotion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(readyMotion).toBe('0s');
      const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });

    test('starts from a routine or a previous session and keeps the saved session', async ({ page }) => {
      test.setTimeout(240_000);
      const touch = width === 390;
      const measured = '2026-10-29';
      const storedKg = lbToKg(40);
      const shown = `${displayWeight(storedKg, 'lb')} lb`;
      const canonical = `Stored as ${storedKg.toFixed(2)} kg · 8 reps`;
      let failWorkoutUpsert = false;
      await page.route('**/api/vault/records/upsert', async route => {
        const body = route.request().postDataJSON() as { records?: Array<{ collection?: string }> };
        const workouts = (body.records ?? []).filter(record => record.collection === 'health_workouts');
        if (failWorkoutUpsert && workouts.length > 0) {
          failWorkoutUpsert = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Synthetic save failed"}' });
          return;
        }
        await route.fallback();
      });
      await syntheticVault(page, SEED);
      await page.goto('/town/gym');
      const room = page.locator('app-health-room');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      const locked = await room.evaluate(node => ({
        text: (node as HTMLElement).innerText,
        inputs: [...node.querySelectorAll('input, textarea')].map(item => (item as HTMLInputElement).value),
      }));
      expect(locked.text).not.toContain('Synthetic press');
      expect(locked.text).not.toContain('Synthetic plan');
      expect(locked.inputs.join('')).not.toMatch(/\d/);
      const motion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');
      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      const before = await collectionCipher(page);

      await activate(page, room.getByRole('button', { name: 'Add exercise' }), touch);
      const exerciseDialog = page.getByRole('dialog', { name: 'Add exercise' });
      await fillControl(page, exerciseDialog, '#health-workout-name', 'Synthetic press', touch);
      await target(exerciseDialog.getByRole('button', { name: 'Save' }));
      await activate(page, exerciseDialog.getByRole('button', { name: 'Save' }), touch);
      await expect(exerciseDialog).toHaveCount(0);
      const exercise = room.locator('[data-workout-kind="exercise"]');
      await expect(exercise).toContainText('Exercise · Synthetic press · Load and reps');
      const exerciseHost = await exercise.locator('[id^="health-edit-"]').getAttribute('id');
      const exerciseId = exerciseHost?.slice('health-edit-'.length) ?? '';
      expect(exerciseId).toMatch(/^hlt_/);

      await activate(page, room.getByRole('button', { name: 'Add routine' }), touch);
      const routineDialog = page.getByRole('dialog', { name: 'Add routine' });
      await expect(routineDialog.locator('#health-workout-routine-name')).toBeFocused();
      await fillControl(page, routineDialog, '#health-workout-routine-name', 'Synthetic plan', touch);
      await routineDialog.locator('#health-workout-definition').selectOption(exerciseId);
      await expect(routineDialog.locator('#health-workout-name')).toHaveValue('Synthetic press');
      await expect(routineDialog.locator('#health-workout-type')).toHaveValue('load-reps');
      await fillControl(page, routineDialog, '#health-workout-load', '40', touch);
      await fillControl(page, routineDialog, '#health-workout-reps', '8', touch);
      await expect(routineDialog.locator('[data-open-preview]')).toContainText(canonical);
      await activate(page, routineDialog.getByRole('button', { name: 'Save' }), touch);
      await expect(routineDialog).toHaveCount(0);
      const routine = room.locator('[data-workout-kind="routine"]');
      await expect(routine).toContainText('Routine · Synthetic plan · 1 exercise');
      const start = routine.locator('[id^="health-start-"] button');
      await target(start);
      await target(routine.locator('[id^="health-archive-"] button'));
      await target(exercise.locator('[id^="health-edit-"] button'));
      await activate(page, start, touch);
      const started = page.getByRole('dialog', { name: 'Start session' });
      await expect(started.locator('#health-workout-measured-on')).toBeFocused();
      await expect(started.locator('#health-workout-measured-on')).toHaveValue(measured);
      await expect(started.locator('#health-workout-state')).toHaveValue('draft');
      await expect(started.locator('[data-entered-set]')).toHaveCount(1);
      await expect(started.locator('[data-entered-set]')).toContainText(shown);
      await expect(started.locator('[data-canonical-preview]')).toContainText(canonical);
      const plannedId = await started.locator('[data-entered-set]').getAttribute('data-entered-set');
      await started.locator('#health-workout-state').selectOption('completed');
      const openScan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(openScan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      const fits = await started.evaluate(node => node.scrollWidth <= node.clientWidth + 1);
      expect(fits).toBe(true);
      await activate(page, started.getByRole('button', { name: 'Save' }), touch);
      await expect(started).toHaveCount(0);
      const completed = room.locator('[data-workout-state="completed"]');
      await expect(completed).toHaveCount(1);
      const sessionHost = await completed.locator('[id^="health-edit-"]').getAttribute('id');
      const sessionId = sessionHost?.slice('health-edit-'.length) ?? '';
      await expect(page.locator(`#health-edit-${sessionId} button`)).toBeFocused();
      const saved = await collectionCipher(page);
      const sessionCipher = saved.health_workouts.find(row => row.client_id === sessionId);
      expect(sessionCipher?.revision).toBe(1);
      expect(saved.health_prs).toEqual(before.health_prs);
      expect(saved.health_stats).toEqual(before.health_stats);

      await activate(page, routine.locator('[id^="health-edit-"] button'), touch);
      const routineEditor = page.getByRole('dialog', { name: 'Edit routine' });
      await target(routineEditor.locator('#health-workout-routine-name'));
      await fillControl(page, routineEditor, '#health-workout-routine-name', 'Synthetic plan edited', touch);
      await activate(page, routineEditor.getByRole('button', { name: 'Remove set 1 on exercise 1' }), touch);
      await expect(routineEditor.locator('[data-entered-set]')).toHaveCount(0);
      await fillControl(page, routineEditor, '#health-workout-load', '20', touch);
      await fillControl(page, routineEditor, '#health-workout-reps', '4', touch);
      failWorkoutUpsert = true;
      await activate(page, routineEditor.getByRole('button', { name: 'Save' }), touch);
      await expect(routineEditor).toContainText('Could not save this workout. Try again.');
      await expect(routineEditor.locator('#health-workout-routine-name')).toHaveValue('Synthetic plan edited');
      await expect(routineEditor.locator('#health-workout-load')).toHaveValue('20');
      expect((await collectionCipher(page)).health_workouts.find(row => row.client_id === sessionId)).toEqual(sessionCipher);
      await activate(page, routineEditor.getByRole('button', { name: 'Save' }), touch);
      await expect(routineEditor).toHaveCount(0);
      await expect(routine).toContainText('Routine · Synthetic plan edited · 1 exercise');
      expect((await collectionCipher(page)).health_workouts.find(row => row.client_id === sessionId)).toEqual(sessionCipher);

      await activate(page, room.locator(`#health-edit-${sessionId} button`), touch);
      const sessionEditor = page.getByRole('dialog', { name: 'Edit session' });
      await expect(sessionEditor.locator('#health-workout-name')).toHaveValue('Synthetic press');
      await expect(sessionEditor.locator('#health-workout-type')).toHaveValue('load-reps');
      await expect(sessionEditor.locator('[data-canonical-preview]')).toContainText(canonical);
      await expect(sessionEditor.locator('[data-entered-set]')).toHaveAttribute('data-entered-set', plannedId ?? '');
      await expect(sessionEditor).not.toContainText('Synthetic plan edited');
      expect(await selectedDefinition(sessionEditor)).toEqual({ value: exerciseId, label: 'Synthetic press' });
      if (touch) await sessionEditor.getByRole('button', { name: 'Cancel' }).tap();
      else {
        await sessionEditor.getByRole('button', { name: 'Cancel' }).focus();
        await page.keyboard.press('Enter');
      }
      await expect(sessionEditor).toHaveCount(0);

      const repeat = room.locator(`#health-again-${sessionId} button`);
      await target(repeat);
      await activate(page, repeat, touch);
      const copy = page.getByRole('dialog', { name: 'Start session' });
      await expect(copy.locator('#health-workout-state')).toHaveValue('draft');
      const copyId = await copy.locator('[data-entered-set]').getAttribute('data-entered-set');
      expect(copyId).toBeTruthy();
      expect(copyId).not.toBe(plannedId);
      await activate(page, copy.getByRole('button', { name: 'Save' }), touch);
      await expect(copy).toHaveCount(0);
      await expect(room.locator('[data-workout-kind="session"]')).toHaveCount(2);
      const draft = room.locator('[data-workout-state="draft"]');
      await expect(draft).toHaveCount(1);
      const draftHost = await draft.locator('[id^="health-resume-"]').getAttribute('id');
      const draftId = draftHost?.slice('health-resume-'.length) ?? '';
      expect(draftId).not.toBe(sessionId);
      await expect(page.locator(`#health-resume-${draftId} button`)).toBeFocused();
      expect((await collectionCipher(page)).health_workouts.find(row => row.client_id === sessionId)).toEqual(sessionCipher);

      await activate(page, exercise.locator('[id^="health-edit-"] button'), touch);
      const definition = page.getByRole('dialog', { name: 'Edit exercise' });
      await fillControl(page, definition, '#health-workout-name', 'Synthetic push', touch);
      await activate(page, definition.getByRole('button', { name: 'Save' }), touch);
      await expect(definition).toHaveCount(0);
      await expect(exercise).toContainText('Exercise · Synthetic push · Load and reps');
      expect((await collectionCipher(page)).health_workouts.find(row => row.client_id === sessionId)).toEqual(sessionCipher);
      await activate(page, room.locator(`#health-edit-${sessionId} button`), touch);
      const renamed = page.getByRole('dialog', { name: 'Edit session' });
      await expect(renamed.locator('#health-workout-name')).toHaveValue('Synthetic press');
      await expect(renamed.locator('#health-workout-type')).toHaveValue('load-reps');
      await expect(renamed.locator('[data-canonical-preview]')).toContainText(canonical);
      expect(await selectedDefinition(renamed)).toEqual({ value: exerciseId, label: 'Synthetic press' });
      await expect(renamed).not.toContainText('Synthetic push');
      if (touch) await renamed.getByRole('button', { name: 'Cancel' }).tap();
      else await page.keyboard.press('Escape');
      await expect(renamed).toHaveCount(0);
      await expect(room.locator(`#health-edit-${sessionId} button`)).toBeFocused();

      const archive = exercise.locator('[id^="health-archive-"] button');
      await target(archive);
      await activate(page, archive, touch);
      const confirm = page.getByRole('dialog', { name: 'Archive this exercise?' });
      await expect(confirm).toContainText('ARCHIVE EXERCISE');
      await confirm.locator('#confirm-phrase-field').fill('ARCHIVE');
      await expect(confirm.getByRole('button', { name: 'Archive exercise' })).toHaveAttribute('aria-disabled', 'true');
      failWorkoutUpsert = true;
      await confirm.locator('#confirm-phrase-field').fill('ARCHIVE EXERCISE');
      if (touch) await confirm.getByRole('button', { name: 'Archive exercise' }).tap();
      else await confirm.getByRole('button', { name: 'Archive exercise' }).click();
      await expect(confirm).toContainText('Could not archive this exercise. It is still saved. Try again.');
      expect((await collectionCipher(page)).health_workouts.find(row => row.client_id === sessionId)).toEqual(sessionCipher);
      if (touch) await confirm.getByRole('button', { name: 'Archive exercise' }).tap();
      else await page.keyboard.press('Enter');
      await expect(confirm).toHaveCount(0);
      await expect(exercise).toContainText('Archived exercise · Synthetic push · Load and reps');
      await expect(exercise).toHaveAttribute('data-workout-archived', 'true');
      await expect(page.locator(`#health-edit-${exerciseId} button`)).toBeFocused();
      expect((await collectionCipher(page)).health_workouts.find(row => row.client_id === sessionId)).toEqual(sessionCipher);

      await activate(page, room.locator(`#health-edit-${sessionId} button`), touch);
      const archivedView = page.getByRole('dialog', { name: 'Edit session' });
      await expect(archivedView.locator('#health-workout-name')).toHaveValue('Synthetic press');
      await expect(archivedView.locator('#health-workout-type')).toHaveValue('load-reps');
      await expect(archivedView.locator('[data-canonical-preview]')).toContainText(canonical);
      expect(await selectedDefinition(archivedView)).toEqual({ value: exerciseId, label: 'Synthetic press' });
      await expect(archivedView).not.toContainText('Synthetic push');
      if (touch) await archivedView.getByRole('button', { name: 'Cancel' }).tap();
      else await page.keyboard.press('Escape');
      await expect(archivedView).toHaveCount(0);

      await activate(page, room.getByRole('button', { name: 'New session' }), touch);
      const fresh = page.getByRole('dialog', { name: 'Add session' });
      await expect(fresh.locator('#health-workout-definition')).toHaveCount(0);
      const roomFits = await room.evaluate(node => node.scrollWidth <= node.clientWidth + 1);
      expect(roomFits).toBe(true);
      const readyMotion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(readyMotion).toBe('0s');
      const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });
  });
}

for (const [width, height, theme] of [[1280, 800, 'light'], [390, 844, 'light'], [1280, 800, 'dark'], [390, 844, 'dark']] as const) {
  test.describe(`health progress at ${width} ${theme}`, () => {
    test.describe.configure({ timeout: 240_000 });
    test.use({
      viewport: { width, height },
      hasTouch: width === 390,
      timezoneId: 'America/Los_Angeles',
    });

    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    });

    test('rolls a session best back to the legacy record without a second row', async ({ page }) => {
      const touch = width === 390;
      const olderId = 'hlt_SyntheticOlderLiftABCD';
      const sessionId = 'hlt_SyntheticSessionBestAB';
      const runId = 'hlt_SyntheticRunEntryABCDE';
      let failPr = false;
      let conflictPr = false;
      await page.route('**/api/vault/records/upsert', async route => {
        const body = route.request().postDataJSON() as { records?: Array<{ collection?: string }> };
        const prs = (body.records ?? []).filter(record => record.collection === 'health_prs');
        if (failPr && prs.length > 0) {
          failPr = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Synthetic save failed"}' });
          return;
        }
        if (conflictPr && prs.length > 0) {
          conflictPr = false;
          await route.fulfill({ status: 409, contentType: 'application/json', body: '{"detail":"Revision conflict"}' });
          return;
        }
        await route.fallback();
      });
      await syntheticVault(page, {
        ...SEED,
        health_prs: [
          ...SEED.health_prs,
          {
            client_id: olderId,
            v: 1,
            kind: 'lift',
            measured_on: '2026-10-01',
            logged_on: '2026-10-01',
            exercise: 'Squat',
            kg: 90,
            reps: 1,
          },
          {
            client_id: runId,
            v: 1,
            kind: 'run',
            measured_on: '2026-10-20',
            logged_on: '2026-10-20',
            distance_m: 5000,
            seconds: 1500,
          },
        ],
        health_workouts: [
          {
            client_id: sessionId,
            v: 1,
            kind: 'session',
            measured_on: '2026-10-29',
            logged_on: '2026-10-29',
            state: 'completed',
            exercises: [{
              id: 'wex_progress1',
              exercise_id: 'static:squat',
              exercise_type: 'load-reps',
              name: 'Squat',
              sets: [
                { id: 'wst_warmup001', set_type: 'warmup', completed: true, kg: 200, reps: 1 },
                { id: 'wst_progress01', set_type: 'work', completed: true, kg: 140, reps: 1 },
              ],
            }],
          },
        ],
      });
      await page.goto('/town/gym');
      const room = page.locator('app-health-room');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      const locked = await room.evaluate(node => (node as HTMLElement).innerText);
      noMeasurementDigits(locked);
      const lockedMotion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(lockedMotion).toBe('0s');
      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await expect(room).toContainText(`Current · Squat · ${displayWeight(140, 'lb')} lb × 1`);
      await expect(room).toContainText('Previous best');
      await expect(room).toContainText('220.5 lb');
      await expect(room).toContainText('New PR in the last 7 days');
      await expect(room).not.toContainText('176.4');
      await expect(room).not.toContainText('64.25');
      const before = await collectionCipher(page);
      expect(before.health_prs).toHaveLength(3);
      expect(before.health_workouts).toHaveLength(1);

      await target(room.locator('#health-add-lift button'));
      await target(room.locator('#health-add-run button'));
      await target(room.locator('#health-add-other button'));
      await activate(page, room.getByRole('radio', { name: 'Kilograms' }), touch);
      await activate(page, room.getByRole('radio', { name: 'Kilometres' }), touch);
      expect(cipherOnly((await collectionCipher(page)).health_prs)).toEqual(cipherOnly(before.health_prs));
      expect(cipherOnly((await collectionCipher(page)).health_workouts)).toEqual(cipherOnly(before.health_workouts));
      await expect(room).toContainText('140.0 kg');
      await expect(room).toContainText('100.0 kg');
      await expect(room).toContainText('5.00 km');
      await expect(room).toContainText('5:00 /km');

      await activate(page, room.locator(`#health-edit-${runId} button`), touch);
      const runDialog = page.getByRole('dialog', { name: 'Edit run' });
      await expect(runDialog.locator('#health-distance')).toHaveValue('5.00');
      await expect(runDialog.locator('#health-seconds')).toHaveValue('1500');
      await expect(runDialog.locator('.logged-on time')).toHaveAttribute('datetime', '2026-10-20');
      if (touch) await runDialog.getByRole('button', { name: 'Save' }).tap();
      else await runDialog.getByRole('button', { name: 'Save' }).click();
      await expect(runDialog).toHaveCount(0);
      expect(cipherOnly((await collectionCipher(page)).health_prs)).toEqual(cipherOnly(before.health_prs));

      await activate(page, room.locator(`#health-edit-${LIFT_ID} button`), touch);
      const dialog = page.getByRole('dialog', { name: 'Edit lift' });
      await expect(dialog.locator('#health-weight')).toHaveValue('100.0');
      await expect(dialog.locator('.logged-on time')).toHaveAttribute('datetime', DAY);
      await dialog.locator('#health-measured-on').evaluate(node => {
        const input = node as HTMLInputElement;
        input.value = '1899-01-01';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      if (touch) await dialog.getByRole('button', { name: 'Save' }).tap();
      else await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog.locator('#health-measured-on')).toHaveValue('1899-01-01');
      await expect(dialog.locator('#health-measured-on')).toBeFocused();
      await expect(dialog).toContainText('Use a real date from 1900 through today.');
      expect(cipherOnly((await collectionCipher(page)).health_prs)).toEqual(cipherOnly(before.health_prs));
      await dialog.locator('#health-measured-on').evaluate(node => {
        const input = node as HTMLInputElement;
        input.value = '2026-10-28';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await fillControl(page, dialog, '#health-reps', '4', touch);
      failPr = true;
      if (touch) await dialog.getByRole('button', { name: 'Save' }).tap();
      else await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toContainText('Could not save this entry. Try again.');
      await expect(dialog.locator('#health-reps')).toHaveValue('4');
      await expect(dialog.locator('#health-form-error')).toBeFocused();
      conflictPr = true;
      if (touch) await dialog.getByRole('button', { name: 'Save' }).tap();
      else await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toContainText('This entry changed in another tab. Reload and try again.');
      await expect(dialog.locator('#health-reps')).toHaveValue('4');
      await expect(dialog.locator('#health-weight')).toHaveValue('100.0');
      await expect(dialog.locator('#health-form-error')).toBeFocused();
      if (touch) await dialog.getByRole('button', { name: 'Save' }).tap();
      else await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toHaveCount(0);
      const edited = (await collectionCipher(page)).health_prs.find(row => row.client_id === LIFT_ID);
      expect(edited?.ciphertext_b64).not.toBe(before.health_prs.find(row => row.client_id === LIFT_ID)?.ciphertext_b64);
      await activate(page, room.locator(`#health-edit-${LIFT_ID} button`), touch);
      const reopened = page.getByRole('dialog', { name: 'Edit lift' });
      await expect(reopened.locator('#health-weight')).toHaveValue('100.0');
      await expect(reopened.locator('#health-reps')).toHaveValue('4');
      await expect(reopened.locator('.logged-on time')).toHaveAttribute('datetime', DAY);
      if (touch) await reopened.getByRole('button', { name: 'Cancel' }).tap();
      else await page.keyboard.press('Escape');
      await expect(reopened).toHaveCount(0);
      const editedCipher = await collectionCipher(page);

      await activate(page, room.locator(`#health-edit-${sessionId} button`), touch);
      const workout = page.getByRole('dialog', { name: 'Edit session' });
      const box = workout.locator('#health-set-completed-wst_progress01');
      await target(box);
      await expect(box).toBeChecked();
      if (touch) await box.tap();
      else await box.click();
      await expect(box).not.toBeChecked();
      if (touch) await workout.getByRole('button', { name: 'Save' }).tap();
      else await workout.getByRole('button', { name: 'Save' }).click();
      await expect(workout).toHaveCount(0);
      await expect(room).toContainText('Current · Squat · 100.0 kg × 4');
      await expect(room).toContainText('Previous best · Squat · 90.0 kg × 1');
      await expect(room).not.toContainText('140.0 kg');
      expect(cipherOnly((await collectionCipher(page)).health_prs)).toEqual(cipherOnly(editedCipher.health_prs));

      await activate(page, room.locator(`#health-delete-${LIFT_ID} button`), touch);
      const confirm = page.getByRole('dialog', { name: 'Delete this lift?' });
      await confirm.locator('#confirm-phrase-field').fill('DELETE');
      await expect(confirm.getByRole('button', { name: 'Delete lift' })).toHaveAttribute('aria-disabled', 'true');
      await confirm.locator('#confirm-phrase-field').fill('DELETE LIFT');
      if (touch) await confirm.getByRole('button', { name: 'Delete lift' }).tap();
      else await confirm.getByRole('button', { name: 'Delete lift' }).click();
      await expect(confirm).toHaveCount(0);
      await expect(room).toContainText('Current · Squat · 90.0 kg × 1');
      await expect(room).not.toContainText('100.0 kg');
      await expect(room.locator('#health-add-lift button')).toBeFocused();
      expect((await collectionCipher(page)).health_prs.map(row => row.client_id).sort()).toEqual([olderId, runId].sort());
      const roomFits = await room.locator('.health-room').evaluate(node => node.scrollWidth <= node.clientWidth + 1);
      expect(roomFits).toBe(true);
      const readyMotion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(readyMotion).toBe('0s');
      const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    });

    test('opens a no-range lab folder and an older checkup in the clinic archive', async ({ page }) => {
      test.setTimeout(180_000);
      await openClinicArchive(page, width === 390);
    });
  });
}

for (const [width, height, theme] of [[1280, 800, 'light'], [390, 844, 'dark'], [1280, 800, 'dark'], [390, 844, 'light']] as const) {
  test.describe(`workout rest timer at ${width} ${theme}`, () => {
    test.describe.configure({ timeout: 180_000 });
    test.use({
      viewport: { width, height },
      hasTouch: width === 390,
      timezoneId: 'America/Los_Angeles',
    });

    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
      await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
      await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
      await page.addInitScript(() => {
        const record = { constructed: 0, closed: 0, started: 0 };
        const Original = window.AudioContext;
        function Wrapped(this: AudioContext): AudioContext {
          const context = new Original();
          record.constructed += 1;
          const close = context.close.bind(context);
          context.close = () => {
            record.closed += 1;
            return close();
          };
          const create = context.createOscillator.bind(context);
          context.createOscillator = () => {
            const oscillator = create();
            const start = oscillator.start.bind(oscillator);
            oscillator.start = (...args: Parameters<OscillatorNode['start']>) => {
              record.started += 1;
              return start(...args);
            };
            return oscillator;
          };
          return context;
        }
        Wrapped.prototype = Original.prototype;
        window.AudioContext = Wrapped as unknown as typeof AudioContext;
        Object.assign(window, { __restAudio: record });
      });
    });

    test('pauses, leaves, locks, and resumes the same session without a tick or the exercise name', async ({ page }) => {
      test.setTimeout(240_000);
      const touch = width === 390;
      mkdirSync('/tmp/fit-07-captures', { recursive: true });
      const audio = () => page.evaluate(() => {
        const record = (window as unknown as { __restAudio?: { constructed: number; closed: number; started: number } }).__restAudio;
        return record ?? { constructed: 0, closed: 0, started: 0 };
      });
      await syntheticVault(page, SEED);
      await page.goto('/town/gym');
      const room = page.locator('app-health-room');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(room).toHaveAttribute('data-health-state', 'locked');
      const lockedBefore = await room.innerText();
      expect(lockedBefore).not.toContain('Synthetic press');
      expect(await room.locator('#health-rest-clock').count()).toBe(0);
      const motion = await room.locator('.health-room').evaluate(node => getComputedStyle(node).transitionDuration);
      expect(motion).toBe('0s');

      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });

      await activate(page, room.getByRole('button', { name: 'Add exercise' }), touch);
      const exercise = page.getByRole('dialog', { name: 'Add exercise' });
      await expect(exercise.locator('#health-rest-start')).toHaveCount(0);
      await activate(page, exercise.getByRole('button', { name: 'Cancel' }), touch);
      await expect(exercise).toHaveCount(0);

      await activate(page, room.locator('#health-add-session button'), touch);
      const dialog = page.getByRole('dialog', { name: 'Add session' });
      const rest = dialog.locator('.rest');
      await expect(rest).toHaveAttribute('data-rest-phase', 'idle');
      await expect(dialog.locator('#health-rest-clock')).toHaveText('0:00');
      await expect(dialog.locator('#health-rest-status')).toHaveText('Not started');
      await target(dialog.getByRole('button', { name: 'Start rest' }));
      await target(dialog.getByRole('button', { name: 'Pause rest' }));
      await target(dialog.getByRole('button', { name: 'Reset rest' }));
      const restMotion = await rest.evaluate(node => getComputedStyle(node).transitionDuration);
      expect(restMotion).toBe('0s');
      if (touch) {
        await dialog.locator('#health-workout-name').tap();
        await dialog.locator('#health-workout-name').fill('Synthetic press');
        await dialog.locator('#health-workout-load').tap();
        await dialog.locator('#health-workout-load').fill('100');
        await dialog.locator('#health-workout-reps').tap();
        await dialog.locator('#health-workout-reps').fill('5');
      } else {
        await focusControl(page, '#health-workout-name');
        await page.keyboard.type('Synthetic press');
        await focusControl(page, '#health-workout-load');
        await page.keyboard.type('100');
        await focusControl(page, '#health-workout-reps');
        await page.keyboard.type('5');
      }
      const quiet = await audio();
      // Fixed time let the page load. Counting needs Date to move while timers run.
      await page.clock.setSystemTime(new Date('2026-10-29T19:00:00Z'));
      await activate(page, dialog.getByRole('button', { name: 'Start rest' }), touch);
      await expect(rest).toHaveAttribute('data-rest-phase', 'running');
      await expect(rest).toHaveAttribute('data-rest-audio', 'off');
      await expect(dialog.locator('#health-rest-clock')).toHaveText('0:01');
      await rest.screenshot({ path: `/tmp/fit-07-captures/rest-${width}-${theme}-running.png` });
      expect(await rest.innerText()).not.toContain('Synthetic press');
      expect((await dialog.locator('#health-rest-clock').getAttribute('aria-label')) ?? '').not.toContain('Synthetic');
      await activate(page, dialog.getByRole('button', { name: 'Pause rest' }), touch);
      await expect(rest).toHaveAttribute('data-rest-phase', 'paused');
      await page.waitForTimeout(1_200);
      await expect(dialog.locator('#health-rest-clock')).toHaveText('0:01');
      await activate(page, dialog.getByRole('button', { name: 'Reset rest' }), touch);
      await expect(dialog.locator('#health-rest-clock')).toHaveText('0:00');
      await expect(rest).toHaveAttribute('data-rest-phase', 'idle');
      await activate(page, dialog.getByRole('button', { name: 'Start rest' }), touch);
      await activate(page, dialog.getByRole('button', { name: 'Add set' }), touch);
      await expect(rest).toHaveAttribute('data-rest-phase', 'running');
      await expect(dialog.locator('[data-entered-set]')).toHaveCount(1);
      await dialog.locator('#health-workout-note').fill('Synthetic kept');
      await dialog.locator('#health-workout-state').selectOption('draft');
      const fits = await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1);
      expect(fits).toBe(true);
      const openScan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(openScan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      expect(await audio()).toEqual(quiet);
      await activate(page, dialog.getByRole('button', { name: 'Save' }), touch);
      await expect(dialog).toHaveCount(0);
      await expect(room.locator('#health-rest-clock')).toHaveCount(0);
      const draftRow = room.locator('[data-workout-state="draft"]');
      await expect(draftRow).toContainText('Synthetic press');
      await expect(draftRow).toHaveAttribute('data-set-count', '1');

      const resume = room.getByRole('button', { name: /^Resume Draft session/ });
      await activate(page, resume, touch);
      const resumed = page.getByRole('dialog', { name: 'Resume session' });
      await expect(resumed.locator('[data-rest-phase]')).toHaveAttribute('data-rest-phase', 'idle');
      await expect(resumed.locator('#health-rest-clock')).toHaveText('0:00');
      await expect(resumed.locator('#health-workout-name')).toHaveValue('Synthetic press');
      await expect(resumed.locator('#health-workout-note')).toHaveValue('Synthetic kept');
      await expect(resumed.locator('[data-entered-set]')).toHaveCount(1);
      await activate(page, resumed.getByRole('button', { name: 'Start rest' }), touch);
      await expect(resumed.locator('[data-rest-phase]')).toHaveAttribute('data-rest-phase', 'running');
      await activate(page, resumed.getByRole('button', { name: 'Cancel' }), touch);
      await expect(resumed).toHaveCount(0);
      await expect(resume).toBeFocused();
      await page.waitForTimeout(1_200);
      expect(await audio()).toEqual(quiet);

      await activate(page, resume, touch);
      await expect(resumed.locator('[data-rest-phase]')).toHaveAttribute('data-rest-phase', 'idle');
      await expect(resumed.locator('#health-workout-note')).toHaveValue('Synthetic kept');
      await activate(page, resumed.getByRole('button', { name: 'Start rest' }), touch);
      await page.goto('/settings/finance');
      await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
      await expect(page.getByText('Finance locked.')).toBeVisible();
      await page.goto('/town/gym');
      await expect(room).toHaveAttribute('data-health-state', 'locked', { timeout: 90_000 });
      const locked = await room.innerText();
      expect(locked).not.toContain('Synthetic press');
      expect(locked).not.toContain('Synthetic kept');
      noMeasurementDigits(locked);
      expect(await room.locator('#health-rest-clock, #health-workout-name').count()).toBe(0);
      await page.screenshot({ path: `/tmp/fit-07-captures/rest-${width}-${theme}-locked.png` });
      const lockedScan = await new AxeBuilder({ page }).include('app-health-room').analyze();
      expect(lockedScan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
      await page.waitForTimeout(1_200);
      expect((await audio()).started).toBe(quiet.started);

      await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
      await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
      await activate(page, room.getByRole('button', { name: /^Resume Draft session/ }), touch);
      const again = page.getByRole('dialog', { name: 'Resume session' });
      await expect(again.locator('#health-workout-name')).toHaveValue('Synthetic press');
      await expect(again.locator('#health-workout-note')).toHaveValue('Synthetic kept');
      await expect(again.locator('[data-entered-set]')).toHaveCount(1);
      await expect(again.locator('[data-rest-phase]')).toHaveAttribute('data-rest-phase', 'idle');
      await expect(again.locator('#health-rest-clock')).toHaveText('0:00');
      await expect(again.locator('[data-rest-audio]')).toHaveAttribute('data-rest-audio', 'off');
      await target(again.getByRole('button', { name: 'Start rest' }));
      await target(again.getByRole('button', { name: 'Pause rest' }));
      await target(again.getByRole('button', { name: 'Reset rest' }));
    });
  });
}

test.describe('workout rest timer sound', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1280, height: 800 }, timezoneId: 'America/Los_Angeles' });

  test('plays a tick only while the session is open and sound is on', async ({ page, request }) => {
    test.setTimeout(240_000);
    expect((await request.post('/e2e/reset?seed=town')).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date('2026-10-29T19:00:00Z'));
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await page.addInitScript(sceneKey => {
      localStorage.setItem('suite-theme', 'light');
      localStorage.setItem(sceneKey, JSON.stringify({ season: 'default', sound: true }));
      const record = { constructed: 0, closed: 0, started: 0 };
      const Original = window.AudioContext;
      function Wrapped(this: AudioContext): AudioContext {
        const context = new Original();
        record.constructed += 1;
        const close = context.close.bind(context);
        context.close = () => {
          record.closed += 1;
          return close();
        };
        const create = context.createOscillator.bind(context);
        context.createOscillator = () => {
          const oscillator = create();
          const start = oscillator.start.bind(oscillator);
          oscillator.start = (...args: Parameters<OscillatorNode['start']>) => {
            record.started += 1;
            return start(...args);
          };
          return oscillator;
        };
        return context;
      }
      Wrapped.prototype = Original.prototype;
      window.AudioContext = Wrapped as unknown as typeof AudioContext;
      Object.assign(window, { __restAudio: record });
    }, scenePreferenceKey(987)); // harness /api/auth/me owner, not the town fixture user
    const audio = () => page.evaluate(() => {
      const record = (window as unknown as { __restAudio?: { constructed: number; closed: number; started: number } }).__restAudio;
      if (!record) throw new Error('missing audio record');
      return record;
    });
    await syntheticVault(page, SEED);
    await page.goto('/town/gym');
    const room = page.locator('app-health-room');
    await activate(page, room.getByRole('link', { name: 'Unlock' }), false);
    await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
    await activate(page, room.locator('#health-add-session button'), false);
    const dialog = page.getByRole('dialog', { name: 'Add session' });
    await focusControl(page, '#health-workout-name');
    await page.keyboard.type('Synthetic press');
    const before = await audio();
    await page.clock.setSystemTime(new Date('2026-10-29T19:00:00Z'));
    await activate(page, dialog.getByRole('button', { name: 'Start rest' }), false);
    await expect(dialog.locator('[data-rest-audio]')).toHaveAttribute('data-rest-audio', 'live');
    await expect(dialog.locator('#health-rest-clock')).toHaveText('0:01');
    const ticking = await audio();
    expect(ticking.constructed).toBe(before.constructed + 1);
    expect(ticking.started).toBeGreaterThan(before.started);
    await activate(page, dialog.getByRole('button', { name: 'Pause rest' }), false);
    await page.waitForTimeout(1_200);
    expect(await audio()).toEqual({ ...ticking, started: ticking.started });
    await activate(page, dialog.getByRole('button', { name: 'Cancel' }), false);
    await expect(dialog).toHaveCount(0);
    await page.waitForTimeout(1_200);
    const left = await audio();
    expect(left.started).toBe(ticking.started);
    expect(left.closed).toBeGreaterThanOrEqual(before.closed + 1);
    await activate(page, room.locator('#health-add-session button'), false);
    const again = page.getByRole('dialog', { name: 'Add session' });
    await expect(again.locator('#health-workout-name')).toHaveValue('Synthetic press');
    await expect(again.locator('[data-rest-phase]')).toHaveAttribute('data-rest-phase', 'idle');
    await expect(again.locator('[data-rest-audio]')).toHaveAttribute('data-rest-audio', 'off');
    await expect(again.locator('#health-rest-clock')).toHaveText('0:00');
  });
});

async function selectedDefinition(dialog: Locator): Promise<{ value: string; label: string }> {
  return dialog.locator('#health-workout-definition').evaluate(node => {
    const select = node as HTMLSelectElement;
    const option = select.selectedOptions[0];
    return { value: option?.value ?? '', label: option?.textContent?.trim() ?? '' };
  });
}

async function fillControl(page: Page, dialog: Locator, selector: string, value: string, touch: boolean): Promise<void> {
  const locator = dialog.locator(selector);
  await expect(locator).toBeVisible();
  await target(locator);
  if (touch) {
    await locator.tap();
    await locator.fill(value);
    return;
  }
  await locator.focus();
  await expect(locator).toBeFocused();
  await locator.fill('');
  await page.keyboard.type(value);
}

async function focusControl(page: Page, selector: string): Promise<void> {
  for (let step = 0; step < 12; step += 1) {
    const focused = await page.evaluate(sel => document.activeElement instanceof Element && document.activeElement.matches(sel), selector);
    if (focused) return;
    await page.keyboard.press('Tab');
  }
  await expect(page.locator(selector)).toBeFocused();
}

async function vaultCall(page: Page, path: string, init?: { method?: string; body?: unknown }): Promise<VaultBody> {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${path} ${text}`);
    return text ? JSON.parse(text) : null;
  }, { path, init: init ?? null });
}

async function collectionCipher(page: Page): Promise<Record<string, Array<{ client_id: string; ciphertext_b64: string; revision: number }>>> {
  const names = ['health_stats', 'health_prs', 'health_workouts'];
  const out: Record<string, Array<{ client_id: string; ciphertext_b64: string; revision: number }>> = {};
  for (const name of names) {
    const rows = await vaultCall(page, `/api/vault/records?collection=${name}`) as Array<{ client_id: string; ciphertext_b64: string; revision: number }>;
    out[name] = rows.map(row => ({ client_id: row.client_id, ciphertext_b64: row.ciphertext_b64, revision: row.revision }))
      .sort((a, b) => a.client_id.localeCompare(b.client_id));
  }
  return out;
}

interface VaultBody {
  fingerprint?: string;
  id?: string;
  collections?: Array<{ collection: string }>;
  records?: Array<{ collection: string; client_id: string; ciphertext_b64: string; schema_version: number; key_version: number; revision: number }>;
}

function cipherOnly(rows: Array<{ client_id: string; ciphertext_b64: string }>): Array<{ client_id: string; ciphertext_b64: string }> {
  return rows.map(row => ({ client_id: row.client_id, ciphertext_b64: row.ciphertext_b64 }));
}

function cipherOf(snapshot: { records?: VaultBody['records'] }, collection: string) {
  return (snapshot.records ?? []).filter(row => row.collection === collection)
    .map(row => ({ client_id: row.client_id, ciphertext_b64: row.ciphertext_b64, revision: row.revision }))
    .sort((a, b) => a.client_id.localeCompare(b.client_id));
}

function historyId(mark: string, index: number): string {
  return `hlt_${mark}${String(index).padStart(21, '0')}`;
}

function historyDay(index: number): string {
  return new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10);
}

async function openClinicArchive(page: Page, touch: boolean): Promise<void> {
  const older = '2026-09-02';
  const marker = 'Ω-marker';
  const other = 'Ω-other';
  const held = 'Ω-held';
  const olderNote = 'Older synthetic visit';
  const newerNote = 'Newer synthetic visit';
  const town: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/town')) town.push(`${request.method()} ${url.pathname}${url.search}\n${request.postData() ?? ''}`);
  });
  await page.goto('/town');
  const exterior = page.locator('[data-building="clinic"]');
  await expect(exterior).toBeVisible();
  const exteriorText = await exterior.innerText();
  expect(exteriorText).not.toContain(marker);
  expect(exteriorText).not.toContain(other);
  expect(exteriorText).not.toContain(olderNote);
  noMeasurementDigits(exteriorText);
  const vault = await syntheticVault(page, {
    ...SEED,
    health_stats: [
      ...SEED.health_stats,
      {
        client_id: 'hlt_SyntheticLabBelowRange',
        v: 1,
        kind: 'lab',
        measured_on: DAY,
        logged_on: DAY,
        lab: { name: marker, value: 9, unit: 'u', ref_low: 10, ref_high: 20 },
      },
      {
        client_id: 'hlt_SyntheticLabNoRangeABC',
        v: 1,
        kind: 'lab',
        measured_on: DAY,
        logged_on: DAY,
        lab: { name: other, value: 4, unit: 'u' },
      },
      {
        client_id: 'hlt_SyntheticCheckupOlderAB',
        v: 1,
        kind: 'checkup',
        measured_on: older,
        logged_on: older,
        note: olderNote,
      },
      {
        client_id: 'hlt_SyntheticCheckupEntryAB',
        v: 1,
        kind: 'checkup',
        measured_on: DAY,
        logged_on: DAY,
        note: newerNote,
      },
    ],
  });
  const room = page.locator('app-health-room');
  for (const object of ['labs', 'checkups']) {
    await page.goto('/town/clinic?object=' + object);
    await expect(room).toHaveAttribute('data-health-state', 'locked');
    await neutralPreview(room);
    const locked = await room.innerText();
    expect(locked).not.toContain(marker);
    expect(locked).not.toContain(other);
    expect(locked).not.toContain(olderNote);
    await expect(room.locator('[data-clinic-table]')).toHaveCount(0);
  }

  await activate(page, room.getByRole('link', { name: 'Unlock' }), touch);
  await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(room).toHaveAttribute('data-health-state', 'ready', { timeout: 90_000 });
  await expect(page).toHaveURL(/\/town\/clinic\?object=checkups$/);
  await expect(room.locator('#clinic-object-title')).toHaveText('Checkup book');
  const folders = room.locator('.clinic-objects').getByRole('button', { name: 'Lab folders', exact: true });
  await target(folders);
  await activate(page, folders, touch);
  await expect(room.locator('#clinic-object-title')).toContainText('Lab folders');
  await expect(room.locator('#health-group-labs')).toHaveCount(0);
  const otherFolder = room.locator('[data-clinic-folder]').filter({ hasText: other }).getByRole('button');
  await target(otherFolder);
  await activate(page, otherFolder, touch);
  await expect(room.locator('h3.lab-folder')).toContainText(other);
  const none = room.locator('[data-clinic-table="none"] td');
  await expect(none.nth(0)).toHaveText(DAY);
  await expect(none.nth(1)).toHaveText('4');
  await expect(none.nth(2)).toHaveText('u');
  await expect(none.nth(3)).toHaveText('no range');
  await expect(room.locator('[data-clinic-unit="lab"]')).toHaveText('Shown in u.');
  await expect(room.locator('[data-clinic-table="none"]')).not.toContainText('10 to 20');
  await expect(room.locator('[data-clinic-table="below"]')).toHaveCount(0);
  const overflow = await room.evaluate(node => (node as HTMLElement).scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const motion = await room.locator('app-clinic-room').evaluate(node => getComputedStyle(node).transitionDuration);
  expect(motion).toBe('0s');

  const edit = room.getByRole('button', { name: `Edit Lab · ${other} · 4 u · no range · ${DAY}` });
  await target(edit);
  await activate(page, edit, touch);
  const editor = page.getByRole('dialog', { name: 'Edit lab result' });
  await enter(page, editor.locator('#health-lab-name'), held, touch);
  vault.failNextWrites(1);
  if (touch) await editor.getByRole('button', { name: 'Save' }).tap();
  else await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor).toContainText('Could not save this entry. Try again.');
  await expect(editor.locator('#health-lab-name')).toHaveValue(held);
  await expect(none.nth(1)).toHaveText('4');
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(room).not.toContainText(held);

  const back = room.getByRole('button', { name: 'All lab folders', exact: true });
  await target(back);
  await activate(page, back, touch);
  await expect(otherFolder).toBeFocused();
  const markerFolder = room.locator('[data-clinic-folder]').filter({ hasText: marker }).getByRole('button');
  await activate(page, markerFolder, touch);
  const below = room.locator('[data-clinic-table="below"]');
  await expect(below).toContainText(DAY);
  await expect(below).toContainText('9');
  await expect(below).toContainText('u');
  await expect(below).toContainText('below range · 10 to 20 u');

  const book = room.locator('.clinic-objects').getByRole('button', { name: 'Checkup book', exact: true });
  await target(book);
  await activate(page, book, touch);
  await expect(room.locator('#clinic-object-title')).toContainText('Checkup book');
  await expect(room.locator('#health-group-checkups')).toHaveCount(0);
  const visits = room.locator('[data-clinic-checkup]');
  await expect(visits.nth(0)).toContainText(DAY);
  await expect(visits.nth(0)).toContainText(newerNote);
  await expect(visits.nth(1)).toContainText(older);
  await expect(visits.nth(1)).toContainText(olderNote);
  await expect(room.locator('[data-clinic-date="checkup"]')).toContainText('measured dates');
  const bookText = await room.innerText();
  expect(bookText).not.toMatch(/diagnos|healthy|normal/i);
  const scan = await new AxeBuilder({ page }).include('app-health-room').analyze();
  expect(scan.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  for (const entry of town) {
    expect(entry).not.toContain(marker);
    expect(entry).not.toContain(other);
    expect(entry).not.toContain(held);
    expect(entry).not.toContain(olderNote);
  }

  await activate(page, page.getByRole('button', { name: 'synthetic', exact: true }), touch);
  await activate(page, page.getByRole('button', { name: 'Sign out', exact: true }), touch);
  await expect.poll(async () => {
    const text = await page.locator('body').innerText();
    return [marker, other, held, olderNote, newerNote].every(secret => !text.includes(secret));
  }).toBe(true);
  await expect(page.locator('[data-clinic-table], [data-clinic-folder], #health-lab-name')).toHaveCount(0);
}

async function saveLab(
  page: Page,
  room: Locator,
  touch: boolean,
  name: string,
  value: string,
  low: string,
  high: string,
  saved: string,
): Promise<void> {
  await saveVital(page, room, touch, 'Add lab result', 'Add lab result', async dialog => {
    await enter(page, dialog.locator('#health-lab-name'), name, touch);
    await enter(page, dialog.locator('#health-lab-value'), value, touch);
    await enter(page, dialog.locator('#health-lab-unit'), 'u', touch);
    if (low) await enter(page, dialog.locator('#health-lab-ref-low'), low, touch);
    if (high) await enter(page, dialog.locator('#health-lab-ref-high'), high, touch);
  }, saved);
}

async function enter(page: Page, locator: Locator, value: string, touch: boolean): Promise<void> {
  await target(locator);
  if (touch) {
    await locator.tap();
    await locator.fill(value);
    return;
  }
  await locator.focus();
  await locator.fill(value);
}

async function saveVital(
  page: Page,
  room: Locator,
  touch: boolean,
  addName: string,
  dialogName: string,
  fill: (dialog: Locator) => Promise<void>,
  saved: string,
): Promise<void> {
  const add = room.getByRole('button', { name: addName, exact: true });
  await target(add);
  await activate(page, add, touch);
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#health-measured-on')).toBeFocused();
  const date = dialog.locator('#health-measured-on');
  await target(date);
  if (touch) {
    await date.tap();
    await date.fill(DAY);
  } else {
    await date.fill(DAY);
  }
  await fill(dialog);
  if (touch) await dialog.getByRole('button', { name: 'Save' }).tap();
  else await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(room).toContainText(saved);
}
