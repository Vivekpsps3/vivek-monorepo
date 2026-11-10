import { fromDollars, roundHalfAwayFromZero, toDollars, type Cents } from '@vivek/browser';
import type { IncomePayFrequency, PaydayFrequency } from '../models/transaction.model';
import { paydayPeriodsPerYear, salaryPeriodsPerYear } from '../utils/job-compensation.util';

/** Editor base-pay choice. Legacy monthly/weekly/biweekly/semimonthly cadences become Yearly. */
export type BasePayUnit = 'annual' | 'hourly';

export interface LegacyPayInput {
  pay_frequency: string;
  base_pay: unknown;
  hours_per_week?: unknown;
  taxes_per_period?: unknown;
  deductions_per_period?: unknown;
  annual_taxes?: unknown;
  annual_deductions?: unknown;
  payday_frequency?: string | null;
}

export interface EditorPay {
  unit: BasePayUnit;
  basePay: number;
  hoursPerWeek: number | null;
  taxesPerPeriod: number;
  deductionsPerPeriod: number;
}

export interface SavedPay {
  pay_frequency: IncomePayFrequency;
  base_pay: number;
  hours_per_week: number | null;
  taxes_per_period: number;
  deductions_per_period: number;
  annual_taxes: number;
  annual_deductions: number;
}

/** Annual base, withholding, and one paycheck, in integer cents. */
export interface CentsPaySnapshot {
  annualBaseCents: Cents;
  annualTaxCents: Cents;
  annualDeductionCents: Cents;
  paycheckCents: Cents | null;
}

const LEGACY_CADENCE = new Set(['monthly', 'weekly', 'biweekly', 'semimonthly']);
const PAYDAY: ReadonlySet<string> = new Set(['weekly', 'biweekly', 'semimonthly', 'monthly']);

/** List label for a stored unit, including cadences the editor no longer offers. */
export const STORED_PAY_FREQUENCY_LABEL: Record<string, string> = {
  annual: 'Yearly',
  hourly: 'Hourly',
  monthly: 'Monthly',
  semimonthly: 'Twice monthly',
  biweekly: 'Every two weeks',
  weekly: 'Weekly',
};

export function storedPayFrequencyLabel(value: string): string {
  return STORED_PAY_FREQUENCY_LABEL[value] || value;
}

/** Integer cents via the shared decimal parser. Non-finite and blank amounts are zero. */
export function storedCents(value: unknown): Cents {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    return fromDollars(Object.is(value, -0) ? '0' : String(value)) ?? 0;
  }
  return fromDollars(value) ?? 0;
}

/** Scale cents and round half away from zero. Integer factors of integer cents stay exact. */
export function scaledCents(cents: Cents, factor: number): Cents {
  if (!Number.isFinite(cents) || !Number.isFinite(factor)) return 0;
  return roundHalfAwayFromZero(cents * factor);
}

function isPayday(value: string | null | undefined): value is PaydayFrequency {
  return !!value && PAYDAY.has(value);
}

/** Missing hours follow the compensation engine's 40-hour week. An explicit 0 stays 0. */
function hoursUsed(value: unknown): number {
  if (value == null || value === '') return 40;
  const hours = Number(value);
  return Number.isFinite(hours) && hours >= 0 ? hours : 40;
}

function periodsFor(frequency: string): number {
  if (
    frequency === 'annual'
    || frequency === 'monthly'
    || frequency === 'semimonthly'
    || frequency === 'biweekly'
    || frequency === 'weekly'
    || frequency === 'hourly'
  ) {
    return salaryPeriodsPerYear(frequency);
  }
  return 1;
}

/**
 * Per-period withholding wins when either side is non-zero, matching paycheck estimates.
 * Otherwise the stored annual withholding is the amount.
 */
function withholdingCents(row: LegacyPayInput, periods: number): { taxes: Cents; deductions: Cents } {
  const periodTax = storedCents(row.taxes_per_period);
  const periodDeduction = storedCents(row.deductions_per_period);
  if (periodTax || periodDeduction) {
    return { taxes: scaledCents(periodTax, periods), deductions: scaledCents(periodDeduction, periods) };
  }
  return { taxes: storedCents(row.annual_taxes), deductions: storedCents(row.annual_deductions) };
}

export function annualBaseCents(row: Pick<LegacyPayInput, 'pay_frequency' | 'base_pay' | 'hours_per_week'>): Cents {
  const base = storedCents(row.base_pay);
  if (row.pay_frequency === 'hourly') return scaledCents(base, hoursUsed(row.hours_per_week) * 52);
  if (LEGACY_CADENCE.has(row.pay_frequency)) return scaledCents(base, periodsFor(row.pay_frequency));
  return base;
}

export function centsPaySnapshot(row: LegacyPayInput): CentsPaySnapshot {
  const periods = periodsFor(row.pay_frequency);
  const annualBase = annualBaseCents(row);
  const withholding = withholdingCents(row, periods);
  const payday = isPayday(row.payday_frequency) ? row.payday_frequency : null;
  return {
    annualBaseCents: annualBase,
    annualTaxCents: withholding.taxes,
    annualDeductionCents: withholding.deductions,
    paycheckCents: payday
      ? scaledCents(annualBase - withholding.taxes - withholding.deductions, 1 / paydayPeriodsPerYear(payday))
      : null,
  };
}

/** Open a stored job on Yearly or Hourly without changing the cents-policy annual amounts. */
export function editorPayFromRecord(row: LegacyPayInput): EditorPay {
  if (row.pay_frequency === 'hourly') {
    const periodTax = storedCents(row.taxes_per_period);
    const periodDeduction = storedCents(row.deductions_per_period);
    return {
      unit: 'hourly',
      basePay: toDollars(storedCents(row.base_pay)),
      hoursPerWeek: hoursUsed(row.hours_per_week),
      taxesPerPeriod: toDollars(periodTax || scaledCents(storedCents(row.annual_taxes), 1 / 52)),
      deductionsPerPeriod: toDollars(periodDeduction || scaledCents(storedCents(row.annual_deductions), 1 / 52)),
    };
  }
  const withholding = withholdingCents(row, periodsFor(row.pay_frequency));
  return {
    unit: 'annual',
    basePay: toDollars(annualBaseCents(row)),
    hoursPerWeek: null,
    taxesPerPeriod: toDollars(withholding.taxes),
    deductionsPerPeriod: toDollars(withholding.deductions),
  };
}

export function savedPayFromEditor(editor: EditorPay): SavedPay {
  if (editor.unit === 'hourly') {
    const tax = storedCents(editor.taxesPerPeriod);
    const deduction = storedCents(editor.deductionsPerPeriod);
    return {
      pay_frequency: 'hourly',
      base_pay: toDollars(storedCents(editor.basePay)),
      hours_per_week: hoursUsed(editor.hoursPerWeek),
      taxes_per_period: toDollars(tax),
      deductions_per_period: toDollars(deduction),
      annual_taxes: toDollars(scaledCents(tax, 52)),
      annual_deductions: toDollars(scaledCents(deduction, 52)),
    };
  }
  const tax = storedCents(editor.taxesPerPeriod);
  const deduction = storedCents(editor.deductionsPerPeriod);
  return {
    pay_frequency: 'annual',
    base_pay: toDollars(storedCents(editor.basePay)),
    hours_per_week: null,
    taxes_per_period: toDollars(tax),
    deductions_per_period: toDollars(deduction),
    annual_taxes: toDollars(tax),
    annual_deductions: toDollars(deduction),
  };
}

/** Yearly and Hourly show the same annual cents, aside from half-cent splits of an hourly week. */
export function convertBasePayUnit(editor: EditorPay, next: BasePayUnit): EditorPay {
  if (editor.unit === next) return editor;
  const hours = hoursUsed(editor.hoursPerWeek);
  if (next === 'hourly') {
    return {
      unit: 'hourly',
      basePay: toDollars(scaledCents(storedCents(editor.basePay), 1 / (hours * 52))),
      hoursPerWeek: hours,
      taxesPerPeriod: toDollars(scaledCents(storedCents(editor.taxesPerPeriod), 1 / 52)),
      deductionsPerPeriod: toDollars(scaledCents(storedCents(editor.deductionsPerPeriod), 1 / 52)),
    };
  }
  return {
    unit: 'annual',
    basePay: toDollars(scaledCents(storedCents(editor.basePay), hours * 52)),
    hoursPerWeek: null,
    taxesPerPeriod: toDollars(scaledCents(storedCents(editor.taxesPerPeriod), 52)),
    deductionsPerPeriod: toDollars(scaledCents(storedCents(editor.deductionsPerPeriod), 52)),
  };
}
