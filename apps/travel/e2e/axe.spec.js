import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function openThemed(page, hash) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("suite-theme", "light");
    localStorage.setItem("travel-theme", "light");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  if (hash) {
    await page.evaluate((value) => { location.hash = value; }, hash);
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  }
}

async function serious(page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
}

test("axe on the travel pages at 1280 light", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const reset = await request.post("/e2e/reset");
  expect(reset.ok()).toBeTruthy();
  const created = await request.post("/api/trips", {
    data: {
      title: "Kyoto",
      start_date: "2026-10-24",
      end_date: "2026-10-30",
      status: "booked",
      counts_as_pto: true,
      stays: [{ city: "Kyoto", arrive_on: "2026-10-24", leave_on: "2026-10-30" }],
      transports: [{ role: "outbound", mode: "flight", depart_place: "SFO", arrive_place: "KIX", status: "booked" }],
    },
  });
  expect(created.ok()).toBeTruthy();
  const trip = await created.json();

  const pages = [
    ["Upcoming", "#/"],
    ["Calendar", "#/calendar/2026/10"],
    ["New trip", "#/trips/new"],
    ["Trip", `#/trips/${trip.id}`],
    ["PTO", "#/pto"],
    ["Settings", "#/settings"],
  ];
  const failures = [];
  for (const [name, hash] of pages) {
    await openThemed(page, hash);
    await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
    if (name === "Trip") await expect(page.locator(".places").first()).toBeVisible();
    if (name === "Calendar") await expect(page.locator(".cal-week").first()).toBeVisible();
    if (name === "New trip") await expect(page.locator(".composer-grid").first()).toBeVisible();
    const violations = await serious(page);
    if (violations.length) {
      failures.push({
        name,
        violations: violations.map((item) => ({
          id: item.id,
          impact: item.impact,
          help: item.help,
          nodes: item.nodes.slice(0, 3).map((node) => node.target.join(" ")),
        })),
      });
    }
  }
  expect(failures).toEqual([]);
});

test("a dark suite-theme replaces an earlier light choice", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("suite-theme", "light");
    localStorage.setItem("travel-theme", "light");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() => {
    localStorage.setItem("suite-theme", "dark");
    localStorage.setItem("travel-theme", "dark");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme-choice", "dark");
});
