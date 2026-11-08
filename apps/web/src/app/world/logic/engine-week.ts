import type { ApiHabit, ApiWeek } from '../engine/types';
import type { WorldHabit, WorldPlace, WorldWeek } from '../world.types';

function placeOf(place: WorldPlace | null): { label: string; lat_e2: number | null } | null {
  if (!place) return null;
  return { label: place.label, lat_e2: place.lat_e2 };
}

function habitOf(habit: WorldHabit): ApiHabit {
  return {
    habit_id: habit.habit_id,
    style: habit.style,
    days: habit.days.slice(),
    archived: habit.archived,
  };
}

/** Engine input for one week. Titles and names stay out of the returned object. */
export function engineWeek(week: WorldWeek): ApiWeek {
  const api: ApiWeek = {
    week: week.week,
    trips: week.trips.map((trip) => ({
      id: trip.id,
      start: trip.start,
      end: trip.end,
      place: placeOf(trip.place),
    })),
    finished: week.finished.map((item) => ({
      entry_id: item.entry_id,
      kind: item.kind,
      on: item.on,
    })),
    habits: week.habits.map(habitOf),
    concepts: week.concepts.map((concept) => ({
      id: concept.id,
      on: concept.on,
    })),
  };
  if (week.finished_more !== undefined) api.finished_more = week.finished_more;
  return api;
}
