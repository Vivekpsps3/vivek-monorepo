import type { Habit } from './town.types';

/** §8.4. JS has no Unicode category, so this rejects C0/C1 and the listed bidi marks. */
export function habitNameError(raw: string): string | null {
  const nfc = raw.normalize('NFC');
  for (const char of nfc) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      return 'Use letters, numbers and punctuation only.';
    }
  }
  const name = nfc.trim().replace(/\s+/g, ' ');
  const length = [...name].length;
  if (length < 1 || length > 40) return 'Use 1 to 40 characters.';
  return null;
}

export function normalizedHabitName(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function cadenceLabel(perWeek: number): string {
  return perWeek === 7 ? 'Every day' : `${perWeek}× a week`;
}

/** Weekday, day, short month. "Mon 2 Nov". Parsed as a calendar date, so the zone does not shift it. */
export function formatTownDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/,/g, '');
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function mondayOn(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return addDays(iso, -((new Date(year, month - 1, day).getDay() + 6) % 7));
}

export interface HistoryCell {
  text: '' | 'done' | 'rest' | 'missed';
  kind: 'done' | 'rest' | 'miss' | 'pending' | 'empty';
}

/** Walk §6.1 inside the fetched window. Weekly days are done or blank; slack replaces rest. */
export function labelRange(args: {
  created: string;
  today: string;
  from: string;
  to: string;
  daily: boolean;
  checked: ReadonlySet<string>;
}): Map<string, HistoryCell> {
  const out = new Map<string, HistoryCell>();
  const rests = new Set<string>();
  let streak = 0;
  for (let day = args.from; day <= args.to; day = addDays(day, 1)) {
    if (day < args.created) continue;
    if (args.checked.has(day)) {
      if (args.daily) streak += 1;
      out.set(day, { text: 'done', kind: 'done' });
      continue;
    }
    if (!args.daily || day === args.today) {
      out.set(day, { text: '', kind: day === args.today ? 'pending' : 'empty' });
      continue;
    }
    if (streak > 0 && !rests.has(mondayOn(day))) {
      rests.add(mondayOn(day));
      out.set(day, { text: 'rest', kind: 'rest' });
      continue;
    }
    streak = 0;
    out.set(day, { text: 'missed', kind: 'miss' });
  }
  return out;
}

export function historyFrom(created: string, today: string): string {
  const limit = addDays(today, -119);
  return created > limit ? created : limit;
}

export function eightWeekStarts(today: string): string[] {
  const first = addDays(mondayOn(today), -49);
  return Array.from({ length: 8 }, (_, index) => addDays(first, index * 7));
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function pendingHint(habit: Habit): string {
  const pending = habit.cadence.pending;
  if (!pending) return '';
  return `Changes to ${cadenceLabel(pending.per_week)} from ${formatTownDay(pending.effective_from)}`;
}

export function apiProblem(error: unknown): { message: string; fields: Record<string, string> } {
  const body = typeof error === 'object' && error && 'error' in error
    ? (error as { error?: { message?: unknown; field_errors?: unknown } }).error : undefined;
  const raw = body && typeof body === 'object' && 'field_errors' in body ? body.field_errors : undefined;
  const fields: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string') fields[key] = value;
    }
  }
  return { message: typeof body?.message === 'string' ? body.message : 'Town is unavailable right now.', fields };
}
