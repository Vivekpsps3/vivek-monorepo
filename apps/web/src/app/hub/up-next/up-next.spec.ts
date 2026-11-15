import { calendarUrls, hubGreeting, rowDateLabel, shiftDay, upNextRows } from './up-next';
import type { MediaCalendar, TravelEvent } from '../hub-decode';

function reminderEvent(): TravelEvent {
  return { id: 7, kind: 'reminder', date: '2026-12-24', time: '09:00', tz: null, title: 'Check in', overdue: true,
    trip_id: 12, trip_title: 'Kyoto', href: '/travel/trips/12',
    reminder: { id: 7, title: 'Check in', due_at: '2026-12-24T09:00', done: false, kind: 'flight', notes: 'Keep this note' } };
}

describe('compact Up next projection', () => {
  it('uses the exact 14-day window across the year and fetches only the necessary months', () => {
    expect(shiftDay('2026-12-25', 13)).toBe('2027-01-07');
    expect(calendarUrls('2026-12-25', 'America/Los_Angeles')).toEqual([
      '/media/api/calendar?month=2026-12&tz=America%2FLos_Angeles', '/media/api/calendar?month=2027-01&tz=America%2FLos_Angeles',
    ]);
    expect(calendarUrls('2026-12-01', 'UTC')).toEqual(['/media/api/calendar?month=2026-12&tz=UTC']);
    expect(shiftDay('2028-02-27', 2)).toBe('2028-02-29');
  });

  it('merges overdue, untimed, timed and Media rows while excluding imprecise, watched and postponed events', () => {
    const event = (title: string, type = 'episode', watched = false, release_status = 'scheduled') => ({ title, type, watched, release_status, entry_id: 4 });
    const calendar: MediaCalendar = { days: [
      { date: '2026-12-24', events: [event('Past')] },
      { date: '2026-12-25', events: [event('Premiere'), event('Watched', 'episode', true), event('Postponed', 'anticipated', false, 'postponed'), event('Sequel', 'sequel')] },
      { date: '2027-01-07', events: [event('Last day', 'anticipated')] },
      { date: '2027-01-08', events: [event('Outside')] },
    ] };
    const reminder = reminderEvent();
    const travel: TravelEvent[] = [reminder,
      { ...reminder, id: 8, kind: 'trip_start', date: '2026-12-25', overdue: false, time: null, title: 'Trip starts', reminder: null },
      { ...reminder, id: 9, kind: 'transport', date: '2026-12-25', overdue: false, time: '10:00', title: 'Flight', reminder: null },
    ];
    const rows = upNextRows(travel, [calendar], '2026-12-25');
    expect(rows.map(row => row.title)).toEqual(['Check in', 'Trip starts', 'Premiere', 'Flight', 'Last day']);
    expect(rows[0].reminder).toBe(reminder.reminder);
    expect(rows.find(row => row.title === 'Premiere')?.href).toBe('/media/item/4');
    expect(rowDateLabel(rows[0], new Date(2026, 11, 25))).toBe('Overdue');
    expect(rowDateLabel(rows[1], new Date(2026, 11, 25))).toBe('Today');
  });

  it('keeps stored transport time when its zone differs from the viewer and tolerates old zone text', () => {
    const row = { ...reminderEvent(), key: 'x', source: 'travel' as const, overdue: false, date: '2026-12-25', time: '10:30', tz: 'Asia/Tokyo' };
    const label = rowDateLabel(row, new Date(2026, 11, 25));
    expect(label).toMatch(/10:30/);
    expect(label).toContain('Today');
    expect(rowDateLabel({ ...row, tz: 'Bad/Zone' }, new Date(2026, 11, 25))).toMatch(/10:30/);
  });
});

for (const [hour, greeting] of [[4, 'Good evening'], [5, 'Good morning'], [11, 'Good morning'], [12, 'Good afternoon'], [16, 'Good afternoon'], [17, 'Good evening']] as const) {
  it(`greets at ${hour}:00 without a blank comma`, () => {
    expect(hubGreeting(' Ada ', hour)).toBe(`${greeting}, Ada`);
    expect(hubGreeting(' ', hour)).toBe(greeting);
  });
}


it('expands only authoritative dates, retaining watched release dates without inventing completion history', () => {
  const event = reminderEvent();
  const calendar: MediaCalendar = { days: [
    { date: '2026-12-01', events: [{ type: 'episode', title: 'Earlier release', entry_id: 4, watched: true, release_status: 'scheduled' }] },
    { date: '2026-12-02', events: [{ type: 'sequel', title: 'Unsupported follow-up', entry_id: 4, watched: false, release_status: 'scheduled' }] },
    { date: '2027-01-01', events: [{ type: 'episode', title: 'Outside month', entry_id: 4, watched: false, release_status: 'scheduled' }] },
  ] };
  expect(upNextRows([event], [calendar], '2026-12-25', '2026-12-01', '2026-12-31', true).map(row => [row.title, row.date]))
    .toEqual([['Check in', '2026-12-24'], ['Earlier release', '2026-12-01']]);
  expect(upNextRows([event], [calendar], '2026-12-25').map(row => row.title)).toEqual(['Check in', 'Outside month']);
});
