export interface BookCard {
  id: number;
  status?: string;
  title?: string;
  creator?: string | null;
  progress_label?: string | null;
  author?: { id?: string | null; name?: string | null } | null;
  series?: { id?: string | null; name?: string | null } | null;
  note?: string | null;
}

export interface BookLink {
  id: string | null;
  linked: boolean;
  text: string;
}

export interface BookBlock {
  type: "series" | "author" | "book";
  id: string;
  label: string;
  books: BookCard[];
}

export interface BookShelfView {
  id: string;
  label: string;
  empty: string;
  books: BookCard[];
  blocks: BookBlock[];
}

export function bookShelfId(status: string): string;

export function bookAuthorLine(card: BookCard | null | undefined): BookLink;

export function bookSeriesLine(
  card: BookCard | null | undefined,
): { id: string; text: string } | null;

export function bookProgressFact(card: BookCard | null | undefined): string;

export function noteExcerpt(value: unknown): string | null;

export function visibleShelves(
  items: BookCard[] | null | undefined,
  status?: string,
): BookShelfView[];
