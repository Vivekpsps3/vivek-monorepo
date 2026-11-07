import { formatMoney } from '@vivek/browser';
import {
  chartCompactMoney,
  chartMoney,
  monthTickLabel,
  readTablePref,
  shouldDrill,
  trimCashflowRange,
  withAlpha,
  writeTablePref,
} from './chart-options';

describe('chart-options (F11)', () => {
  it('monthTickLabel Oct / Jan 2026 / Sep', () => {
    expect(monthTickLabel('2026-10', false)).toBe('Oct');
    expect(monthTickLabel('2026-01', true)).toBe('Jan 2026');
    expect(monthTickLabel('2026-09', false)).toBe('Sep');
  });

  it('trimCashflowRange drops leading empties, keeps inner empties', () => {
    const rows = [
      { month: '2026-01', income: 0, expense: 0 },
      { month: '2026-02', income: 0, expense: 0 },
      { month: '2026-03', income: 10, expense: 0 },
      { month: '2026-04', income: 0, expense: 0 },
      { month: '2026-05', income: 0, expense: 5 },
    ];
    expect(trimCashflowRange(rows).map(row => row.month)).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('trimCashflowRange keeps min 3 when all empty', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ month: `2026-0${i + 1}`, income: 0, expense: 0 }));
    expect(trimCashflowRange(rows).map(row => row.month)).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('trimCashflowRange keeps 12 when first month has data', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, '0')}`,
      income: i === 0 ? 1 : 0,
      expense: 0,
    }));
    expect(trimCashflowRange(rows).length).toBe(12);
  });

  it('withAlpha hex and rgb', () => {
    expect(withAlpha('#ef4444', 0.8)).toBe('rgba(239, 68, 68, 0.8)');
    expect(withAlpha('rgb(1, 2, 3)', 0.5)).toBe('rgba(1, 2, 3, 0.5)');
    expect(withAlpha('var(--danger)', 0.8)).toBe('var(--danger)');
  });

  it('chartMoney sign always → +$4,941.00, negative → −$12.00', () => {
    expect(chartMoney(4941, 'always')).toBe(formatMoney(494100, { sign: 'always' }));
    expect(chartMoney(4941, 'always').replace(/⁠/g, '')).toBe('+$4,941.00');
    expect(chartMoney(-12)).toBe(formatMoney(-1200));
    expect(chartMoney(-12).replace(/⁠/g, '')).toBe('−$12.00');
  });

  it('chartCompactMoney 5000 → $5K', () => {
    expect(chartCompactMoney(5000)).toBe(formatMoney(500000, { style: 'compact' }));
  });

  it('readTablePref fallback when storage throws', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    expect(readTablePref('cashflow', true)).toBe(true);
    expect(readTablePref('cashflow', false)).toBe(false);
  });

  it('table prefs round-trip through localStorage', () => {
    writeTablePref('cashflow', true);
    expect(localStorage.getItem('finance.chartTable.cashflow')).toBe('1');
    expect(readTablePref('cashflow', false)).toBe(true);
    writeTablePref('cashflow', false);
    expect(readTablePref('cashflow', true)).toBe(false);
    localStorage.removeItem('finance.chartTable.cashflow');
    expect(readTablePref('cashflow', true)).toBe(true);
  });

  it('shouldDrill mouse true, first touch false, second touch same key true, different key false, after 4s false', () => {
    expect(shouldDrill(null, 'cashflow:1:0', 'mouse', 1000)).toBe(true);
    expect(shouldDrill(null, 'cashflow:1:0', '', 1000)).toBe(true);
    expect(shouldDrill(null, 'cashflow:1:0', 'pen', 1000)).toBe(true);
    expect(shouldDrill(null, 'cashflow:1:0', 'touch', 1000)).toBe(false);
    expect(shouldDrill({ key: 'cashflow:1:0', at: 1000 }, 'cashflow:1:0', 'touch', 2000)).toBe(true);
    expect(shouldDrill({ key: 'cashflow:1:0', at: 1000 }, 'cashflow:2:0', 'touch', 2000)).toBe(false);
    expect(shouldDrill({ key: 'cashflow:1:0', at: 1000 }, 'cashflow:1:0', 'touch', 5000)).toBe(false);
  });
});
