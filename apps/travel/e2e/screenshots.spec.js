import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const dir = process.env.SCREENSHOT_DIR || "/opt/cursor/artifacts/travel-ux-bundle-t";
const widths = (process.env.SHOT_WIDTHS || "390,768,1280").split(",").map(Number);
const modes = (process.env.SHOT_THEMES || "light,dark").split(",");
const backgrounds = { light: "rgb(246, 243, 238)", dark: "rgb(20, 19, 17)" };
const longCity = "Puerto Viejo de la Costa Rica Sur";

async function reset(request) {
  const response = await request.post("/e2e/reset");
  expect(response.ok()).toBeTruthy();
}

async function theme(page, value) {
  await page.goto("/");
  await page.evaluate((choice) => localStorage.setItem("travel-theme", choice), value);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", value);
}

async function settle(page, hash) {
  const seq = await page.locator("#app").getAttribute("data-seq");
  await page.evaluate((value) => { location.hash = value; }, hash);
  if (seq) await expect(page.locator("#app")).not.toHaveAttribute("data-seq", seq);
  else await expect(page.locator("#app")).toHaveAttribute("data-seq", /[0-9]+/);
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
}

async function openHash(page, hash) {
  const current = await page.evaluate(() => location.hash);
  if (current === hash) await settle(page, hash === "#/" ? "#/pto" : "#/");
  await settle(page, hash);
}

async function clearToasts(page) {
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((node) => node.remove()));
}

async function shot(page, stem, width, mode) {
  if (!/focus/i.test(stem)) await page.evaluate(() => document.activeElement?.blur?.());
  await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(backgrounds[mode]);
  const expectsToast = /success|servererror|offline/.test(stem);
  if (!expectsToast) await expect(page.locator(".toast")).toHaveCount(0);
  if (await page.locator(".composer-grid").count()) await expect(page.locator(".composer-grid").first()).toBeVisible();
  if (await page.locator(".cal-week, .cal-strip").count()) {
    const calendar = width >= 768 ? page.locator(".cal-week") : page.locator(".cal-strip");
    await expect(calendar.first()).toBeVisible();
  }
  if (await page.locator(".places").count()) await expect(page.locator(".places").first()).toBeVisible();
  if (width >= 768 && await page.locator("#map").count()) {
    await expect(page.locator("#map")).toBeVisible();
    await expect(page.locator("#map .leaflet-marker-icon").first()).toBeVisible();
  }
  const file = path.join(dir, `${stem}-${width}-${mode}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

async function trip(request, body) {
  const response = await request.post("/api/trips", { data: body });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function seedOne(request) {
  const created = await trip(request, {
    title: "Kyoto",
    start_date: "2026-10-24",
    end_date: "2026-10-30",
    origin_label: "Home",
    status: "booked",
    counts_as_pto: true,
    stays: [{ city: "Kyoto", arrive_on: "2026-10-24", leave_on: "2026-10-30" }],
    transports: [
      { role: "outbound", mode: "flight", depart_place: "SFO", arrive_place: "KIX", status: "booked" },
      { role: "inbound", mode: "flight", depart_place: "KIX", arrive_place: "SFO", status: "planned" },
    ],
  });
  await request.post(`/api/trips/${created.id}/plans`, { data: { on_date: "2026-10-25", title: "Tea", kind: "activity" } });
  await request.post(`/api/trips/${created.id}/parking`, { data: { necessary: "yes", place_name: "Airport lot", booked: false } });
  await request.post(`/api/trips/${created.id}/notes`, { data: { body: "Window seat if it is free." } });
  await request.post(`/api/trips/${created.id}/reminders`, { data: { title: "Book parking", kind: "general" } });
  await request.post(`/api/trips/${created.id}/budget-lines`, { data: { category: "other", label: "Travel insurance", amount: "40.00" } });
  return created;
}

async function seedMany(request) {
  const titles = [
    ["In progress now", "2026-10-20", "2026-10-25", "Osaka"],
    ["Month boundary crossing", "2026-10-28", "2026-11-04", longCity],
    ["Lisbon long weekend", "2026-11-06", "2026-11-09", "Lisbon"],
    ["North Atlantic circuit", "2026-12-01", "2026-12-15", "Reykjavik"],
    ["Late September coast", "2026-09-20", "2026-09-27", "Porto"],
    ["Weekend ferry", "2026-11-14", "2026-11-15", "Juneau"],
    ["Winter city", "2027-01-04", "2027-01-08", "Sapporo"],
    ["Spring gardens", "2027-03-12", "2027-03-16", "Kanazawa"],
    ["Island hop", "2027-04-02", "2027-04-09", "Okinawa"],
    ["Desert road", "2026-11-20", "2026-11-24", "Santa Fe"],
    ["Lake week", "2026-08-10", "2026-08-16", "Como"],
  ];
  for (const [title, start, end, city] of titles) {
    await trip(request, {
      title,
      start_date: start,
      end_date: end,
      status: end < "2026-10-22" ? "done" : "planning",
      counts_as_pto: true,
      stays: [{ city, arrive_on: start, leave_on: end }],
      transports: [],
    });
  }
  const policy = await request.put("/api/pto/policy", {
    data: {
      balance_days: "12.5",
      balance_as_of: "2026-10-01",
      accrual_amount: "1.25",
      accrual_unit: "day",
      accrual_cadence: "monthly",
      hours_per_day: "8",
    },
  });
  expect(policy.ok()).toBeTruthy();
}

async function tabs(page, count) {
  await page.evaluate(() => { document.activeElement?.blur?.(); });
  for (let index = 0; index < count; index += 1) await page.keyboard.press("Tab");
}

async function pickRange(page) {
  await page.getByRole("gridcell", { name: /October 24, 2026/ }).first().click();
  await page.getByRole("gridcell", { name: /October 30, 2026/ }).first().click();
  await expect(page.locator("#composer-summary")).toContainText("6 nights");
}

test("travel ux matrix", async ({ page, request }) => {
  test.skip(!dir, "SCREENSHOT_DIR is required");
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const mode of modes) {
      await reset(request);
      await theme(page, mode);
      const ids = {};

      async function go(stem, hash, act) {
        await clearToasts(page);
        if (hash) await openHash(page, hash);
        if (act) await act();
        await shot(page, stem, width, mode);
      }

      await go("home-empty", "#/");
      await go("home-focus1", "#/", () => tabs(page, 1));
      await go("home-focus2", "#/", () => tabs(page, 2));
      await go("home-focus3", "#/", () => tabs(page, 3));
      await go("home-focus4", "#/", () => tabs(page, 4));
      await go("home-focus5", "#/", () => tabs(page, 5));
      await go("calendar-empty", "#/calendar/2026/10");
      await go("calendar-focus1", "#/calendar/2026/10", () => tabs(page, 1));
      await go("calendar-focus2", "#/calendar/2026/10", () => tabs(page, 2));
      await go("calendar-focus3", "#/calendar/2026/10", () => tabs(page, 3));
      await go("calendar-focus4", "#/calendar/2026/10", () => tabs(page, 4));
      await go("calendar-focus5", "#/calendar/2026/10", () => tabs(page, 5));
      await go("pto-empty", "#/pto");
      await go("pto-focused", "#/pto", () => page.locator("#pto-balance").focus());
      await go("pto-filled", "#/pto", async () => {
        await page.locator("#pto-balance").fill("12.5");
        await page.locator("#pto-asof").fill("2026-10-01");
        await page.locator("#pto-amount").fill("1.25");
      });
      await go("pto-datefocus", "#/pto", () => page.locator("#pto-asof").focus());
      await go("pto-validation", "#/pto", async () => {
        await page.locator("#pto-balance").fill("9999");
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toBeVisible();
      });
      await go("pto-focus1", "#/pto", () => tabs(page, 1));
      await go("pto-focus2", "#/pto", () => tabs(page, 2));
      await go("pto-focus3", "#/pto", () => tabs(page, 3));
      await go("pto-focus4", "#/pto", () => tabs(page, 4));
      await go("pto-focus5", "#/pto", () => tabs(page, 5));
      await go("settings-blank", "#/settings");
      await go("settings-focused", "#/settings", () => page.getByLabel("AeroAPI key").focus());
      await go("settings-filled", "#/settings", () => page.getByLabel("AeroAPI key").fill("synthetic-key-1234"));
      await go("settings-validation", "#/settings", async () => {
        await page.getByLabel("AeroAPI key").fill("");
        await page.getByRole("button", { name: "Save key" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toBeVisible();
      });
      await go("settings-focus1", "#/settings", () => tabs(page, 1));
      await go("settings-focus2", "#/settings", () => tabs(page, 2));
      await go("settings-focus3", "#/settings", () => tabs(page, 3));
      await go("settings-focus4", "#/settings", () => tabs(page, 4));
      await go("settings-focus5", "#/settings", () => tabs(page, 5));
      await go("newtrip-blank", "#/trips/new");
      await go("newtrip-focus1", "#/trips/new", () => tabs(page, 1));
      await go("newtrip-focus2", "#/trips/new", () => tabs(page, 2));
      await go("newtrip-focus3", "#/trips/new", () => tabs(page, 3));
      await go("newtrip-focus4", "#/trips/new", () => tabs(page, 4));
      await go("newtrip-focus5", "#/trips/new", () => tabs(page, 5));
      await go("newtrip-ptounchecked", "#/trips/new", () => page.getByRole("checkbox", { name: "Counts as PTO" }).uncheck());
      await go("newtrip-ptofocus", "#/trips/new", () => page.getByRole("checkbox", { name: "Counts as PTO" }).focus());
      await go("newtrip-ptochecked", "#/trips/new");
      await go("newtrip-focused", "#/trips/new", async () => {
        await pickRange(page);
        await page.locator("[data-city-start]").focus();
      });
      await go("newtrip-filled", "#/trips/new", async () => {
        await pickRange(page);
        await page.locator("[data-city-start]").fill(longCity);
      });
      await go("newtrip-submittedempty", "#/", async () => {
        await openHash(page, "#/trips/new");
        await pickRange(page);
        await page.locator("[data-city-start]").fill("");
        await page.getByRole("button", { name: "Save trip" }).click({ force: true });
        await expect(page.locator(".field-error[data-error-for]")).toContainText("Name the city.");
      });

      await openHash(page, "#/pto");
      await page.route("**/api/home", async (route) => {
        await expect(page.locator(".skeleton").first()).toBeVisible();
        await shot(page, "home-loading", width, mode);
        await route.continue();
      });
      await openHash(page, "#/");
      await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
      await page.unrouteAll({ behavior: "ignoreErrors" });

      await openHash(page, "#/pto");
      await page.route("**/api/home", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic server error."}' }));
      await openHash(page, "#/");
      await expect(page.getByRole("heading", { name: "Couldn't load your trips" })).toBeVisible();
      await shot(page, "home-error", width, mode);
      await page.unrouteAll({ behavior: "ignoreErrors" });

      await openHash(page, "#/pto");
      await page.context().setOffline(true);
      await openHash(page, "#/");
      await expect(page.locator(".toast, .error-panel").first()).toBeVisible();
      await shot(page, "home-offline", width, mode);
      await page.context().setOffline(false);
      await clearToasts(page);

      ids.one = await seedOne(request);
      await go("home-one", "#/");
      await go("calendar-one", "#/calendar/2026/10");
      await go("calendarday-one", "#/calendar/2026/10/2026-10-25");
      await go("trip-populated", `#/trips/${ids.one.id}`);
      await go("tripday-populated", `#/trips/${ids.one.id}/day/2026-10-25`);
      await go("trip-focus1", `#/trips/${ids.one.id}`, () => tabs(page, 1));
      await go("trip-focus2", `#/trips/${ids.one.id}`, () => tabs(page, 2));
      await go("trip-focus3", `#/trips/${ids.one.id}`, () => tabs(page, 3));
      await go("trip-focus4", `#/trips/${ids.one.id}`, () => tabs(page, 4));
      await go("trip-focus5", `#/trips/${ids.one.id}`, () => tabs(page, 5));
      await go("trip-confirm", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Delete trip" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
      });
      await page.keyboard.press("Escape");
      await go("tripedit-filled", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await expect(page.getByRole("heading", { name: "Edit trip" })).toBeVisible();
      });
      await go("checkbox-checked", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await page.getByRole("checkbox", { name: "Count as PTO" }).check();
      });
      await go("checkbox-focus", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await page.getByRole("checkbox", { name: "Count as PTO" }).focus();
      });
      await go("checkbox-unchecked", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await page.getByRole("checkbox", { name: "Count as PTO" }).uncheck();
      });
      await go("checkbox-uncheckedfocus", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await page.getByRole("checkbox", { name: "Count as PTO" }).uncheck();
        await page.getByRole("checkbox", { name: "Count as PTO" }).focus();
      });
      await go("date-empty", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await page.getByLabel("Day you leave").fill("");
      });
      await go("date-filled", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await expect(page.getByLabel("Day you leave")).toHaveValue("2026-10-24");
      });
      await go("date-focus", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await page.getByLabel("Day you leave").focus();
      });
      await go("date-picker", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await page.getByLabel("Day you leave").click();
      });
      await go("city-blank", `#/trips/${ids.one.id}`, () => page.locator("#add-city").scrollIntoViewIfNeeded());
      await go("city-focused", `#/trips/${ids.one.id}`, () => page.locator("#add-city").focus());
      await go("city-filled", `#/trips/${ids.one.id}`, () => page.locator("#add-city").fill(longCity));
      await go("city-validation", `#/trips/${ids.one.id}`, async () => {
        await page.locator("#add-city").fill("");
        await page.locator("form[data-form=stay]").getByRole("button", { name: "Add" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toBeVisible();
      });
      await go("transport-blank", `#/trips/${ids.one.id}`);
      await go("transport-focused", `#/trips/${ids.one.id}`, () => page.locator("#add-transport-outbound").focus());
      await go("transport-filled", `#/trips/${ids.one.id}`, async () => {
        await page.locator("#add-transport-outbound").fill("SFO");
        await page.locator("#add-transport-outbound-to").fill("KIX");
      });
      await go("transport-validation", `#/trips/${ids.one.id}`, async () => {
        await page.locator("#add-transport-local").fill("");
        await page.locator("form[data-form=transport]").filter({ has: page.locator("#add-transport-local") }).getByRole("button", { name: "Add" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toBeVisible();
      });
      await go("plan-blank", `#/trips/${ids.one.id}`);
      await go("plan-focused", `#/trips/${ids.one.id}`, () => page.locator("#add-plan-2026-10-24").focus());
      await go("plan-filled", `#/trips/${ids.one.id}`, () => page.locator("#add-plan-2026-10-24").fill("Morning walk"));
      await go("plan-validation", `#/trips/${ids.one.id}`, async () => {
        await page.locator("#add-plan-2026-10-24").fill("");
        await page.locator("form[data-form=plan]").first().getByRole("button", { name: "Add" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toBeVisible();
      });
      await go("parking-blank", `#/trips/${ids.one.id}`);
      await go("parking-focused", `#/trips/${ids.one.id}`, () => page.locator("#add-parking").focus());
      await go("parking-filled", `#/trips/${ids.one.id}`, () => page.locator("#add-parking").fill("Garage"));
      await go("parking-validation", `#/trips/${ids.one.id}`, async () => {
        await page.locator("#add-parking").fill("");
        await page.locator("form[data-form=parking]").getByRole("button", { name: "Add" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toBeVisible();
      });
      await go("budget-blank", `#/trips/${ids.one.id}`);
      await go("budget-focused", `#/trips/${ids.one.id}`, () => page.locator("#add-cost").focus());
      await go("budget-filled", `#/trips/${ids.one.id}`, async () => {
        await page.locator("#add-cost").fill("Snacks");
        await page.locator("#add-cost-amount").fill("12.00");
      });
      await go("budget-validation", `#/trips/${ids.one.id}`, async () => {
        await page.locator("#add-cost").fill("");
        await page.locator("form[data-form=budget]").getByRole("button", { name: "Add" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toBeVisible();
      });
      await go("note-blank", `#/trips/${ids.one.id}`);
      await go("note-focused", `#/trips/${ids.one.id}`, () => page.locator("#add-note").focus());
      await go("note-filled", `#/trips/${ids.one.id}`, () => page.locator("#add-note").fill("A long note about the train that keeps going so the field wraps."));
      await go("note-validation", `#/trips/${ids.one.id}`, async () => {
        await page.locator("#add-note").fill("");
        await page.locator("form[data-form=note]").getByRole("button", { name: "Add" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toBeVisible();
      });
      await go("reminder-blank", `#/trips/${ids.one.id}`);
      await go("reminder-focused", `#/trips/${ids.one.id}`, () => page.locator("#add-reminder").focus());
      await go("reminder-filled", `#/trips/${ids.one.id}`, () => page.locator("#add-reminder").fill("Pack a coat"));
      await go("reminder-validation", `#/trips/${ids.one.id}`, async () => {
        await page.locator("#add-reminder").fill("");
        await page.locator("form[data-form=reminder]").getByRole("button", { name: "Add" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toBeVisible();
      });
      await go("reminder-unchecked", `#/trips/${ids.one.id}`);
      await go("reminder-checked", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("checkbox", { name: "Book parking" }).check();
        await expect(page.locator(".toast")).toContainText("Reminder marked done.");
        await expect(page.getByRole("checkbox", { name: /Book parking/ })).toBeChecked();
        await clearToasts(page);
      });
      await go("reminder-checkedfocus", `#/trips/${ids.one.id}`, () => page.getByRole("checkbox", { name: /Book parking/ }).focus());
      await go("tripedit-validation", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await page.getByLabel("Trip name").fill("");
        await page.getByRole("button", { name: "Save trip" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toContainText("Give the trip a name.");
      });
      await go("trip-missing", "#/trips/999999");
      await go("pto-one", "#/pto");
      await page.route("**/api/calendar**", async (route) => {
        await expect(page.locator(".skeleton").first()).toBeVisible();
        await shot(page, "calendar-loading", width, mode);
        await route.continue();
      });
      await openHash(page, "#/");
      await openHash(page, "#/calendar/2026/10");
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.route("**/api/calendar**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic server error."}' }));
      await openHash(page, "#/");
      await openHash(page, "#/calendar/2026/10");
      await expect(page.getByRole("heading", { name: "Couldn't load the calendar" })).toBeVisible();
      await shot(page, "calendar-error", width, mode);
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await openHash(page, "#/");
      await page.context().setOffline(true);
      await openHash(page, "#/calendar/2026/10");
      await shot(page, "calendar-offline", width, mode);
      await page.context().setOffline(false);
      await clearToasts(page);
      await page.route(`**/api/trips/${ids.one.id}`, async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        await expect(page.locator(".skeleton").first()).toBeVisible();
        await shot(page, "trip-loading", width, mode);
        await route.continue();
      });
      await openHash(page, "#/");
      await openHash(page, `#/trips/${ids.one.id}`);
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.route(`**/api/trips/${ids.one.id}`, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic server error."}' }));
      await openHash(page, "#/");
      await openHash(page, `#/trips/${ids.one.id}`);
      await expect(page.getByRole("heading", { name: "Couldn't load this trip" })).toBeVisible();
      await shot(page, "trip-error", width, mode);
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.route("**/api/pto", async (route) => {
        await expect(page.locator(".skeleton").first()).toBeVisible();
        await shot(page, "pto-loading", width, mode);
        await route.continue();
      });
      await openHash(page, "#/");
      await openHash(page, "#/pto");
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.route("**/api/pto", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic server error."}' }));
      await openHash(page, "#/");
      await openHash(page, "#/pto");
      await expect(page.getByRole("heading", { name: "Couldn't load PTO" })).toBeVisible();
      await shot(page, "pto-error", width, mode);
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.route("**/api/settings", async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        await expect(page.locator(".skeleton").first()).toBeVisible();
        await shot(page, "settings-loading", width, mode);
        await route.continue();
      });
      await openHash(page, "#/");
      await openHash(page, "#/settings");
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.route("**/api/settings", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic server error."}' }));
      await openHash(page, "#/");
      await openHash(page, "#/settings");
      await expect(page.getByRole("heading", { name: "Couldn't load settings" })).toBeVisible();
      await shot(page, "settings-error", width, mode);
      await page.unrouteAll({ behavior: "ignoreErrors" });

      await go("pto-servererror", "#/pto", async () => {
        await page.route("**/api/pto/policy", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic server error."}' }));
        await page.locator("#pto-balance").fill("12.5");
        await page.locator("#pto-asof").fill("2026-10-01");
        await page.locator("#pto-amount").fill("1.25");
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.locator(".toast").first()).toBeVisible();
      });
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await clearToasts(page);
      await go("pto-success", "#/pto", async () => {
        await page.locator("#pto-balance").fill("12.5");
        await page.locator("#pto-asof").fill("2026-10-01");
        await page.locator("#pto-amount").fill("1.25");
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.locator(".toast")).toContainText("PTO settings saved.");
      });
      await clearToasts(page);
      await go("pto-nameblank", "#/pto", async () => {
        await page.locator("#pto-start").fill("2026-11-02");
        await page.locator("#pto-end").fill("2026-11-04");
        await page.locator("#pto-name").focus();
        await expect(page.locator("#pto-name")).toHaveValue("");
      });

      await seedMany(request);
      await go("home-many", "#/");
      await go("calendar-many", "#/calendar/2026/10");
      await go("calendarday-many", "#/calendar/2026/10/2026-10-24");
      await go("calendarday-boundary", "#/calendar/2026/11/2026-11-01");
      await go("pto-many", "#/pto");
      await go("newtrip-servererror", "#/trips/new", async () => {
        await pickRange(page);
        await page.locator("[data-city-start]").fill("Kyoto");
        await page.route("**/api/trips", (route) => {
          if (route.request().method() !== "POST") return route.continue();
          return route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic server error."}' });
        });
        await page.getByRole("button", { name: "Save trip" }).click();
        await expect(page.locator(".toast").first()).toBeVisible();
      });
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await clearToasts(page);
      await go("newtrip-success", "#/trips/new", async () => {
        await pickRange(page);
        await page.locator("[data-city-start]").fill("Kyoto");
        await page.getByRole("button", { name: "Save trip" }).click();
        await expect(page.getByRole("heading", { name: "Kyoto" }).first()).toBeVisible();
      });
      await go("tripedit-servererror", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await page.route(`**/api/trips/${ids.one.id}`, (route) => {
          if (route.request().method() !== "PATCH") return route.continue();
          return route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic server error."}' });
        });
        await page.getByRole("button", { name: "Save trip" }).click();
        await expect(page.locator(".toast").first()).toBeVisible();
      });
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await clearToasts(page);
      await go("tripedit-success", `#/trips/${ids.one.id}`, async () => {
        await page.getByRole("button", { name: "Edit trip" }).click();
        await page.getByRole("button", { name: "Save trip" }).click();
        await expect(page.locator(".toast")).toContainText("Trip saved.");
      });
      await go("note-servererror", `#/trips/${ids.one.id}`, async () => {
        await page.route("**/api/trips/**/notes", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic server error."}' }));
        await page.locator("#add-note").fill("Server please fail");
        await page.locator("form[data-form=note]").getByRole("button", { name: "Add" }).click();
        await expect(page.locator(".toast").first()).toBeVisible();
      });
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await clearToasts(page);
      await go("note-success", `#/trips/${ids.one.id}`, async () => {
        await page.locator("#add-note").fill("Saved from the form");
        await page.locator("form[data-form=note]").getByRole("button", { name: "Add" }).click();
        await expect(page.locator(".toast")).toContainText("Note added.");
      });
      await go("city-servervalidation", `#/trips/${ids.one.id}`, async () => {
        await page.route("**/api/trips/**/stays", (route) => route.fulfill({ status: 422, contentType: "application/json", body: '{"detail":"Name the city."}' }));
        await page.locator("#add-city").fill("Kyoto");
        await page.locator("form[data-form=stay]").getByRole("button", { name: "Add" }).click();
        await expect(page.locator(".field-error[data-error-for]")).toContainText("Name the city.");
      });
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await go("settings-servererror", "#/settings", async () => {
        await page.route("**/api/settings/flightaware", (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"detail":"Synthetic server error."}' }));
        await page.getByLabel("AeroAPI key").fill("synthetic-key-1234");
        await page.getByRole("button", { name: "Save key" }).click();
        await expect(page.locator(".toast").first()).toBeVisible();
      });
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await clearToasts(page);
      await go("settings-success", "#/settings", async () => {
        await page.getByLabel("AeroAPI key").fill("synthetic-key-1234");
        await page.getByRole("button", { name: "Save key" }).click();
        await expect(page.locator(".toast")).toContainText("Key saved.");
      });

      await go("login-locked", null, async () => {
        await page.route("**/api/**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
        await openHash(page, "#/");
        await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
      });
      for (const [stem, count] of [["login-focus1", 1], ["login-focus2", 2], ["login-focus3", 3], ["login-focus4", 4], ["login-focus5", 5]]) {
        await go(stem, null, () => tabs(page, count));
      }
      await page.unrouteAll({ behavior: "ignoreErrors" });

      const differ = (focused, plain) => {
        const left = readFileSync(path.join(dir, `${focused}-${width}-${mode}.png`));
        const right = readFileSync(path.join(dir, `${plain}-${width}-${mode}.png`));
        expect(left.equals(right), `${focused} matches ${plain} at ${width} ${mode}`).toBe(false);
      };
      differ("checkbox-focus", "checkbox-checked");
      differ("checkbox-uncheckedfocus", "checkbox-unchecked");
      differ("newtrip-ptofocus", "newtrip-ptochecked");
      differ("reminder-checkedfocus", "reminder-checked");
      differ("home-focus1", "home-empty");
      differ("pto-focused", "pto-empty");
      differ("city-focused", "city-blank");
      differ("login-focus1", "login-locked");
    }
  }
});
