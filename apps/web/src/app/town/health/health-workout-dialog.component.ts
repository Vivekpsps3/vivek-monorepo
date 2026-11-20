import { ChangeDetectionStrategy, Component, afterRenderEffect, effect, input, output, signal } from '@angular/core';
import { UiButtonComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective } from '@vivek/ui';
import type { HealthUnits } from './health-entry';
import {
  EXERCISE_TYPES,
  SET_TYPES,
  emptyWorkoutDraft,
  exerciseTypeLabel,
  firstWorkoutField,
  workoutFieldId,
  workoutFieldMessage,
  workoutFromDraft,
  validateWorkoutRecord,
  type ExerciseType,
  type SetType,
  type WorkoutDraft,
  type WorkoutRecord,
} from './workout';
import type { FieldErrors } from './health-validate';

@Component({
  selector: 'app-health-workout-dialog',
  imports: [UiButtonComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective],
  templateUrl: './health-workout-dialog.component.html',
  styleUrl: './health-workout-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HealthWorkoutDialogComponent {
  readonly open = input(false);
  readonly today = input.required<string>();
  readonly units = input.required<HealthUnits>();
  readonly draft = input<WorkoutDraft>(emptyWorkoutDraft('exercise', ''));
  readonly customExerciseCount = input(0);
  readonly formError = input('');
  readonly busy = input(false);
  readonly draftChange = output<WorkoutDraft>();
  readonly save = output<WorkoutRecord>();
  readonly closed = output<void>();
  readonly errors = signal<FieldErrors>({});
  protected readonly local = signal<WorkoutDraft>(emptyWorkoutDraft('exercise', ''));
  protected readonly types = EXERCISE_TYPES;
  protected readonly setTypes = SET_TYPES;
  protected readonly typeLabel = exerciseTypeLabel;
  protected setLabel(type: SetType): string {
    if (type === 'warmup') return 'Warm-up';
    if (type === 'drop') return 'Drop';
    return 'Work';
  }
  protected readonly message = workoutFieldMessage;
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
      const field = firstWorkoutField(this.errors(), this.local().kind);
      if (field) {
        document.getElementById(workoutFieldId(field))?.focus();
        return;
      }
      const message = this.formError();
      if (!message) {
        this.formErrorSeen = '';
        return;
      }
      if (message === this.formErrorSeen) return;
      this.formErrorSeen = message;
      document.getElementById('health-workout-error')?.focus();
    });
  }

  protected heading(): string {
    switch (this.local().kind) {
      case 'exercise': return 'Add exercise';
      case 'routine': return 'Add routine';
      case 'session': return 'Add session';
    }
  }

  protected usesLoad(): boolean {
    const type = this.local().exerciseType;
    return type === 'load-reps' || type === 'assisted-reps';
  }

  protected usesReps(): boolean {
    const type = this.local().exerciseType;
    return type === 'load-reps' || type === 'assisted-reps' || type === 'bodyweight-reps';
  }

  protected usesTime(): boolean {
    const type = this.local().exerciseType;
    return type === 'time-distance' || type === 'time-only';
  }

  protected usesDistance(): boolean {
    return this.local().exerciseType === 'time-distance';
  }

  protected loadLabel(): string {
    const unit = this.units().weight;
    return this.local().exerciseType === 'assisted-reps' ? `Assistance (${unit})` : `Load (${unit})`;
  }

  protected onName(event: Event): void {
    this.patch({ name: this.text(event) });
  }

  protected onMeasured(event: Event): void {
    this.patch({ measuredOn: this.text(event) });
  }

  protected onType(event: Event): void {
    const value = this.text(event);
    if ((EXERCISE_TYPES as readonly string[]).includes(value)) this.patch({ exerciseType: value as ExerciseType });
  }

  protected onSetType(event: Event): void {
    const value = this.text(event);
    if ((SET_TYPES as readonly string[]).includes(value)) this.patch({ setType: value as SetType });
  }

  protected onState(event: Event): void {
    const value = this.text(event);
    if (value === 'draft' || value === 'completed') this.patch({ state: value });
  }

  protected onLoad(event: Event): void {
    this.patch({ load: this.text(event) });
  }

  protected onReps(event: Event): void {
    this.patch({ reps: this.text(event) });
  }

  protected onSeconds(event: Event): void {
    this.patch({ seconds: this.text(event) });
  }

  protected onDistance(event: Event): void {
    this.patch({ distance: this.text(event) });
  }

  protected onNote(event: Event): void {
    this.patch({ note: this.text(event) });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    const draft = this.local();
    const result = validateWorkoutRecord(
      workoutFromDraft(draft, this.today(), this.units()),
      this.customExerciseCount(),
      this.today(),
    );
    this.errors.set(result.fieldErrors);
    this.draftChange.emit(draft);
    if (Object.keys(result.fieldErrors).length > 0) return;
    this.save.emit(result.value);
  }

  protected onClosed(): void {
    this.errors.set({});
    this.closed.emit();
  }

  private patch(change: Partial<WorkoutDraft>): void {
    const next = { ...this.local(), ...change };
    this.local.set(next);
    this.errors.set({});
    this.draftChange.emit(next);
  }

  private text(event: Event): string {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return target.value;
    }
    return '';
  }
}
