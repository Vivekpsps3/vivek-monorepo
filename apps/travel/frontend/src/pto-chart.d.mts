export const CHART_HEIGHT_COMPACT: number;
export const CHART_HEIGHT_WIDE: number;
export const CHART_ERROR: string;

export interface PtoChartPoint {
  on: string;
  days: string | number;
  hours?: string | number;
  kinds?: string[];
  projected?: boolean;
}

export interface PtoChartBucket {
  balance_horizon_days?: string | number;
  balance_horizon_hours?: string | number;
  horizon_end?: string;
  first_negative?: {
    on: string;
    hours?: string | number;
    days?: string | number;
  } | null;
  points?: readonly PtoChartPoint[] | null;
}

export interface PtoChartSeries {
  today?: string;
  horizon_end?: string;
  policy_year_end?: string;
  rolled_over?: boolean;
  days_left_in_policy_year?: number;
  pto?: PtoChartBucket | null;
  sick?: PtoChartBucket | null;
}

export interface ChartPlot {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CombinedForecast {
  width: number;
  height: number;
  viewBox: string;
  plot: ChartPlot;
  axisName: { x: number; y: number; text: string };
  yTicks: { days: number; y: number; label: string }[];
  xTicks: { on: string; x: number; label: string }[];
  xLabelY: number;
  band: { x: number; y: number; width: number; height: number } | null;
  zeroY: number | null;
  today: { x: number; labelX: number; labelY: number; anchor: string } | null;
  series: {
    bucket: string;
    shape: "circle" | "square";
    history: string;
    projection: string;
    historyClass: string;
    projectionClass: string;
    markerClass: string;
    markers: { on: string; x: number; y: number }[];
  }[];
  endLabels: { text: string; x: number; y: number }[];
  legend: { bucket: string; glyph: string; label: string; legendClass: string }[];
  warnings: string[];
  caption: string;
  table: { columns: string[]; rows: { key: string; cells: string[] }[] };
}

export function dayTicks(minDays: number, maxDays: number): number[];

export function combinedForecast(
  series: PtoChartSeries | null | undefined,
  options?: { wide?: boolean; width?: number },
): CombinedForecast | null;
