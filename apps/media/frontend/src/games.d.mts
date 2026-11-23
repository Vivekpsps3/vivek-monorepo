export interface GameCard {
  id?: number;
  kind?: string;
  status?: string;
  progress_value?: number | null;
  progress_unit?: string | null;
  progress_label?: string | null;
  /** Server fact. Absent means derive it from status and progress. */
  unopened?: boolean;
}

export interface GameBay<T> {
  id: string;
  status: string;
  label: string;
  empty: string;
  games: T[];
}

export function gameStateOptions(): { value: string; label: string }[];

export function gameStatusWords(status: string): string;

export function gameProgressWords(
  card: GameCard | null | undefined,
): string;

export function unopenedCabinet(card: GameCard | null | undefined): boolean;

export function visibleBays<T extends { status?: string }>(
  items: readonly T[] | null | undefined,
  status?: string,
): GameBay<T>[];
