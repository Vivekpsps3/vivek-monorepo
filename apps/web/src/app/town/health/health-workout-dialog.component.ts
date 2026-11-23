import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, afterRenderEffect, effect, input, output, signal } from '@angular/core';
import { UiButtonComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective } from '@vivek/ui';
import type { HealthUnits } from './health-entry';
import {
  EXERCISE_TYPES,
  SET_TYPES,
  activateDraftLine,
  canonicalPreview,
  commitEnteredSet,
  commitExerciseLine,
  emptyWorkoutDraft,
  exerciseTypeLabel,
  firstWorkoutField,
  formatEnteredSet,
  isCustomExerciseId,
  markSetCounted,
  moveDraftSet,
  openCanonicalPreview,
  removeDraftSet,
  retagDraftSet,
  routineTitleError,
  setTypeLabel,
  workoutFieldId,
  workoutFieldMessage,
  workoutFromDraft,
  validateWorkoutRecord,
  type ExerciseType,
  type SetType,
  type WorkoutDefinitionChoice,
  type WorkoutDraft,
  type WorkoutDraftSet,
  type WorkoutRecord,
} from './workout';
import type { FieldErrors } from './health-validate';

interface FloorLineView {
  id: string;
  name: string;
  exerciseType: ExerciseType;
  sets: WorkoutDraftSet[];
  active: boolean;
}

@Component({
  selector: 'app-health-workout-dialog',
  imports: [NgTemplateOutlet, UiButtonComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective],
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
  readonly definitions = input<readonly WorkoutDefinitionChoice[]>([]);
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
  protected readonly setLabel = setTypeLabel;
  protected readonly enteredLabel = formatEnteredSet;
  protected readonly storedLabel = canonicalPreview;
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
    const draft = this.local();
    if (draft.startedFrom !== '' && draft.clientId === '') return 'Start session';
    if (draft.clientId !== '') {
      if (draft.kind === 'session') return draft.state === 'draft' ? 'Resume session' : 'Edit session';
      if (draft.kind === 'exercise') return 'Edit exercise';
      return 'Edit routine';
    }
    switch (draft.kind) {
      case 'exercise': return 'Add exercise';
      case 'routine': return 'Add routine';
      case 'session': return 'Add session';
    }
  }

  protected floorLines(): FloorLineView[] {
    const draft = this.local();
    if (draft.kind === 'exercise') return [];
    const lines: FloorLineView[] = [
      ...draft.floorBefore.map(line => ({ ...line, active: false })),
      {
        id: draft.exerciseLineId,
        name: draft.name,
        exerciseType: draft.exerciseType,
        sets: draft.sets,
        active: true,
      },
      ...draft.floorAfter.map(line => ({ ...line, active: false })),
    ];
    return lines.filter(line => line.active || line.sets.length > 0);
  }

  protected openPreview(): string {
    return openCanonicalPreview(this.local(), this.units());
  }

  protected loggedOn(): string {
    return this.local().loggedOn || this.today();
  }

  protected showSavedExercise(): boolean {
    return this.definitions().length > 0 || isCustomExerciseId(this.local().exerciseId);
  }

  protected savedDefinitionMissing(): boolean {
    const id = this.local().exerciseId;
    return isCustomExerciseId(id) && !this.definitions().some(item => item.id === id);
  }

  /** The blank choice is selected only when this line is not tied to a saved definition. */
  protected definitionSelected(id: string): boolean {
    const current = this.local().exerciseId;
    if (id === '') return current === '' || (!this.definitions().some(item => item.id === current) && !this.savedDefinitionMissing());
    return current === id;
  }

  protected definitionLabel(item: WorkoutDefinitionChoice): string {
    const draft = this.local();
    return item.id === draft.exerciseId && draft.name !== '' ? draft.name : item.name;
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

  protected onTemplateName(event: Event): void {
    this.patch({ templateName: this.text(event) });
  }

  protected onDefinition(event: Event): void {
    const id = this.text(event);
    const draft = this.local();
    if (id === '') {
      this.patch({ exerciseId: '' });
      return;
    }
    const match = this.definitions().find(item => item.id === id);
    if (!match) return;
    if (draft.sets.length > 0 && match.exerciseType !== draft.exerciseType) {
      this.patch({ exerciseId: draft.exerciseId });
      return;
    }
    this.patch({
      exerciseId: match.id,
      name: match.name,
      exerciseType: draft.sets.length > 0 ? draft.exerciseType : match.exerciseType,
    });
  }

  protected onMeasured(event: Event): void {
    this.patch({ measuredOn: this.text(event) });
  }

  protected onType(event: Event): void {
    const value = this.text(event);
    if (!(EXERCISE_TYPES as readonly string[]).includes(value) || value === this.local().exerciseType) return;
    this.patch({ exerciseType: value as ExerciseType, exerciseId: '' });
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

  protected onAddSet(): void {
    if (this.busy()) return;
    this.applyFloor(commitEnteredSet(this.local(), this.units(), this.today()));
  }

  protected onAddExercise(): void {
    if (this.busy()) return;
    const result = commitExerciseLine(this.local(), this.units(), this.today());
    this.errors.set(result.fieldErrors);
    if (Object.keys(result.fieldErrors).length > 0) return;
    this.publish(result.draft);
    this.focusField('health-workout-name');
  }

  protected onActivate(lineId: string): void {
    if (this.busy()) return;
    const result = activateDraftLine(this.local(), lineId, this.units(), this.today());
    this.errors.set(result.fieldErrors);
    if (Object.keys(result.fieldErrors).length > 0) return;
    this.publish(result.draft);
    this.focusField('health-workout-name');
  }

  protected onMove(setId: string, direction: -1 | 1): void {
    if (this.busy()) return;
    const next = moveDraftSet(this.local(), setId, direction);
    if (next === this.local()) return;
    this.publish(next);
    this.focusField(`health-move-earlier-${setId}`, `health-move-later-${setId}`);
  }

  protected onRemove(setId: string): void {
    if (this.busy()) return;
    const next = removeDraftSet(this.local(), setId);
    if (next === this.local()) return;
    this.publish(next);
    this.focusField('health-workout-add-set');
  }

  protected onRetag(setId: string, event: Event): void {
    const value = this.text(event);
    if (!(SET_TYPES as readonly string[]).includes(value)) return;
    this.publish(retagDraftSet(this.local(), setId, value as SetType));
  }

  protected onCount(setId: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.publish(markSetCounted(this.local(), setId, target.checked));
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
    const titleError = routineTitleError(draft);
    const fieldErrors = titleError ? { ...result.fieldErrors, template_name: titleError } : result.fieldErrors;
    this.errors.set(fieldErrors);
    this.draftChange.emit(draft);
    if (Object.keys(fieldErrors).length > 0) return;
    this.save.emit(result.value);
  }

  protected onClosed(): void {
    this.errors.set({});
    this.closed.emit();
  }

  private applyFloor(result: { draft: WorkoutDraft; fieldErrors: FieldErrors }): void {
    this.errors.set(result.fieldErrors);
    if (Object.keys(result.fieldErrors).length > 0) return;
    this.publish(result.draft);
  }

  private publish(next: WorkoutDraft): void {
    this.local.set(next);
    this.errors.set({});
    this.draftChange.emit(next);
  }

  private focusField(primary: string, fallback = ''): void {
    queueMicrotask(() => {
      const preferred = document.getElementById(primary)?.querySelector('button') ?? document.getElementById(primary);
      const alternate = fallback ? document.getElementById(fallback)?.querySelector('button') ?? document.getElementById(fallback) : null;
      const target = preferred instanceof HTMLButtonElement && preferred.disabled ? alternate : preferred;
      if (target instanceof HTMLElement) target.focus();
    });
  }

  private patch(change: Partial<WorkoutDraft>): void {
    this.publish({ ...this.local(), ...change });
  }

  private text(event: Event): string {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return target.value;
    }
    return '';
  }
}
