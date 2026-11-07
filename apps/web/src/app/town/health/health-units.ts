import { LB_PER_KG, METRES_PER_MILE } from './health.constants';

export { lbToKg } from './health.constants';
export const kgToLb = (kg: number): number => kg / LB_PER_KG;
export const metresToKm = (metres: number): number => metres / 1000;
export const kmToMetres = (km: number): number => km * 1000;
export const metresToMiles = (metres: number): number => metres / METRES_PER_MILE;
export const milesToMetres = (miles: number): number => miles * METRES_PER_MILE;
export const displayWeight = (kg: number, unit: 'kg' | 'lb'): string =>
  (unit === 'kg' ? kg : kgToLb(kg)).toFixed(1);
export const displayDistance = (metres: number, unit: 'km' | 'mi'): string =>
  (unit === 'km' ? metresToKm(metres) : metresToMiles(metres)).toFixed(2);
export function pace(seconds: number, distanceM: number, unit: 'km' | 'mi'): string {
  const total = Math.round(seconds * (unit === 'km' ? 1000 : METRES_PER_MILE) / distanceM);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
