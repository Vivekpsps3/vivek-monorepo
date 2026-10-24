import { FieldIssue } from '@vivek/browser';

/** Inline dialog save failure. The draft stays open and this alert receives focus. */
export function dialogSaveAlert(): string {
  return "Couldn't save. Something went wrong. Try again.";
}

export function fieldMessage(errors: FieldIssue[], field: string): string | null {
  return errors.find(error => error.field === field)?.message ?? null;
}

export function errorSummary(errors: FieldIssue[]): string {
  if (!errors.length) return '';
  const noun = errors.length === 1 ? 'field' : 'fields';
  return `Fix ${errors.length} ${noun} to save: ${errors.map(error => error.label).join(', ')}`;
}

export function focusFirstInvalid(root: ParentNode | null | undefined): void {
  const target = root?.querySelector<HTMLElement>('[aria-invalid="true"], [data-field-invalid="true"]');
  target?.focus();
}

export function focusField(root: ParentNode | null | undefined, field: string): void {
  const target = root?.querySelector<HTMLElement>(`[data-field="${field}"]`);
  target?.focus();
}

export function focusErrorSummary(root: ParentNode | null | undefined): void {
  root?.querySelector<HTMLElement>('[data-error-summary]')?.focus();
}

export function focusDialogAlert(root: ParentNode | null | undefined): void {
  const start = root instanceof Element ? root : document.body;
  const host = start.closest('ui-dialog, [role="dialog"]') ?? start;
  host.querySelector<HTMLElement>('[data-dialog-alert]')?.focus();
}
