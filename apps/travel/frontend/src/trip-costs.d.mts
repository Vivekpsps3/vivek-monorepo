import type { CostBucket } from "./travel.models";

export const BUCKET_SHORT: Record<CostBucket["bucket"], string>;
export function bucketForCategory(category: string | null | undefined): CostBucket["bucket"];
export function toCents(text: string | null | undefined): number | null;
export function splitWidths(paid: number, total: number): { paid: number; unpaid: number } | null;
export function bucketRows(
  currencyItem: { buckets?: readonly CostBucket[] } | null | undefined,
): CostBucket[];
export interface TripSpendRow {
  currency: string;
  cents: number;
  count: number;
}
export type SpendState =
  | { kind: "locked" }
  | { kind: "none" }
  | { kind: "some"; rows: TripSpendRow[] };
export function spendState(lookup: unknown, tripId: number): SpendState;
export function countLabel(n: number): string;
