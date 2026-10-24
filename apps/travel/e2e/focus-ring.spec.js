import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const dir = "/tmp/travel-focus";

test("a focused checkbox is not the same picture as the unfocused one", async ({ page, request }) => {
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
      transports: [],
    },
  });
  expect(created.ok()).toBeTruthy();
  const trip = await created.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate((id) => { location.hash = `#/trips/${id}`; }, trip.id);
  await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await page.getByRole("button", { name: "Edit trip" }).click();
  const box = page.getByRole("checkbox", { name: "Count as PTO" });
  await box.uncheck();
  await page.evaluate(() => document.activeElement?.blur?.());
  const plain = path.join(dir, "plain.png");
  const focused = path.join(dir, "focused.png");
  await page.screenshot({ path: plain });
  await box.focus();
  await expect(box).toBeFocused();
  await page.screenshot({ path: focused });
  expect(readFileSync(plain).equals(readFileSync(focused))).toBe(false);
});
