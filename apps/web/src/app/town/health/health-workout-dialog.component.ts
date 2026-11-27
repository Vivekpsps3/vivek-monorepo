import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, NgZone, afterRenderEffect, effect, inject, input, output, signal } from '@angular/core';
import { UiButtonComponent, UiDialogComponent, UiFieldComponent, UiFieldControlDirective } from '@vivek/ui';
import { SceneAppearanceService } from '../../platform/scene-appearance.service';
import type { HealthUnits } from './health-entry';
import {
  RestTickAudio,
  formatRestClock,
  idleRestTimer,
  pauseRest,
  resetRest,
  restElapsed,
  restTickAllowed,
  startRest,
  type RestPhase,
  type RestTimer,
} from './rest-timer';
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
  reviseDraftSet,
  routineTitleError,
  setEntryFields,
  setTypeLabel,
  workoutFieldId,
  workoutFieldMessage,
  workoutFromDraft,
  validateWorkoutRecord,
  type ExerciseType,
  type SetEntryFields,
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
  protected readonly editingSetId = signal<string | null>(null);
  protected readonly editBuffer = signal<SetEntryFields | null>(null);
  protected readonly editError = signal('');
  private readonly pendingFocus = signal<string | null>(null);
  protected readonly types = EXERCISE_TYPES;
  protected readonly setTypes = SET_TYPES;
  protected readonly typeLabel = exerciseTypeLabel;
  protected readonly setLabel = setTypeLabel;
  protected readonly enteredLabel = formatEnteredSet;
  protected readonly storedLabel = canonicalPreview;
  protected readonly message = workoutFieldMessage;
  private readonly scene = inject(SceneAppearanceService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reducedMotion = signal(false);
  private readonly pageVisible = signal(true);
  private readonly rest = signal<RestTimer>(idleRestTimer());
  private readonly restShown = signal(0);
  private formErrorSeen = '';
  private restOwner = '';
  private restSecond = 0;
  private restInterval: ReturnType<typeof setInterval> | null = null;
  private restAudio = new RestTickAudio();

  constructor() {
    this.bindRestEnvironment();
    effect(() => {
      this.local.set(this.draft());
    });
    effect(() => {
      const editing = this.editingSetId();
      if (editing && !this.containsSet(this.draft(), editing)) {
        this.editingSetId.set(null);
        this.editBuffer.set(null);
        this.editError.set('');
      }
    });
    effect(() => {
      const draft = this.local();
      const owner = this.open() && draft.kind === 'session' ? `session:${draft.clientId}` : '';
      if (owner === this.restOwner) return;
      this.clearRest();
      this.restOwner = owner;
    });
    afterRenderEffect(() => {
      if (!this.open()) {
        this.formErrorSeen = '';
        return;
      }
      const pending = this.pendingFocus();
      if (pending) {
        const node = document.getElementById(pending);
        if (node instanceof HTMLElement) {
          this.focusElement(node);
          this.pendingFocus.set(null);
        }
        return;
      }
      const field = firstWorkoutField(this.errors(), this.local().kind);
      if (field) {
        const node = document.getElementById(workoutFieldId(field));
        if (node instanceof HTMLElement) this.focusElement(node);
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

  protected restPhase(): RestPhase {
    return this.rest().phase;
  }

  protected restClock(): string {
    return formatRestClock(this.restShown());
  }

  protected restStatus(): string {
    switch (this.rest().phase) {
      case 'running': return 'Running';
      case 'paused': return 'Paused';
      default: return 'Not started';
    }
  }

  /** The clock label is the time and the phase. It does not include the exercise. */
  protected restLabel(): string {
    return `Rest ${this.restClock()}, ${this.restStatus()}`;
  }

  protected restAudioLive(): boolean {
    return this.restAudio.live;
  }

  protected onRestStart(): void {
    if (this.local().kind !== 'session' || !this.open()) return;
    const now = Date.now();
    const next = startRest(this.rest(), now);
    if (next === this.rest()) return;
    this.rest.set(next);
    this.paintRest(now);
    this.restAudio.arm(this.tickAllowed());
    this.ensureRestInterval();
  }

  protected onRestPause(): void {
    const now = Date.now();
    const next = pauseRest(this.rest(), now);
    if (next === this.rest()) return;
    this.rest.set(next);
    this.paintRest(now);
    this.restAudio.silence();
    this.stopRestInterval();
  }

  protected onRestReset(): void {
    this.rest.set(resetRest());
    this.restShown.set(0);
    this.restSecond = 0;
    this.restAudio.dispose();
    this.restAudio = new RestTickAudio();
    this.stopRestInterval();
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
    return this.lineLoadLabel(this.local().exerciseType);
  }

  protected lineUsesLoad(type: ExerciseType): boolean {
    return type === 'load-reps' || type === 'assisted-reps';
  }

  protected lineUsesReps(type: ExerciseType): boolean {
    return type === 'load-reps' || type === 'assisted-reps' || type === 'bodyweight-reps';
  }

  protected lineUsesTime(type: ExerciseType): boolean {
    return type === 'time-distance' || type === 'time-only';
  }

  protected lineUsesDistance(type: ExerciseType): boolean {
    return type === 'time-distance';
  }

  protected lineLoadLabel(type: ExerciseType): string {
    const unit = this.units().weight;
    return type === 'assisted-reps' ? `Assistance (${unit})` : `Load (${unit})`;
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
    const result = commitEnteredSet(this.local(), this.units(), this.today());
    this.errors.set(result.fieldErrors);
    if (Object.keys(result.fieldErrors).length > 0) {
      const field = firstWorkoutField(result.fieldErrors, this.local().kind);
      if (field) this.pendingFocus.set(workoutFieldId(field));
      return;
    }
    this.publish(result.draft);
    this.pendingFocus.set(this.nextComposerField());
  }

  protected onToggleEdit(set: WorkoutDraftSet, exerciseType: ExerciseType): void {
    if (this.busy()) return;
    if (this.editingSetId() === set.id) {
      this.editingSetId.set(null);
      this.editBuffer.set(null);
      this.editError.set('');
      this.pendingFocus.set(`health-set-edit-${set.id}`);
      return;
    }
    this.editingSetId.set(set.id);
    this.editBuffer.set(setEntryFields(set, this.units()));
    this.editError.set('');
    this.pendingFocus.set(this.editFieldId(set.id, exerciseType));
  }

  protected onRevise(setId: string, field: keyof SetEntryFields, event: Event): void {
    const current = this.editBuffer();
    if (!current || this.editingSetId() !== setId || this.busy()) return;
    const next = { ...current, [field]: this.text(event) };
    this.editBuffer.set(next);
    const result = reviseDraftSet(this.local(), setId, next, this.units(), this.today());
    if (Object.keys(result.fieldErrors).length > 0) {
      const code = result.fieldErrors[field === 'load' ? 'kg' : field === 'distance' ? 'metres' : field]
        ?? Object.values(result.fieldErrors)[0];
      this.editError.set(workoutFieldMessage(code));
      return;
    }
    this.editError.set('');
    if (result.draft !== this.local()) this.publish(result.draft);
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

  /** Finish the open session. A failed check leaves the draft unfinished. */
  protected onFinish(): void {
    if (this.busy() || this.local().kind !== 'session') return;
    const draft: WorkoutDraft = { ...this.local(), state: 'completed' };
    const result = validateWorkoutRecord(
      workoutFromDraft(draft, this.today(), this.units()),
      this.customExerciseCount(),
      this.today(),
    );
    this.errors.set(result.fieldErrors);
    if (Object.keys(result.fieldErrors).length > 0) {
      this.draftChange.emit(this.local());
      return;
    }
    this.publish(draft);
    this.save.emit(result.value);
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
    this.editingSetId.set(null);
    this.editBuffer.set(null);
    this.editError.set('');
    this.pendingFocus.set(null);
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
    this.pendingFocus.set(primary);
    queueMicrotask(() => {
      const preferred = document.getElementById(primary)?.querySelector('button') ?? document.getElementById(primary);
      const alternate = fallback ? document.getElementById(fallback)?.querySelector('button') ?? document.getElementById(fallback) : null;
      const target = preferred instanceof HTMLButtonElement && preferred.disabled ? alternate : preferred;
      if (target instanceof HTMLElement) this.focusElement(target);
      if (this.pendingFocus() === primary) this.pendingFocus.set(null);
    });
  }

  private focusElement(node: HTMLElement): void {
    const inner = node.querySelector('button');
    const target = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement
      ? node
      : inner instanceof HTMLElement ? inner : node;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private nextComposerField(): string {
    if (this.usesLoad()) return 'health-workout-load';
    if (this.usesReps()) return 'health-workout-reps';
    if (this.usesTime()) return 'health-workout-seconds';
    return 'health-workout-set-type';
  }

  private editFieldId(setId: string, type: ExerciseType): string {
    if (this.lineUsesLoad(type)) return `health-set-load-${setId}`;
    if (this.lineUsesReps(type)) return `health-set-reps-${setId}`;
    if (this.lineUsesTime(type)) return `health-set-seconds-${setId}`;
    return `health-set-edit-${setId}`;
  }

  private containsSet(draft: WorkoutDraft, setId: string): boolean {
    return draft.sets.some(set => set.id === setId)
      || draft.floorBefore.some(line => line.sets.some(set => set.id === setId))
      || draft.floorAfter.some(line => line.sets.some(set => set.id === setId));
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

  private bindRestEnvironment(): void {
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion.set(query.matches);
      const onChange = (): void => this.reducedMotion.set(query.matches);
      query.addEventListener?.('change', onChange);
      this.destroyRef.onDestroy(() => query.removeEventListener?.('change', onChange));
    }
    if (typeof document !== 'undefined') {
      this.pageVisible.set(document.visibilityState !== 'hidden');
      const onVisibility = (): void => {
        const visible = document.visibilityState !== 'hidden';
        this.pageVisible.set(visible);
        if (!visible) this.restAudio.silence();
      };
      document.addEventListener('visibilitychange', onVisibility);
      this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisibility));
    }
    this.destroyRef.onDestroy(() => this.clearRest());
  }

  private tickAllowed(): boolean {
    return restTickAllowed({
      sound: this.scene.effective().sound,
      reducedMotion: this.reducedMotion(),
      visible: this.pageVisible(),
      running: this.rest().phase === 'running',
    });
  }

  private paintRest(now: number): void {
    const elapsed = restElapsed(this.rest(), now);
    this.restShown.set(elapsed);
    this.restSecond = Math.floor(elapsed / 1000);
  }

  /**
   * The interval stays outside the Angular zone. An in-zone timer is a macrotask,
   * so the app would never become stable and leave/lock could not finish.
   */
  private ensureRestInterval(): void {
    if (this.restInterval !== null) return;
    this.restInterval = this.zone.runOutsideAngular(() => setInterval(() => {
      this.zone.run(() => this.onRestTick());
    }, 200));
  }

  private onRestTick(): void {
    if (this.rest().phase !== 'running') {
      this.stopRestInterval();
      return;
    }
    const now = Date.now();
    const elapsed = restElapsed(this.rest(), now);
    this.restShown.set(elapsed);
    const second = Math.floor(elapsed / 1000);
    if (second > this.restSecond) {
      this.restSecond = second;
      if (this.tickAllowed()) this.restAudio.pulse(true);
      else this.restAudio.silence();
    }
  }

  private stopRestInterval(): void {
    if (this.restInterval === null) return;
    clearInterval(this.restInterval);
    this.restInterval = null;
  }

  /** Drop the clock and the tick. The workout draft is a separate signal. */
  private clearRest(): void {
    this.stopRestInterval();
    this.restAudio.dispose();
    this.restAudio = new RestTickAudio();
    this.restSecond = 0;
    this.rest.set(idleRestTimer());
    this.restShown.set(0);
  }
}
