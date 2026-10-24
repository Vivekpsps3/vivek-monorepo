import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const shots = "/opt/cursor/artifacts/travel-blockers";
fs.mkdirSync(shots, { recursive: true });

async function reset(request) {
  const response = await request.post("/e2e/reset");
  expect(response.ok()).toBeTruthy();
}

async function openHash(page, hash) {
  await page.goto("/");
  await page.evaluate((value) => { location.hash = value; }, hash);
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#app h1")).toBeVisible();
}

async function trip(request, body) {
  const response = await request.post("/api/trips", { data: body });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("P1 #1 the tab bar sits at the bottom of a 390px screen", async ({ page, request }) => {
  await reset(request);
  await openHash(page, "#/");
  const boxes = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    };
    return { header: rect(".topbar"), nav: rect(".nav"), brand: rect(".brand"), height: window.innerHeight };
  });
  expect(boxes.nav.top).toBeGreaterThan(boxes.header.bottom);
  expect(boxes.nav.bottom).toBeGreaterThan(boxes.height - 8);
  expect(boxes.brand.bottom).toBeLessThanOrEqual(boxes.header.bottom + 1);
  await page.screenshot({ path: path.join(shots, "p1-1-tabs-390.png") });
});

test("P0 #2 a quick-add ride shows Mode instead of a hidden flight", async ({ page, request }) => {
  await reset(request);
  const created = await trip(request, {
    title: "Kyoto",
    start_date: "2026-10-24",
    end_date: "2026-10-30",
    stays: [{ city: "Kyoto", arrive_on: "2026-10-24", leave_on: "2026-10-30" }],
  });
  await openHash(page, `#/trips/${created.id}`);
  const mode = page.locator('form[data-form="transport"] select[name="mode"]').first();
  await expect(mode).toBeVisible();
  await expect(mode.locator("option").first()).toHaveText("Choose…");
  await expect(page.locator('input[type="hidden"][name="mode"][value="flight"]')).toHaveCount(0);
  await mode.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, "p0-2-mode-390.png") });
});

test("P0 #3 Retry sends the Booked value that was chosen", async ({ page, request }) => {
  await reset(request);
  const created = await trip(request, {
    title: "Kyoto",
    start_date: "2026-10-24",
    end_date: "2026-10-30",
    stays: [{ city: "Kyoto", arrive_on: "2026-10-24", leave_on: "2026-10-30" }],
  });
  const parked = await request.post(`/api/trips/${created.id}/parking`, {
    data: { place_name: "Garage", booked: false, necessary: "yes" },
  });
  expect(parked.ok()).toBeTruthy();
  await openHash(page, `#/trips/${created.id}`);
  let failed = false;
  const bodies = [];
  await page.route("**/api/parking/**", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    bodies.push(route.request().postDataJSON());
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "nope" }) });
    }
    return route.continue();
  });
  await page.getByRole("checkbox", { name: "Booked" }).check();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Parking marked booked.")).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[0].booked).toBe(true);
  expect(bodies[1].booked).toBe(true);
  await page.screenshot({ path: path.join(shots, "p0-3-retry-390.png") });
});

test("P0 #4 Space and a synthetic click pick a composer day", async ({ page, request }) => {
  await reset(request);
  await openHash(page, "#/trips/new");
  const day = page.locator('[role="gridcell"][data-day]').nth(10);
  await day.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#composer-summary")).not.toHaveText("Pick the day you leave.");
  await expect(day).toBeFocused();
  const other = page.locator('[role="gridcell"][data-day]').nth(12);
  await other.evaluate((node) => node.click());
  await expect(other).toHaveAttribute("aria-selected", "true");
  await expect(other).toBeFocused();
  await page.screenshot({ path: path.join(shots, "p0-4-composer-390.png") });
});

test("P0 #5 a cadence change keeps the typed balance and a later pointerup does not", async ({ page, request }) => {
  await reset(request);
  const policy = await request.put("/api/pto/policy", {
    data: {
      accrual_amount: "1",
      accrual_unit: "day",
      accrual_cadence: "yearly",
      hours_per_day: "8",
      balance_days: "10",
      balance_as_of: "2026-01-01",
    },
  });
  expect(policy.ok()).toBeTruthy();
  await openHash(page, "#/pto");
  await page.getByRole("button", { name: "Edit" }).click();
  const balance = page.locator("#pto-balance");
  await balance.fill("12.5");
  await page.getByRole("radio", { name: "Monthly" }).click();
  await expect(balance).toHaveValue("12.5");
  await expect(page.locator('#pto-board [role="radio"][tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('#pto-board [role="radio"][aria-checked="true"]')).toBeFocused();
  const cell = page.locator("[data-pto-day]").first();
  const box = await cell.boundingBox();
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.up();
  await page.locator("#pto-start").fill("2026-12-01");
  await page.locator("h1").click();
  await expect(page.locator("#pto-start")).toHaveValue("2026-12-01");
  await page.screenshot({ path: path.join(shots, "p0-5-pto-390.png") });
});

test("P1 #6 delete closes the dialog before focusing the heading, and a failure is an alert", async ({ page, request }) => {
  await reset(request);
  const created = await trip(request, {
    title: "Kyoto",
    start_date: "2026-10-24",
    end_date: "2026-10-30",
  });
  await openHash(page, `#/trips/${created.id}`);
  await page.route(`**/api/trips/${created.id}`, async (route) => {
    if (route.request().method() === "DELETE") {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "nope" }) });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Delete trip" }).click();
  await page.getByRole("button", { name: "Delete trip" }).last().click();
  const alert = page.locator("[data-confirm-error]");
  await expect(alert).toBeVisible();
  await expect(alert).toHaveAttribute("role", "alert");
  await expect(alert).toContainText("⚠");
  await page.screenshot({ path: path.join(shots, "p1-6-dialog-390.png") });
  await page.unroute(`**/api/trips/${created.id}`);
  await page.getByRole("button", { name: "Delete trip" }).last().click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator("#app h1")).toBeFocused();
});

test("P1 #7 a successful save dismisses the Retry toast", async ({ page, request }) => {
  await reset(request);
  await openHash(page, "#/trips/new");
  const days = page.locator('[role="gridcell"][data-day]');
  await days.nth(4).click();
  await days.nth(8).click();
  await page.locator("[data-city-start]").fill("Kyoto");
  let failed = false;
  await page.route("**/api/trips", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "nope" }) });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Save trip" }).click();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.screenshot({ path: path.join(shots, "p1-7-retry-390.png") });
  await page.getByRole("button", { name: "Save trip" }).click();
  await expect(page).toHaveURL(/#\/trips\/\d+/);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  const home = await request.get("/api/home");
  const body = await home.json();
  const titles = [...body.upcoming, ...body.in_progress, ...body.past].map((item) => item.title);
  expect(titles.filter((title) => title === "Kyoto")).toHaveLength(1);
});

test("P1 #8 Name the city stays visible at 390 after a resize and clears on input", async ({ page, request }) => {
  await reset(request);
  await openHash(page, "#/trips/new");
  const days = page.locator('[role="gridcell"][data-day]');
  await days.nth(4).click();
  await days.nth(8).click();
  await page.locator("[data-save]").click({ force: true });
  const error = page.getByText("Name the city.");
  await expect(error).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect(error).toBeVisible();
  await page.screenshot({ path: path.join(shots, "p1-8-city-390.png") });
  await page.locator("[data-city-start]").fill("Kyoto");
  await expect(error).toHaveCount(0);
});

test("composer Enter and Escape keep focus, and outside days are a single tab stop", async ({ page, request }) => {
  await reset(request);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openHash(page, "#/trips/new?start=2026-11-10");
  const day = page.locator('[data-day="2026-11-10"]');
  await day.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-day="2026-11-10"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-day="2026-11-10"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const stops = await page.locator('[role="gridcell"][tabindex="0"]').count();
  expect(stops).toBe(1);
  const hidden = await page.locator('.composer-day.is-out[aria-hidden="true"]').count();
  expect(hidden).toBeGreaterThan(0);
  const named = await page.locator('[aria-label="Monday, November 30, 2026"]').count();
  expect(named).toBeLessThanOrEqual(1);
  await page.screenshot({ path: path.join(shots, "composer-grid-1280.png") });
});
