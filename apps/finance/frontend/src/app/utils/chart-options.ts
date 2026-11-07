import { formatDate, formatMoney, fromDollars } from '@vivek/browser';

/**
 * Finance-local chart helpers (Suite UX v2 F11). The shared @vivek/ui
 * chart theme stays untouched: other apps use it.
 */

export function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** '#rrggbb' or 'rgb(…)' → 'rgba(r, g, b, a)'; anything else returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(color.trim());
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  }
  return color;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const NARROW_QUERY = '(max-width: 640px)';

export function isNarrow(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(NARROW_QUERY).matches;
}

/** Inverse tooltip styling, read at paint time so theme changes flip it. */
export function financeTooltip(): Record<string, unknown> {
  return {
    enabled: true,
    backgroundColor: cssVar('--text', '#111'),
    titleColor: cssVar('--bg', '#fff'),
    bodyColor: cssVar('--bg', '#fff'),
    displayColors: false,
    padding: 8,
    cornerRadius: 6,
    titleFont: { weight: '600' },
    caretSize: 5,
  };
}

export function chartMoney(dollars: number, sign?: 'auto' | 'always'): string {
  return formatMoney(fromDollars(dollars), sign ? { sign } : {});
}

export function chartCompactMoney(dollars: number): string {
  return formatMoney(fromDollars(dollars), { style: 'compact' });
}

/** '2026-10' → 'Oct'; with the year when asked: 'Jan 2026'. */
export function monthTickLabel(month: string, withYear: boolean): string {
  const full = formatDate(`${month}-01`, 'month');
  const [name, year] = full.split(' ');
  const short = (name ?? '').slice(0, 3);
  return withYear ? `${short} ${year ?? ''}`.trim() : short;
}

/**
 * Rows arrive oldest first. Drop leading months with no income and no
 * spending, but never so far that fewer than `min` rows remain. Empty
 * months inside the range stay.
 */
export function trimCashflowRange<T extends { income: number; expense: number }>(rows: T[], min = 3): T[] {
  let start = 0;
  while (rows.length - start > min && rows[start].income === 0 && rows[start].expense === 0) {
    start += 1;
  }
  return rows.slice(start);
}

/** Table/chart choice per card, in localStorage: UI state, not vault data. */
export function readTablePref(id: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(`finance.chartTable.${id}`);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeTablePref(id: string, open: boolean): void {
  try {
    localStorage.setItem(`finance.chartTable.${id}`, open ? '1' : '0');
  } catch {
    // UI state only; a blocked store just loses the remembered choice.
  }
}

/**
 * Drill-down gate for chart taps: a mouse, pen or keyboard activation
 * drills at once; a touch drills only on a second tap on the same point
 * within four seconds (the first tap shows the tooltip).
 */
export function shouldDrill(
  last: { key: string; at: number } | null,
  key: string,
  pointerType: string,
  now: number,
): boolean {
  if (pointerType !== 'touch') return true;
  return last?.key === key && now - last.at < 4000;
}
