export const CAPTURE_KINDS: readonly string[];
export const CAPTURE_RETRY_LIMIT: number;
export declare function kindLabel(kind: string): string;
export declare function selectedKind(value: string | null, manual: boolean): string;
export declare function captureParams(kind: string): { kind?: string };
export declare function addQuery(title: string, kind: string): { title?: string; kind?: string };
export declare function retryOpen(used: number, limit?: number): boolean;
export declare function acceptCaptureResult(
  epoch: number,
  current: number,
  ownsSession: boolean,
): boolean;
export declare function sameProviderIdentity(
  left: { source?: string; source_id?: string } | null,
  right: { source?: string; source_id?: string } | null,
): boolean;
export interface CoverageSource {
  id?: string;
  kinds?: string[];
  state?: string;
  coverage?: string;
  reason?: string | null;
}
export declare function coverageText(source: CoverageSource): string;
