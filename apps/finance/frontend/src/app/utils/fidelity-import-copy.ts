import { formatMoney, fromDollars, plural } from '@vivek/browser';

const EXPORT_HELP = 'In Fidelity, open Positions and download the CSV export.';
const NOT_POSITIONS = "This isn't a Fidelity positions export.";

/** Only translate known parser errors; never echo arbitrary file contents. */
export function fidelityImportError(message: string | null | undefined): string {
  if (!message || message === 'CSV file is empty') return `${NOT_POSITIONS} ${EXPORT_HELP}`;
  if (message === 'No positions') return `${NOT_POSITIONS} It has no positions to import. ${EXPORT_HELP}`;
  if (message.startsWith('Missing required columns: ')) {
    const names = new Map([
      ['account number', 'Account Number'], ['symbol', 'Symbol'], ['quantity', 'Quantity'],
    ]);
    const columns = message.slice('Missing required columns: '.length).split(', ').map(key => names.get(key));
    if (columns.length && columns.every(Boolean)) {
      const list = columns.length < 2 ? columns[0]
        : `${columns.slice(0, -1).join(', ')} and ${columns[columns.length - 1]}`;
      return `${NOT_POSITIONS} It's missing ${list}. ${EXPORT_HELP}`;
    }
  }
  return "Couldn't read this file. Try downloading your Fidelity positions export again.";
}

export function fidelityReplaceLine(positions: number, value: number | null, existing: number): string {
  const total = value == null ? 'Value incomplete' : formatMoney(fromDollars(value));
  return `${plural(positions, 'position', { zeroIsNo: false })} · ${total} · replaces your ${plural(existing, 'Fidelity holding', { zeroIsNo: false })}`;
}

export function fidelityConfirmBody(positions: number, existing: number): string {
  return `${plural(positions, 'position', { zeroIsNo: false })} ${positions === 1 ? 'replaces' : 'replace'} your ${plural(existing, 'Fidelity holding', { zeroIsNo: false })}. Manual holdings stay.`;
}

export function fidelityImportToast(positions: number): string {
  return `Imported ${plural(positions, 'Fidelity position')}`;
}
