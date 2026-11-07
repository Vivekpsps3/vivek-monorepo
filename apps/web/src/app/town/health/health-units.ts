import { LB_PER_KG, METRES_PER_MILE } from './health.constants';

export { lbToKg } from './health.constants';

/** Inverse of the stored conversion; display code rounds. */
export const kgToLb = (kg: number): number => kg / LB_PER_KG;
export const metresToKm = (metres: number): number => metres / 1000;
export const kmToMetres = (km: number): number => km * 1000;
export const metresToMiles = (metres: number): number => metres / METRES_PER_MILE;
export const milesToMetres = (miles: number): number => miles * METRES_PER_MILE;

/** §18.8 display rounding: weight to 0.1, distance to 0.01. */
export const displayWeight = (kg: number, unit: 'kg' | 'lb'): string =>
  (unit === 'kg' ? kg : kgToLb(kg)).toFixed(1);
export const displayDistance = (metres: number, unit: 'km' | 'mi'): string =>
  (unit === 'km' ? metresToKm(metres) : metresToMiles(metres)).toFixed(2);

/** Pace as m:ss per km or per mile, seconds rounded to the nearest whole. */
export function pace(seconds: number, distanceM: number, unit: 'km' | 'mi'): string {
  const perUnit = unit === 'km' ? 1000 : METRES_PER_MILE;
  const total = Math.round(seconds * perUnit / distanceM);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
