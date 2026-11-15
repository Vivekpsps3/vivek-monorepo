import { formatRelativeDay, parseDateOnly, isoDateInZone, browserTimeZone } from '@vivek/browser';
import type { MediaCalendar, TravelEvent, TravelReminder } from '../hub-decode';

export type AgendaSource = 'travel' | 'media';
export interface UpNextRow {
  key: string;
  source: AgendaSource;
  date: string;
  time: string | null;
  tz: string | null;
  title: string;
  href: string;
  overdue: boolean;
  reminder: TravelReminder | null;
}

export function shiftDay(iso: string, days: number): string {
  const date = parseDateOnly(iso)!;
  date.setDate(date.getDate() + days);
  return isoDateInZone(date, browserTimeZone());
}

export function calendarUrls(today: string, tz: string): string[] {
  const months = new Set([today.slice(0, 7), shiftDay(today, 13).slice(0, 7)]);
  return [...months].map(month => `/media/api/calendar?month=${month}&tz=${encodeURIComponent(tz)}`);
}

export function upNextRows(travel: TravelEvent[], calendars: MediaCalendar[], today: string): UpNextRow[] {
  const end = shiftDay(today, 13);
  const rows: UpNextRow[] = travel.filter(row => row.overdue || (row.date >= today && row.date <= end))
    .map(row => ({ ...row, key: `travel:${row.kind}:${row.id}`, source: 'travel' }));
  for (const calendar of calendars) {
    for (const day of calendar.days) {
      if (day.date < today || day.date > end) continue;
      day.events.forEach((event, index) => {
        if (!['episode', 'anticipated'].includes(event.type) || event.watched || event.release_status === 'postponed') return;
        rows.push({ key: `media:${day.date}:${event.entry_id}:${index}`, source: 'media', date: day.date,
          time: null, tz: null, title: event.title, overdue: false, reminder: null,
          href: event.entry_id === null ? '/media/calendar' : `/media/item/${event.entry_id}` });
      });
    }
  }
  return rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date)
    || (a.time ?? '').localeCompare(b.time ?? '') || Number(a.source === 'media') - Number(b.source === 'media')
    || a.title.localeCompare(b.title));
}

export function rowDateLabel(row: UpNextRow, now = new Date()): string {
  if (row.overdue) return 'Overdue';
  let label = formatRelativeDay(row.date, now);
  if (!row.time) return label;
  const date = parseDateOnly(row.date)!;
  const [hour, minute] = row.time.split(':').map(Number);
  date.setHours(hour, minute);
  label += ` · ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)}`;
  if (row.tz) {
    // Zone names describe the stored wall time; never shift the time into the viewer's zone.
    const short = (tz: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(date).find(part => part.type === 'timeZoneName')?.value;
    try {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (short(row.tz) !== short(local)) label += ` ${short(row.tz)}`;
    } catch { /* Old saved timezone text does not make the row unusable. */ }
  }
  return label;
}

export function hubGreeting(name: string, hour: number): string {
  const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
  return name.trim() ? `${greeting}, ${name.trim()}` : greeting;
}
