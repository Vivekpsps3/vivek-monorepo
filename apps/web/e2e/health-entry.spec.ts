import AxeBuilder from '@axe-core/playwright';
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
      const appearance = page.getByRole('navigation', { name: 'Settings', exact: true }).getByRole('link', { name: 'Appearance', exact: true });
      await expect(appearance).toBeVisible();
      if (touch) await appearance.tap();
      else await appearance.press('Enter');
      await expect(page).toHaveURL(/\/settings\/appearance$/);
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
      const add = room.getByRole('button', { name: 'Add session' });
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

      await activate(page, room.getByRole('button', { name: 'Add session' }), touch);
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

      await activate(page, room.getByRole('button', { name: 'Add session' }), touch);
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
      const resume = room.getByRole('button', { name: /Resume/ });
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
      await activate(pageB, roomB.getByRole('button', { name: /Resume/ }), touch);
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
      await activate(pageB, roomB.getByRole('button', { name: /Resume/ }), touch);
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

      await activate(page, room.getByRole('button', { name: 'Add session' }), touch);
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
