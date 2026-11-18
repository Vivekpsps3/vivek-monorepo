export interface FilmShelf {
  tone: string;
  fact: string;
  viewedOn: string | null;
}

export interface SeriesShelf {
  lifecycle: string;
  lifecycleLabel: string;
  progress: string;
  fact: string;
}

export function recordedViewing(value: unknown): string | null;

export function filmShelf(status: string, viewedOn?: string | null): FilmShelf;

export function seriesShelf(card: {
  caught_up?: boolean;
  lifecycle?: { state?: string; raw_value?: string | null };
  continuation?: {
    state?: string;
    season?: number;
    episode?: number;
  } | null;
}): SeriesShelf;
