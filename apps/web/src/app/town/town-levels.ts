import { TREASURY_WEEKS } from './town.constants';

export function level(xp: number, table: readonly number[]): number {
  for (let index = table.length - 1; index >= 0; index--) {
    if (xp >= table[index]) return index + 1;
  }
  throw new RangeError('xp is below every threshold');
}

export function stage(level: number): 1 | 2 | 3 {
  return level <= 1 ? 1 : level <= 3 ? 2 : 3;
}

export function levelProgress(
  xp: number, table: readonly number[],
): { level: number; start: number; next: number | null } {
  const current = level(xp, table);
  return {
    level: current,
    start: table[current - 1],
    next: current < table.length ? table[current] : null,
  };
}

export function treasuryTier(weeksKept: number): number {
  return level(weeksKept, TREASURY_WEEKS);
}

/**
 * Unlocked treasury. The level is the habit-week tier from TREASURY_WEEKS, not the town level.
 * The stage is the same sprite stage the world paints.
 */
export function treasuryUnlocked(weeksKept: number): { level: number; stage: 1 | 2 | 3 } {
  const weeks = Number.isFinite(weeksKept) && weeksKept > 0 ? Math.floor(weeksKept) : 0;
  const tier = treasuryTier(weeks);
  return { level: tier, stage: stage(tier) };
}
