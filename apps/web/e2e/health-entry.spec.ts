import AxeBuilder from '@axe-core/playwright';
import { displayWeight, lbToKg } from '../src/app/town/health/health-units';
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
  });
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
