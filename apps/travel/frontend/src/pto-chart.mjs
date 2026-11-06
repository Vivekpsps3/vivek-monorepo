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
    markers,
    today,
    first: markers[0],
    last: markers[markers.length - 1],
  };
}
