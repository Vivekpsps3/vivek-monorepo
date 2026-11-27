import type { Holding, Transaction } from '../models/transaction.model';
import { galleryGain as publishedGain, projectTreasuryGallery as publishedGallery } from '../../public-api';
import {
  emptyGalleryFilters,
  galleryActivityQuery,
  galleryFilterSummary,
  galleryGain,
  galleryHasAdvancedFilters,
  projectTreasuryGallery,
  readGalleryQuery,
  writeGalleryQuery,
  type GalleryFilters,
  type GallerySort,
} from './treasury-gallery';

const asOf = '2026-10-15';
const sort: GallerySort = { column: 'date', direction: 'desc' };

function holding(patch: Partial<Holding> & Pick<Holding, 'id' | 'symbol'>): Holding {
  return {
    shares: 2,
    purchase_price: 10,
    purchase_date: '2026-03-02',
    current_price: 40,
    value: 80,
    price_source: 'live_eod',
    quote_date: '2026-10-14',
    position_as_of: '2026-10-14',
    ...patch,
  };
}

function entry(patch: Partial<Transaction> & Pick<Transaction, 'id' | 'date'>): Transaction {
  return {
    type: 'expense',
    category: 'Groceries',
    amount: 18.4,
    description: 'Boardwalk Cafe',
    ...patch,
  };
}

function view(input: {
  holdings?: Holding[];
  transactions?: Transaction[];
  filters?: Partial<GalleryFilters>;
  sort?: GallerySort;
  openedPositionId?: number | null;
  openedLedgerId?: number | null;
  vaultOpen?: boolean;
}) {
  return projectTreasuryGallery({
    holdings: input.holdings ?? [],
    transactions: input.transactions ?? [],
    filters: { ...emptyGalleryFilters(), ...input.filters },
    sort: input.sort ?? sort,
    openedPositionId: input.openedPositionId ?? null,
    openedLedgerId: input.openedLedgerId ?? null,
    vaultOpen: input.vaultOpen ?? true,
    asOf,
  });
}

describe('treasury gallery projection', () => {
  const harbor = holding({
    id: 2, symbol: 'HARBOR', shares: 2, purchase_price: 100, current_price: 124.56, value: 249.12,
    account_display: 'Checking',
  });
  const tide = holding({
    id: 3, symbol: 'TIDE', quote_date: '2026-10-01', account_display: 'Checking',
  });
  const unnamed = holding({
    id: 1, symbol: ' ', price_source: 'unavailable', current_price: null, purchase_price: null, value: null, quote_date: null,
  });
  const cafe = entry({ id: 41, date: '2026-08-15', category: 'Groceries', amount: 18.4, description: 'Boardwalk Cafe', bank_account_key: 'checking' });
  const books = entry({ id: 42, date: '2026-08-16', category: 'Books', amount: 9, description: 'Lighthouse Books' });
  const stipend = entry({ id: 44, date: '2026-08-15', type: 'income', category: 'Pay', amount: 500, description: 'Civic stipend' });
  const undated = entry({ id: 43, date: 'not-a-date', description: 'Undated kiosk', amount: 4 });

  it('publishes the same projection and gain rule the public entry exposes', () => {
    expect(publishedGallery).toBe(projectTreasuryGallery);
    expect(publishedGain).toBe(galleryGain);
  });

  it('lists holdings and dated lines without inventing a selected record', () => {
    const locked = view({ holdings: [unnamed, harbor, tide], transactions: [undated, cafe, books, stipend] });
    expect(locked.plaques.map(plaque => plaque.label)).toEqual(['Unnamed position', 'HARBOR', 'TIDE']);
    expect(locked.inspectorPosition).toBeNull();
    expect(locked.inspectorLedger).toBeNull();
    expect(locked.plaques.every(plaque => plaque.value == null && plaque.shares == null)).toBeTrue();
    expect(locked.lines.every(line => line.amount == null && !line.opened)).toBeTrue();
    expect(locked.lines.map(line => line.id)).toEqual([43, 42, 41, 44]);
    expect(locked.readout.value).toBeNull();
    expect(locked.readout.gain).toBeNull();
    expect(JSON.stringify(locked)).not.toContain('$');
  });

  it('opens the selected position and withholds a stale quote from gain', () => {
    expect(galleryGain(tide, asOf)).toBeNull();
    expect(galleryGain(harbor, asOf)).toBeCloseTo(49.12, 8);
    const opened = view({
      holdings: [harbor, tide],
      transactions: [cafe],
      openedPositionId: 3,
    });
    const tidePlaque = opened.plaques[1];
    expect(opened.inspectorPosition).toBe(tidePlaque);
    expect(tidePlaque.opened).toBeTrue();
    expect(tidePlaque.shares).toBe(2);
    expect(tidePlaque.value).toBe(80);
    expect(tidePlaque.gain).toBeNull();
    expect(tidePlaque.quoteState).toBe('Stale');
    expect(tidePlaque.quoteLabel).toBe('Stale · 14 days old');
    expect(tidePlaque.purchaseDate).toBe('2026-03-02');
    expect(opened.plaques[0].value).toBeNull();
    expect(opened.readout.value).toBeCloseTo(329.12, 8);
    expect(opened.readout.gain).toBeCloseTo(49.12, 8);
    expect(opened.readout.staleCount).toBe(1);
    expect(opened.readout.withheld).toBe(1);
  });

  it('does not turn an unknown basis or a provisional price into a gain', () => {
    const unknown = holding({ id: 5, symbol: 'BAY', cost_basis_status: 'unknown', purchase_price: null });
    const provisional = holding({ id: 6, symbol: 'FLAT', price_source: 'provisional_cost_basis', value: 30, purchase_price: 10 });
    expect(galleryGain(unknown, asOf)).toBeNull();
    expect(galleryGain(provisional, asOf)).toBeNull();
    const opened = view({ holdings: [provisional], openedPositionId: 6 });
    expect(opened.inspectorPosition?.gain).toBeNull();
    expect(opened.readout.gain).toBeNull();
  });

  it('opens the dated ledger line that matches the Activity filters', () => {
    const rows = [cafe, books, stipend, undated, entry({
      id: 45, date: '2026-08-15', description: 'Pier transfer', amount: 3, kind: 'transfer', trip_id: 7,
    })];
    const spending = view({
      transactions: rows,
      filters: { typeFilter: 'expense', fromDate: '2026-08-15', throughDate: '2026-08-15', categoryFilter: 'groceries' },
      openedLedgerId: 41,
    });
    expect(spending.lines.map(line => line.id)).toEqual([41]);
    expect(spending.inspectorLedger?.description).toBe('Boardwalk Cafe');
    expect(spending.inspectorLedger?.date).toBe('2026-08-15');
    expect(spending.inspectorLedger?.amount).toBe(18.4);
    expect(spending.ledgerOutsideFilter).toBeFalse();

    const outside = view({
      transactions: rows,
      filters: { fromDate: '2026-08-16', throughDate: '2026-08-16' },
      openedLedgerId: 41,
    });
    expect(outside.lines.map(line => line.id)).toEqual([42]);
    expect(outside.lines[0].opened).toBeFalse();
    expect(outside.inspectorLedger).toBeNull();
    expect(outside.ledgerOutsideFilter).toBeTrue();
    expect(JSON.stringify(outside.lines)).not.toContain('Boardwalk');

    const trip = view({
      transactions: rows,
      filters: { tripFilter: '7' },
    });
    expect(trip.lines.map(line => line.id)).toEqual([45]);

    const account = view({
      transactions: rows,
      filters: { accountFilter: 'checking', searchTerm: 'boardwalk' },
      openedLedgerId: 41,
    });
    expect(account.lines.map(line => line.id)).toEqual([41]);
  });

  it('sorts the desk with the Activity order and does not select an undated row on its own', () => {
    const oldest = view({
      transactions: [books, cafe, undated],
      sort: { column: 'date', direction: 'asc' },
    });
    expect(oldest.lines.map(line => line.id)).toEqual([41, 42, 43]);
    expect(oldest.inspectorLedger).toBeNull();
    const opened = view({
      transactions: [books, cafe, undated],
      sort: { column: 'date', direction: 'asc' },
      openedLedgerId: 41,
    });
    expect(opened.inspectorLedger?.id).toBe(41);
    expect(view({ transactions: [undated] }).inspectorLedger).toBeNull();
  });

  it('drops a locked vault to an empty projection with no ticker text', () => {
    const locked = view({
      holdings: [harbor, tide],
      transactions: [cafe],
      openedPositionId: 2,
      openedLedgerId: 41,
      vaultOpen: false,
    });
    expect(locked.plaques).toEqual([]);
    expect(locked.lines).toEqual([]);
    expect(locked.inspectorPosition).toBeNull();
    expect(locked.inspectorLedger).toBeNull();
    expect(locked.readout).toEqual(jasmine.objectContaining({ revealed: false, value: null, gain: null }));
    const text = JSON.stringify(locked);
    expect(text).not.toContain('HARBOR');
    expect(text).not.toContain('TIDE');
    expect(text).not.toContain('Boardwalk');
  });

  it('round-trips the gallery query through the Activity filter names', () => {
    const filters: GalleryFilters = {
      ...emptyGalleryFilters(),
      searchTerm: 'boardwalk',
      typeFilter: 'expense',
      fromDate: '2026-08-15',
      throughDate: '2026-08-15',
      categoryFilter: 'groceries',
      accountFilter: 'checking',
      tripFilter: 'none',
    };
    const params = writeGalleryQuery({
      filters,
      sort: { column: 'amount', direction: 'asc' },
      positionId: 3,
      ledgerId: 41,
    });
    expect(params['t']).toBe('gallery');
    expect(params['v']).toBe('spending');
    const read = readGalleryQuery(name => params[name] ?? null);
    expect(read.filters).toEqual(filters);
    expect(read.sort).toEqual({ column: 'amount', direction: 'asc' });
    expect(read.positionId).toBe(3);
    expect(read.ledgerId).toBe(41);
    expect(readGalleryQuery(() => 'nope').positionId).toBeNull();
    expect(readGalleryQuery(() => null).sort).toEqual({ column: 'date', direction: 'desc' });
    const activity = galleryActivityQuery(filters);
    expect(activity['edit']).toBeUndefined();
    expect(activity['position']).toBeUndefined();
    expect(activity['t']).toBeUndefined();
    expect(activity['v']).toBe('spending');
    expect(activity['from']).toBe('2026-08-15');
    expect(activity['month']).toBeNull();
    expect(galleryActivityQuery(emptyGalleryFilters())['month']).toBe('all');
    expect(galleryHasAdvancedFilters(filters, { column: 'date', direction: 'desc' })).toBeTrue();
    expect(galleryHasAdvancedFilters(emptyGalleryFilters(), { column: 'date', direction: 'desc' })).toBeFalse();
    expect(galleryFilterSummary(filters, {
      categories: [{ value: 'groceries', label: 'Groceries' }],
      merchants: [],
      accounts: [{ value: 'checking', label: 'Checking' }],
      trips: [],
    })).toBe('Spending · Groceries · Checking · No trip · 2026-08-15–2026-08-15');
  });
});
