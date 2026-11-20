import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '../../../tests/e2e/fixtures';
import { chooseColorTheme } from '../../../tests/e2e/user-menu.mjs';
import { SYNTHETIC_VAULT_PASSPHRASE, syntheticVault } from '../../../tests/e2e/synthetic-vault-harness';

// Synthetic vault rows only. The marker stays in Finance and must not appear on the trip.
const POSTED_LABEL = '2026-11-02 · Travel';
const FLIGHT = 'SYN 100';
/** formatMoney inserts a word joiner between the currency symbol and the amount. */
const usd = (amount: string) => new RegExp(`\\$\\u2060${amount.replace('.', '\\.')}`);

function postedTransaction(tripId: number) {
  return {
    id: 91001,
    date: '2026-11-02',
    type: 'expense',
    kind: 'purchase',
    category: 'Travel',
    amount: 420,
    trip_id: tripId,
    description: 'SYN flight marker',
    merchant: 'Hidden airline',
    account_display: 'Hidden card',
  };
}

async function seedStageTrip(request: { post: (url: string, options: { data: unknown }) => Promise<{ ok: () => boolean; text: () => Promise<string>; json: () => Promise<{ id: number }> }> }) {
  const created = await request.post('/travel/api/trips', {
    data: { title: 'Stage costs', start_date: '2026-11-02', end_date: '2026-11-04' },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  const base = `/travel/api/trips/${trip.id}`;
  const flight = await request.post(`${base}/transports`, {
    data: {
      mode: 'flight',
      role: 'outbound',
      carrier: 'SYN',
      number: '100',
      depart_place: 'Harbor',
      arrive_place: 'Field',
      cost: '420.00',
      currency: 'USD',
      paid: true,
    },
  });
  expect(flight.ok(), await flight.text()).toBeTruthy();
  const plan = await request.post(`${base}/plans`, {
    data: { title: 'Museum hour', kind: 'activity', on_date: '2026-11-03', cost: '15.00', currency: 'USD', paid: false },
  });
  expect(plan.ok(), await plan.text()).toBeTruthy();
  const guide = await request.post(`${base}/plans`, {
    data: { title: 'Guidebook', kind: 'activity', on_date: '2026-11-03', cost: '8.00', currency: 'EUR', paid: false },
  });
  expect(guide.ok(), await guide.text()).toBeTruthy();
  return trip;
}

function installRoutes(page: Page) {
  let failNext = false;
  let holdNext = false;
  let releaseHold: (() => void) | null = null;
  const held = { active: false };
  const arm = {
    failOnce() { failNext = true; },
    holdOnce() { holdNext = true; },
    release() { releaseHold?.(); },
    get holding() { return held.active; },
  };
  return {
    arm,
    ready: (async () => {
      await page.route('**/travel/api/**', (route) => route.continue());
      await page.route('**/e2e/**', (route) => route.continue());
      await page.route('**/api/vault/records**', async (route: Route) => {
        const url = new URL(route.request().url());
        const transactions = route.request().method() === 'GET' && url.searchParams.get('collection') === 'transactions';
        if (transactions && failNext) {
          failNext = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Synthetic read failure"}' });
          return;
        }
        if (transactions && holdNext) {
          holdNext = false;
          held.active = true;
          await new Promise<void>((resolve) => {
            releaseHold = () => {
              held.active = false;
              resolve();
            };
          });
        }
        await route.fallback();
      });
    })(),
  };
}

/** Stay inside the open app. A document load would drop the session link and the unlocked key timing. */
async function visit(page: Page, path: string) {
  await page.evaluate((next) => {
    history.pushState(null, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function openUnlockedTrip(page: Page, request: Parameters<typeof seedStageTrip>[0], theme: 'light' | 'dark') {
  const trip = await seedStageTrip(request);
  const vault = await syntheticVault(page, { transactions: [postedTransaction(trip.id)] });
  const routes = installRoutes(page);
  await routes.ready;
  await page.goto(`/travel/trips/${trip.id}`);
  await chooseColorTheme(page, theme);
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/finance/vault/unlock`);
  await page.getByRole('textbox', { name: 'Vault passphrase', exact: true }).fill(SYNTHETIC_VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/?$/);
  await page.goto(`${origin}/travel/trips/${trip.id}`);
  const section = page.locator('travel-trip-costs');
  await expect(section.getByText('Spent in Finance:', { exact: false }).first()).toBeVisible();
  await expect(section.getByText(FLIGHT)).toBeVisible();
  return { trip, vault, section, routes };
}

async function expectView(page: Page, section: ReturnType<Page['locator']>) {
  const axe = await new AxeBuilder({ page }).include('travel-trip-costs').analyze();
  expect(axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '') || item.id === 'color-contrast')).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(section).toHaveCSS('animation-name', 'none');
  for (const name of ['Link posted transaction', 'Clear link', 'Cancel', 'Try again']) {
    const button = section.getByRole('button', { name, exact: true });
    if (await button.count()) {
      const box = await button.first().boundingBox();
      expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
    }
  }
}

test.beforeEach(async ({ request }) => {
  expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
});

test.describe('cost reconcile touch night', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });

  test('a booked flight linked to one posted transaction counts once, then delete clears the private spend', async ({ page, request }) => {
    test.setTimeout(90_000);
    const { vault, section, trip } = await openUnlockedTrip(page, request, 'dark');
    await expect(section.getByText('No posted EUR')).toBeVisible();
    await expect(section.getByText('Planned').first()).toBeVisible();
    await expect(section.getByText(usd('15.00')).first()).toBeVisible();
    await expect(section.getByText('Booked').first()).toBeVisible();
    await expect(section.locator('.cost-total').filter({ hasText: usd('435.00') })).toBeVisible();
    await expect(section.getByText(usd('840.00'))).toHaveCount(0);
    const link = section.getByRole('button', { name: 'Link posted transaction', exact: true });
    const linkBox = await link.boundingBox();
    expect(linkBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await link.tap();
    const choice = section.getByRole('button', { name: new RegExp(POSTED_LABEL) });
    await choice.tap();
    await expect(section.getByText('Linked · counted once')).toBeVisible();
    await expect(section.getByText('Counted once', { exact: true })).toBeVisible();
    await expect(section.getByText('The linked booked cost and posted transaction are one payment.')).toBeVisible();
    await expect(section.getByText(usd('420.00')).first()).toBeVisible();
    await expect(section.getByText(usd('840.00'))).toHaveCount(0);
    await expect(section.getByText('SYN flight marker')).toHaveCount(0);
    await expect(section.getByText('Hidden airline')).toHaveCount(0);
    await expect(section.getByText('Hidden card')).toHaveCount(0);
    expect(vault.mutations.filter((change) => String(change.path).includes('upsert'))).toEqual([]);
    await expect(section.getByRole('button', { name: 'Clear link', exact: true })).toBeFocused();
    await expectView(page, section);

    await visit(page, '/finance/spending?t=activity&month=2026-11');
    const row = page.locator('details.tx-mobile-row').filter({ hasText: 'Travel' });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('summary').tap();
    await row.locator('.tx-mobile-details').getByRole('button', { name: 'Delete', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: 'Delete transaction?' });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).tap();
    await expect(page.getByText('Transaction deleted', { exact: true })).toBeVisible();

    await visit(page, `/travel/trips/${trip.id}`);
    await expect(section.getByText(FLIGHT)).toBeVisible({ timeout: 15_000 });
    await expect(section.getByText('No posted USD')).toBeVisible();
    await expect(section.getByText('That posted transaction is no longer available.')).toBeVisible();
    await expect(section.getByText(POSTED_LABEL)).toHaveCount(0);
    await expect(section.getByText('SYN flight marker')).toHaveCount(0);
    await expect(section.locator('.cost-finance')).toContainText('no card spend is tagged to this trip');
    await expect(section.getByText(usd('840.00'))).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('cost reconcile keyboard day', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, reducedMotion: 'reduce' });

  test('a failed link keeps the flight, a late response does not apply, and lock clears private spend', async ({ page, request }) => {
    test.setTimeout(90_000);
    const { section, routes, trip, vault } = await openUnlockedTrip(page, request, 'light');
    const link = section.getByRole('button', { name: 'Link posted transaction', exact: true });
    const linkBox = await link.boundingBox();
    expect(linkBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await link.focus();
    await page.keyboard.press('Enter');
    const choice = section.getByRole('button', { name: new RegExp(POSTED_LABEL) });
    await expect(choice).toBeVisible();
    routes.arm.failOnce();
    await choice.focus();
    await page.keyboard.press('Enter');
    const alert = section.getByRole('alert');
    await expect(alert).toContainText("Couldn't save this link. Try again.");
    await expect(section.getByText(FLIGHT)).toBeVisible();
    await expect(section.getByText('Linked · counted once')).toHaveCount(0);
    const retry = section.getByRole('button', { name: 'Try again', exact: true });
    await expect(retry).toBeFocused();
    const retryBox = await retry.boundingBox();
    expect(retryBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Enter');
    await expect(section.getByText('Linked · counted once')).toBeVisible();
    await expect(section.getByText(usd('840.00'))).toHaveCount(0);
    expect(vault.mutations.filter((change) => String(change.path).includes('upsert'))).toEqual([]);
    await expect(section.getByText('SYN flight marker')).toHaveCount(0);

    await section.getByRole('button', { name: 'Clear link', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(link).toBeVisible();
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(choice).toBeVisible();
    routes.arm.holdOnce();
    await choice.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => routes.arm.holding).toBe(true);
    await page.keyboard.press('Escape');
    await expect(link).toBeFocused();
    routes.arm.release();
    await expect(section.getByText('Saving link')).toHaveCount(0);
    await expect(section.getByText('Linked · counted once')).toHaveCount(0);
    await expect(section.getByText(FLIGHT)).toBeVisible();

    await visit(page, '/settings/finance');
    await page.getByRole('button', { name: 'Lock Finance', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Lock Finance', exact: true })).toHaveCount(0);
    await visit(page, `/travel/trips/${trip.id}`);
    await expect(section.getByRole('link', { name: 'Unlock Finance to see card spend', exact: true })).toBeVisible();
    await expect(section.getByText('Hidden while Finance is locked', { exact: true })).toHaveCount(2);
    await expect(section.locator('.cost-finance')).not.toContainText(usd('420.00'));
    await expect(section.getByText(FLIGHT)).toBeVisible();
    await expect(section.getByText(POSTED_LABEL)).toHaveCount(0);
    await expect(section.getByText('SYN flight marker')).toHaveCount(0);
    await expectView(page, section);
  });
});
