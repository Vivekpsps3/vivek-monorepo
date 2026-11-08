/**
 * Town story run, in weeks, from streaks Town already computed.
 * A day streak contributes a whole week for every 7 days. This is not a Finance count.
 */
export function weeksKeptRun(
  habits: readonly { streak: { unit: 'days' | 'weeks'; current: number } }[],
): number {
  let best = 0;
  for (const habit of habits) {
    const current = habit.streak.current;
    if (!Number.isFinite(current) || current <= 0) continue;
    const weeks = habit.streak.unit === 'weeks' ? Math.floor(current) : Math.floor(current / 7);
    if (weeks > best) best = weeks;
  }
  return best;
}
