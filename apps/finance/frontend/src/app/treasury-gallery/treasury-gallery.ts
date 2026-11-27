import { isReturnDate } from '@vivek/ui';
import type { Holding, Transaction } from '../models/transaction.model';
import { normalizeTripId } from '../transactions/trip-tag';
import { filterTransactionActivity, sortTransactionActivity, type TransactionActivityFilters } from '../transactions/transactions-activity-query';
import {
  holdingGain,
  holdingMarketValue,
  quoteFreshness,
  quoteFreshnessLabel,
  totalPortfolioValue,
  type QuoteState,
} from '../utils/portfolio.util';
import { spendingGroupKey, spendingGroupLabel, UNASSIGNED_ACCOUNT_FILTER } from '../utils/spending-filter.util';

export type GalleryFilters = TransactionActivityFilters;

export interface GallerySort {
  column: 'date' | 'category' | 'amount';
  direction: 'asc' | 'desc';
}

export interface GalleryChoice {
  value: string;
  label: string;
}

export interface TreasuryPlaque {
  id: number;
  symbol: string;
  label: string;
  account: string;
  quoteLabel: string;
  quoteState: QuoteState;
  useful: boolean;
  opened: boolean;
  shares: number | null;
  value: number | null;
  gain: number | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  positionDate: string | null;
  quoteDate: string | null;
  basis: 'known' | 'provisional' | 'unknown';
}

export interface TreasuryLedgerLine {
  id: number;
  date: string;
  useful: boolean;
  category: string;
  description: string;
  account: string;
  opened: boolean;
  amount: number | null;
  type: 'income' | 'expense';
}

export interface TreasuryReadout {
  revealed: boolean;
  value: number | null;
  gain: number | null;
  withheld: number;
  staleCount: number;
  missingCount: number;
  positionCount: number;
}

export interface TreasuryGalleryProjection {
  plaques: TreasuryPlaque[];
  lines: TreasuryLedgerLine[];
  readout: TreasuryReadout;
  inspectorPosition: TreasuryPlaque | null;
  inspectorLedger: TreasuryLedgerLine | null;
  ledgerOutsideFilter: boolean;
  positionMissing: boolean;
}

export interface GalleryFilterChoices {
  categories: GalleryChoice[];
  merchants: GalleryChoice[];
  accounts: GalleryChoice[];
  trips: GalleryChoice[];
}

const HIDDEN_READOUT: TreasuryReadout = {
  revealed: false,
  value: null,
  gain: null,
  withheld: 0,
  staleCount: 0,
  missingCount: 0,
  positionCount: 0,
};

/** Local calendar day. The gallery passes this into quote age so a stale label matches the page. */
export function galleryToday(now = new Date()): string {
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

export function emptyGalleryFilters(): GalleryFilters {
  return {
    searchTerm: '',
    typeFilter: 'all',
    summaryMonth: '',
    fromDate: '',
    throughDate: '',
    selectedCalendarDate: null,
    accountFilter: '',
    categoryFilter: '',
    merchantFilter: '',
    receiptFilter: '',
    tripFilter: '',
  };
}

/**
 * A stale, unknown, unavailable, or provisional quote is not a gain.
 * Live, cached, and imported prices still use the portfolio gain rule, which
 * already withholds an unknown basis.
 */
export function galleryGain(holding: Holding, asOf: string): number | null {
  const state = quoteFreshness(holding, asOf);
  if (state === 'Stale' || state === 'Unavailable' || state === 'Unknown' || state === 'Provisional') return null;
  return holdingGain(holding);
}

export function readGalleryId(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,16}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function readGalleryQuery(read: (name: string) => string | null): {
  filters: GalleryFilters;
  sort: GallerySort;
  positionId: number | null;
  ledgerId: number | null;
} {
  const view = read('v');
  const month = read('month') || '';
  const from = read('from') || '';
  const through = read('through') || '';
  const day = read('date') || '';
  const trip = read('trip') || '';
  const receipt = read('receipt') || '';
  return {
    filters: {
      searchTerm: read('q') || '',
      typeFilter: view === 'income' ? 'income' : view === 'spending' ? 'expense' : 'all',
      summaryMonth: isReturnDate(month + '-01') ? month : '',
      fromDate: isReturnDate(from) ? from : '',
      throughDate: isReturnDate(through) ? through : '',
      selectedCalendarDate: isReturnDate(day) ? day : null,
      accountFilter: read('account') || '',
      categoryFilter: (read('category') || '').trim().toLocaleLowerCase(),
      merchantFilter: (read('merchant') || '').trim().toLocaleLowerCase(),
      receiptFilter: /^\d+$/.test(receipt) ? receipt : '',
      tripFilter: trip === 'none' || normalizeTripId(trip) !== null ? trip : '',
    },
    sort: readGallerySort(read('sort')),
    positionId: readGalleryId(read('position')),
    ledgerId: readGalleryId(read('ledger')),
  };
}

/** Activity understands these names. Gallery-only position and ledger focus stay on this room. */
export function galleryActivityQuery(filters: GalleryFilters): Record<string, string | null> {
  const view = filters.typeFilter === 'income' ? 'income' : filters.typeFilter === 'expense' ? 'spending' : null;
  const dated = Boolean(filters.fromDate || filters.throughDate || filters.selectedCalendarDate);
  return {
    q: filters.searchTerm.trim() || null,
    v: view,
    month: filters.summaryMonth || (dated ? null : 'all'),
    from: filters.fromDate || null,
    through: filters.throughDate || null,
    date: filters.selectedCalendarDate,
    account: filters.accountFilter || null,
    category: filters.categoryFilter || null,
    merchant: filters.merchantFilter || null,
    trip: filters.tripFilter || null,
    receipt: filters.receiptFilter || null,
  };
}

export function galleryHasAdvancedFilters(filters: GalleryFilters, sort: GallerySort): boolean {
  return sort.column !== 'date'
    || sort.direction !== 'desc'
    || filters.typeFilter !== 'all'
    || Boolean(
      filters.summaryMonth
      || filters.fromDate
      || filters.throughDate
      || filters.selectedCalendarDate
      || filters.accountFilter
      || filters.categoryFilter
      || filters.merchantFilter
      || filters.receiptFilter
      || filters.tripFilter,
    );
}

export function galleryFilterSummary(filters: GalleryFilters, choices: GalleryFilterChoices): string {
  const named = (rows: readonly GalleryChoice[], value: string) => rows.find(row => row.value === value)?.label || value;
  const parts: string[] = [];
  if (filters.typeFilter === 'expense') parts.push('Spending');
  else if (filters.typeFilter === 'income') parts.push('Income');
  if (filters.categoryFilter) parts.push(named(choices.categories, filters.categoryFilter));
  if (filters.accountFilter) {
    parts.push(filters.accountFilter === UNASSIGNED_ACCOUNT_FILTER ? 'Unassigned account' : named(choices.accounts, filters.accountFilter));
  }
  if (filters.merchantFilter) parts.push(named(choices.merchants, filters.merchantFilter));
  if (filters.tripFilter === 'none') parts.push('No trip');
  else if (filters.tripFilter) parts.push(named(choices.trips, filters.tripFilter));
  if (filters.selectedCalendarDate) parts.push(filters.selectedCalendarDate);
  else if (filters.fromDate || filters.throughDate) parts.push([filters.fromDate, filters.throughDate].filter(Boolean).join('–'));
  if (filters.summaryMonth) parts.push(filters.summaryMonth);
  if (filters.receiptFilter) parts.push(`Receipt ${filters.receiptFilter}`);
  return parts.join(' · ');
}

export function writeGalleryQuery(state: {
  filters: GalleryFilters;
  sort: GallerySort;
  positionId: number | null;
  ledgerId: number | null;
}): Record<string, string | null> {
  const sortKey = gallerySortKey(state.sort);
  const view = state.filters.typeFilter === 'income'
    ? 'income'
    : state.filters.typeFilter === 'expense'
      ? 'spending'
      : null;
  return {
    t: 'gallery',
    q: state.filters.searchTerm.trim() || null,
    v: view,
    month: state.filters.summaryMonth || null,
    from: state.filters.fromDate || null,
    through: state.filters.throughDate || null,
    date: state.filters.selectedCalendarDate,
    account: state.filters.accountFilter || null,
    category: state.filters.categoryFilter || null,
    merchant: state.filters.merchantFilter || null,
    trip: state.filters.tripFilter || null,
    receipt: state.filters.receiptFilter || null,
    sort: sortKey === 'date-desc' ? null : sortKey,
    position: state.positionId == null ? null : String(state.positionId),
    ledger: state.ledgerId == null ? null : String(state.ledgerId),
  };
}

export function galleryFilterChoices(rows: readonly Transaction[], filters: GalleryFilters): GalleryFilterChoices {
  const categories = new Map<string, string>();
  const merchants = new Map<string, string>();
  const accounts = new Map<string, string>();
  const trips = new Set<number>();
  for (const row of rows) {
    const category = spendingGroupKey(row, 'category');
    if (!categories.has(category)) categories.set(category, spendingGroupLabel(row, 'category'));
    const merchant = spendingGroupKey(row, 'merchant');
    if (!merchants.has(merchant)) merchants.set(merchant, spendingGroupLabel(row, 'merchant'));
    const key = String(row.bank_account_key || '').trim();
    if (key && !accounts.has(key)) accounts.set(key, String(row.account_display || '').trim() || 'Bank account');
    const trip = normalizeTripId(row.trip_id);
    if (trip != null) trips.add(trip);
  }
  const selectedTrip = normalizeTripId(filters.tripFilter);
  if (selectedTrip != null) trips.add(selectedTrip);
  const byLabel = (left: GalleryChoice, right: GalleryChoice) => left.label.localeCompare(right.label);
  return {
    categories: [...categories].map(([value, label]) => ({ value, label })).sort(byLabel),
    merchants: [...merchants].map(([value, label]) => ({ value, label })).sort(byLabel),
    accounts: [...accounts].map(([value, label]) => ({ value, label })).sort(byLabel),
    trips: [...trips].sort((left, right) => left - right).map(id => ({ value: String(id), label: `Trip #${id}` })),
  };
}

export function projectTreasuryGallery(input: {
  holdings: readonly Holding[];
  transactions: readonly Transaction[];
  filters: GalleryFilters;
  sort: GallerySort;
  openedPositionId: number | null;
  openedLedgerId: number | null;
  vaultOpen: boolean;
  asOf: string;
}): TreasuryGalleryProjection {
  if (!input.vaultOpen) {
    return {
      plaques: [],
      lines: [],
      readout: HIDDEN_READOUT,
      inspectorPosition: null,
      inspectorLedger: null,
      ledgerOutsideFilter: false,
      positionMissing: false,
    };
  }

  const plaques = input.holdings.map(holding => plaqueFor(holding, input.openedPositionId, input.asOf));
  const openedPosition = plaques.find(plaque => plaque.opened) ?? null;
  const filtered = sortTransactionActivity(
    filterTransactionActivity([...input.transactions], input.filters),
    input.sort.column,
    input.sort.direction,
  );
  const lines = filtered.map(row => lineFor(row, input.openedLedgerId));
  const openedLine = lines.find(line => line.opened) ?? null;
  const readout = readoutFor(input.holdings, openedPosition != null, input.asOf);
  return {
    plaques,
    lines,
    readout,
    inspectorPosition: openedPosition,
    inspectorLedger: openedLine,
    ledgerOutsideFilter: input.openedLedgerId != null
      && openedLine == null
      && input.transactions.some(row => row.id === input.openedLedgerId),
    positionMissing: input.openedPositionId != null && openedPosition == null,
  };
}

function plaqueFor(holding: Holding, openedId: number | null, asOf: string): TreasuryPlaque {
  const symbol = String(holding.symbol || '').trim();
  const lifecycle = holding.lifecycle_status;
  const useful = symbol.length > 0 && lifecycle !== 'staged' && lifecycle !== 'inactive';
  const opened = holding.id === openedId;
  const state = quoteFreshness(holding, asOf);
  const basis = holding.cost_basis_status === 'provisional'
    ? 'provisional'
    : holding.cost_basis_status === 'unknown' || holding.purchase_price == null
      ? 'unknown'
      : 'known';
  return {
    id: holding.id,
    symbol,
    label: symbol || 'Unnamed position',
    account: String(holding.account_display || '').trim() || 'Manual',
    quoteLabel: quoteFreshnessLabel(holding, asOf),
    quoteState: state,
    useful,
    opened,
    shares: opened ? Number(holding.shares) : null,
    value: opened ? holdingMarketValue(holding) : null,
    gain: opened ? galleryGain(holding, asOf) : null,
    purchasePrice: opened && basis !== 'unknown' ? Number(holding.purchase_price) : null,
    purchaseDate: opened ? holding.purchase_date ?? null : null,
    positionDate: opened ? holding.position_as_of ?? null : null,
    quoteDate: opened ? holding.quote_date ?? holding.price_as_of ?? null : null,
    basis,
  };
}

function lineFor(row: Transaction, openedId: number | null): TreasuryLedgerLine {
  const opened = row.id === openedId;
  return {
    id: row.id,
    date: row.date,
    useful: isReturnDate(row.date || ''),
    category: spendingGroupLabel(row, 'category'),
    description: String(row.description || row.merchant || '').trim() || 'Ledger entry',
    account: String(row.account_display || '').trim(),
    opened,
    amount: opened ? Number(row.amount) : null,
    type: row.type,
  };
}

function readoutFor(holdings: readonly Holding[], revealed: boolean, asOf: string): TreasuryReadout {
  if (!revealed) return { ...HIDDEN_READOUT, positionCount: holdings.length };
  let gain = 0;
  let counted = 0;
  let withheld = 0;
  let staleCount = 0;
  let missingCount = 0;
  for (const holding of holdings) {
    const state = quoteFreshness(holding, asOf);
    if (state === 'Stale') staleCount += 1;
    if (holdingMarketValue(holding) == null) missingCount += 1;
    const allowed = galleryGain(holding, asOf);
    if (allowed == null) {
      withheld += 1;
      continue;
    }
    gain += allowed;
    counted += 1;
  }
  return {
    revealed: true,
    value: totalPortfolioValue([...holdings]),
    gain: counted > 0 ? gain : null,
    withheld,
    staleCount,
    missingCount,
    positionCount: holdings.length,
  };
}

function readGallerySort(value: string | null): GallerySort {
  const [column, direction] = (value || '').split('-');
  const sortColumn = column === 'amount' || column === 'category' || column === 'date' ? column : 'date';
  const sortDirection = direction === 'asc' || direction === 'desc' ? direction : 'desc';
  if (sortColumn === 'category' && sortDirection !== 'asc') return { column: 'date', direction: 'desc' };
  if ((column === 'date' || column === 'amount' || column === 'category') && (direction === 'asc' || direction === 'desc')) {
    return { column: sortColumn, direction: sortDirection };
  }
  return { column: 'date', direction: 'desc' };
}

function gallerySortKey(sort: GallerySort): string {
  return `${sort.column}-${sort.direction}`;
}

export { UNASSIGNED_ACCOUNT_FILTER };
