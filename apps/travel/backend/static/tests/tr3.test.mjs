import assert from "node:assert/strict";
import test from "node:test";
import { barName, dayLinkName, monthMatrix, weekdayHeads } from "../../../frontend/src/calendar-model.mjs";
import {
  changeCity,
  clearRange,
  confirmSpan,
  dayName,
  guardSpan,
  moveChange,
  moveFocus,
  pickDay,
  removeChange,
  saveState,
  segments,
  summaryText,
} from "../../../frontend/src/composer-model.mjs";
import { blankRange } from "../../../frontend/src/composer-model.mjs";

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

test("a missing city blocks save and one named city is the title", () => {
  const ranged = { ...blankRange(), start: "2026-10-24", end: "2026-10-30", awaitingEnd: false, splits: [], cities: {} };
  const blocked = saveState({ ...ranged, cities: { "2026-10-24": "  " }, tripName: "" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.field, "city");
  assert.equal(blocked.cityKey, "2026-10-24");
  const ready = saveState({ ...ranged, cities: { "2026-10-24": "Kyoto" }, tripName: "" });
  assert.equal(ready.ok, true);
  assert.equal(ready.title, "Kyoto");
});

test("Kyoto until Oct 26 and Osaka from Oct 27 is one title and two stays", () => {
  let model = { ...blankRange(), start: "2026-10-24", end: "2026-10-30", awaitingEnd: false, splits: [], cities: { "2026-10-24": "Kyoto" }, tripName: "Keep me", nameTouched: true, pto: false };
  model = changeCity(model, "2026-10-27");
  assert.deepEqual(segments(model).map((part) => [part.arrive, part.leave]), [
    ["2026-10-24", "2026-10-26"],
    ["2026-10-27", "2026-10-30"],
  ]);
  assert.equal(model.cities["2026-10-24"], "Kyoto");
  assert.equal(model.cities["2026-10-27"], "");
  assert.equal(model.tripName, "Keep me");
  assert.equal(model.pto, false);
  model.cities["2026-10-27"] = "Osaka";
  const saved = saveState({ ...model, tripName: "", nameTouched: false });
  assert.equal(saved.ok, true);
  assert.equal(saved.title, "Kyoto and Osaka");
  assert.deepEqual(saved.parts.map((part) => [part.arrive, part.leave, part.city]), [
    ["2026-10-24", "2026-10-26", "Kyoto"],
    ["2026-10-27", "2026-10-30", "Osaka"],
  ]);
  const blank = saveState({ ...model, cities: { ...model.cities, "2026-10-27": "  " } });
  assert.equal(blank.ok, false);
  assert.equal(blank.field, "city");
  assert.equal(blank.cityKey, "2026-10-27");
  const single = removeChange(model, "2026-10-27");
  assert.deepEqual(single.splits, []);
  assert.equal(segments(single).length, 1);
  assert.equal(single.cities["2026-10-24"], "Kyoto");
  assert.equal(summaryText(single.start, single.end), "Oct 24 – Oct 30 · 6 nights");
});

test("moving a boundary and shortening dates keep the destinations already typed", () => {
  let model = changeCity({ ...blankRange(), start: "2026-10-24", end: "2026-10-30", awaitingEnd: false, splits: [], cities: { "2026-10-24": "Kyoto" } }, "2026-10-27");
  model.cities["2026-10-27"] = "Osaka";
  model = moveChange(model, "2026-10-27", "2026-10-28");
  assert.equal(model.cities["2026-10-24"], "Kyoto");
  assert.equal(model.cities["2026-10-28"], "Osaka");
  assert.equal(segments(model)[0].leave, "2026-10-27");
  assert.equal(segments(model)[1].arrive, "2026-10-28");
  const blocked = guardSpan(model, "2026-10-24", "2026-10-26");
  assert.equal(blocked.end, "2026-10-30");
  assert.equal(blocked.cities["2026-10-28"], "Osaka");
  assert.equal(blocked.pendingSpan.dropped[0].city, "Osaka");
  const shortened = confirmSpan(blocked);
  assert.equal(shortened.end, "2026-10-26");
  assert.equal(shortened.cities["2026-10-24"], "Kyoto");
  assert.equal(shortened.cities["2026-10-28"], undefined);
  const restarted = pickDay(model, "2026-11-02");
  assert.equal(restarted.start, "2026-10-24");
  assert.equal(restarted.pendingSpan.reset, true);
  assert.equal(confirmSpan(restarted).cities["2026-10-24"], undefined);
});

test("same-day trips, the last day, and adjacent stops stay predictable", () => {
  const same = { ...blankRange(), start: "2026-10-24", end: "2026-10-24", awaitingEnd: false, splits: [], cities: { "2026-10-24": "Kyoto" } };
  assert.equal(summaryText(same.start, same.end), "Oct 24 · same day");
  assert.equal(changeCity(same, "2026-10-24"), same);
  const last = changeCity({ ...blankRange(), start: "2026-10-24", end: "2026-10-30", awaitingEnd: false, splits: [], cities: {} }, "2026-10-30");
  assert.equal(segments(last)[0].leave, "2026-10-29");
  assert.equal(segments(last)[1].arrive, "2026-10-30");
  assert.equal(segments(last)[1].leave, "2026-10-30");
  let adjacent = changeCity({ ...blankRange(), start: "2026-10-24", end: "2026-10-30", awaitingEnd: false, splits: [], cities: { "2026-10-24": "Kyoto" } }, "2026-10-25");
  adjacent = changeCity(adjacent, "2026-10-26");
  adjacent.cities["2026-10-25"] = "Osaka";
  adjacent.cities["2026-10-26"] = "Nara";
  assert.deepEqual(segments(adjacent).map((part) => part.arrive), ["2026-10-24", "2026-10-25", "2026-10-26"]);
  const removed = removeChange(adjacent, "2026-10-25");
  assert.equal(removed.cities["2026-10-24"], "Kyoto");
  assert.equal(removed.cities["2026-10-26"], "Nara");
  assert.equal(dayName("2026-10-27", { start: "2026-10-24", end: "2026-10-30", splits: ["2026-10-27"] }), "Tuesday, October 27, 2026, change city");
});

test("calendar day names include plans and the bar name includes the range", () => {
  const day = new Date(2026, 9, 22);
  assert.equal(dayLinkName({ iso: "2026-10-22", todayIso: "2026-10-22", day, planCount: 2, tripTitles: ["Kyoto trip"] }), "Thu, Oct 22, today, 2 plans, in Kyoto trip");
  assert.equal(barName({ title: "Kyoto", start_date: "2026-10-24", end_date: "2026-10-30" }), "Kyoto, Oct 24 – Oct 30");
  const weeks = monthMatrix(2026, 10, 0);
  assert.equal(weeks[0][0].getDay(), 0);
  assert.equal(weekdayHeads()[0].title, "Sunday");
});
