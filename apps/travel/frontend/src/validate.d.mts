export function balanceError(value: unknown): string;
export function accrualError(value: unknown): string;
export function requiredText(value: unknown, sentence: string): string;
export function dateOrderError(start: string, end: string, sentence: string): string;
export function ptoDaysError(value: unknown): string;
export function fieldErrors(kind: string, data?: Record<string, unknown>): Record<string, string>;
export function formError(kind: string, data?: Record<string, unknown>): { name: string; message: string } | null;
