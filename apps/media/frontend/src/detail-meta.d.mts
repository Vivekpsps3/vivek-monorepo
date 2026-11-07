export interface MetaEntry {
  kind: string;
  year?: number | null;
  creator?: string | null;
  status?: string;
}
export declare function kindIcon(kind: string): string;
export declare function kindLabel(kind: string): string;
export declare function stateLabel(status: string): string;
export declare function metaChips(entry: MetaEntry): string[];
export declare function placeholderLetter(title: string): string;
export declare function episodeCode(season: number, episode: number): string;
export declare function toggleLabel(season: number, episode: number): string;
