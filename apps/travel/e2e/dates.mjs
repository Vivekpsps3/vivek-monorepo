import { formatDateRange, formatDay } from '../../../packages/browser/runtime/calendar-format.mjs';

export { formatDateRange, formatDay };

/** Saved trips label each day with formatDay. The new-trip form still uses the ISO day. */
export function ptoChoice(page, day) {
  return page.getByRole('combobox', { name: formatDay(day), exact: true })
    .or(page.getByRole('combobox', { name: day, exact: true }));
}

/** The date line is projected into the page header, not a sibling of the h1. */
export function tripHeader(page, title) {
  return page.locator('ui-page-header').filter({
    has: page.getByRole('heading', { level: 1, name: title, exact: true }),
  });
}
