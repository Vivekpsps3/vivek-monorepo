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
};
export declare function tagOptions(
  available: string[] | undefined,
  selected: string[],
): string[];
export declare function isFiltered(f: LibraryFilters): boolean;
