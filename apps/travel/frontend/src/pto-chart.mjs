/** Step-chart geometry for the /pto/series points (TPTO2B).
 *
 * Balances only change at event points, so the line steps: it holds the
 * previous balance until the next point's date, then jumps. Pure math with
 * no DOM so node tests can pin the shape.
 */

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 200;

function dayMs(iso) {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function num(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Build the SVG geometry for one bucket's series points.
 * Returns null when there are fewer than two usable points.
 */
export function chartGeometry(points, options = {}) {
  const width = options.width ?? CHART_WIDTH;
  const height = options.height ?? CHART_HEIGHT;
  const padX = options.padX ?? 6;
  const padTop = options.padTop ?? 10;
  const padBottom = options.padBottom ?? 10;
  const usable = [];
  for (const point of points ?? []) {
    const ms = dayMs(point?.on);
    const days = num(point?.days);
    if (ms === null || days === null) continue;
    usable.push({
      on: point.on,
      ms,
      days,
      daysText: String(point.days),
      hours: point.hours == null || point.hours === "" ? "" : String(point.hours),
      kinds: Array.isArray(point.kinds) ? point.kinds : [],
      projected: Boolean(point.projected),
    });
  }
  if (usable.length < 2) return null;
  usable.sort((a, b) => a.ms - b.ms);

  const firstMs = usable[0].ms;
  const lastMs = usable[usable.length - 1].ms;
  const spanMs = Math.max(lastMs - firstMs, 1);
  const rawMin = Math.min(...usable.map((p) => p.days));
  let minDays = Math.min(0, rawMin);
  let maxDays = Math.max(0, ...usable.map((p) => p.days));
  if (maxDays === minDays) maxDays = minDays + 1;
  const headroom = (maxDays - minDays) * 0.08;
  maxDays += headroom;
  minDays -= headroom;

  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const x = (ms) => round(padX + ((ms - firstMs) / spanMs) * innerW);
  const y = (days) =>
    round(padTop + ((maxDays - days) / (maxDays - minDays)) * innerH);

  const markers = usable.map((p) => ({
    on: p.on,
    days: p.days,
    daysText: p.daysText,
    hours: p.hours,
    kinds: p.kinds,
    projected: p.projected,
    x: x(p.ms),
    y: y(p.days),
  }));

  let path = `M ${markers[0].x} ${markers[0].y}`;
  for (let i = 1; i < markers.length; i++) {
    path += ` H ${markers[i].x} V ${markers[i].y}`;
  }

  const today = markers.find((m) => m.kinds.includes("today")) ?? null;
  return {
    width,
    height,
    path,
    zeroY: rawMin < 0 ? y(0) : null,
    minDays,
    maxDays,
    ticks: dayTicks(minDays, maxDays).map((days) => ({
      days,
      y: y(days),
      label: tickLabel(days),
    })),
    markers,
    today,
    first: markers[0],
    last: markers[markers.length - 1],
  };
}

/** About four gaps across the scale. The step is 1, 2, or 5 times a power of ten. */
function niceStep(rough) {
  if (!(rough > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const n = rough / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function tickLabel(value) {
  const scaled = Math.round(value * 100) / 100;
  if (Math.abs(scaled) < 1e-9) return "0";
  if (Math.abs(scaled - Math.round(scaled)) < 1e-6) return String(Math.round(scaled));
  return String(scaled);
}

function dayTicks(minDays, maxDays) {
  const step = niceStep((maxDays - minDays) / 4);
  const start = Math.ceil((minDays - step * 1e-8) / step) * step;
  const ticks = [];
  for (let i = 0; i < 8; i += 1) {
    const value = Math.round((start + i * step) * 1000) / 1000;
    if (value > maxDays + step * 1e-8) break;
    if (value < minDays - step * 1e-8) continue;
    ticks.push(value);
  }
  return ticks.length ? ticks : [minDays];
}
