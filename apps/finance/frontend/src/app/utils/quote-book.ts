import { Holding } from '../models/transaction.model';

export interface QuoteEntry {
  price: number;
  asOf: string | null;
  source: string;
}

/**
 * One quote per symbol: the newest saved price wins, so every surface that
 * reads prices through this book shows the same number for a symbol.
 */
export function quoteBook(holdings: Holding[]): Map<string, QuoteEntry> {
  const book = new Map<string, QuoteEntry>();
  for (const holding of holdings) {
    const symbol = (holding.symbol ?? '').trim().toUpperCase();
    const price = Number(holding.current_price);
    const source = holding.price_source ?? '';
    if (!symbol || source === 'unavailable' || !Number.isFinite(price) || price <= 0) continue;
    const asOf = holding.price_as_of ?? null;
    const existing = book.get(symbol);
    if (!existing || (asOf ?? '') >= (existing.asOf ?? '')) {
      book.set(symbol, { price, asOf, source });
    }
  }
  return book;
}

/** "Oct 30, 1:24 PM PT" — market times are Pacific; the suffix is literal. */
export function formatAsOf(iso: string | null | undefined): string {
  if (!iso) return 'date unknown';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'date unknown';
  return `${parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  })} PT`;
}
