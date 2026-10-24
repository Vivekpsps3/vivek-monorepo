import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { barName, dayLinkName, monthMatrix, weekdayHeads } from "../modules/calendar-model.mjs";
import {
  clearRange,
  dayName,
  moveFocus,
  pickDay,
  saveState,
  summaryText,
  toggleSplit,
} from "../modules/composer-model.mjs";
import { blankRange } from "../modules/composer-model.mjs";

test("tap then tap selects a range and a backwards tap swaps the ends", () => {
  let model = blankRange();
  model = pickDay(model, "2026-10-24");
  assert.equal(summaryText("", ""), "Pick the day you leave.");
  assert.equal(summaryText(model.start, model.end), "Now pick the day you come back.");
  model = pickDay(model, "2026-10-30");
  assert.equal(model.start, "2026-10-24");
  assert.equal(model.end, "2026-10-30");
  assert.equal(summaryText(model.start, model.end), "Oct 24 – Oct 30 · 6 nights");
  model = pickDay(pickDay(blankRange(), "2026-10-30"), "2026-10-24");
  assert.equal(model.start, "2026-10-24");
  assert.equal(model.end, "2026-10-30");
});

test("day buttons are named with the weekday and the range role", () => {
  assert.equal(dayName("2026-10-24", { start: "2026-10-24", end: "2026-10-30" }), "Saturday, October 24, 2026, start");
  assert.equal(dayName("2026-10-26", { start: "2026-10-24", end: "2026-10-30" }), "Monday, October 26, 2026, in trip");
  assert.equal(dayName("2026-10-30", { start: "2026-10-24", end: "2026-10-30" }), "Friday, October 30, 2026, end");
});

test("arrow keys move a day and escape clears the range", () => {
  assert.equal(moveFocus("2026-10-24", "ArrowRight"), "2026-10-25");
  assert.equal(moveFocus("2026-10-24", "ArrowDown"), "2026-10-31");
  assert.equal(moveFocus("2026-10-24", "Home"), "2026-10-18");
  assert.equal(moveFocus("2026-10-24", "End"), "2026-10-24");
  assert.equal(moveFocus("2026-10-24", "Escape"), "");
  const cleared = clearRange({ start: "2026-10-24", end: "2026-10-30", splits: ["2026-10-26"], awaitingEnd: false });
  assert.equal(cleared.start, "");
  assert.deepEqual(cleared.splits, []);
});

test("split replaces a double click and a missing city blocks save", () => {
  const ranged = { ...blankRange(), start: "2026-10-24", end: "2026-10-30", awaitingEnd: false, splits: [], cities: {} };
  const split = toggleSplit(ranged, "2026-10-27");
  assert.deepEqual(split.splits, ["2026-10-27"]);
  const blocked = saveState({ ...ranged, cities: { "2026-10-24": "  " }, tripName: "" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.field, "city");
  const ready = saveState({ ...ranged, cities: { "2026-10-24": "Kyoto" }, tripName: "" });
  assert.equal(ready.ok, true);
  assert.equal(ready.title, "Kyoto");
});

test("calendar day names include plans and the bar name includes the range", () => {
  const day = new Date(2026, 9, 22);
  assert.equal(dayLinkName({ iso: "2026-10-22", todayIso: "2026-10-22", day, planCount: 2, tripTitles: ["Kyoto trip"] }), "Thu, Oct 22, today, 2 plans, in Kyoto trip");
  assert.equal(barName({ title: "Kyoto", start_date: "2026-10-24", end_date: "2026-10-30" }), "Kyoto, Oct 24 – Oct 30");
  const weeks = monthMatrix(2026, 10, 0);
  assert.equal(weeks[0][0].getDay(), 0);
  assert.equal(weekdayHeads()[0].title, "Sunday");
});

test("the composer grid and the pto cadence are in the page source", () => {
  const composer = readFileSync(new URL("../modules/views/composer.mjs", import.meta.url), "utf8");
  const pto = readFileSync(new URL("../modules/views/pto.mjs", import.meta.url), "utf8");
  const trip = readFileSync(new URL("../modules/views/trip.mjs", import.meta.url), "utf8");
  const calendar = readFileSync(new URL("../modules/views/calendar.mjs", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
  assert.match(composer, /role="grid"/);
  assert.match(composer, /role="columnheader"/);
  assert.match(composer, /aria-label="Previous month"/);
  assert.match(composer, /Counts as PTO/);
  assert.match(composer, /aria-disabled/);
  assert.match(composer, /input\.name = "city";\s*model\.cityError = true;\s*applyFieldError\(root, "city", "Name the city\."\)/);
  assert.match(composer, /Split…/);
  assert.match(pto, /role="radiogroup"/);
  assert.match(pto, /Set up PTO/);
  assert.match(pto, /aria-hidden="true"/);
  assert.match(trip, /Show \$\{esc\(point.label\)\} on map/);
  assert.match(trip, /City: \$\{point.label\}/);
  assert.match(trip, /Map tiles couldn't load/);
  assert.match(calendar, />Today<\/a>/);
  assert.match(calendar, /aria-current="date"/);
  assert.match(calendar, /cal-strip/);
  assert.match(css, /\.composer-grid \[role="row"\]/);
});
