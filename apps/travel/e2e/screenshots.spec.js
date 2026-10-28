import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const dir = process.env.SCREENSHOT_DIR || 'test-results/artifacts/travel-ux';
const widths = (process.env.SHOT_WIDTHS || '390,768,1280').split(',').map(Number);
const themes = (process.env.SHOT_THEMES || 'light,dark').split(',');

for (const width of widths) for (const theme of themes) {
  test('Travel empty, populated, editor, error and focus scenes at ' + width + ' ' + theme, async ({ page, request }) => {
    test.setTimeout(180_000);
    await request.post('/e2e/reset');
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/travel');
    await chooseColorTheme(page, theme);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const shot = async name => {
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: path.join(dir, name + '-' + width + '-' + theme + '.png'), fullPage: true });
    };
    for (const [name, route] of [['home-empty','/travel'],['calendar-empty','/travel/calendar?month=2026-10'],['pto-empty','/travel/pto'],['settings-blank','/travel/settings'],['newtrip-blank','/travel/trips/new']]) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      await shot(name);
    }
    await page.getByLabel('Departure date').fill('2026-10-24');
    await page.getByLabel('Return date').fill('2026-10-30');
    await page.getByLabel('Destination city').fill('Puerto Viejo de la Costa Rica Sur');
    await page.getByText('Add destination', { exact: true }).first().click();
    await page.getByLabel('Change city on date').fill('2026-10-27');
    await page.getByRole('button', { name: 'Add destination', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save trip', exact: true })).toBeDisabled();
    await shot('newtrip-unnamed-city');
    await page.getByLabel('Next destination city').fill('Osaka');
    await page.getByText('Time off', { exact: true }).click();
    const pto = page.getByRole('checkbox', { name: 'Count selected dates as PTO' });
    await pto.uncheck();
    await shot('newtrip-pto-off');
    await pto.check();
    await pto.focus();
    await shot('newtrip-pto-focus');
    await page.route('**/travel/api/trips', route => route.request().method() === 'POST'
      ? route.fulfill({ status: 502, json: { message: 'Temporary save outage. Your trip draft remains here.' } }) : route.continue());
    await page.getByRole('button', { name: 'Save trip', exact: true }).click();
    await expect(page.locator('main [role=alert]')).toBeVisible();
    await shot('newtrip-server-error');
    await page.unroute('**/travel/api/trips');
    await page.getByRole('button', { name: 'Save trip', exact: true }).click();
    await expect(page).toHaveURL(/\/travel\/trips\/\d+$/);
    const id = Number(page.url().split('/').pop());
    await shot('trip-quiet');
    await request.post('/travel/api/trips/' + id + '/plans', { data: { on_date: '2026-10-25', title: 'Tea garden', kind: 'activity' } });
    await request.post('/travel/api/trips/' + id + '/parking', { data: { place_name: 'Airport lot', necessary: 'yes', booked: true } });
    await request.post('/travel/api/trips/' + id + '/notes', { data: { body: 'Window seat if it is free.' } });
    await request.post('/travel/api/trips/' + id + '/reminders', { data: { title: 'Check booking' } });
    await request.post('/travel/api/trips/' + id + '/budget-lines', { data: { category: 'other', label: 'Travel insurance', amount: '40.00', currency: 'USD' } });
    await page.reload();
    await expect(page.getByText('Tea garden', { exact: false })).toBeVisible();
    await shot('trip-populated');
    await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
    await shot('trip-confirm');
    await page.getByRole('button', { name: 'Keep trip' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    for (const [button, field, value] of [
      ['Edit trip','Trip name','Autumn in Japan'],
      ['Add activity','Activity title','Long museum visit'],
      ['Add destination','Destination city','Puerto Viejo de la Costa Rica Sur'],
      ['Add parking','Address','Terminal long term parking'],
      ['Add note','Note','Window seat if it is free.'],
      ['Add reminder','Reminder','Book the airport shuttle'],
      ['Add cost','Cost label','Airport shuttle'],
    ]) {
      if (button.startsWith('Add ') && !['Add activity'].includes(button)) await page.getByText('Add more', { exact: true }).click();
      await page.getByRole('button', { name: button, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await shot(button.toLowerCase().replaceAll(' ','-') + '-blank');
      if (field === 'Address') await dialog.getByText('Optional details', { exact: true }).click();
      const input = dialog.getByLabel(field, { exact: false });
      await input.fill(value);
      await input.focus();
      await shot(button.toLowerCase().replaceAll(' ','-') + '-focused-filled');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('dialog', { name: 'Discard this draft?' }).getByRole('button', { name: 'Discard changes' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const addMore = page.locator('details.add-menu');
      if (await addMore.getAttribute('open') !== null) await addMore.locator('summary').click();
    }
    await page.getByRole('button', { name: 'Add transport', exact: true }).click();
    await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('drive');
    await page.getByLabel('From', { exact: true }).fill('Home');
    await page.getByLabel('To', { exact: true }).fill('Airport');
    await shot('transport-manual');
    await page.getByRole('button', { name: 'Save transport', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/travel/calendar?month=2026-10');
    await expect(page.getByText('Tea garden', { exact: false })).toBeVisible();
    await shot('calendar-populated');
    await page.goto('/travel/pto');
    await page.getByLabel('Known balance (days)').fill('12.5');
    await page.getByLabel('Balance date').fill('2026-10-01');
    await page.getByLabel('Accrual amount').fill('1.25');
    await shot('pto-filled');
    await page.getByRole('button', { name: 'Save PTO policy' }).click();
    await expect(page.locator('main [role=status]')).toContainText('PTO saved');
    await shot('pto-success');
    await page.goto('/travel/settings');
    await page.getByLabel('New FlightAware API key').fill('synthetic-key-1234');
    await shot('settings-filled');
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.locator('main [role=status]')).toContainText('Key saved');
    await expect(page.getByLabel('New FlightAware API key')).toHaveValue('');
    await shot('settings-success');
    await page.goto('/travel/trips/999999');
    await expect(page.locator('main [role=alert]')).toBeVisible();
    await shot('trip-missing');
    expect(errors).toEqual([]);
  });
}
