export type SourceKind = 'library' | 'travel' | 'memory';
export type SourceState = 'loading' | 'ready' | 'empty' | 'locked' | 'unavailable';

export interface SourceRead {
  readonly status: number;
  readonly body: unknown;
}

const LIBRARY_KEYS = ['currently', 'recent_reviews', 'upcoming', 'next_episodes'] as const;

function locked(status: number): boolean {
  return status === 401 || status === 403 || status === 423;
}

export function classifyLibrary(read: SourceRead | null): SourceState {
  if (read === null) return 'loading';
  if (locked(read.status)) return 'locked';
  if (read.status !== 200 || !read.body || typeof read.body !== 'object' || Array.isArray(read.body)) {
    return 'unavailable';
  }
  const record = read.body as Record<string, unknown>;
  const lists = LIBRARY_KEYS.map(key => record[key]);
  if (lists.some(value => !Array.isArray(value))) return 'unavailable';
  return lists.some(value => (value as unknown[]).length > 0) ? 'ready' : 'empty';
}

export function classifyTravel(read: SourceRead | null): SourceState {
  if (read === null) return 'loading';
  if (locked(read.status)) return 'locked';
  if (read.status !== 200 || !read.body || typeof read.body !== 'object' || Array.isArray(read.body)) {
    return 'unavailable';
  }
  const total = (read.body as { total?: unknown }).total;
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) return 'unavailable';
  return total === 0 ? 'empty' : 'ready';
}

export function classifyMemory(read: SourceRead | null): SourceState {
  if (read === null) return 'loading';
  if (locked(read.status)) return 'locked';
  if (read.status !== 200 || !Array.isArray(read.body)) return 'unavailable';
  return read.body.length === 0 ? 'empty' : 'ready';
}

export function classifySource(kind: SourceKind, read: SourceRead | null): SourceState {
  if (kind === 'library') return classifyLibrary(read);
  if (kind === 'travel') return classifyTravel(read);
  return classifyMemory(read);
}

export function combineSource(parts: readonly SourceState[]): SourceState {
  if (parts.length === 0) return 'unavailable';
  if (parts.some(part => part === 'ready')) return 'ready';
  if (parts.some(part => part === 'loading')) return 'loading';
  if (parts.every(part => part === 'empty')) return 'empty';
  if (parts.every(part => part === 'locked' || part === 'empty') && parts.some(part => part === 'locked')) {
    return 'locked';
  }
  return 'unavailable';
}
