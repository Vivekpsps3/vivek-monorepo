import { test as base, expect } from '@playwright/test';

/**
 * Noon on 2026-10-15 in America/Los_Angeles (PDT, UTC-7).
 * The instant is absolute, so Node's TZ cannot move the calendar day.
 * UTC and Los Angeles both land on 2026-10-15.
 */
const FROZEN_EPOCH = Date.parse('2026-10-15T12:00:00-07:00');

export function frozenNow(): Date {
  return new Date(FROZEN_EPOCH);
}

/** Node-side "today". Matches the browser's local date at the frozen instant. */
export function frozenToday(): string {
  return '2026-10-15';
}

/**
 * install() starts the fake clock at this instant and leaves it running, so
 * setTimeout and Date.now() advance together. setFixedTime keeps Date.now()
 * still, and RxJS debounceTime waits for that clock to reach the due time, so
 * the import account list never arrives. A running clock stays on 2026-10-15
 * for the length of a Finance test.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: frozenNow() });
    await use(page);
  },
});

export { expect };
export type { Page } from '@playwright/test';
