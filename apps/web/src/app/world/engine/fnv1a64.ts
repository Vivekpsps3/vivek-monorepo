const MASK64 = (1n << 64n) - 1n;

export function fnv1a64(str: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(str)) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & MASK64;
  }
  return h;
}

export const hex64 = (h: bigint): string => h.toString(16).padStart(16, '0');

export const seed32 = (h: bigint): number => Number((h ^ (h >> 32n)) & 0xffffffffn);
