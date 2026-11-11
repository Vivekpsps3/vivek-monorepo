/** Combined PTO and Sick forecast geometry.

 * The server /pto/series points are the balances. This module only places
 * those points, formats their existing day and hour text, and describes the
 * SVG. It does not accrue, cap, or project a second balance.
 */

import { formatDate } from "../../../../packages/browser/runtime/date.mjs";
import { DOT, MINUS, MONTHS, longDate, trimNumber } from "./pto-model.mjs";

export const CHART_HEIGHT_COMPACT = 220;
export const CHART_HEIGHT_WIDE = 300;
export const CHART_ERROR = "Couldn't load the balance chart.";

const LABEL_GAP = 16;
const CHAR_WIDTH = 6.6;

const SERIES = [
  { key: "pto", label: "PTO", glyph: "\u25cf", shape: "circle", line: "pto-line pto-line-pto", marker: "pto-marker-pto", legend: "pto-key-pto" },
  { key: "sick", label: "Sick", glyph: "\u25a0", shape: "square", line: "pto-line pto-line-sick", marker: "pto-marker-sick", legend: "pto-key-sick" },
];

function dayMs(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day);
  return Number.isFinite(ms) ? ms : null;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function roundTick(value) {
  const scaled = Math.round(value * 1000) / 1000;
  return Math.abs(scaled) < 1e-9 ? 0 : scaled;
}

function num(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim().replaceAll(MINUS, "-");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function signed(value) {
  const parsed = num(value);
  return parsed === null ? String(value ?? "") : trimNumber(parsed);
}

function amount(days, hours) {
  return `${signed(days)} days ${DOT} ${signed(hours)} h`;
}

function monthName(iso) {
  return MONTHS[Number(iso.slice(5, 7)) - 1]?.[1] || "";
}

function addMonth(iso) {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

function monthStarts(firstIso, lastIso) {
  const last = `${lastIso.slice(0, 7)}-01`;
  const starts = [];
  let cursor = `${firstIso.slice(0, 7)}-01`;
  while (cursor <= last && starts.length < 36) {
    starts.push(cursor);
    cursor = addMonth(cursor);
  }
  return starts;
}

function niceStep(rough) {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const n = rough / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

/** 4 or 5 day ticks that cover the data and always include zero. */
export function dayTicks(minDays, maxDays) {
  const low = Math.min(0, minDays);
  const high = Math.max(0, maxDays);
  const span = Math.max(high - low, 1);
  const attempts = [span / 4, span / 3, span / 5, span / 2, span / 4.5];
  let closest = null;
  for (const rough of attempts) {
    const step = niceStep(rough);
    const start = roundTick(Math.floor((low + step * 1e-6) / step) * step);
    const end = roundTick(Math.ceil((high - step * 1e-6) / step) * step);
    const gaps = Math.round((end - start) / step);
    if (gaps < 1 || gaps > 8) continue;
    const ticks = [];
    for (let index = 0; index <= gaps; index += 1) ticks.push(roundTick(start + index * step));
    const unique = [...new Set(ticks)];
    const covers = unique[0] <= low + 1e-6 && unique[unique.length - 1] >= high - 1e-6;
    const hasZero = unique.includes(0);
    if (!covers || !hasZero) continue;
    if (unique.length >= 4 && unique.length <= 5) return unique;
    if (!closest || Math.abs(unique.length - 4.5) < Math.abs(closest.length - 4.5)) closest = unique;
  }
  if (closest && closest.length >= 4 && closest.length <= 5) return closest;
  const step = niceStep(span / 4);
  const start = roundTick(Math.floor(low / step) * step);
  const ticks = [];
  for (let value = start; ticks.length < 5; value = roundTick(value + step)) {
    ticks.push(value);
    if (value >= high && ticks.length >= 4) break;
  }
  if (!ticks.includes(0)) ticks.push(0);
  ticks.sort((a, b) => a - b);
  return ticks.slice(0, 5);
}

function usablePoints(points) {
  const byDate = new Map();
  for (const point of points ?? []) {
    const ms = dayMs(point?.on);
    const days = num(point?.days);
    if (ms === null || days === null) continue;
    byDate.set(point.on, {
      on: point.on,
      ms,
      days,
      daysText: point.days,
      hoursText: point.hours,
      kinds: Array.isArray(point.kinds) ? point.kinds : [],
      projected: Boolean(point.projected),
    });
  }
  return [...byDate.values()].sort((a, b) => a.ms - b.ms);
}

function linePath(points) {
  if (points.length < 2) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function xLabel(iso, first, wide) {
  const name = monthName(iso);
  const year = iso.slice(0, 4);
  const january = iso.slice(5, 7) === "01";
  if (wide && (iso === first || january)) return `${name} ${year}`;
  if (!wide && january) return `${name} \u2019${year.slice(2)}`;
  return name;
}

function separate(labels, minY, maxY) {
  const ordered = [...labels].sort((a, b) => a.y - b.y || a.text.localeCompare(b.text));
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].y < ordered[index - 1].y + LABEL_GAP) {
      ordered[index].y = round(ordered[index - 1].y + LABEL_GAP);
    }
  }
  if (ordered.length && ordered[ordered.length - 1].y > maxY) {
    const shift = ordered[ordered.length - 1].y - maxY;
    for (const label of ordered) label.y = round(label.y - shift);
  }
  if (ordered.length && ordered[0].y < minY) {
    const shift = minY - ordered[0].y;
    for (const label of ordered) label.y = round(label.y + shift);
  }
  return ordered;
}

function overlaps(left, right, placed) {
  return placed.some((item) => left < item.right + 4 && right > item.left - 4);
}

/**
 * One plot for the buckets present on a /pto/series body.
 * `wide` is the 1280 layout (300px, monthly ticks). Otherwise the chart is
 * the 390 layout (220px, every other month).
 * Returns null when neither bucket has a usable point.
 */
export function combinedForecast(series, options = {}) {
  if (!series) return null;
  const wide = Boolean(options.wide);
  const height = wide ? CHART_HEIGHT_WIDE : CHART_HEIGHT_COMPACT;
  const width = Math.max(240, Number(options.width) || (wide ? 760 : 350));
  const buckets = [];
  for (const spec of SERIES) {
    const raw = series[spec.key];
    const points = usablePoints(raw?.points);
    if (!raw || !points.length) continue;
    buckets.push({ spec, raw, points });
  }
  if (!buckets.length) return null;
  const labelWidth = (text) => text.length * 8;
  const endGuess = buckets.map((bucket) => {
    const last = bucket.points[bucket.points.length - 1];
    return `${bucket.spec.label} ${signed(last.daysText)} d`;
  });
  const padRight = Math.max(72, Math.ceil(Math.max(...endGuess.map(labelWidth)) + 8));
  const plot = { left: 44, right: width - padRight, top: 22, bottom: height - 28 };
  if (plot.right <= plot.left + 40) plot.right = Math.min(width - 8, plot.left + 40);

  const todayIso = typeof series.today === "string" ? series.today : "";
  const allPoints = buckets.flatMap((bucket) => bucket.points);
  const firstIso = allPoints.reduce((min, point) => (point.on < min ? point.on : min), allPoints[0].on);
  const lastPointIso = allPoints.reduce((max, point) => (point.on > max ? point.on : max), allPoints[0].on);
  const horizonIso = dayMs(series.horizon_end) !== null && series.horizon_end > lastPointIso
    ? series.horizon_end
    : lastPointIso;
  const firstMs = dayMs(firstIso);
  const lastMs = dayMs(horizonIso);
  const span = Math.max(lastMs - firstMs, 1);
  const xOf = (ms) => round(plot.left + ((ms - firstMs) / span) * (plot.right - plot.left));

  const dataMin = Math.min(...allPoints.map((point) => point.days));
  const dataMax = Math.max(...allPoints.map((point) => point.days));
  const ticks = dayTicks(dataMin, dataMax);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const ySpan = yMax - yMin || 1;
  const yOf = (days) => round(plot.bottom - ((days - yMin) / ySpan) * (plot.bottom - plot.top));

  const placed = buckets.map((bucket) => ({
    ...bucket,
    placed: bucket.points.map((point) => ({ ...point, x: xOf(point.ms), y: yOf(point.days) })),
  }));

  const yTicks = ticks.map((days) => ({ days, y: yOf(days), label: trimNumber(days) }));
  const negative = dataMin < 0;
  const zeroY = negative ? yOf(0) : null;
  const band = negative
    ? { x: plot.left, y: zeroY, width: round(plot.right - plot.left), height: round(plot.bottom - zeroY) }
    : null;

  const months = monthStarts(firstIso, horizonIso);
  const chosen = [];
  months.forEach((iso, index) => {
    if (wide || index % 2 === 0 || iso.slice(5, 7) === "01") chosen.push(iso);
  });
  const xTicks = [];
  for (const iso of chosen) {
    const at = iso < firstIso ? firstIso : iso;
    const x = xOf(dayMs(at));
    const label = xLabel(iso, chosen[0], wide);
    const half = (label.length * CHAR_WIDTH) / 2;
    const required = iso === chosen[0] || iso.slice(5, 7) === "01";
    const box = { on: iso, x, label, left: x - half, right: x + half, required };
    if (!required && overlaps(box.left, box.right, xTicks)) continue;
    if (required) {
      for (let index = xTicks.length - 1; index >= 0; index -= 1) {
        if (!xTicks[index].required && overlaps(box.left, box.right, [xTicks[index]])) xTicks.splice(index, 1);
      }
    }
    xTicks.push(box);
  }
  for (let index = 1; index < xTicks.length; index += 1) {
    const gap = xTicks[index].left - xTicks[index - 1].right;
    if (gap >= 4) continue;
    const shift = 4 - gap;
    xTicks[index].x = round(xTicks[index].x + shift);
    xTicks[index].left += shift;
    xTicks[index].right += shift;
  }

  let today = null;
  for (const bucket of placed) {
    const point = bucket.placed.find((item) => item.kinds.includes("today") || item.on === todayIso);
    if (!point) continue;
    const nearAxis = point.x < plot.left + 36;
    today = {
      x: point.x,
      labelX: nearAxis ? round(point.x + 4) : point.x,
      labelY: 12,
      anchor: nearAxis ? "start" : "middle",
    };
    break;
  }

  const drawn = placed.map((bucket) => {
    const history = bucket.placed.filter((point) => !todayIso || point.on <= todayIso);
    const projection = bucket.placed.filter((point) => todayIso && point.on >= todayIso);
    const markAll = bucket.placed.length === 1;
    const markers = bucket.placed
      .filter((point) => markAll || point.kinds.includes("month") || point.kinds.includes("today"))
      .map((point) => ({ on: point.on, x: point.x, y: point.y }));
    const last = bucket.placed[bucket.placed.length - 1];
    return {
      bucket: bucket.spec.key,
      shape: bucket.spec.shape,
      history: linePath(history),
      projection: projection.length > 1 ? linePath(projection) : "",
      historyClass: bucket.spec.line,
      projectionClass: `${bucket.spec.line} pto-future`,
      markerClass: bucket.spec.marker,
      markers,
      end: {
        text: `${bucket.spec.label} ${signed(last.daysText)} d`,
        x: plot.right + 8,
        y: last.y,
      },
    };
  });
  const endLabels = separate(
    drawn.map((series) => series.end),
    plot.top + 8,
    plot.bottom - 4,
  );
  for (const label of endLabels) {
    const room = width - 4 - labelWidth(label.text);
    if (label.x > room) label.x = Math.max(plot.left, room);
  }

  const warnings = [];
  for (const bucket of placed) {
    const dip = bucket.raw.first_negative;
    if (!dip || dayMs(dip.on) === null) continue;
    warnings.push(
      `\u26a0 ${bucket.spec.label} drops below zero on ${longDate(dip.on)}: ${amount(dip.days, dip.hours)}.`,
    );
  }

  const endIso = series.rolled_over ? series.horizon_end : series.policy_year_end || series.horizon_end;
  const endText = dayMs(endIso) !== null ? longDate(endIso) : "";
  let caption = "";
  if (series.rolled_over) {
    caption = `Projected to ${endText}, the end of next policy year. This one ends in ${series.days_left_in_policy_year} days.`;
  } else {
    const parts = placed.map((bucket) => `${bucket.spec.label} ${amount(bucket.raw.balance_horizon_days, bucket.raw.balance_horizon_hours)}`);
    caption = `Projected to ${endText}, the end of your policy year: ${parts.join(", ")}.`;
  }
  for (const bucket of placed) {
    const dip = bucket.raw.first_negative;
    if (dip && dayMs(dip.on) !== null) caption += ` ${bucket.spec.label} drops below zero on ${longDate(dip.on)}.`;
  }

  const columns = ["Month"];
  for (const bucket of placed) columns.push(`${bucket.spec.label} days ${DOT} h`);
  columns.push("Projected");
  const rowDates = new Map();
  for (const bucket of placed) {
    const marked = bucket.placed.filter((point) => point.kinds.includes("month") || point.kinds.includes("today"));
    const rows = marked.length ? marked : bucket.placed;
    for (const point of rows) {
      const row = rowDates.get(point.on) || { on: point.on, today: false, month: false, projected: point.projected, cells: {} };
      row.cells[bucket.spec.key] = amount(point.daysText, point.hoursText);
      row.today = row.today || point.kinds.includes("today") || point.on === todayIso;
      row.month = row.month || point.kinds.includes("month");
      row.projected = point.projected;
      rowDates.set(point.on, row);
    }
  }
  const rows = [...rowDates.values()]
    .sort((a, b) => a.on.localeCompare(b.on))
    .map((row) => {
      const monthLabel = row.month ? formatDate(row.on, "month") : longDate(row.on);
      const label = row.today ? `${monthLabel} ${DOT} Today` : monthLabel;
      const cells = [label];
      for (const bucket of placed) cells.push(row.cells[bucket.spec.key] || "");
      cells.push(row.today || !row.projected ? "No" : "Yes");
      return { key: row.on, cells };
    });

  return {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    plot,
    axisName: { x: plot.left - 6, y: 12, text: "days" },
    yTicks,
    xTicks,
    xLabelY: height - 10,
    band,
    zeroY,
    today,
    series: drawn.map(({ end: _end, ...series }) => series),
    endLabels,
    legend: placed.map((bucket) => ({
      bucket: bucket.spec.key,
      glyph: bucket.spec.glyph,
      label: bucket.spec.label,
      legendClass: bucket.spec.legend,
    })),
    warnings,
    caption,
    table: { columns, rows },
  };
}
