import { plural } from '@vivek/browser';

/**
 * Plain-language copy for bank import (F9). One home for the strings the
 * wizard, the preview and the receipt history all share, so a file that
 * fails reads the same way everywhere it surfaces.
 */

export const BANK_EXPORT_HELP: Record<string, string> = {
  chase: 'Chase: open your account, choose Download account activity, and pick the CSV that covers the months you want.',
  capital_one: 'Capital One: choose View Statements / Download, pick the transaction export (CSV), and download it.',
  amex: 'American Express: choose Statements & Activity, then Download your Transactions as a CSV.',
  citi: 'Citi: choose Statements, Download, and select the CSV format.',
  bank_of_america: 'Bank of America: open the account, choose Download transactions, and pick the comma-separated (CSV) format.',
  x_money: 'X Money: export your transactions as a CSV from the app, then choose that file here.',
  custom_csv: 'Custom CSV: map the date, description, and amount or debit and credit columns. A currency column must be USD.',
};

export const DEFAULT_BANK_EXPORT_HELP = 'Download a CSV of your transactions from your bank, then choose that file here.';

export function bankExportHelp(slug: string): string {
  return BANK_EXPORT_HELP[slug] ?? DEFAULT_BANK_EXPORT_HELP;
}

const HEADER_HINTS = ['header', 'column', 'missing field', 'unrecognized format'];

/**
 * Map a raw parser/store error to one plain sentence. Anything unknown —
 * including stack-shaped text — collapses to the generic line; raw errors
 * never reach the screen.
 */
export function importFileError(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  if (lower.includes('unsupported currency') || lower.includes('missing currency') || lower.startsWith('choose ') || lower.startsWith('fix the column mapping')) {
    return /[.!?]$/.test(text) ? text : `${text}.`;
  }
  if (HEADER_HINTS.some(hint => lower.includes(hint))) {
    return "This file doesn't look like a bank export. Download the CSV from your bank and try again.";
  }
  if (lower.includes('empty') || lower.includes('no rows') || lower.includes('no transactions')) {
    return 'That file has no transactions in it.';
  }
  if (lower.includes('account') && (lower.includes('ambiguous') || lower.includes('unclear') || lower.includes('which account') || lower.includes('match'))) {
    return "We couldn't tell which account this file belongs to. Pick the account and try again.";
  }
  if (/^(error|typeerror|referenceerror|rangeerror)\b/.test(lower) || text.includes('\n    at ') || text.length > 180) {
    return "That file couldn't be read. Download a fresh CSV from your bank and try again.";
  }
  // Short, plain, single-sentence parser messages may pass through.
  if (/^[A-Z][^.]*\.$/.test(text) && !text.includes('Error')) return text;
  return "That file couldn't be read. Download a fresh CSV from your bank and try again.";
}

export interface ImportSummaryCounts {
  total_parsed: number;
  new: number;
  duplicate: number;
  skipped: number;
  errors: number;
}

/** The one summary line the preview shows, whatever the selection is. */
export function importSummaryLine(summary: ImportSummaryCounts, importableCount: number): string {
  const parts = [
    `${summary.total_parsed} read`,
    `${importableCount} new`,
    `${summary.duplicate} already imported`,
    `${summary.skipped} skipped`,
  ];
  if (summary.errors > 0) parts.push(`${summary.errors} couldn't be read`);
  return `${parts.join(' · ')}.`;
}

export function importButtonLabel(importableCount: number, selectedCount: number): string {
  if (selectedCount > 0) return `Import ${plural(selectedCount, 'transaction')}`;
  if (importableCount > 0) return 'Select the transactions to import';
  return 'Nothing importable in these files';
}

export interface UndoCounts {
  removable: number;
  editedKept: number;
  alreadyGone: number;
}

/** Confirm-dialog body for Undo, built from the previewed counts. */
export function undoConfirmBody(counts: UndoCounts): string {
  const sentences: string[] = [];
  if (counts.removable > 0) sentences.push(`Remove ${plural(counts.removable, 'transaction')} this import added.`);
  if (counts.editedKept > 0) sentences.push(`${plural(counts.editedKept, 'transaction')} you edited will stay.`);
  if (counts.alreadyGone > 0) sentences.push(`${plural(counts.alreadyGone, 'transaction')} are already gone.`);
  if (!sentences.length) sentences.push('Nothing from this import is left to remove.');
  sentences.push('This also removes the statement coverage this import confirmed.');
  return sentences.join(' ');
}

const RECEIPT_STATUS_LABELS: Record<string, string> = {
  complete: 'Imported',
  partial: 'Partly imported',
  staged: 'Ready to resume',
  staging: 'In progress',
  undoing: 'Undoing',
  withdrawn: 'Undone',
};

export function receiptStatusLabel(status: string): string {
  return RECEIPT_STATUS_LABELS[status] ?? status;
}

/** One line per receipt in Import history. */
export function receiptLine(input: {
  filenames: string[];
  dateLabel: string;
  status: string;
  saved: number;
  needFixing: number;
}): string {
  const files = input.filenames.join(', ') || 'Bank CSV import';
  const base = `${files} · ${input.dateLabel} · ${receiptStatusLabel(input.status)} · ${input.saved} saved`;
  return input.needFixing > 0 ? `${base} · ${input.needFixing} need fixing` : base;
}
