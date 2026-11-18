import type { UiSectionNavItem } from '@vivek/ui';

export const financeCalendarPath = '/finance/spending?t=calendar';

export const financeSections: readonly UiSectionNavItem[] = [
  { label: 'Home', link: '/finance', exact: true },
  { label: 'Accounts', link: '/finance/have' },
  { label: 'Holdings', link: '/finance/have?t=holdings' },
  { label: 'Activity', link: '/finance/spending' },
  { label: 'Calendar', link: financeCalendarPath },
  { label: 'Bills', link: '/finance/recurring?t=spend', also: ['/finance/recurring?t=bills', '/finance/recurring?t=subs'] },
  { label: 'Pay', link: '/finance/recurring' },
  { label: 'Planning', link: '/finance/planning' },
  { label: 'Imports', link: '/finance/spending?receipts=1', also: ['/finance/spending?t=imports'] },
];
