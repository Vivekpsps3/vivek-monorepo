import { isoMonday } from './paging';

export type ConceptEdit =
  | { kind: 'text' }
  | { kind: 'archive' }
  | { kind: 'weeks'; weeks: readonly string[] };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function weeksToRegenerate(edit: ConceptEdit): readonly string[] {
  if (edit.kind === 'text' || edit.kind === 'archive') return [];
  const seen = new Set<string>();
  const mondays: string[] = [];
  for (const raw of edit.weeks) {
    if (raw === '' || !ISO_DAY.test(raw)) continue;
    const monday = isoMonday(raw);
    if (seen.has(monday)) continue;
    seen.add(monday);
    mondays.push(monday);
  }
  return mondays;
}
