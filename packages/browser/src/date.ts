/**
 * Typed entry for the shared date module. The implementation lives in
 * runtime/date.mjs, which re-exports runtime/today.mjs (PR #8).
 */
export {
  WEEK_STARTS_ON,
  browserTimeZone,
  daysBetweenDateOnly,
  formatDate,
  formatDateRange,
  isoDateInZone,
  isOnOrBeforeToday,
  localTodayIso,
  parseDateOnly,
  todayIsoDate,
  weekStartIndex,
} from '../runtime/date.mjs';

export type DateStyle = 'table' | 'heading' | 'timestamp' | 'time' | 'month' | 'range';
