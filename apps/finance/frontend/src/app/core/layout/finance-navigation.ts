import type { ParamMap } from '@angular/router';
import { returnPath, type UiSectionNavItem } from '@vivek/ui';

/** Canonical Activity coordinates for a selected Pixels day, without ledger fields. */
export function pixelsDayActivityPath(day: string): string {
  const query = new URLSearchParams({ date: day, pixelsDay: day });
  return '/finance/spending?' + query.toString();
}

export const financeCalendarPath = '/finance/spending?t=calendar';
export const financeBillsPath = '/finance/bills';
export const financePayPath = '/finance/pay';

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
  { label: 'Imports', link: '/finance/spending?receipts=1', also: ['/finance/spending?t=imports'] },
];
