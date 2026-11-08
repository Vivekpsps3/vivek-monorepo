export interface SeriesPointLike {
  on: string;
  days: string | number;
  hours?: string | number;
  kinds?: string[];
  projected?: boolean;
}
export interface ChartTick {
  days: number;
  y: number;
  label: string;
}
export interface ChartMarker {
  on: string;
  days: number;
  daysText: string;
  hours: string;
  kinds: string[];
  projected: boolean;
  x: number;
  y: number;
}
export interface ChartGeometry {
  width: number;
  height: number;
  path: string;
  zeroY: number | null;
  minDays: number;
  maxDays: number;
  ticks: ChartTick[];
  markers: ChartMarker[];
  today: ChartMarker | null;
  first: ChartMarker;
  last: ChartMarker;
}
export const CHART_WIDTH: number;
export const CHART_HEIGHT: number;
export function chartGeometry(
  points: readonly SeriesPointLike[] | null | undefined,
  options?: { width?: number; height?: number; padX?: number; padTop?: number; padBottom?: number },
): ChartGeometry | null;
