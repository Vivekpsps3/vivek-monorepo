import { isIsoDate } from './pixels-dates';

export interface DayQuery {
  date: string;
  from: 'year' | 'life';
  year: string;
  span: string | null;
}

const YEAR = /^(?!0+$)\d{1,4}$/;

/** Public coordinates for `/pixels/day`. Invalid dates do not become another day. */
export function parseDayQuery(raw: {
  date: string | null;
  from: string | null;
  year: string | null;
  span: string | null;
}): { query: DayQuery | null; notice: string | null } {
  const date = (raw.date ?? '').trim();
  if (!isIsoDate(date)) {
    const notice = date === '' ? 'No day selected.' : `${date} is not a date.`;
    return { query: null, notice };
  }
  const from = raw.from === 'life' ? 'life' : 'year';
  const yearText = (raw.year ?? '').trim();
  const year = YEAR.test(yearText) ? yearText : date.slice(0, 4);
  const spanText = (raw.span ?? '').trim();
  const span = from === 'life' && isIsoDate(spanText) ? spanText : null;
  return { query: { date, from, year, span }, notice: null };
}

/** Year or life URL that still names this day and its originating span. */
export function dayOriginPath(query: DayQuery): string {
  if (query.from === 'life' && query.span) return `/pixels/life?span=${query.span}`;
  const sameYear = Number(query.date.slice(0, 4)) === Number(query.year);
  return sameYear ? `/pixels?year=${query.year}&day=${query.date}` : `/pixels?year=${query.year}`;
}

export function daySearch(query: DayQuery): string {
  const params = new URLSearchParams();
  params.set('date', query.date);
  params.set('from', query.from);
  params.set('year', query.year);
  if (query.span) params.set('span', query.span);
  return params.toString();
}
