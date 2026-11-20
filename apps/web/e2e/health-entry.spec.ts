import AxeBuilder from '@axe-core/playwright';
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
  const box = await locator.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
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

function noMeasurementDigits(text: string): void {
  expect(text).not.toContain('176.4');
  expect(text).not.toContain('220.5');
  expect(text).not.toContain('64.25');
  expect(text).not.toContain('80.0');
  expect(text).not.toContain('Squat');
  expect(text).not.toMatch(/\d/);
}

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
  });
}
