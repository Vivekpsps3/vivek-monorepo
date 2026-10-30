import { WORLDGEN_VERSION } from './constants';
import { fnv1a64, seed32 } from './fnv1a64';

export const worldSeed = (userId: number): number =>
  seed32(fnv1a64(`world|v${WORLDGEN_VERSION}|user|${userId}`));
