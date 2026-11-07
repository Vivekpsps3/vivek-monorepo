export const MAX_TAGS: number;
export const MAX_TAG_LENGTH: number;
export interface AddTagResult {
  tags: string[];
  error: string;
  existing?: string;
}
export declare function cleanTag(raw: string): string;
export declare function addTag(tags: string[], raw: string): AddTagResult;
export declare function removeTag(tags: string[], index: number): string[];
export declare function normaliseTags(tags: string[]): string[];
