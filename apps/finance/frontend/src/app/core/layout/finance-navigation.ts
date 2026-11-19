import { inject } from '@angular/core';
import { Router, type CanActivateFn, type ParamMap } from '@angular/router';
import { returnPath, type UiSectionNavItem } from '@vivek/ui';

/** Canonical Activity coordinates for a selected Pixels day, without ledger fields. */
export function pixelsDayActivityPath(day: string): string {
  const query = new URLSearchParams({ date: day, pixelsDay: day });
  return '/finance/spending?' + query.toString();
}

export const financeCalendarPath = '/finance/spending?t=calendar';
export const financeBillsPath = '/finance/bills';
export const financePayPath = '/finance/pay';
export const financeImportsPath = '/finance/imports';

const importStarts = new Set(['bank', 'fidelity']);

function boundedImportFile(value: string | null): string | null {
  if (!value || value.length > 180 || /[/?#\\\r\n]/.test(value)) return null;
  return value;
}

/** Old Activity receipts links open the import history page with bounded coordinates. */
export function legacyImportsDestination(params: ParamMap | null | undefined): string | null {
  if (!params || typeof params.get !== 'function') return null;
  const tab = params.get('t');
  if (tab === 'calendar') return null;
  if (tab !== 'imports' && params.get('receipts') !== '1') return null;
  const query = new URLSearchParams();
  const start = params.get('start');
  if (start && importStarts.has(start)) query.set('start', start);
  else if (params.get('add') === '1' && !params.has('date')) query.set('start', 'bank');
  const reattach = params.get('reattach') || '';
  if (/^\d{1,16}$/.test(reattach)) query.set('reattach', reattach);
  const file = boundedImportFile(params.get('reattach_file'));
  if (file) query.set('reattach_file', file);
  const suffix = query.toString();
  return suffix ? `${financeImportsPath}?${suffix}` : financeImportsPath;
}

export const redirectLegacyImports: CanActivateFn = route => {
  const destination = legacyImportsDestination(route?.queryParamMap);
  return destination ? inject(Router).parseUrl(destination) : true;
};

/** Compatibility redirects carry only bounded navigation coordinates. */
export function legacyPayDestination(params: ParamMap | null | undefined): string {
  const tab = params?.get('t') ?? null;
  const bills = tab === 'spend' || tab === 'bills' || tab === 'subs';
  const path = bills ? financeBillsPath : financePayPath;
  const query = new URLSearchParams();
  const keys = bills
    ? ['kind', 'status', 'order']
    : ['month', 'history', 'year', 'start', 'end', 'compensation_start', 'compensation_end'];
  if (params) {
    for (const key of keys) {
      for (const value of params.getAll(key)) query.append(key, value);
    }
  }
  if (tab === 'compensation') query.set('history', '1');
  return returnPath(path + '?' + query) ?? path;
}

export const financeSections: readonly UiSectionNavItem[] = [
  { label: 'Home', link: '/finance', exact: true },
  { label: 'Accounts', link: '/finance/have' },
  { label: 'Holdings', link: '/finance/have?t=holdings' },
  { label: 'Activity', link: '/finance/spending' },
  { label: 'Calendar', link: financeCalendarPath },
  { label: 'Bills', link: financeBillsPath },
  { label: 'Pay', link: financePayPath },
  { label: 'Planning', link: '/finance/planning' },
  { label: 'Imports', link: financeImportsPath, also: ['/finance/spending?receipts=1', '/finance/spending?t=imports'] },
];
