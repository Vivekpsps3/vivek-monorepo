export const RELATED_KINDS: string[];
export const RELATED_ATTEMPT_LIMIT: number;
export interface RelatedNode {
  title: string;
  relation: string;
  year: number | null;
}
export declare function relationLabel(relation: string): string;
export declare function relatedHref(node: { title: string }): string;
export declare function cleanNodes(nodes: unknown): RelatedNode[];
