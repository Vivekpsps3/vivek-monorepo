import type { ReadingItem, ReadingWeek, WeekChest, WorldWeek } from '../world.types';
import { addIsoDays } from './paging';

function daysInWeek(monday: string, days: readonly string[]): number {
  const end = addIsoDays(monday, 6);
  let count = 0;
  for (const day of days) {
    if (day >= monday && day <= end) count += 1;
  }
  return count;
}

/** Same lit rule as normalizeWeek: a covering trip, a concept or finished item, or a habit day. */
function isLit(week: WorldWeek, date: string): boolean {
  const trip = week.trips.some((item) => item.start <= date && date <= item.end);
  const marked = week.concepts.some((item) => item.on === date)
    || week.finished.some((item) => item.on === date);
  const habit = week.habits.some((item) => item.days.includes(date));
  return trip || marked || habit;
}

function itemsFor(week: WorldWeek, chest: WeekChest | null): { items: ReadingItem[]; budgetLine: string | null } {
  const items: ReadingItem[] = [];
  for (const trip of week.trips) {
    items.push({
      kind: 'trip',
      id: `trip:${trip.id}`,
      title: trip.title,
      detail: trip.place ? trip.place.label : '',
      date: `${trip.start}–${trip.end}`,
    });
  }
  for (const finished of week.finished) {
    items.push({
      kind: 'finished',
      id: `finished:${finished.entry_id}`,
      title: finished.title,
      detail: finished.kind,
      date: finished.on,
    });
  }
  const more = week.finished_more ?? 0;
  if (more > 0) {
    items.push({
      kind: 'finished',
      id: `finished-more:${week.week}`,
      title: `${more} more finished`,
      detail: '',
      date: '',
    });
  }
  for (const habit of week.habits) {
    const count = daysInWeek(week.week, habit.days);
    items.push({
      kind: 'habit',
      id: `habit:${habit.habit_id}`,
      title: habit.name,
      detail: `${habit.style}, ${count} days`,
      date: '',
    });
  }
  for (const concept of week.concepts) {
    items.push({
      kind: 'concept',
      id: `concept:${concept.id}`,
      title: concept.name,
      detail: '',
      date: concept.on,
    });
  }
  for (let index = 0; index < 7; index += 1) {
    const date = addIsoDays(week.week, index);
    if (!isLit(week, date)) continue;
    items.push({ kind: 'lit', id: `lit:${date}`, title: 'Lit', detail: '', date });
  }
  const budgetLine = chest?.line ? chest.line : null;
  if (budgetLine) {
    items.push({
      kind: 'budget',
      id: `budget:${week.week}`,
      title: budgetLine,
      detail: '',
      date: '',
    });
  }
  return { items, budgetLine };
}

export function readingWeek(week: WorldWeek, chest?: WeekChest | null): ReadingWeek {
  const reading = itemsFor(week, chest ?? null);
  return {
    week: week.week,
    label: week.week,
    items: reading.items,
    budgetLine: reading.budgetLine,
  };
}

function chestFor(chests: readonly WeekChest[], week: string): WeekChest | null {
  for (const chest of chests) {
    if (chest.week === week) return chest;
  }
  return null;
}

export function readingForWeeks(
  weeks: readonly WorldWeek[],
  chests: readonly WeekChest[],
  newestFirst: boolean,
): ReadingWeek[] {
  const readings = weeks.map((week) => readingWeek(week, chestFor(chests, week.week)));
  readings.sort((left, right) => {
    if (left.week === right.week) return 0;
    if (newestFirst) return left.week < right.week ? 1 : -1;
    return left.week < right.week ? -1 : 1;
  });
  return readings;
}
