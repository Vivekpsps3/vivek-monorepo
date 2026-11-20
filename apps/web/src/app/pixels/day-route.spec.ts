import { dayOriginPath, daySearch, parseDayQuery } from './day-route';

describe('day route', () => {
  it('keeps a leap day and its year or life origin', () => {
    const year = parseDayQuery({ date: '2024-02-29', from: 'year', year: '2024', span: '2024-02-29' });
    expect(year.notice).toBeNull();
    expect(year.query).toEqual({ date: '2024-02-29', from: 'year', year: '2024', span: null });
    expect(dayOriginPath(year.query!)).toBe('/pixels?year=2024&day=2024-02-29');
    expect(daySearch(year.query!)).toBe('date=2024-02-29&from=year&year=2024');

    const life = parseDayQuery({ date: '2024-02-29', from: 'life', year: '2024', span: '2024-02-29' });
    expect(life.query).toEqual({ date: '2024-02-29', from: 'life', year: '2024', span: '2024-02-29' });
    expect(dayOriginPath(life.query!)).toBe('/pixels/life?span=2024-02-29');
    expect(daySearch(life.query!)).toBe('date=2024-02-29&from=life&year=2024&span=2024-02-29');
  });

  it('does not coerce an invalid date into another day', () => {
    expect(parseDayQuery({ date: '', from: null, year: null, span: null })).toEqual({
      query: null,
      notice: 'No day selected.',
    });
    expect(parseDayQuery({ date: '2024-02-31', from: 'year', year: '2024', span: null })).toEqual({
      query: null,
      notice: '2024-02-31 is not a date.',
    });
    const fallback = parseDayQuery({ date: '2024-02-29', from: 'nope', year: '0000', span: 'not-a-date' });
    expect(fallback.query).toEqual({ date: '2024-02-29', from: 'year', year: '2024', span: null });
  });
});
