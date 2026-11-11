import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHART_ERROR,
  CHART_HEIGHT_COMPACT,
  CHART_HEIGHT_WIDE,
  combinedForecast,
  dayTicks,
} from "../../../frontend/src/pto-chart.mjs";

const DOT = "\u00b7";

function point(on, days, hours, kinds = [], projected = false) {
  return { on, days: String(days), hours: String(hours), kinds, projected };
}

function series(extra = {}) {
  return {
    today: "2026-09-15",
    horizon_end: "2027-03-31",
    policy_year_end: "2027-03-31",
    rolled_over: false,
    days_left_in_policy_year: 197,
    pto: {
      balance_horizon_days: "12.5",
      balance_horizon_hours: "100",
      first_negative: null,
      points: [
        point("2026-07-15", "10", "80", ["as_of"]),
        point("2026-08-01", "10.5", "84", ["month"]),
        point("2026-09-01", "11", "88", ["month"]),
        point("2026-09-15", "11.25", "90", ["today"]),
        point("2026-10-01", "11.5", "92", ["month"], true),
        point("2026-11-01", "12", "96", ["month"], true),
        point("2026-12-01", "12.25", "98", ["month"], true),
        point("2027-01-01", "12.5", "100", ["month"], true),
        point("2027-02-01", "12.75", "102", ["month"], true),
        point("2027-03-01", "13", "104", ["month"], true),
        point("2027-03-31", "12.5", "100", ["horizon"], true),
      ],
    },
    sick: {
      balance_horizon_days: "4",
      balance_horizon_hours: "32",
      first_negative: null,
      points: [
        point("2026-07-15", "3", "24", ["as_of"]),
        point("2026-08-01", "3.25", "26", ["month"]),
        point("2026-09-01", "3.5", "28", ["month"]),
        point("2026-09-15", "3.75", "30", ["today"]),
        point("2026-10-01", "4", "32", ["month"], true),
        point("2027-01-01", "4.5", "36", ["month"], true),
        point("2027-03-31", "4", "32", ["horizon"], true),
      ],
    },
    ...extra,
  };
}

function labelsOf(geo) {
  return geo.xTicks.map((tick) => tick.label);
}

test("day ticks always include zero and stay within four or five", () => {
  for (const [min, max] of [[0, 10], [0, 12], [-1.5, 10], [-3, 2], [0, 0], [5, 5], [-0.25, 0.5]]) {
    const ticks = dayTicks(min, max);
    assert.ok(ticks.includes(0), `${min}..${max} => ${ticks}`);
    assert.ok(ticks.length >= 4 && ticks.length <= 5, `${min}..${max} => ${ticks}`);
    assert.ok(ticks[0] <= Math.min(0, min) + 1e-6);
    assert.ok(ticks[ticks.length - 1] >= Math.max(0, max) - 1e-6);
  }
});

test("two buckets share one plot, table, and server point text", () => {
  const body = series();
  const geo = combinedForecast(body, { wide: true, width: 900 });
  assert.equal(geo.height, CHART_HEIGHT_WIDE);
  assert.equal(geo.series.length, 2);
  assert.deepEqual(geo.legend.map((item) => `${item.glyph} ${item.label}`), ["\u25cf PTO", "\u25a0 Sick"]);
  assert.equal(geo.series[0].shape, "circle");
  assert.equal(geo.series[1].shape, "square");
  assert.match(geo.series[0].historyClass, /pto-line-pto/);
  assert.match(geo.series[1].projectionClass, /pto-line-sick pto-future/);
  assert.match(geo.series[0].history, /^M /);
  assert.match(geo.series[0].history, / L /);
  assert.doesNotMatch(geo.series[0].history, / H /);
  const today = geo.today;
  assert.ok(today);
  assert.match(geo.series[0].history, new RegExp(`L ${today.x} `));
  assert.match(geo.series[0].projection, new RegExp(`^M ${today.x} `));
  assert.ok(geo.yTicks.some((tick) => tick.label === "0"));
  assert.ok(geo.yTicks.length >= 4 && geo.yTicks.length <= 5);
  assert.equal(geo.band, null);
  assert.equal(geo.zeroY, null);
  assert.deepEqual(labelsOf(geo).slice(0, 3), ["Jul 2026", "Aug", "Sep"]);
  assert.ok(labelsOf(geo).includes("Jan 2027"));
  const january = body.pto.points.find((item) => item.on === "2027-01-01");
  const row = geo.table.rows.find((item) => item.key === "2027-01-01");
  assert.equal(row.cells[1], `12.5 days ${DOT} 100 h`);
  assert.equal(row.cells[1], `${Number(january.days)} days ${DOT} ${Number(january.hours)} h`.replace("-", "\u2212"));
  assert.equal(row.cells[3], "Yes");
  assert.equal(geo.table.columns[2], `Sick days ${DOT} h`);
  const todayRow = geo.table.rows.find((item) => item.key === "2026-09-15");
  assert.match(todayRow.cells[0], /Today/);
  assert.equal(todayRow.cells[3], "No");
  assert.equal(todayRow.cells[1], `11.25 days ${DOT} 90 h`);
  assert.match(geo.caption, /^Projected to Mar 31, 2027, the end of your policy year: PTO 12\.5 days/);
  assert.match(geo.caption, /Sick 4 days/);
  assert.equal(geo.warnings.length, 0);
  assert.deepEqual(geo.endLabels.map((label) => label.text), ["PTO 12.5 d", "Sick 4 d"]);
});

test("narrow ticks use every other month and an apostrophe year on January", () => {
  const geo = combinedForecast(series(), { wide: false, width: 900 });
  assert.equal(geo.height, CHART_HEIGHT_COMPACT);
  assert.equal(CHART_HEIGHT_COMPACT, 220);
  assert.deepEqual(labelsOf(geo), ["Jul", "Sep", "Nov", "Jan \u201927", "Mar"]);
});

test("x labels and end labels do not occupy the same box", () => {
  const geo = combinedForecast(series(), { wide: true, width: 420 });
  const boxes = geo.xTicks.map((tick) => {
    const width = tick.label.length * 6.6;
    return { left: tick.x - width / 2, right: tick.x + width / 2, label: tick.label };
  });
  for (let index = 1; index < boxes.length; index += 1) {
    assert.ok(boxes[index].left >= boxes[index - 1].right - 1, boxes.map((box) => box.label).join(" | "));
  }
  const ends = [...geo.endLabels].sort((a, b) => a.y - b.y);
  if (ends.length === 2) assert.ok(ends[1].y - ends[0].y >= 14);
  const tied = series();
  tied.sick.points = tied.pto.points.map((item) => ({ ...item }));
  tied.sick.balance_horizon_days = tied.pto.balance_horizon_days;
  tied.sick.balance_horizon_hours = tied.pto.balance_horizon_hours;
  const tiedGeo = combinedForecast(tied, { wide: true, width: 800 });
  const tiedEnds = [...tiedGeo.endLabels].sort((a, b) => a.y - b.y);
  assert.ok(tiedEnds[1].y - tiedEnds[0].y >= 14);
  assert.notEqual(tiedEnds[0].text, tiedEnds[1].text);
});

test("negative balances keep the API text, the band, and both warnings", () => {
  const body = series();
  body.pto.first_negative = { on: "2027-03-09", days: "-1.5", hours: "-12" };
  body.pto.balance_horizon_days = "-1.5";
  body.pto.balance_horizon_hours = "-12";
  body.pto.points = body.pto.points.map((item) => item.on === "2027-03-01"
    ? point("2027-03-01", "-1.5", "-12", ["month"], true)
    : item);
  body.sick.first_negative = { on: "2027-02-02", days: "-0.25", hours: "-2" };
  body.sick.points.push(point("2027-02-02", "-0.25", "-2", ["charge"], true));
  const geo = combinedForecast(body, { wide: true, width: 900 });
  assert.ok(geo.band);
  assert.equal(geo.zeroY, geo.band.y);
  assert.ok(geo.band.height > 0);
  const dipped = geo.series[0];
  assert.ok(dipped.projection.includes("L"));
  assert.equal(geo.warnings[0], "\u26a0 PTO drops below zero on Mar 9, 2027: \u22121.5 days \u00b7 \u221212 h.");
  assert.match(geo.warnings[1], /^⚠ Sick drops below zero on Feb 2, 2027/);
  assert.match(geo.caption, / PTO drops below zero on Mar 9, 2027\./);
  assert.match(geo.caption, / Sick drops below zero on Feb 2, 2027\./);
  const row = geo.table.rows.find((item) => item.cells[1].includes("\u22121.5"));
  assert.ok(row);
  assert.equal(row.cells[1], `\u22121.5 days ${DOT} \u221212 h`);
});

test("one bucket omits the other line, column, and caption clause", () => {
  const body = series({ sick: null });
  const geo = combinedForecast(body, { wide: false, width: 640 });
  assert.equal(geo.series.length, 1);
  assert.deepEqual(geo.legend.map((item) => item.label), ["PTO"]);
  assert.deepEqual(geo.table.columns, ["Month", `PTO days ${DOT} h`, "Projected"]);
  assert.doesNotMatch(geo.caption, /Sick/);
  assert.equal(combinedForecast(series({ pto: null, sick: null })), null);
  assert.equal(combinedForecast(null), null);
});

test("a single point still draws a marker and a matching table row", () => {
  const body = series({
    today: "2027-04-02",
    horizon_end: "2027-04-02",
    policy_year_end: "2027-03-31",
    pto: {
      balance_horizon_days: "2",
      balance_horizon_hours: "16",
      first_negative: null,
      points: [point("2027-04-02", "2", "16", ["as_of", "today"])],
    },
    sick: null,
  });
  const geo = combinedForecast(body, { wide: true, width: 640 });
  assert.equal(geo.series[0].history, "");
  assert.equal(geo.series[0].projection, "");
  assert.equal(geo.series[0].markers.length, 1);
  assert.equal(geo.table.rows.length, 1);
  assert.equal(geo.table.rows[0].cells[1], `2 days ${DOT} 16 h`);
  assert.equal(geo.table.rows[0].cells[2], "No");
});

test("rollover caption uses the next policy year and the server day count", () => {
  const geo = combinedForecast(series({
    rolled_over: true,
    horizon_end: "2028-03-31",
    policy_year_end: "2027-03-31",
    days_left_in_policy_year: 42,
  }), { wide: true, width: 800 });
  assert.equal(
    geo.caption,
    "Projected to Mar 31, 2028, the end of next policy year. This one ends in 42 days.",
  );
});

test("table text is the API point, not hours divided again", () => {
  const body = series({ sick: null });
  body.pto.points = [
    point("2026-09-01", "3", "999", ["as_of", "month"]),
    point("2026-09-15", "3", "999", ["today"]),
  ];
  body.pto.balance_horizon_days = "3";
  body.pto.balance_horizon_hours = "999";
  const geo = combinedForecast(body, { wide: true, width: 640 });
  assert.equal(geo.table.rows[0].cells[1], `3 days ${DOT} 999 h`);
  assert.match(geo.caption, /PTO 3 days · 999 h/);
});

test("the chart failure sentence is the local retry copy", () => {
  assert.equal(CHART_ERROR, "Couldn't load the balance chart.");
});
