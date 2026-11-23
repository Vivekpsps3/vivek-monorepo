/** One visit: a Year day, or a birthday-relative Life week. Not both. */
export type DateSelection =
  | { kind: 'year'; year: string; day: string }
  | { kind: 'life'; span: string; day: string };

export type SelectionRead =
  | { status: 'absent' }
  | { status: 'invalid'; notice: string }
  | { status: 'ready'; selection: DateSelection };

export type VisitAppearance =
  | 'loading'
  | 'recorded'
  | 'unrecorded'
  | 'future'
  | 'unavailable'
  | 'expired'
  | 'undated';

const YEAR = /^(?!0+$)\d{1,4}$/;

/** The span is the Life week start already chosen. It is not moved to Monday or Sunday. */
export function readDateSelection(params: URLSearchParams): SelectionRead {
  const visit = one(params, 'visit');
  const day = one(params, 'day');
  const from = one(params, 'from');
  const year = one(params, 'year');
  const span = one(params, 'span');
  if (visit === undefined || day === undefined || from === undefined || year === undefined || span === undefined) {
    return { status: 'invalid', notice: 'That date link is not one visit.' };
  }
  if (visit === null && from === null && span === null) return { status: 'absent' };
  if (from !== null && from !== 'year' && from !== 'life') {
    return { status: 'invalid', notice: 'That visit is not a year day or a life week.' };
  }
  const life = from === 'life' || (from === null && span !== null);
  if (life) return readLife(span, visit ?? day);
  return readYear(visit ?? day, year);
}

export function selectionOrigin(selection: DateSelection): string {
  const route = originRoute(selection);
  const query = new URLSearchParams(route.query);
  const suffix = query.toString();
  return suffix ? `${route.commands[0]}?${suffix}` : route.commands[0];
}

export function originRoute(selection: DateSelection): { commands: string[]; query: Record<string, string> } {
  if (selection.kind === 'life') return { commands: ['/pixels/life'], query: { span: selection.span } };
  const query: Record<string, string> = { year: selection.year };
  if (Number(selection.day.slice(0, 4)) === Number(selection.year)) query['day'] = selection.day;
  return { commands: ['/pixels'], query };
}

export function townVisitQuery(selection: DateSelection): Record<string, string> {
  if (selection.kind === 'life') return { visit: selection.day, from: 'life', span: selection.span };
  return { visit: selection.day, from: 'year', year: selection.year };
}

export function worldVisitQuery(selection: DateSelection): Record<string, string> {
  // `visit` is the chosen origin. World may replace `day` when the camera settles.
  if (selection.kind === 'life') {
    return { visit: selection.day, day: selection.day, from: 'life', span: selection.span };
  }
  return { visit: selection.day, day: selection.day, from: 'year', year: selection.year };
}

export function originLabel(selection: DateSelection): string {
  if (selection.kind === 'life') return `Back to week of ${formatVisitDay(selection.span)}`;
  return `Back to ${selection.year}`;
}

export function formatVisitDay(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${weekday}, ${months[month - 1]} ${day}, ${year}`;
}

export const LAYOUT_NOTE = 'Current town layout. Rooms, levels, and balances are not reconstructed for this date.';

export function visitAppearance(input: {
  date: string;
  today: string;
  status: 'loading' | 'ready' | 'unavailable' | 'expired';
  records: number;
  sourceUnavailable: boolean;
}): VisitAppearance {
  if (input.status === 'loading') return 'loading';
  if (input.status === 'expired') return 'expired';
  if (input.status === 'unavailable') return 'unavailable';
  if (!isIsoDate(input.today)) return input.records > 0 ? 'recorded' : 'undated';
  if (input.sourceUnavailable && input.records === 0) return 'unavailable';
  if (input.date > input.today) return 'future';
  if (input.records > 0) return 'recorded';
  return 'unrecorded';
}

export function visitSentence(state: VisitAppearance, date: string): string {
  switch (state) {
    case 'loading': return `Loading records for ${date}.`;
    case 'recorded': return `Recorded on ${date}.`;
    case 'unrecorded': return `Nothing recorded on ${date}. That does not describe the day.`;
    case 'future': return `${date} is still ahead.`;
    case 'unavailable': return `Records for ${date} are unavailable.`;
    case 'expired': return `Sign in again to load records for ${date}.`;
    case 'undated': return 'The town date is unavailable, so this day is not marked empty or ahead.';
  }
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Civil YYYY-MM-DD, including leap day. Lives with the visit so Town, Pixels, and World do not import each other. */
export function isIsoDate(value: string): boolean {
  const match = ISO.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= (month === 2 && leap ? 29 : lengths[month]);
}

/** `undefined` means the key was repeated. `null` means it was absent. */
function one(params: URLSearchParams, key: string): string | null | undefined {
  const values = params.getAll(key).map(value => value.trim());
  if (values.length > 1) return undefined;
  if (values.length === 0) return null;
  return values[0] === '' ? null : values[0];
}

function readLife(span: string | null, dated: string | null): SelectionRead {
  if (!span || !isIsoDate(span)) {
    return { status: 'invalid', notice: span ? `${span} is not a life week.` : 'No life week selected.' };
  }
  if (dated !== null && !isIsoDate(dated)) return { status: 'invalid', notice: `${dated} is not a date.` };
  return { status: 'ready', selection: { kind: 'life', span, day: dated && isIsoDate(dated) ? dated : span } };
}

function readYear(dated: string | null, year: string | null): SelectionRead {
  if (!dated || !isIsoDate(dated)) {
    return { status: 'invalid', notice: dated ? `${dated} is not a date.` : 'No day selected.' };
  }
  if (year !== null && !YEAR.test(year)) return { status: 'invalid', notice: `${year} is not a year.` };
  const yearText = year && YEAR.test(year) ? year : dated.slice(0, 4);
  return { status: 'ready', selection: { kind: 'year', year: yearText, day: dated } };
}
