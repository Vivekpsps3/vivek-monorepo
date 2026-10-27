export type Kind = 'movie' | 'tv' | 'book' | 'game' | 'artist' | 'album' | 'track';
export const kinds: {
    value: Kind;
    label: string;
}[] = [
    { value: 'movie', label: 'Movies' }, { value: 'tv', label: 'Series' }, { value: 'book', label: 'Books' },
    { value: 'game', label: 'Games' }, { value: 'artist', label: 'Artists' }, { value: 'album', label: 'Albums' }, { value: 'track', label: 'Songs' },
];
export interface Lifecycle {
    state: string;
    freshness: string;
    fetched_at?: string | null;
    completeness: string;
}
export interface MediaCard {
    id: number;
    kind: Kind;
    title: string;
    creator: string | null;
    year: number | null;
    artwork_url: string | null;
    status: string;
    favorite: boolean;
    rating: number | null;
    saved_count?: number;
    progress_label?: string | null;
    lifecycle?: Lifecycle;
    caught_up?: boolean;
    metadata_incomplete?: boolean;
}
export interface Episode {
    id: number;
    season_number: number;
    episode_number: number;
    title: string | null;
    air_date: string | null;
    watched: boolean;
    watched_on: string | null;
    released: boolean;
}
export interface Season {
    season_number: number;
    episode_count: number;
    watched: boolean;
    rating: number | null;
    manual: boolean;
}
export interface MusicChild extends MediaCard {
    catalog_id: number;
}
export interface Detail extends MediaCard {
    updated_at: string;
    review_updated_at: string | null;
    catalog: {
        source: string;
        source_id: string | null;
        overview: string | null;
        extra: Record<string, unknown>;
        genres: string[];
        external_ratings: {
            label: string;
            value: number;
            scale: string;
        }[];
    };
    review: string | null;
    summary: string | null;
    favorite: boolean;
    anticipated: boolean;
    progress_value: number | null;
    progress_unit: string | null;
    tags: string[];
    portrait: {
        source_url: string;
        creator: string;
        license: string;
        crop: number[] | null;
    } | null;
    show: {
        episodes: Episode[];
        seasons: Season[];
        caught_up: boolean;
        metadata_incomplete: boolean;
        next_episode: Episode | null;
        upcoming_episodes: Episode[];
        watched_count: number;
        episode_count: number;
    } | null;
    music: {
        saved_children?: MusicChild[];
        albums?: unknown[];
    } | null;
    operation?: {
        operation_token: string | null;
        changed_ids: number[];
        eligible_count: number;
        cutoff: string;
    };
    undo?: {
        conflict_ids: number[];
        undone_ids: number[];
    };
}
export interface SearchHit {
    source: string;
    source_id: string;
    kind: Kind;
    title: string;
    year?: number;
    creator?: string;
    artwork_url?: string | null;
    already_saved?: boolean;
    saved_id?: number;
    extra?: {
        lifecycle?: string;
    };
}
export interface SourceState {
    id: string;
    state: string;
    kinds: string[];
    coverage: string;
    reason: string | null;
    cached: boolean;
    fetched_at?: string;
    retryable: boolean;
}
export interface SearchResponse {
    results: SearchHit[];
    sources: SourceState[];
    partial: boolean;
    total: number;
    offset: number;
    has_more: boolean;
}
export interface LibraryResponse {
    items: MediaCard[];
    total: number;
    offset: number;
    limit: number;
    has_more: boolean;
}
export interface NextEpisode {
    entry_id: number;
    episode_id: number;
    show_title: string;
    season: number;
    episode: number;
    title: string;
    air_date: string;
    state: string;
}
export interface Photo {
    source_id: string;
    title: string;
    thumbnail: string;
    source_url: string;
    creator: string;
    license: string;
}
export function errorCopy(error: unknown): string {
    const response = error as {
        error?: {
            message?: string;
            detail?: string;
            request_id?: string;
        };
    };
    const payload = response?.error;
    const copy = payload?.message || (typeof payload?.detail === 'string' ? payload.detail : 'This could not finish. Your changes are still here. Try again.');
    return copy + (payload?.request_id ? ' Reference: ' + payload.request_id : '');
}
export function statusLabel(value: string): string { return ({ want: 'Want to', in_progress: 'In progress', completed: 'Completed', anticipating: 'Anticipating', following: 'Following', unfollowed: 'Unfollowed', paused: 'Paused', dropped: 'Dropped' } as Record<string, string>)[value] || value; }
