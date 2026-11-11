import type { Injector } from '@angular/core';
import { financeVaultPresent } from '../../../../../finance/frontend/src/public-api';
import { computeHealthXp, computePrEvents } from './health-math';
import { HEALTH_LOAD_DEADLINE_MS, HealthStoreService, type HealthLoadResult } from './health-store.service';

/**
 * The Town Health public barrel (§22.3). This is the only export surface:
 * Worldgen and the Town screens ask for stages, never for records.
 *
 * "No numbers" (§22.3) is read as: no XP, levels, counts or record values
 * cross this barrel. The stage (1|2|3) is required to pick the
 * clinic-{stage} / gym-{stage} sprites. That reading is on the tech lead's
 * gaps list; it is implemented as specified in the THC2 packaging rule.
 */
export type TownHealthStages =
  | { state: 'locked' }
  | { state: 'unavailable' }
  | { state: 'ready'; clinic: 1 | 2 | 3; gym: 1 | 2 | 3 };

export async function loadTownHealthStages(
  injector: Injector,
  signal: AbortSignal,
  opts?: { deadlineMs?: number },
): Promise<TownHealthStages> {
  // Locked first: no vault crypto is imported or touched on this path.
  if (!financeVaultPresent()) return { state: 'locked' };
  if (signal.aborted) return { state: 'unavailable' };
  const deadlineMs = opts?.deadlineMs ?? HEALTH_LOAD_DEADLINE_MS;
  const store = injector.get(HealthStoreService);
  let result: HealthLoadResult;
  try {
    result = await store.load({ deadlineMs, signal });
  } catch {
    return { state: 'unavailable' };
  }
  if (result.state === 'locked') return { state: 'locked' };
  if (signal.aborted || result.state !== 'ready') return { state: 'unavailable' };
  const events = computePrEvents(result.prs.map(entry => entry.value));
  const xp = computeHealthXp(
    result.stats.map(entry => entry.value),
    result.prs.map(entry => entry.value),
    events,
  );
  return { state: 'ready', clinic: xp.clinic.stage, gym: xp.gym.stage };
}
