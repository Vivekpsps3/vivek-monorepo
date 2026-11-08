import type { LitSummary } from '../world.types';
import { addIsoDays } from './paging';

const OFF = '0';

export function fogStorageKey(userId: number): string {
  return `world.fog.v1.${userId}`;
}

export function readFogEnabled(userId: number, storage?: Pick<Storage, 'getItem'> | null): boolean {
  if (!storage) return true;
  try {
    const value = storage.getItem(fogStorageKey(userId));
    if (value === null || value === '') return true;
    return value !== OFF && value !== 'false';
  } catch {
    return true;
  }
}

export function writeFogEnabled(
  userId: number,
  enabled: boolean,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(fogStorageKey(userId), enabled ? '1' : OFF);
  } catch {
    // Storage can be missing or full. Fog stays at its default on the next read.
  }
}

/** One flag per day. True means draw fog. District and sea are not days. */
export function fogMask(
  chunkLit: readonly boolean[],
  week: string,
  currentWeek: string,
  today: string,
): boolean[] {
  const mask: boolean[] = [];
  for (let index = 0; index < 7; index += 1) {
    const lit = chunkLit[index] === true;
    const date = addIsoDays(week, index);
    const future = week === currentWeek && date > today;
    mask.push(!lit || future);
  }
  return mask;
}

export function litSummary(
  weeks: readonly { week: string; lit: boolean[] }[],
  startWeek: string,
  fullyPaged: boolean,
): LitSummary {
  let lit = 0;
  let total = 0;
  let since = startWeek;
  let seen = false;
  for (const entry of weeks) {
    if (!seen || entry.week < since) since = entry.week;
    seen = true;
    for (const day of entry.lit) {
      total += 1;
      if (day) lit += 1;
    }
  }
  return { lit, total, since, partial: !fullyPaged };
}
