import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../tests/e2e/fixtures';

test.use({ hasTouch: true });

for (const width of [390, 1280]) for (const theme of ['light', 'dark']) {
  test(`crafted Travel controls correct and save at ${width} ${theme}`, async ({ page, request }, info) => {
    expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.addInitScript(value => localStorage.setItem('suite-theme', value), theme);
    await page.goto('/travel/trips/new');
    const saveTrip = page.getByRole('button', { name: 'Save trip', exact: true });
    await saveTrip.focus();
    await page.keyboard.press('Enter');
    const departure = page.getByLabel('Departure date');
    await expect(departure).toBeFocused();
    await expect(departure).toHaveAttribute('aria-invalid', 'true');
    const errorId = (await departure.getAttribute('aria-describedby')).split(/\s+/).find(id => id.endsWith('-error'));
    await expect(page.locator(`[id="${errorId}"]`)).toContainText('Pick the day');
    await departure.hover();
    const paint = await departure.evaluate(node => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--danger)';
      document.body.append(probe);
      const value = { border: getComputedStyle(node).borderColor, danger: getComputedStyle(probe).color };
      probe.remove();
      return value;
    });
    expect(paint.border).toBe(paint.danger);
    await info.attach('linked-error', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await departure.fill('2026-12-01');
    await expect(departure).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Return date').fill('2026-12-03');
    await page.getByLabel('Destination city').fill('Kyoto');
    await page.getByText('Time off', { exact: true }).click();
    const selected = page.getByRole('radio', { name: 'Full', exact: true }).first();
    await expect(selected).toBeChecked();
    for (const control of [departure, selected.locator('..'), saveTrip]) {
      const box = await control.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await saveTrip.tap();
    await expect(page.getByRole('heading', { name: 'Kyoto', level: 1, exact: true })).toBeVisible();
    const id = Number(new URL(page.url()).pathname.split('/').pop());
    for (const motion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion: motion });
      const add = page.getByRole('button', { name: 'Add', exact: true });
      await add.focus();
      await page.keyboard.press('ArrowDown');
      const noteItem = page.getByRole('menuitem', { name: 'Note', exact: true });
      await expect(page.getByRole('menuitem').first()).toBeFocused();
      expect((await noteItem.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await info.attach(`menu-${motion}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await noteItem.tap();
      const dialog = page.getByRole('dialog', { name: 'Add note', exact: true });
      const note = dialog.getByLabel('Note', { exact: true });
      await expect(note).toBeFocused();
      if (motion === 'reduce') await expect(dialog).toHaveCSS('animation-name', 'none');
      else await expect(dialog).toHaveCSS('animation-name', /ui-dialog-in$/);
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(note).toBeFocused();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await info.attach(`dialog-${motion}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await page.keyboard.press('Escape');
      const discard = page.getByRole('dialog', { name: 'Discard this draft?', exact: true });
      await expect(discard).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(discard).toBeHidden();
      await expect(note).toBeFocused();
      await page.keyboard.press('Escape');
      await discard.getByRole('button', { name: 'Discard changes', exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(add).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    }
    const stored = await (await request.get(`/travel/api/trips/${id}`)).json();
    expect(stored.stays.map(stay => [stay.city, stay.arrive_on, stay.leave_on])).toEqual([['Kyoto', '2026-12-01', '2026-12-03']]);
    expect(stored.note_entries).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
