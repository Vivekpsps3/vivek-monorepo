import {
  LAYOUT_NOTE,
  formatVisitDay,
  originLabel,
  originRoute,
  readDateSelection,
  selectionOrigin,
  townVisitQuery,
  visitAppearance,
  visitSentence,
  worldVisitQuery,
} from './date-visit';

describe('date visit selection', () => {
  function read(query: string) {
    return readDateSelection(new URLSearchParams(query));
  }

  it('accepts one year day and one life week, and refuses a second value', () => {
    expect(read('visit=2024-02-29&from=year&year=2024')).toEqual({
      status: 'ready',
      selection: { kind: 'year', year: '2024', day: '2024-02-29' },
    });
    expect(read('day=2024-02-29&from=life&span=2024-02-26')).toEqual({
      status: 'ready',
      selection: { kind: 'life', span: '2024-02-26', day: '2024-02-29' },
    });
    expect(read('visit=2024-02-29&visit=2024-03-01&from=year&year=2024').status).toBe('invalid');
    expect(read('from=week&visit=2024-02-29').status).toBe('invalid');
    expect(read('visit=2024-02-31&from=year&year=2024')).toEqual({
      status: 'invalid',
      notice: '2024-02-31 is not a date.',
    });
    expect(read('from=life&span=2024-02-31').status).toBe('invalid');
    expect(read('week=2024-02-26&day=2024-02-29').status).toBe('absent');
  });

  it('keeps the life week start and the year day as the return path', () => {
    const year = { kind: 'year' as const, year: '2024', day: '2024-02-29' };
    const life = { kind: 'life' as const, span: '2024-02-26', day: '2024-02-29' };
    expect(selectionOrigin(year)).toBe('/pixels?year=2024&day=2024-02-29');
    expect(selectionOrigin(life)).toBe('/pixels/life?span=2024-02-26');
    expect(originRoute(life).commands).toEqual(['/pixels/life']);
    expect(townVisitQuery(life)).toEqual({ visit: '2024-02-29', from: 'life', span: '2024-02-26' });
    expect(worldVisitQuery(year)).toEqual({ visit: '2024-02-29', day: '2024-02-29', from: 'year', year: '2024' });
    expect(worldVisitQuery(life)).toEqual({ visit: '2024-02-29', day: '2024-02-29', from: 'life', span: '2024-02-26' });
    expect(read('visit=2024-02-29&day=2024-02-28&from=year&year=2024')).toEqual({
      status: 'ready',
      selection: year,
    });
    expect(originLabel(life)).toBe('Back to week of Mon, Feb 26, 2024');
    expect(formatVisitDay('2024-02-29')).toBe('Thu, Feb 29, 2024');
    expect(selectionOrigin({ kind: 'year', year: '2023', day: '2024-02-29' })).toBe('/pixels?year=2023');
  });

  it('keeps unrecorded, future, unavailable, and recorded days distinct', () => {
    const base = { date: '2024-02-29', today: '2026-10-29', status: 'ready' as const, records: 0, sourceUnavailable: false };
    expect(visitAppearance(base)).toBe('unrecorded');
    expect(visitAppearance({ ...base, records: 2 })).toBe('recorded');
    expect(visitAppearance({ ...base, date: '2026-12-01' })).toBe('future');
    expect(visitAppearance({ ...base, date: '2026-12-01', records: 1 })).toBe('future');
    expect(visitAppearance({ ...base, sourceUnavailable: true })).toBe('unavailable');
    expect(visitAppearance({ ...base, status: 'unavailable', records: 4 })).toBe('unavailable');
    expect(visitAppearance({ ...base, status: 'expired' })).toBe('expired');
    expect(visitAppearance({ ...base, status: 'loading', records: 3 })).toBe('loading');
    expect(visitAppearance({ ...base, today: '' })).toBe('undated');
    expect(visitAppearance({ ...base, today: '', records: 1 })).toBe('recorded');
    expect(visitSentence('unrecorded', '2024-02-29')).not.toContain('unavailable');
    expect(visitSentence('unrecorded', '2024-02-29')).not.toContain('ahead');
    expect(visitSentence('future', '2026-12-01')).not.toContain('Nothing recorded');
    expect(visitSentence('unavailable', '2024-02-29')).not.toContain('Nothing recorded');
    expect(LAYOUT_NOTE).toContain('not reconstructed');
  });
});
