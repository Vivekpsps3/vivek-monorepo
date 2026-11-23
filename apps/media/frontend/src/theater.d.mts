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

export interface ShelfContinuation {
  episode_id: number;
  season: number;
  episode: number;
  title: string | null;
  air_date: string | null;
  state: "next" | "upcoming";
}

export function continuationFromShow(show: {
  next_episode?: {
    id?: number;
    season_number?: number;
    episode_number?: number;
    title?: string | null;
    air_date?: string | null;
    released?: boolean;
  } | null;
  upcoming_episodes?: {
    id?: number;
    season_number?: number;
    episode_number?: number;
    title?: string | null;
    air_date?: string | null;
    released?: boolean;
  }[] | null;
} | null | undefined): ShelfContinuation | null;

export function showContinuation(card: {
  continuation?: ShelfContinuation | null;
} | null | undefined): ShelfContinuation | null;

export function progressKey(card: {
  watched_count?: number;
  caught_up?: boolean;
  continuation?: {
    episode_id?: number;
    state?: string;
    season?: number;
    episode?: number;
  } | null;
} | null | undefined): string;

export function progressKeyFromShow(show: {
  watched_count?: number;
  caught_up?: boolean;
  next_episode?: {
    id?: number;
    season_number?: number;
    episode_number?: number;
    title?: string | null;
    air_date?: string | null;
    released?: boolean;
  } | null;
  upcoming_episodes?: {
    id?: number;
    season_number?: number;
    episode_number?: number;
    title?: string | null;
    air_date?: string | null;
    released?: boolean;
  }[] | null;
} | null | undefined): string;

export interface EpisodeSeat {
  id: number;
  season: number;
  episode: number;
  title: string | null;
  airDate: string | null;
  watchedOn: string | null;
  place: string;
  label: string;
  code: string;
}

export interface SeatingRow {
  season: number;
  label: string;
  seats: EpisodeSeat[];
}

export function episodeSeat(
  episode: {
    id?: number;
    season_number?: number;
    episode_number?: number;
    title?: string | null;
    air_date?: string | null;
    watched?: boolean;
    watched_on?: string | null;
    released?: boolean;
  } | null | undefined,
  nextId?: number | null,
): EpisodeSeat | null;

export function seatingRows(
  episodes: Parameters<typeof episodeSeat>[0][] | null | undefined,
  nextId?: number | null,
): SeatingRow[];
