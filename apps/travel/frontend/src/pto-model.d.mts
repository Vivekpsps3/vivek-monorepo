export const MINUS: string;
export const DOT: string;
export const START_COPY: string;
export const ACCRUAL_COPY: string;
export const CADENCE_COPY: string;
export const CAP_COPY: string;
export const YEAR_COPY: string;
export const CARRY_COPY: string;
export const MODE_COPY: string;
export const ANCHOR_COPY: string;
export const HPD_COPY: string;
export const NAME_COPY: string;
export const RANGE_COPY: string;
export const SICK_HINT: string;
export const POLICY_SAVED: { pto: string; sick: string };
export const POLICY_FAILED: { pto: string; sick: string };
export const ENTRY_FAILED: string;
export const DISMISS_FAILED: string;
export const EMPTY_TITLE: string;
export const EMPTY_MESSAGE: string;
export const LOAD_ERROR: string;
export const PAGE_TITLE: string;
export const FIRST_RUN_TITLE: string;
export const FIRST_RUN_BODY: string;
export const SICK_UNSET: string;
export const CAP_BLURB: string;
export const CADENCES: { value: string; label: string; period: string }[];
export const ACCRUAL_MODES: { value: string; label: string }[];
export const MONTHS: [string, string][];
export const HOUR_FIELDS: string[];
export function periodWord(cadence: string): string;
export function addDays(iso: string, count: number): string;
export function longDate(iso: string): string;
export function asOfCopy(today: string): string;
export function parseHours(raw: unknown): {
  ok: boolean;
  blank?: boolean;
  sign?: number;
  whole?: string;
  frac?: string;
  text?: string;
  places?: number;
};
export function roundHalfUp(value: number, places: number): number;
export function trimNumber(value: number): string;
export function formatBalance(hours: number | string, hoursPerDay: number | string): string;
export function daysHelper(hours: unknown, hoursPerDay: number | string): string;
export function softStart(hours: unknown, hoursPerDay: number | string): string;
export function softAccrual(hours: unknown, cadence: string): string;
export function fieldHint(field: string, raw: unknown, hoursPerDay: number | string, cadence: string, note?: string): string;
export function capLine(capHours: unknown): string;
export function yearStartOk(month: string, day: string): boolean;
export function yearStartText(month: string, day: string): string;
export function policyErrors(draft: object, stored: object | null, today: string): Record<string, string>;
export function firstInvalid(errors: Record<string, string>): string;
export function hoursPerDayError(raw: unknown, stored: string | null | undefined): string;
export function entryErrors(entry: { label?: string; start_date?: string; end_date?: string }): Record<string, string>;
export function dateErrors(entry: { start_date?: string; end_date?: string }): Record<string, string>;
export function fieldErrorMap(body: unknown): Record<string, string> | null;
export function previewKey(input: {
  start_date?: string;
  end_date?: string;
  days?: string | number | null;
  bucket?: string;
  hours_per_day?: string;
  policy?: object | null;
  entries?: object[] | null;
}): string;
export function blurHours(raw: unknown): { text: string; note: string };
export function commitHour(raw: unknown, stored: string | null | undefined, edited: boolean): { text: string; note: string };
export function blurHoursPerDay(raw: unknown, stored: string | null | undefined): { text: string; error: string };
export function policyBody(
  draft: object,
  stored?: object | null,
  edited?: { has(field: string): boolean } | string[],
): {
  start_balance_hours: string;
  balance_as_of: unknown;
  accrual_hours: string;
  accrual_cadence: unknown;
  cap_hours: string | null;
  year_start: string;
  carry_forward: boolean;
  accrual_mode: string;
  accrual_anchor: string | null;
  accrual_version: number;
};
export const ALLOCATION_CHOICES: { id: string; label: string; amount: string }[];
export function allocationText(raw: unknown): string;
export function defaultAllocation(iso: string): string;
export function allocationDraft(
  dates: readonly string[] | null | undefined,
  amounts: Readonly<Record<string, string | number>> | null | undefined,
  enabled?: boolean,
): {
  total: string;
  payload: { on_date: string; amount: string }[];
  rows: { on_date: string; amount: string; choice: string; label: string }[];
};
export function bucketLabel(bucket: string): string;
export function chipText(entry: { trip_id?: number | null; bucket?: string }): string;
