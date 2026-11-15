import {
readTablePref,
trimCashflowRange,
writeTablePref
} from './chart-options';

describe('chart-options (F11)', () => {

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

  it('table prefs round-trip through localStorage', () => {
    writeTablePref('cashflow', true);
    expect(localStorage.getItem('finance.chartTable.cashflow')).toBe('1');
    expect(readTablePref('cashflow', false)).toBe(true);
    writeTablePref('cashflow', false);
    expect(readTablePref('cashflow', true)).toBe(false);
    localStorage.removeItem('finance.chartTable.cashflow');
    expect(readTablePref('cashflow', true)).toBe(true);
  });

});
