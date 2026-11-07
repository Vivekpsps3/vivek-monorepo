import { Holding } from '../models/transaction.model';
import { formatAsOf, quoteBook } from './quote-book';

function holding(values: Partial<Holding>): Holding {
  return values as Holding;
}

describe('quoteBook', () => {
  it('keeps the newest price_as_of per symbol', () => {
    const book = quoteBook([
      holding({ symbol: 'VOO', current_price: 100, price_source: 'manual', price_as_of: '2026-10-01T00:00:00Z' }),
      holding({ symbol: 'voo', current_price: 125, price_source: 'live_eod', price_as_of: '2026-10-08T13:24:00Z' }),
      holding({ symbol: 'VOO', current_price: 110, price_source: 'manual', price_as_of: '2026-10-05T00:00:00Z' }),
    ]);
    expect(book.size).toBe(1);
    expect(book.get('VOO')).toEqual({ price: 125, asOf: '2026-10-08T13:24:00Z', source: 'live_eod' });
  });

  it('skips unavailable and non-positive prices', () => {
    const book = quoteBook([
      holding({ symbol: 'AAPL', current_price: 10, price_source: 'unavailable', price_as_of: '2026-10-08T00:00:00Z' }),
      holding({ symbol: 'MSFT', current_price: 0, price_source: 'manual', price_as_of: '2026-10-08T00:00:00Z' }),
      holding({ symbol: 'NVDA', current_price: null, price_source: 'manual', price_as_of: '2026-10-08T00:00:00Z' }),
    ]);
    expect(book.size).toBe(0);
  });
});

describe('formatAsOf', () => {
  it('renders a Pacific time with a literal PT suffix', () => {
    expect(formatAsOf('2026-10-30T20:24:00Z')).toBe('Oct 30, 1:24 PM PT');
  });

  it('falls back to date unknown', () => {
    expect(formatAsOf(null)).toBe('date unknown');
    expect(formatAsOf('not-a-date')).toBe('date unknown');
  });
});
