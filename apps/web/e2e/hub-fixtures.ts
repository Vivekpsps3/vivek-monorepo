import type { Page } from '../../../tests/e2e/fixtures';

export const reminder = { id: 7, title: 'Check in', due_at: '2026-12-24T09:00', done: false, kind: 'flight', notes: 'Keep this note' };
export const event = { id: 7, kind: 'reminder', date: '2026-12-24', time: '09:00', tz: null, title: 'Check in', overdue: true,
  trip_id: 12, trip_title: 'Kyoto', href: '/travel/trips/12', reminder };
export const travel = { today: '2026-12-25', next_trip: { id: 12, title: 'Kyoto', destination: 'Kyoto', start_date: '2026-12-26',
  end_date: '2027-01-07', phase: 'upcoming', days_until: 1, next_action: 'Leaves tomorrow', href: '/travel/trips/12' },
  up_next: [event, { ...event, id: 12, kind: 'trip_start', date: '2026-12-26', time: null, title: 'Kyoto starts', overdue: false, reminder: null }] };
export const summary = { currently: [{ id: 4, title: 'Example series', kind: 'tv', progress_label: 'S1 E1' }], recent_reviews: [], upcoming: [], next_episodes: [] };
export const mediaEvent = (title: string) => ({ type: 'episode', title, entry_id: 4, watched: false, release_status: 'scheduled' });

export async function sources(page: Page) {
  const calls: string[] = [];
  await page.route('**/travel/api/summary?*', route => { calls.push('travel'); return route.fulfill({ json: travel }); });
  await page.route('**/media/api/summary', route => { calls.push('media'); return route.fulfill({ json: summary }); });
  await page.route('**/media/api/calendar?*', route => {
    const month = new URL(route.request().url()).searchParams.get('month');
    calls.push(month!);
    return route.fulfill({ json: { days: [{ date: month === '2026-12' ? '2026-12-25' : '2027-01-07', events: [mediaEvent(month === '2026-12' ? 'Premiere' : 'Finale')] }] } });
  });
  return calls;
}
