import { ChangeDetectionStrategy, Component, afterRenderEffect, effect, input, output, signal } from '@angular/core';
import { UiButtonComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective } from '@vivek/ui';
import {
  EMPTY_HEALTH_DRAFT,
  firstHealthField,
  healthFieldId,
  healthFieldMessage,
  isPrKind,
  prFromDraft,
  vitalStatFromDraft,
  type HealthDraft,
  type HealthEditorKind,
} from './health-entry';
import type { HealthPr, HealthStat } from './health.types';
import type { FieldErrors } from './health-validate';

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
  readonly distanceUnit = input<'km' | 'mi'>('mi');
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
      case 'lab': return editing ? 'Edit lab result' : 'Add lab result';
      case 'checkup': return editing ? 'Edit checkup' : 'Add checkup';
      case 'lift': return editing ? 'Edit lift' : 'Add lift';
      case 'run': return editing ? 'Edit run' : 'Add run';
      case 'other': return editing ? 'Edit record' : 'Add record';
    }
  }

  protected help(): string {
    if (this.kind() === 'lab') {
      return 'Below range, in range, above range, and no range compare this number with the reference you type.';
    }
    if (this.kind() === 'checkup') return 'A checkup is a note saved for this date.';
    return 'Saved values stay in canonical units. This choice only changes how they are shown.';
  }

  protected loggedOn(): string {
    return this.local().loggedOn || this.today();
  }

  protected weightLabel(): string {
    return `Weight (${this.weightUnit()})`;
  }

  protected distanceLabel(): string {
    return `Distance (${this.distanceUnit()})`;
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

  protected onDistance(event: Event): void {
    this.patch({ distance: this.text(event) });
  }

  protected onSeconds(event: Event): void {
    this.patch({ seconds: this.text(event) });
  }

  protected onOtherName(event: Event): void {
    this.patch({ otherName: this.text(event) });
  }

  protected onOtherValue(event: Event): void {
    this.patch({ otherValue: this.text(event) });
  }

  protected onOtherUnit(event: Event): void {
    this.patch({ otherUnit: this.text(event) });
  }

  protected onDirection(event: Event): void {
    const value = this.text(event);
    this.patch({ direction: value === 'higher' || value === 'lower' ? value : '' });
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

  protected onLabName(event: Event): void {
    this.patch({ labName: this.text(event) });
  }

  protected onLabValue(event: Event): void {
    this.patch({ labValue: this.text(event) });
  }

  protected onLabUnit(event: Event): void {
    this.patch({ labUnit: this.text(event) });
  }

  protected onRefLow(event: Event): void {
    this.patch({ refLow: this.text(event) });
  }

  protected onRefHigh(event: Event): void {
    this.patch({ refHigh: this.text(event) });
  }

  protected onNote(event: Event): void {
    this.patch({ note: this.text(event) });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    const draft = { ...this.local(), kind: this.kind() };
    const today = this.today();
    const result = isPrKind(draft.kind)
      ? prFromDraft(draft, today, { weight: this.weightUnit(), distance: this.distanceUnit() })
      : vitalStatFromDraft(draft, today, this.weightUnit());
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
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
      ? target.value
      : '';
  }
}
