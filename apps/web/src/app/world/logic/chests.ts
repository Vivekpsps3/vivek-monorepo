import { WORLD_COPY, type ChestOverlay, type WeekChest } from '../world.types';

export type BudgetView =
  | { status: 'loading' }
  | { status: 'locked' }
  | { status: 'no_plan' }
  | { status: 'no_data' }
  | { status: 'unavailable' }
  | { status: 'ready'; weeks: readonly { weekStart: string; kept: boolean | null }[] }
  | { status: 'cleared' };

function blank(loadedWeeks: readonly string[]): WeekChest[] {
  return loadedWeeks.map((week) => ({ week, visual: 'none', line: null }));
}

function quiet(loadedWeeks: readonly string[]): ChestOverlay {
  return { weeks: blank(loadedWeeks), toolbar: null, retry: false };
}

export function chestOverlay(
  view: BudgetView,
  loadedWeeks: readonly string[],
  currentWeek: string,
  previous?: ChestOverlay,
): ChestOverlay {
  switch (view.status) {
    case 'loading':
      return previous ?? quiet(loadedWeeks);
    case 'cleared':
      return quiet(loadedWeeks);
    case 'locked':
      return {
        weeks: loadedWeeks.map((week) => (
          week === currentWeek
            ? { week, visual: 'none', line: null }
            : { week, visual: 'sealed', line: null }
        )),
        toolbar: { href: WORLD_COPY.unlockHref, label: WORLD_COPY.unlock },
        retry: false,
      };
    case 'no_plan':
      return {
        weeks: blank(loadedWeeks),
        toolbar: { href: WORLD_COPY.setPlanHref, label: WORLD_COPY.setPlan },
        retry: false,
      };
    case 'no_data':
      return {
        weeks: blank(loadedWeeks),
        toolbar: { href: WORLD_COPY.reviewSpendingHref, label: WORLD_COPY.reviewSpending },
        retry: false,
      };
    case 'unavailable':
      return { weeks: blank(loadedWeeks), toolbar: null, retry: true };
    case 'ready': {
      const keptByWeek = new Map<string, boolean | null>();
      for (const row of view.weeks) keptByWeek.set(row.weekStart, row.kept);
      return {
        weeks: loadedWeeks.map((week) => {
          if (week === currentWeek) return { week, visual: 'none', line: null };
          const kept = keptByWeek.get(week);
          if (kept === true) return { week, visual: 'gold', line: WORLD_COPY.withinPlan };
          if (kept === false) return { week, visual: 'none', line: WORLD_COPY.overPlan };
          return { week, visual: 'none', line: null };
        }),
        toolbar: null,
        retry: false,
      };
    }
    default: {
      const unexpected: never = view;
      return unexpected;
    }
  }
}
