export interface AddInput {
  title: string;
  kind: string;
  year: number | string | null;
}
export interface AddErrors {
  title?: string;
  kind?: string;
  year?: string;
}
export const FIELD_ORDER: string[];
export declare function validateAdd(input: AddInput): AddErrors;
