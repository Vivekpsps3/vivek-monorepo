export interface RatingOption {
  value: number;
  label: string;
  ariaLabel: string;
}
export declare function ratingOptions(): RatingOption[];
export declare function segmentValue(r: number | null): number | null;
export declare function halfNote(r: number | null): string;
