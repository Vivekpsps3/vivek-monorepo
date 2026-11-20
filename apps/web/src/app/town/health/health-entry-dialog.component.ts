import { ChangeDetectionStrategy, Component, afterRenderEffect, effect, input, output, signal } from '@angular/core';
import { UiButtonComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective } from '@vivek/ui';
import {
  EMPTY_HEALTH_DRAFT,
  firstHealthField,
  healthFieldId,
  healthFieldMessage,
  parseHealthNumber,
  vitalStatFromDraft,
  type HealthDraft,
  type HealthEditorKind,
} from './health-entry';
import type { HealthPr, HealthStat } from './health.types';
import { validateHealthPr, type FieldErrors } from './health-validate';

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
  readonly kind = input<HealthEditorKind>('weight');
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
  private formErrorSeen = '';

  constructor() {
    effect(() => {
      this.local.set(this.draft());
    });
    afterRenderEffect(() => {
      if (!this.open()) {
        this.formErrorSeen = '';
        return;
      }
      const field = firstHealthField(this.errors(), this.room(), this.kind());
      if (field) {
        document.getElementById(healthFieldId(field))?.focus();
        return;
      }
      const message = this.formError();
      if (!message) {
        this.formErrorSeen = '';
        return;
      }
      if (message === this.formErrorSeen) return;
      this.formErrorSeen = message;
      document.getElementById('health-form-error')?.focus();
    });
  }

  protected heading(): string {
    const editing = this.local().clientId != null;
    switch (this.kind()) {
      case 'weight': return editing ? 'Edit weight' : 'Add weight';
      case 'rhr': return editing ? 'Edit resting heart rate' : 'Add resting heart rate';
      case 'bp': return editing ? 'Edit blood pressure' : 'Add blood pressure';
      case 'sleep': return editing ? 'Edit sleep' : 'Add sleep';
      case 'lift': return 'Add lift';
    }
  }

  protected loggedOn(): string {
    return this.local().loggedOn || this.today();
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

  protected onBpm(event: Event): void {
    this.patch({ bpm: this.text(event) });
  }

  protected onSys(event: Event): void {
    this.patch({ sys: this.text(event) });
  }

  protected onDia(event: Event): void {
    this.patch({ dia: this.text(event) });
  }

  protected onHours(event: Event): void {
    this.patch({ hours: this.text(event) });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    const draft = this.local();
    const today = this.today();
    const result = this.kind() === 'lift'
      ? validateHealthPr({
        v: 1,
        kind: 'lift',
        measured_on: draft.measuredOn,
        logged_on: draft.loggedOn || today,
        exercise: draft.exercise,
        kg: parseHealthNumber(draft.weight),
        reps: parseHealthNumber(draft.reps),
      }, today, this.weightUnit())
      : vitalStatFromDraft({ ...draft, kind: this.kind() }, today, this.weightUnit());
    this.errors.set(result.fieldErrors);
    if (Object.keys(result.fieldErrors).length > 0) {
      this.draftChange.emit(draft);
      return;
    }
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
