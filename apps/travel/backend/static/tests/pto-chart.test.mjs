import assert from "node:assert/strict";
import { test } from "node:test";

import { chartGeometry } from "../../../frontend/src/pto-chart.mjs";

const point = (on, days, kinds = [], projected = false) => ({
  on,
  days: String(days),
  kinds,
  projected,
});

test("steps between event points instead of sloping", () => {
  const geo = chartGeometry([
    point("2026-01-01", 5, ["as_of"]),
    point("2026-01-11", 3, ["charge"]),
    point("2026-01-21", 4, ["month"], true),
  ]);
  assert.ok(geo);
  // Horizontal hold at the old balance, then a vertical jump at the event.
  assert.match(geo.path, /^M [\d.]+ [\d.]+ H [\d.]+ V [\d.]+ H [\d.]+ V [\d.]+$/);
  assert.equal(geo.markers.length, 3);
  assert.equal(geo.first.days, 5);
  assert.equal(geo.last.days, 4);
  assert.ok(geo.markers[0].x < geo.markers[1].x);
  assert.ok(geo.markers[1].x < geo.markers[2].x);
  // A drop in balance moves down the chart (larger y).
  assert.ok(geo.markers[1].y > geo.markers[0].y);
});

test("zero line only appears when the balance crosses zero", () => {
  const crossing = chartGeometry([
    point("2026-01-01", 2),
    point("2026-02-01", -1, ["zero"]),
  ]);
  assert.ok(crossing.zeroY !== null);
  assert.ok(crossing.zeroY > crossing.markers[0].y);
  assert.ok(crossing.zeroY < crossing.markers[1].y);

  const positive = chartGeometry([point("2026-01-01", 2), point("2026-02-01", 3)]);
  assert.equal(positive.zeroY, null);
});

test("y-axis ticks use the day scale and markers keep hours", () => {
  const geo = chartGeometry([
    { on: "2026-01-01", days: "0", hours: "0", kinds: ["as_of"] },
    { on: "2026-02-01", days: "10", hours: "80", kinds: ["horizon"], projected: true },
  ]);
  assert.ok(geo.ticks.length >= 2);
  assert.ok(geo.ticks.some((tick) => tick.label === "0"));
  assert.ok(geo.ticks.every((tick) => tick.y >= 0 && tick.y <= geo.height));
  assert.equal(geo.markers[1].daysText, "10");
  assert.equal(geo.markers[1].hours, "80");
  assert.ok(geo.markers[1].y < geo.markers[0].y);
});

test("today marker is found by kind", () => {
  const geo = chartGeometry([
    point("2026-01-01", 5, ["as_of"]),
    point("2026-01-15", 5, ["today"]),
    point("2026-02-01", 6, ["horizon"], true),
  ]);
  assert.equal(geo.today.on, "2026-01-15");
  assert.equal(geo.today.days, 5);
});

test("unusable input yields no chart", () => {
  assert.equal(chartGeometry([]), null);
  assert.equal(chartGeometry([point("2026-01-01", 5)]), null);
  assert.equal(chartGeometry(null), null);
  assert.equal(
    chartGeometry([{ on: "nope", days: "1" }, { on: "2026-01-01", days: "x" }]),
    null,
  );
});

test("unsorted points are ordered by date", () => {
  const geo = chartGeometry([
    point("2026-03-01", 9),
    point("2026-01-01", 5),
    point("2026-02-01", 7),
  ]);
  assert.deepEqual(
    geo.markers.map((m) => m.on),
    ["2026-01-01", "2026-02-01", "2026-03-01"],
  );
});
