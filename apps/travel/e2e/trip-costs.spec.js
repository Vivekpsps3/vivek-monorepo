import { expect, test } from '@playwright/test';

// T2 e2e. Seeded through the API like undo.spec.js.
// Playwright matrix: every test runs at 390x844 and 1280x800, light and dark.
//
// BLOCKED-ON-K1 deviation (see trip-costs.component.css): the spec's
// "menu at 390" step uses ui-menu, which ships with K1 and is not on main
// yet. Until K1 lands the manual-line actions stay inline at 390 too, so
// the row-actions test clicks the inline Edit cost at both widths. When
// ui-menu lands, restore the menu step at 390: open
// `More actions for …` and pick Edit cost there.

const COMBOS = [
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 1280, height: 800, theme: 'light' },
  { width: 1280, height: 800, theme: 'dark' },
];

function watchConsole(page) {
  const violations = [];
  page.on('console', (message) => {
    if (/content security policy|trusted types|violates/i.test(message.text())) violations.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (/content security policy|trusted types/i.test(String(error))) violations.push(String(error));
  });
  return violations;
}

async function expectClean(page, violations) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(violations).toEqual([]);
}

function money(text) {
  return Number(String(text).replace(/[^0-9.\-]/g, ''));
}

async function seedCostTrip(request) {
  const created = await request.post('/travel/api/trips', {
    data: { title: 'Costs trip', start_date: '2026-12-01', end_date: '2026-12-03' },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const trip = await created.json();
  const base = '/travel/api/trips/' + trip.id;
  const posts = [
    ['/transports', { mode: 'flight', role: 'outbound', depart_place: 'Seattle', arrive_place: 'Kyoto', cost: '50.00', currency: 'USD', paid: true }],
    ['/transports', { mode: 'train', role: 'local', depart_place: 'Kyoto', arrive_place: 'Osaka', cost: '40.00', currency: 'USD', paid: false }],
    ['/plans', { title: 'Museum', kind: 'activity', on_date: '2026-12-02', cost: '25.50', currency: 'USD', paid: false }],
    ['/parking', { place_name: 'Garage', necessary: 'yes', booked: true, cost: '10.00', currency: 'USD', paid: false }],
    ['/budget-lines', { label: 'Manual lodging', amount: '12.00', category: 'lodging', currency: 'EUR', paid: false }],
  ];
  for (const [suffix, data] of posts) {
    const added = await request.post(base + suffix, { data });
    expect(added.ok(), await added.text()).toBeTruthy();
  }
  return trip;
}

async function seedEmptyTrip(request) {
  const created = await request.post('/travel/api/trips', {
    data: { title: 'Empty costs trip', start_date: '2026-12-01', end_date: '2026-12-03' },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  return created.json();
}

for (const combo of COMBOS) {
  test.describe(`trip costs [${combo.width} ${combo.theme}]`, () => {
    test.use({ viewport: { width: combo.width, height: combo.height } });

    test.beforeEach(async ({ page, request }) => {
      expect((await request.post('/e2e/reset')).ok()).toBeTruthy();
      await page.addInitScript((theme) => {
        try {
          localStorage.setItem('suite-theme', theme);
        } catch {
          // Storage may be unavailable before the first navigation.
        }
      }, combo.theme);
    });

    async function openCosts(page, request) {
      const trip = await seedCostTrip(request);
      await page.goto('/travel/trips/' + trip.id);
      const section = page.locator('travel-trip-costs');
      await expect(section.getByRole('heading', { name: 'Trip costs', exact: true })).toBeVisible();
      return { trip, section };
    }

    test(`[${combo.width} ${combo.theme}] shows per-currency totals with paid plus unpaid equal to total`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const { section } = await openCosts(page, request);
      for (const currency of ['USD', 'EUR']) {
        const block = section.locator('.cost-currency').filter({ hasText: currency + ' total' });
        await expect(block).toHaveCount(1);
        const total = money(await block.locator('.cost-total').innerText());
        const legend = await block.locator('.cost-legend .num').allInnerTexts();
        expect(legend).toHaveLength(2);
        expect(money(legend[0]) + money(legend[1])).toBeCloseTo(total, 2);
      }
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] bucket table rows in order`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const { section } = await openCosts(page, request);
      const usd = section.locator('.cost-currency').filter({ hasText: 'USD total' });
      await expect(usd.locator('.cost-table tbody th[scope="row"]')).toHaveText(['Transport', 'Stays and plans', 'Parking']);
      const eur = section.locator('.cost-currency').filter({ hasText: 'EUR total' });
      await expect(eur.locator('.cost-table tbody th[scope="row"]')).toHaveText(['Stays and plans']);
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] currencies kept separate note only with two currencies`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const { section } = await openCosts(page, request);
      await expect(section.getByText("Currencies are kept separate. Totals aren't converted.", { exact: true })).toBeVisible();

      const single = await seedEmptyTrip(request);
      const added = await request.post('/travel/api/trips/' + single.id + '/transports', {
        data: { mode: 'train', role: 'outbound', depart_place: 'Kyoto', arrive_place: 'Osaka', cost: '40.00', currency: 'USD', paid: false },
      });
      expect(added.ok(), await added.text()).toBeTruthy();
      await page.goto('/travel/trips/' + single.id);
      const singleSection = page.locator('travel-trip-costs');
      await expect(singleSection.locator('.cost-currency')).toHaveCount(1);
      await expect(singleSection.getByText("Currencies are kept separate. Totals aren't converted.", { exact: true })).toHaveCount(0);
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] no raw money`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const { section } = await openCosts(page, request);
      const text = await section.innerText();
      expect(text).not.toMatch(/\b\d+\.\d{1,2} [A-Z]{3}\b/);
      expect(text).not.toMatch(/\b[A-Z]{3} \d/);
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] spent in finance shows locked copy and links to finance`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const { section } = await openCosts(page, request);
      const link = section.getByRole('link', { name: 'Unlock Finance to see card spend', exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', '/finance');
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] empty trip shows Add a cost which opens the cost dialog`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const trip = await seedEmptyTrip(request);
      await page.goto('/travel/trips/' + trip.id);
      const section = page.locator('travel-trip-costs');
      await expect(section.getByText("No costs yet. Add what you've booked or plan to spend.", { exact: true })).toBeVisible();
      await section.getByRole('button', { name: 'Add a cost', exact: true }).click();
      await expect(page.getByRole('dialog').getByLabel('Cost label')).toBeVisible();
      await expectClean(page, violations);
    });

    test(`[${combo.width} ${combo.theme}] manual line row actions inline at 1280 and menu at 390`, async ({ page, request }) => {
      const violations = watchConsole(page);
      const { section } = await openCosts(page, request);
      const row = section.locator('article.trip-row').filter({ hasText: 'Manual lodging' });
      await expect(row).toHaveCount(1);
      // Inline at 1280 per spec; at 390 the ui-menu step is blocked on K1,
      // so the inline actions are used there too (see header note).
      await row.getByRole('button', { name: 'Edit cost', exact: true }).click();
      await expect(page.getByRole('dialog').getByLabel('Cost label')).toHaveValue('Manual lodging');
      await expectClean(page, violations);
    });
  });
}
