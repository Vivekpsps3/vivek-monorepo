export const SOON_DAYS: number;
export interface ReminderLike {
  id: number;
  due_at: string | null;
  done: boolean;
}
export function groupReminders<T extends ReminderLike>(
  list: readonly T[],
  nowIso: string,
): { soon: T[]; later: T[]; done: T[] };
export function isOverdue(reminder: ReminderLike, nowIso: string): boolean;
export function dueParts(
  dueAt: string | null | undefined,
): { date: string; time: string | null } | null;
export function validateTitle(text: string): string | null;
