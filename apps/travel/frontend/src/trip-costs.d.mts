import type { CostBucket } from "./travel.models";

export const BUCKET_SHORT: Record<CostBucket["bucket"], string>;
export function bucketForCategory(category: string | null | undefined): CostBucket["bucket"];
export function toCents(text: string | null | undefined): number | null;
export function splitWidths(paid: number, total: number): { paid: number; unpaid: number } | null;
export function bucketRows(
  currencyItem: { buckets?: readonly CostBucket[] } | null | undefined,
): CostBucket[];
export interface TripSpendPosting {
  id: number;
  cents: number;
  label: string;
}
export interface TripSpendRow {
  currency: string;
  cents: number;
  count: number;
  postings?: TripSpendPosting[];
}
export interface CostStage {
  currency: string;
  planned: number;
  booked: number;
  posted: number | null;
  countedOnce: number;
  locked: boolean;
}
export interface CostLinkRef {
  tripId: number;
  source: string;
  sourceId: number;
  transactionId: number;
}
export interface CostLineRef {
  source?: string;
  source_id?: number;
  sourceId?: number;
  currency?: string;
  amount_cents?: number;
  paid?: boolean;
}
export interface SettleLinkRequest {
  epoch: number;
  tripId: number;
  source: string;
  sourceId: number;
  transactionId: number;
  status: "posted" | "missing" | "invalid" | "failed";
  posting: TripSpendPosting | null;
}
export interface SettleLinkCurrent {
  epoch: number;
  tripId: number;
  source: string;
  sourceId: number;
  transactionId: number;
  sessionActive: boolean;
  spendLocked: boolean;
}
export interface SettleLinkResult {
  action: "apply" | "drop" | "keep";
  clearDraft: boolean;
  error: string | null;
}
export type SpendState =
  | { kind: "locked" }
  | { kind: "none" }
  | { kind: "some"; rows: TripSpendRow[] };
export function spendState(lookup: unknown, tripId: number): SpendState;
export function countLabel(n: number): string;
export function countedCents(lineCents: number, postingCents: number): number;
export function reconcileStages(
  lines: readonly CostLineRef[] | null | undefined,
  spend: SpendState | null | undefined,
  links: readonly CostLinkRef[] | null | undefined,
  currency: string,
  tripId: number,
): CostStage;
export function linkChoices(
  postings: readonly TripSpendPosting[] | null | undefined,
  links: readonly CostLinkRef[] | null | undefined,
  line: CostLineRef | null | undefined,
): TripSpendPosting[];
export function linkedPostingMissing(
  line: CostLineRef | null | undefined,
  spend: SpendState | null | undefined,
  link: { transactionId: number } | null | undefined,
): boolean;
export function settleCostLink(
  request: SettleLinkRequest | null | undefined,
  current: SettleLinkCurrent | null | undefined,
): SettleLinkResult;
