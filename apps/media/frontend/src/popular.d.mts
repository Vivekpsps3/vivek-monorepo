import type { SearchHit } from "./media.models";

export const ART_HOSTS: string[];
export declare function safeArt(url: string | null | undefined): string | null;
export declare function cleanPopular(rows: unknown): SearchHit[];
export declare function popularError(status: number): string;
