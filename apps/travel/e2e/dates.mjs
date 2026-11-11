import { expect } from '@playwright/test';
import { formatDateRange, formatDay } from '../../../packages/browser/runtime/calendar-format.mjs';

export { formatDateRange, formatDay };

/** Saved trips label each day with formatDay. The new-trip form still uses the ISO day. */
export function ptoChoice(page, day) {
  return page.getByRole('combobox', { name: formatDay(day), exact: true })
    .or(page.getByRole('combobox', { name: day, exact: true }));
}

/** Section titles stay in the accessibility tree and are clipped out of view. */
export async function expectSectionHeading(page, name) {
  const heading = page.getByRole('heading', { level: 1, name, exact: true });
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveClass(/ui-page-header__title--concealed/);
  const box = await heading.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(2);
  expect(box?.height ?? 0).toBeLessThanOrEqual(2);
  return heading;
}

/** Trip-detail Add menu. Item names are the seven menuitems. */
export async function openTripAdd(page, name) {
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

/** Inline buttons at wide widths, one row menu at narrow widths. */
export async function removeRow(row) {
  const menu = row.getByRole('button', { name: /^Actions for / });
  if (await menu.isVisible()) {
    await menu.click();
    await row.getByRole('menuitem', { name: /^Remove/ }).click();
    return;
  }
  await row.getByRole('button', { name: /^Remove/ }).click();
}

export async function runRowAction(row, action) {
  const menu = row.getByRole('button', { name: /^Actions for / });
  if (await menu.isVisible()) {
    await menu.click();
    await row.getByRole('menuitem', { name: action, exact: true }).click();
    return;
  }
  await row.getByRole('button', { name: action, exact: true }).click();
}

/** The date line is projected into the page header, not a sibling of the h1. */
export function tripHeader(page, title) {
  return page.locator('ui-page-header').filter({
    has: page.getByRole('heading', { level: 1, name: title, exact: true }),
  });
}

/** Fixed-date fixtures can move into the collapsed past-trip list over time. */
export async function openTripFromList(page, title) {
  const heading = page.getByRole('heading', { name: title, exact: true, includeHidden: true });
  await heading.waitFor({ state: 'attached' });
  if (!(await heading.isVisible())) {
    await page.locator('details').filter({ has: heading }).locator('summary').click();
  }
  await heading.click();
}
