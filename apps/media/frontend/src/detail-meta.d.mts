export interface MetaEntry {
  kind: string;
  year?: number | null;
  creator?: string | null;
  status?: string;
}
export interface StatusChoice {
  value: string;
  label: string;
}
export interface MoreFields {
  anticipated?: boolean;
  progress?: number | null;
  unit?: string;
}
export declare function kindIcon(kind: string): string;
export declare function kindLabel(kind: string): string;
export declare function stateLabel(status: string, kind?: string): string;
export declare function statusChoices(kind: string): StatusChoice[];
export declare function statusFieldLabel(kind: string): string;
export declare function metaChips(entry: MetaEntry): string[];
export declare function artRatio(): string;
export declare function experienceTitle(kind: string): string;
export declare function aboutSummary(kind: string): string;
export declare function progressPrimary(kind: string): boolean;
export declare function showsGenericProgress(kind: string): boolean;
export declare function showsAnticipated(kind: string): boolean;
export declare function moreSummary(kind: string): string;
export declare function needsMoreOpen(kind: string, fields: MoreFields): boolean;
export declare function dateOnly(value: string | null | undefined): string;
export declare function episodeDateLine(
  airLabel: string,
  watchedLabel: string,
): string;
export declare function placeholderLetter(title: string): string;
export declare function episodeCode(season: number, episode: number): string;
export declare function toggleLabel(season: number, episode: number): string;
