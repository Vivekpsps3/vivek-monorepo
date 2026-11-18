export const DEFAULT_SORT: string;
export interface LibraryFilters {
  q: string;
  kind: string;
  status: string;
  sort: string;
  favorite: boolean;
  tags: string[];
}
export interface ParamMapLike {
  get(key: string): string | null;
  getAll(key: string): string[];
}
export declare function readFilters(paramMap: ParamMapLike): LibraryFilters;
export declare function filterCount(f: LibraryFilters): number;
export declare function filterLabel(n: number): string;
export declare function toQueryParams(f: LibraryFilters): {
  q: string | null;
  kind: string | null;
  status: string | null;
  sort: string;
  fav: number | null;
  tag: string[] | null;
  offset: null;
  expanded: null;
  group: null;
};
export declare function tagOptions(
  available: string[] | undefined,
  selected: string[],
): string[];
export declare function isFiltered(f: LibraryFilters): boolean;
export type CollectionKey = "movie" | "tv" | "book" | "music" | "game" | "all";
export interface StatusChoice {
  value: string;
  label: string;
}
export interface LibraryCopy {
  title: string;
  message: string;
}
export interface LibraryView {
  kind: string;
  status: string;
}
export interface LibraryTransition {
  kind: string;
  status: string;
  notice: string;
  redirect: boolean;
  kindChange: boolean;
}
export interface CollectionQuery {
  q: string | null;
  kind: string | null;
  status: string | null;
  sort: string | null;
  fav: number | null;
  tag: string[] | null;
  offset: null;
  expanded: null;
  group: null;
}
export interface MusicView {
  kind: string;
  label: string;
}
export interface SectionLink {
  label: string;
  link: string;
  ariaLabel?: string;
  exact?: boolean;
  also?: readonly string[];
}
export declare function collectionHref(kind: string): string;
export declare function collectionKey(kind: string): CollectionKey;
export declare function collectionSummary(kind: string): string;
export declare function normalizationNotice(kind: string, status: string): string;
export declare function emptyLibraryCopy(kind: string, filtered: boolean): LibraryCopy;
export declare function statusChoices(kind: string): StatusChoice[];
export declare const MUSIC_VIEWS: readonly MusicView[];
export declare function collectionQuery(filters: LibraryFilters, kind: string): CollectionQuery;
export declare function libraryTransition(
  previous: LibraryView | null,
  next: LibraryFilters,
): LibraryTransition;
export declare function mediaSectionLinks<T extends SectionLink>(
  url: string,
  sections: readonly T[],
): T[];
