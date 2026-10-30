export function canonical(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    return '{' + Object.keys(obj).sort().filter((k) => obj[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
  }
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error('canonical: non-integer number');
    return String(v);
  }
  return JSON.stringify(v);
}
