/**
 * Chart.js palette from design tokens (--chart-1 … --chart-6 in packages/ui/tokens.css).
 */
const CHART_VAR_NAMES = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
] as const;

const CHART_FALLBACKS = [
  '#126963',
  '#986d33',
  '#a15c54',
  '#3d6f8f',
  '#6e6a5e',
  '#827c71',
] as const;

export function chartColorAt(index: number): string {
  const slot = index % CHART_VAR_NAMES.length;
  return cssVar(CHART_VAR_NAMES[slot], CHART_FALLBACKS[slot]);
}

/** CHT-05: 2px slice separator in the card color. Chart.js otherwise uses white. */
export function chartSliceBorder(): { borderColor: string; borderWidth: number } {
  return { borderColor: cssVar('--card-bg', '#fff9ed'), borderWidth: 2 };
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function chartTextMuted(): string {
  return cssVar('--text-secondary', '#4c5b60');
}

export function chartAccentColor(): string {
  return cssVar('--accent', '#126963');
}

export function chartSuccessColor(): string {
  return cssVar('--success', '#22c55e');
}

export function chartDangerColor(): string {
  return cssVar('--danger', '#ef4444');
}

function chartGridColor(): string {
  return cssVar('--border', '#333333');
}

export function chartTooltipTheme() {
  return {
    backgroundColor: cssVar('--card-bg', '#171721'),
    borderColor: cssVar('--border', '#28253b'),
    borderWidth: 1,
    titleColor: cssVar('--text', '#f5f5f5'),
    bodyColor: cssVar('--text', '#f5f5f5'),
    padding: 10,
    cornerRadius: 8,
  };
}

export function chartLegendBottom() {
  return {
    position: 'bottom' as const,
    labels: {
      color: chartTextMuted(),
      padding: 14,
      usePointStyle: true,
    },
  };
}

export function chartCartesianScales() {
  const tick = chartTextMuted();
  const grid = chartGridColor();
  return {
    y: {
      ticks: { color: tick },
      grid: { color: grid },
      border: { color: grid },
    },
    x: {
      ticks: {
        color: tick,
        maxRotation: 45,
        autoSkip: true,
        maxTicksLimit: 12,
      },
      grid: { color: grid },
      border: { color: grid },
    },
  };
}
