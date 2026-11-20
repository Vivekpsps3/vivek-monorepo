import { ChangeDetectionStrategy, Component, afterRenderEffect, effect, input, output, signal } from '@angular/core';
import { UiButtonComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective } from '@vivek/ui';
import {
  EMPTY_HEALTH_DRAFT,
  firstHealthField,
  healthFieldId,
  healthFieldMessage,
  parseHealthNumber,
  type HealthDraft,
} from './health-entry';
import type { HealthPr, HealthStat } from './health.types';
import { validateHealthPr, validateHealthStat, type FieldErrors } from './health-validate';

export type HealthEntryValue = HealthStat | HealthPr;

@Component({
  selector: 'app-health-entry-dialog',
  imports: [UiButtonComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective],
  templateUrl: './health-entry-dialog.component.html',
  styleUrl: './health-entry-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HealthEntryDialogComponent {
  readonly open = input(false);
  readonly room = input.required<'clinic' | 'gym'>();
  readonly today = input.required<string>();
  readonly weightUnit = input<'kg' | 'lb'>('lb');
  readonly draft = input<HealthDraft>(EMPTY_HEALTH_DRAFT);
  readonly formError = input('');
  readonly busy = input(false);
  readonly draftChange = output<HealthDraft>();
  readonly save = output<HealthEntryValue>();
  readonly closed = output<void>();
  readonly errors = signal<FieldErrors>({});
  protected readonly local = signal<HealthDraft>(EMPTY_HEALTH_DRAFT);
  protected readonly message = healthFieldMessage;

  constructor() {
    effect(() => {
      this.local.set(this.draft());
    });
    afterRenderEffect(() => {
      if (!this.open()) return;
      const field = firstHealthField(this.errors(), this.room());
      if (!field) return;
      document.getElementById(healthFieldId(field))?.focus();
    });
  }

  protected weightLabel(): string {
    return `Weight (${this.weightUnit()})`;
  }

  protected onMeasured(event: Event): void {
    this.patch({ measuredOn: this.text(event) });
  }

  protected onWeight(event: Event): void {
    this.patch({ weight: this.text(event) });
  }

  protected onExercise(event: Event): void {
    this.patch({ exercise: this.text(event) });
  }

  protected onReps(event: Event): void {
    this.patch({ reps: this.text(event) });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    const draft = this.local();
    const today = this.today();
    const weight = parseHealthNumber(draft.weight);
    const result = this.room() === 'clinic'
      ? validateHealthStat({
        v: 1,
        kind: 'weight',
        measured_on: draft.measuredOn,
        logged_on: today,
        kg: weight,
      }, today, this.weightUnit())
      : validateHealthPr({
        v: 1,
        kind: 'lift',
        measured_on: draft.measuredOn,
        logged_on: today,
        exercise: draft.exercise,
        kg: weight,
        reps: parseHealthNumber(draft.reps),
      }, today, this.weightUnit());
    this.errors.set(result.fieldErrors);
    if (Object.keys(result.fieldErrors).length > 0) return;
    this.save.emit(result.value);
  }

  protected onClosed(): void {
    this.errors.set({});
    this.closed.emit();
  }

  private patch(change: Partial<HealthDraft>): void {
    const next = { ...this.local(), ...change };
    this.local.set(next);
    this.draftChange.emit(next);
  }

  private text(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }
}
