import assert from 'node:assert/strict';
import test from 'node:test';
import { monthCells, weekdayHeads } from '../../../frontend/src/composer-model.mjs';
import { clearItineraryDraft, projectItinerary, restoredLocalDate, settleItineraryWrite } from '../../../frontend/src/calendar-model.mjs';
import { rotateWeekLabels, weekStartsOn } from '../../../../../packages/browser/runtime/week.mjs';

test('the live trip composer follows the shared week setting', () => {
  const previous = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  try {
    assert.equal(weekStartsOn(), 0);
    localStorage.setItem('suite-week-start', '1');
    assert.equal(weekdayHeads()[0].title, 'Monday');
    assert.equal(rotateWeekLabels(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[0], 'Mon');
    assert.equal(monthCells(new Date(2026, 9, 1))[0].iso, '2026-09-28');
    localStorage.setItem('suite-week-start', '0');
    assert.equal(weekdayHeads()[0].title, 'Sunday');
    assert.equal(monthCells(new Date(2026, 9, 1))[0].iso, '2026-09-27');
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

const span = { start_date: '2026-10-24', end_date: '2026-10-26' };

test('a red-eye arrival is placed on the next trip day with linked parking before departure', () => {
  const projected = projectItinerary({
    ...span,
    transports: [{
      id: 7,
      label: 'Night flight',
      depart_at: '2026-10-24T23:40',
      arrive_at: '2026-10-25T06:10',
      sort_order: 0,
    }],
    plans: [{ id: 3, on_date: '2026-10-25', start_time: '09:00', title: 'Museum' }],
    parking: [{ id: 4, transport_id: 7, place_name: 'Garage', start_at: null }],
  });
  const leave = projected.days[0];
  const next = projected.days[1];
  assert.deepEqual(leave.entries.map((entry) => entry.key), ['parking:4', 'transport:7:depart']);
  assert.deepEqual(next.entries.map((entry) => entry.key), ['transport:7:arrive', 'plan:3']);
  assert.equal(leave.accessibleName, 'Sat, Oct 24, Saturday, October 24, 2026, Leave day, busy');
  assert.equal(next.label, 'Sun, Oct 25');
  assert.equal(projected.days[2].accessibleName, 'Mon, Oct 26, Monday, October 26, 2026, Return day, free');
  assert.equal(projected.outOfRange.length, 0);
});

test('missing times stay in explicit unscheduled groups', () => {
  const projected = projectItinerary({
    ...span,
    plans: [
      { id: 2, on_date: '2026-10-24', start_time: '', title: 'Nap' },
      { id: 1, on_date: '2026-10-24', start_time: null, title: 'Walk' },
    ],
    transports: [{ id: 8, label: 'TBD', depart_at: null, arrive_at: null }],
    parking: [{ id: 5, place_name: 'Lot', start_at: null, transport_id: null }],
  });
  assert.deepEqual(projected.days[0].entries.map((entry) => entry.key), []);
  assert.deepEqual(projected.days[0].unscheduled.map((entry) => entry.key), ['plan:1', 'plan:2']);
  assert.equal(projected.days[0].busy, true);
  assert.deepEqual(projected.unscheduled.map((entry) => entry.key), ['parking:5', 'transport:8']);
});

test('the same minute orders parking, departure, activities, then arrival, and ties use sort order then id', () => {
  const projected = projectItinerary({
    ...span,
    transports: [
      { id: 1, label: 'Later slot', depart_at: '2026-10-24T08:00', arrive_at: '2026-10-24T18:00', sort_order: 2 },
      { id: 9, label: 'Earlier slot', depart_at: '2026-10-24T08:00', arrive_at: '2026-10-24T08:00', sort_order: 1 },
    ],
    plans: [
      { id: 4, on_date: '2026-10-24', start_time: '08:00', title: 'Later activity', sort_order: 0 },
      { id: 3, on_date: '2026-10-24', start_time: '08:00', title: 'Earlier activity', sort_order: 0 },
      { id: 2, on_date: '2026-10-24', start_time: '12:00', title: 'Lunch' },
    ],
    parking: [{ id: 6, start_at: '2026-10-24T08:00', place_name: 'Lot' }],
  });
  assert.deepEqual(projected.days[0].entries.map((entry) => entry.key), [
    'parking:6',
    'transport:9:depart',
    'transport:1:depart',
    'plan:3',
    'plan:4',
    'plan:2',
    'transport:1:arrive',
  ]);
});

test('out-of-range dates and a next-day arrival past the trip stay in the out-of-range group', () => {
  const projected = projectItinerary({
    ...span,
    plans: [
      { id: 2, on_date: '2026-10-30', start_time: null, title: 'After' },
      { id: 1, on_date: '2026-10-20', start_time: '09:00', title: 'Before' },
    ],
    transports: [{
      id: 9,
      label: 'Late',
      depart_at: '2026-10-26T22:00',
      arrive_at: '2026-10-27T01:00',
    }],
    parking: [{ id: 11, start_at: '2026-10-19T07:00', place_name: 'Early lot' }],
  });
  assert.deepEqual(projected.days[2].entries.map((entry) => entry.key), ['transport:9:depart']);
  assert.deepEqual(projected.outOfRange.map((entry) => entry.key), [
    'parking:11',
    'plan:1',
    'transport:9:arrive',
    'plan:2',
  ]);
  assert.equal(projected.outOfRange[1].title, 'Before');
  assert.equal(projected.outOfRange[3].title, 'After');
});

test('lodging, notes, and reminders share the local day and a date-line arrival stays earlier', () => {
  const projected = projectItinerary({
    start_date: '2026-11-02',
    end_date: '2026-11-04',
    stays: [{ id: 1, city: 'Harbor', arrive_on: '2026-11-02', leave_on: '2026-11-04', lodging_name: 'Inn' }],
    note_entries: [
      { id: 2, body: 'Window', on_date: '2026-11-03' },
      { id: 3, body: 'Loose', on_date: null },
    ],
    reminders: [
      { id: 4, title: 'Pack', due_at: '2026-11-02T09:30' },
      { id: 5, title: 'Someday', due_at: null },
    ],
    transports: [{
      id: 8,
      label: 'Date line',
      depart_at: '2026-11-03T10:00',
      arrive_at: '2026-11-02T18:00',
    }],
    plans: [],
    parking: [{ id: 6, place_name: 'Lot', start_at: '2026-11-04T00:00' }],
  });
  assert.deepEqual(projected.days[0].lodging.map((entry) => entry.part), ['check-in']);
  assert.equal(projected.days[0].lodging[0].primary, true);
  assert.deepEqual(projected.days[1].lodging.map((entry) => entry.part), ['stay']);
  assert.equal(projected.days[1].lodging[0].primary, false);
  assert.deepEqual(projected.days[2].lodging.map((entry) => entry.part), ['check-out']);
  assert.deepEqual(projected.days[0].entries.map((entry) => entry.key), ['reminder:4', 'transport:8:arrive']);
  const arrival = projected.days[0].entries.find((entry) => entry.key === 'transport:8:arrive');
  assert.equal(arrival.dateLine, true);
  assert.equal(arrival.overnight, false);
  assert.deepEqual(projected.days[1].entries.map((entry) => entry.key), ['transport:8:depart']);
  assert.equal(projected.days[1].entries[0].dateLine, true);
  assert.deepEqual(projected.days[1].unscheduled.map((entry) => entry.key), ['note:2']);
  assert.deepEqual(projected.days[2].unscheduled.map((entry) => entry.key), ['parking:6']);
  assert.deepEqual(projected.unscheduled.map((entry) => entry.key), ['reminder:5', 'note:3']);
  assert.equal(projected.outOfRange.length, 0);
});

test('a chosen midnight leg stays on that day without a clock, and a reversed stay does not fill invented days', () => {
  const projected = projectItinerary({
    ...span,
    transports: [{ id: 1, label: 'Drive', depart_at: '2026-10-25T00:00', arrive_at: null }],
    stays: [{ id: 2, city: 'Reversed', arrive_on: '2026-10-27', leave_on: '2026-10-23' }],
    parking: [],
    plans: [],
  });
  assert.deepEqual(projected.days[1].unscheduled.map((entry) => entry.key), ['transport:1:depart']);
  assert.equal(projected.days[1].unscheduled[0].time, null);
  assert.deepEqual(projected.days.map((day) => day.lodging.length), [0, 0, 0]);
  assert.deepEqual(projected.outOfRange.map((entry) => entry.date), ['2026-10-23', '2026-10-27']);
  assert.deepEqual(projected.outOfRange.map((entry) => entry.part), ['check-out', 'check-in']);
  assert.equal(projected.outOfRange[1].primary, true);
});

test('a late or other-owner itinerary response does not apply, and invalidation clears private text', () => {
  const current = { epoch: 3, currentEpoch: 3, sessionActive: true, tripId: 9, currentTripId: 9 };
  assert.equal(settleItineraryWrite(current), true);
  assert.equal(settleItineraryWrite({ ...current, epoch: 2 }), false);
  assert.equal(settleItineraryWrite({ ...current, sessionActive: false }), false);
  assert.equal(settleItineraryWrite({ ...current, currentTripId: 10 }), false);
  const cleared = clearItineraryDraft();
  assert.equal(cleared.editor, '');
  assert.equal(cleared.noteBody, '');
  assert.equal(cleared.reminderTitle, '');
  assert.equal(cleared.activityTitle, '');
  assert.equal(cleared.activityNotes, '');
  assert.equal(cleared.lodgingNotes, '');
  assert.equal(cleared.parkingNotes, '');
  assert.equal(cleared.placeQuery, '');
  assert.equal(restoredLocalDate('plan', { on_date: '2026-10-25' }), '2026-10-25');
  assert.equal(restoredLocalDate('transport', { depart_at: '2026-11-03T10:00', arrive_at: '2026-11-02T18:00' }), '2026-11-03');
  assert.equal(restoredLocalDate('reminder', { due_at: null }), '');
});
