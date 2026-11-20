import { NgTemplateOutlet } from '@angular/common';
import { AfterViewChecked, ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, InjectionToken, Injector, OnInit, afterRenderEffect, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { localTodayIso } from '@vivek/browser';
import {
  ConfirmService,
  UiButtonComponent,
  UiPageHeaderComponent,
  UiSegmentedComponent,
  UiSkeletonComponent,
  isHealthEntryId,
  vaultReturnQuery,
} from '@vivek/ui';
import { bindLockSnapshots, financeVaultExists, financeVaultPresent } from '../../../../../finance/frontend/src/public-api';
import { SessionService } from '../../platform/session.service';
import { HealthEntryDialogComponent, type HealthEntryValue } from './health-entry-dialog.component';
import { HealthWorkoutDialogComponent } from './health-workout-dialog.component';
import { HEALTH_HISTORY_PAGE, buildClinicSeries, pageClinicSeries } from './health-history';
import { HealthSparklineComponent } from './health-sparkline.component';
import {
  DEFAULT_HEALTH_UNITS,
  EMPTY_HEALTH_DRAFT,
  corruptNotice,
  draftFromStat,
  formatHealthPr,
  healthDeletePhrase,
  isClinicKind,
  isVitalKind,
  readHealthUnits,
  reformatWeightDraft,
  sameStoredStat,
  writeHealthUnits,
  type HealthClinicKind,
  type HealthDraft,
  type HealthEditorKind,
  type HealthUnits,
} from './health-entry';
import {
  HEALTH_CONFLICT_MESSAGE,
  HealthConflictError,
  HealthLockedError,
  HealthStoreService,
  HealthWorkoutError,
  type HealthEntry,
} from './health-store.service';
import type { HealthPr, HealthStat } from './health.types';
import {
  draftFromSession,
  emptyWorkoutDraft,
  formatWorkout,
  reformatWorkoutDraft,
  type WorkoutDraft,
  type WorkoutKind,
  type WorkoutRecord,
} from './workout';

export const HEALTH_VAULT_EXISTS = new InjectionToken<() => Promise<boolean | null>>('HEALTH_VAULT_EXISTS', {
  providedIn: 'root',
  factory: () => {
    const injector = inject(Injector);
    return () => financeVaultExists(injector);
  },
});

type HealthRoom = 'clinic' | 'gym';
type RoomRecord = HealthEntry<HealthStat> | HealthEntry<HealthPr>;

/** Moves focus to a deep-linked row once that row is in the document. */
@Directive({
  selector: '[appHealthLinkedFocus]',
})
export class HealthLinkedFocusDirective implements AfterViewChecked {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly appHealthLinkedFocus = input(false);
  private placed = false;

  ngAfterViewChecked(): void {
    if (this.placed || !this.appHealthLinkedFocus()) return;
    const row = this.host.nativeElement;
    if (!row.isConnected) return;
    row.focus();
    this.placed = row === document.activeElement;
  }
}

function vitalName(kind: 'weight' | 'rhr' | 'bp' | 'sleep'): string {
  switch (kind) {
    case 'weight': return 'weight';
    case 'rhr': return 'resting heart rate';
    case 'bp': return 'blood pressure';
    case 'sleep': return 'sleep';
  }
}

function deleteCopy(kind: HealthClinicKind): {
  title: string;
  noun: string;
  confirm: string;
  cancel: string;
  busy: string;
} {
  switch (kind) {
    case 'lab':
      return {
        title: 'Delete this lab result?',
        noun: 'lab result',
        confirm: 'Delete lab result',
        cancel: 'Keep lab result',
        busy: 'Deleting lab result',
      };
    case 'checkup':
      return {
        title: 'Delete this checkup?',
        noun: 'checkup',
        confirm: 'Delete checkup',
        cancel: 'Keep checkup',
        busy: 'Deleting checkup',
      };
    case 'weight':
    case 'rhr':
    case 'bp':
    case 'sleep':
      return {
        title: 'Delete this measurement?',
        noun: vitalName(kind),
        confirm: 'Delete measurement',
        cancel: 'Keep measurement',
        busy: 'Deleting measurement',
      };
  }
}

interface HealthListRow {
  clientId: string;
  label: string;
  kind: string;
}

function isStat(value: HealthStat | HealthPr): value is HealthStat {
  return value.kind === 'weight' || value.kind === 'rhr' || value.kind === 'bp'
    || value.kind === 'sleep' || value.kind === 'lab' || value.kind === 'checkup';
}

@Component({
  selector: 'app-health-room',
  imports: [
    HealthEntryDialogComponent,
    HealthWorkoutDialogComponent,
    HealthLinkedFocusDirective,
    HealthSparklineComponent,
    NgTemplateOutlet,
    UiButtonComponent,
    UiPageHeaderComponent,
    UiSegmentedComponent,
    UiSkeletonComponent,
  ],
  templateUrl: './health-room.component.html',
  styleUrl: './health-room.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-health-state]': 'phase()',
    '[attr.data-health-room]': 'room()',
    '[attr.aria-busy]': 'phase() === "loading" ? "true" : null',
  },
})
export class HealthRoomComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly store = inject(HealthStoreService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly vaultExists = inject(HEALTH_VAULT_EXISTS);
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly data = toSignal(this.route.data, { requireSync: true });
  private generation = 0;
  private dead = false;
  private seenOwner: number | null | undefined;
  private seenRoom: HealthRoom | null = null;

  protected readonly phase = signal<'loading' | 'locked' | 'setup' | 'unavailable' | 'ready'>('loading');
  protected readonly units = signal<HealthUnits>({ ...DEFAULT_HEALTH_UNITS });
  protected readonly entries = signal<readonly RoomRecord[]>([]);
  protected readonly unreadable = signal(0);
  private readonly shownByKind = signal<Partial<Record<HealthStat['kind'], number>>>({});
  protected readonly revealFocusId = signal<string | null>(null);
  protected readonly draft = signal<HealthDraft | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly workouts = signal<readonly HealthEntry<WorkoutRecord>[]>([]);
  protected readonly workoutDraft = signal<WorkoutDraft | null>(null);
  protected readonly workoutDialogOpen = signal(false);
  protected readonly workoutFormError = signal('');
  protected readonly workoutBusy = signal(false);
  protected readonly idleWorkoutDraft = emptyWorkoutDraft('exercise', '');
  private readonly returnWorkoutFocus = signal<string | null>(null);
  private readonly returnFocusKind = signal<HealthClinicKind | null>(null);
  protected readonly emptyDraft = EMPTY_HEALTH_DRAFT;
  protected readonly clinicAdds: readonly { kind: HealthClinicKind; label: string; id: string }[] = [
    { kind: 'weight', label: 'Add weight', id: 'health-add-weight' },
    { kind: 'rhr', label: 'Add resting heart rate', id: 'health-add-rhr' },
    { kind: 'bp', label: 'Add blood pressure', id: 'health-add-bp' },
    { kind: 'sleep', label: 'Add sleep', id: 'health-add-sleep' },
    { kind: 'lab', label: 'Add lab result', id: 'health-add-lab' },
    { kind: 'checkup', label: 'Add checkup', id: 'health-add-checkup' },
  ];
  protected readonly weightOptions = [
    { value: 'lb', label: 'Pounds' },
    { value: 'kg', label: 'Kilograms' },
  ];
  protected readonly distanceOptions = [
    { value: 'mi', label: 'Miles' },
    { value: 'km', label: 'Kilometres' },
  ];
  protected readonly room = computed<HealthRoom>(() => this.data()['healthRoom'] === 'gym' ? 'gym' : 'clinic');
  protected readonly entryId = computed(() => {
    const value = this.params().get('entry') ?? '';
    return isHealthEntryId(value) ? value : null;
  });
  protected readonly title = computed(() => this.room() === 'clinic' ? 'Clinic' : 'Gym');
  protected readonly editorKind = computed<HealthEditorKind>(() => {
    const draft = this.draft();
    if (draft) return draft.kind;
    return this.room() === 'gym' ? 'lift' : 'weight';
  });
  private readonly clinicSeries = computed(() => {
    if (this.room() !== 'clinic') return [];
    const stats = this.entries().flatMap(entry => isStat(entry.value)
      ? [{ clientId: entry.clientId, value: entry.value }]
      : []);
    return buildClinicSeries(stats, this.units());
  });
  protected readonly clinicPages = computed(() => pageClinicSeries(
    this.clinicSeries(),
    this.shownByKind(),
    this.entryId(),
  ));
  protected readonly measurementPages = computed(() => this.clinicPages().filter(page => isVitalKind(page.kind)));
  protected readonly labPage = computed(() => this.clinicPages().find(page => page.kind === 'lab') ?? null);
  protected readonly checkupPage = computed(() => this.clinicPages().find(page => page.kind === 'checkup') ?? null);
  protected readonly rows = computed((): HealthListRow[] => {
    const units = this.units();
    if (this.room() === 'clinic') {
      return this.clinicSeries().flatMap(series => series.rows.map(row => ({
        clientId: row.clientId,
        label: row.label,
        kind: row.kind,
      })));
    }
    return this.entries().flatMap(entry => isStat(entry.value)
      ? []
      : [{
        clientId: entry.clientId,
        label: formatHealthPr(entry.value, units),
        kind: entry.value.kind,
      }]);
  });
  protected readonly missingEntry = computed(() => {
    const id = this.entryId();
    return !!id && this.phase() === 'ready' && !this.rows().some(row => row.clientId === id);
  });
  protected readonly notice = computed(() => corruptNotice(this.unreadable()));
  protected readonly customExerciseCount = computed(() => this.workouts()
    .filter(entry => entry.value.kind === 'exercise' && !entry.value.archived).length);
  protected readonly workoutRows = computed(() => this.workouts().map(entry => ({
    clientId: entry.clientId,
    label: formatWorkout(entry.value, this.units()),
    kind: entry.value.kind,
    state: entry.value.kind === 'session' ? entry.value.state : '',
    setCount: entry.value.kind === 'session'
      ? entry.value.exercises.reduce((sum, line) => sum + line.sets.length, 0)
      : 0,
  })));

  constructor() {
    const releaseLock = bindLockSnapshots(() => this.invalidate());
    this.destroyRef.onDestroy(() => {
      this.dead = true;
      this.generation += 1;
      this.dropPrivate();
      releaseLock();
    });
    this.session.user$.pipe(takeUntilDestroyed()).subscribe(user => this.noteOwner(user?.id));
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => this.invalidate());
    effect(() => {
      const room = this.room();
      if (this.seenRoom === room) return;
      const previous = this.seenRoom;
      this.seenRoom = room;
      if (previous === null) return;
      this.draft.set(null);
      this.dialogOpen.set(false);
      this.formError.set('');
      this.workoutDraft.set(null);
      this.workoutDialogOpen.set(false);
      this.workoutFormError.set('');
      this.returnWorkoutFocus.set(null);
      this.revealFocusId.set(null);
      if (this.phase() === 'ready') this.publish();
    });
    afterRenderEffect(() => {
      const kind = this.returnFocusKind();
      if (!kind || this.phase() !== 'ready' || this.dialogOpen()) return;
      setTimeout(() => {
        if (this.returnFocusKind() !== kind || this.phase() !== 'ready' || this.dialogOpen()) return;
        const button = document.querySelector<HTMLElement>(`#health-add-${kind} button`);
        if (!button) return;
        let node: HTMLElement | null = button;
        while (node) {
          if (node.inert) return;
          node = node.parentElement;
        }
        this.returnFocusKind.set(null);
        button.focus();
      });
    });
    afterRenderEffect(() => {
      const id = this.returnWorkoutFocus();
      if (!id || this.phase() !== 'ready' || this.dialogOpen() || this.workoutDialogOpen()) return;
      setTimeout(() => {
        if (this.returnWorkoutFocus() !== id || this.phase() !== 'ready' || this.dialogOpen() || this.workoutDialogOpen()) return;
        const button = document.querySelector<HTMLElement>(`#${id} button`);
        if (!button) return;
        let node: HTMLElement | null = button;
        while (node) {
          if (node.inert) return;
          node = node.parentElement;
        }
        this.returnWorkoutFocus.set(null);
        button.focus();
      });
    });
  }

  ngOnInit(): void {
    this.readUnits();
    void this.resolveGate();
  }

  protected today(): string {
    return localTodayIso();
  }

  protected returnQuery(): { next?: string } {
    const entry = this.entryId();
    const path = this.room() === 'clinic' ? '/town/clinic' : '/town/gym';
    return vaultReturnQuery(entry ? `${path}?entry=${entry}` : path);
  }

  protected retry(): void {
    void this.resolveGate();
  }

  protected openCreate(kind: HealthClinicKind): void {
    this.formError.set('');
    const draft = this.draft();
    if (!draft || draft.kind !== kind || draft.clientId) {
      this.draft.set({ ...EMPTY_HEALTH_DRAFT, kind });
    }
    this.dialogOpen.set(true);
  }

  protected openLift(): void {
    this.formError.set('');
    const draft = this.draft();
    if (!draft || draft.kind !== 'lift' || draft.clientId) {
      this.draft.set({ ...EMPTY_HEALTH_DRAFT, kind: 'lift' });
    }
    this.dialogOpen.set(true);
  }

  protected openWorkout(kind: WorkoutKind): void {
    this.workoutFormError.set('');
    this.returnWorkoutFocus.set(`health-add-${kind}`);
    const draft = this.workoutDraft();
    if (!draft || draft.kind !== kind || draft.clientId !== '') {
      this.workoutDraft.set(emptyWorkoutDraft(kind, this.today()));
    }
    this.workoutDialogOpen.set(true);
  }

  protected resumeWorkout(clientId: string): void {
    this.openSavedSession(clientId, `health-resume-${clientId}`, 'draft');
  }

  protected editWorkout(clientId: string): void {
    this.openSavedSession(clientId, `health-edit-${clientId}`, 'completed');
  }

  protected onWorkoutDraft(draft: WorkoutDraft): void {
    if (this.dead) return;
    this.workoutDraft.set(draft);
    if (this.workoutFormError()) this.workoutFormError.set('');
  }

  protected onWorkoutClosed(): void {
    this.workoutDialogOpen.set(false);
    this.workoutFormError.set('');
  }

  protected openEdit(clientId: string): void {
    const entry = this.entries().find(item => item.clientId === clientId);
    if (!entry || !isStat(entry.value)) return;
    const draft = draftFromStat({ clientId: entry.clientId, value: entry.value }, this.units());
    if (!draft) return;
    this.formError.set('');
    this.draft.set(draft);
    this.dialogOpen.set(true);
  }

  protected onDraft(draft: HealthDraft): void {
    if (this.dead) return;
    this.draft.set(draft);
    if (this.formError()) this.formError.set('');
  }

  protected onDialogClosed(): void {
    this.dialogOpen.set(false);
    this.formError.set('');
  }

  protected setWeight(value: string | number | null): void {
    if (value !== 'kg' && value !== 'lb') return;
    const previous = this.units().weight;
    if (previous === value) return;
    const next: HealthUnits = { ...this.units(), weight: value };
    this.updateUnits(next);
    const draft = this.draft();
    if (draft && (draft.kind === 'weight' || draft.kind === 'lift') && draft.weight !== '') {
      this.draft.set(reformatWeightDraft(draft, previous, value));
    }
    const workout = this.workoutDraft();
    if (workout) this.workoutDraft.set(reformatWorkoutDraft(workout, { ...next, weight: previous }, next));
  }

  protected showMore(kind: HealthStat['kind']): void {
    const series = this.clinicSeries().find(item => item.kind === kind);
    const page = this.clinicPages().find(item => item.kind === kind);
    if (!series || !page?.more) return;
    const revealed = series.rows[page.shown];
    this.shownByKind.update(current => ({
      ...current,
      [kind]: page.shown + HEALTH_HISTORY_PAGE,
    }));
    if (revealed) this.revealFocusId.set(revealed.clientId);
  }

  protected setDistance(value: string | number | null): void {
    if (value !== 'km' && value !== 'mi') return;
    const previous = this.units();
    if (previous.distance === value) return;
    const next: HealthUnits = { ...previous, distance: value };
    this.updateUnits(next);
    const workout = this.workoutDraft();
    if (workout) this.workoutDraft.set(reformatWorkoutDraft(workout, previous, next));
  }

  protected removeWorkout(clientId: string): void {
    const generation = this.generation;
    const entry = this.workouts().find(item => item.clientId === clientId);
    if (!entry || entry.value.kind !== 'session') return;
    const measured = entry.value.measured_on;
    void this.confirm.confirmAction({
      title: 'Delete this session?',
      message: `This permanently deletes the session measured on ${measured}. This cannot be undone.`,
      confirmLabel: 'Delete session',
      cancelLabel: 'Keep session',
      busyLabel: 'Deleting session',
      phrase: 'DELETE SESSION',
      errorMessage: 'Could not delete this session. It is still saved. Try again.',
      run: async () => {
        if (!this.current(generation)) return;
        const latest = this.store.workoutsSnapshot.find(item => item.clientId === clientId);
        if (!latest || latest.value.kind !== 'session') throw new Error('missing');
        try {
          await this.store.deleteWorkout(latest);
        } catch (error) {
          if (!this.current(generation)) return;
          if (error instanceof HealthConflictError) this.publish();
          throw error;
        }
        if (!this.current(generation)) return;
        if (this.workoutDraft()?.clientId === clientId) {
          this.workoutDraft.set(null);
          this.workoutDialogOpen.set(false);
          this.workoutFormError.set('');
        }
        this.publish();
      },
    }).then(confirmed => {
      if (confirmed && this.current(generation)) this.returnWorkoutFocus.set('health-add-session');
    });
  }

  protected removeEntry(clientId: string): void {
    const generation = this.generation;
    const entry = this.entries().find(item => item.clientId === clientId);
    if (!entry || !isStat(entry.value) || !isClinicKind(entry.value.kind)) return;
    const kind = entry.value.kind;
    const measured = entry.value.measured_on;
    const copy = deleteCopy(kind);
    void this.confirm.confirmAction({
      title: copy.title,
      message: `This permanently deletes the ${copy.noun} measured on ${measured}. This cannot be undone.`,
      confirmLabel: copy.confirm,
      cancelLabel: copy.cancel,
      busyLabel: copy.busy,
      phrase: healthDeletePhrase(kind),
      errorMessage: 'Could not delete this entry. It is still saved. Try again.',
      run: async () => {
        if (!this.current(generation)) return;
        const latest = this.store.statsSnapshot.find(item => item.clientId === clientId);
        if (!latest) throw new Error('missing');
        try {
          await this.store.deleteStat(latest);
        } catch (error) {
          if (!this.current(generation)) return;
          if (error instanceof HealthConflictError) this.publish();
          throw error;
        }
        if (!this.current(generation)) return;
        if (this.draft()?.clientId === clientId) {
          this.draft.set(null);
          this.dialogOpen.set(false);
          this.formError.set('');
        }
        this.publish();
      },
    }).then(confirmed => {
      if (confirmed && this.current(generation)) this.returnFocusKind.set(kind);
    });
  }

  protected async save(value: HealthEntryValue): Promise<void> {
    const generation = this.generation;
    const submitted = this.draft();
    const clientId = submitted?.clientId ?? null;
    this.formError.set('');
    this.busy.set(true);
    try {
      if (isStat(value)) {
        if (clientId) {
          const current = this.store.statsSnapshot.find(item => item.clientId === clientId);
          if (!this.current(generation)) return;
          if (!current) {
            this.formError.set('That entry is no longer saved. Your draft is still here.');
            return;
          }
          if (sameStoredStat(current.value, value)) {
            this.finishSaved(generation, submitted);
            return;
          }
          await this.store.updateStat(current, value);
        } else {
          await this.store.createStat(value);
        }
      } else {
        await this.store.createPr(value);
      }
      if (!this.current(generation)) return;
      this.publish();
      this.finishSaved(generation, submitted);
    } catch (error) {
      if (!this.current(generation)) return;
      if (error instanceof HealthLockedError) {
        this.invalidate();
        return;
      }
      if (error instanceof HealthConflictError) this.publish();
      this.formError.set(error instanceof HealthConflictError
        ? HEALTH_CONFLICT_MESSAGE
        : 'Could not save this entry. Try again.');
    } finally {
      if (this.current(generation)) this.busy.set(false);
    }
  }

  protected async saveWorkout(value: WorkoutRecord): Promise<void> {
    const generation = this.generation;
    const submitted = this.workoutDraft();
    this.workoutFormError.set('');
    this.workoutBusy.set(true);
    try {
      if (value.kind === 'session' && submitted?.clientId) {
        const current = this.store.workoutsSnapshot.find(item => item.clientId === submitted.clientId);
        if (!this.current(generation)) return;
        if (!current || current.value.kind !== 'session') {
          this.workoutFormError.set('That session is no longer saved. Your draft is still here.');
          return;
        }
        const revision = submitted.revision ?? current.revision;
        await this.store.updateWorkoutSession({ ...current, revision }, value, this.today());
        if (this.current(generation)) {
          this.returnWorkoutFocus.set(value.state === 'draft'
            ? `health-resume-${submitted.clientId}`
            : `health-edit-${submitted.clientId}`);
        }
      } else {
        await this.store.createWorkout(value, this.today());
      }
      if (!this.current(generation)) return;
      this.publish();
      this.finishWorkout(generation, submitted);
    } catch (error) {
      if (!this.current(generation)) return;
      if (error instanceof HealthLockedError) {
        this.invalidate();
        return;
      }
      if (error instanceof HealthConflictError) this.publish();
      this.workoutFormError.set(error instanceof HealthWorkoutError
        ? error.message
        : error instanceof HealthConflictError
          ? HEALTH_CONFLICT_MESSAGE
          : 'Could not save this workout. Try again.');
    } finally {
      if (this.current(generation)) this.workoutBusy.set(false);
    }
  }

  private noteOwner(id: unknown): void {
    const owner = typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
    if (this.seenOwner === undefined) {
      this.seenOwner = owner;
      return;
    }
    if (this.seenOwner === owner) return;
    this.seenOwner = owner;
    this.invalidate();
  }

  private ownerId(): number | null {
    const id = this.session.currentUser?.id;
    return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
  }

  private invalidate(): void {
    if (this.dead) return;
    this.generation += 1;
    this.dropPrivate();
    this.phase.set('loading');
    this.readUnits();
    void this.resolveGate();
  }

  private finishSaved(generation: number, submitted: HealthDraft | null): void {
    if (!this.current(generation)) return;
    const draft = this.draft();
    if (submitted && draft && JSON.stringify(draft) !== JSON.stringify(submitted)) return;
    this.draft.set(null);
    this.dialogOpen.set(false);
    this.formError.set('');
  }

  private openSavedSession(clientId: string, focusId: string, state: 'draft' | 'completed'): void {
    this.workoutFormError.set('');
    const held = this.workoutDraft();
    if (!held || held.clientId !== clientId) {
      const entry = this.workouts().find(item => item.clientId === clientId);
      if (!entry || entry.value.kind !== 'session' || entry.value.state !== state) return;
      this.workoutDraft.set(draftFromSession({
        clientId: entry.clientId,
        revision: entry.revision,
        value: entry.value,
      }));
    }
    this.returnWorkoutFocus.set(focusId);
    this.workoutDialogOpen.set(true);
  }

  private finishWorkout(generation: number, submitted: WorkoutDraft | null): void {
    if (!this.current(generation)) return;
    const draft = this.workoutDraft();
    if (submitted && draft && JSON.stringify(draft) !== JSON.stringify(submitted)) return;
    this.workoutDraft.set(null);
    this.workoutDialogOpen.set(false);
    this.workoutFormError.set('');
  }

  private dropPrivate(): void {
    this.entries.set([]);
    this.unreadable.set(0);
    this.draft.set(null);
    this.formError.set('');
    this.dialogOpen.set(false);
    this.busy.set(false);
    this.workoutDraft.set(null);
    this.workoutDialogOpen.set(false);
    this.workoutFormError.set('');
    this.workoutBusy.set(false);
    this.returnWorkoutFocus.set(null);
    this.workouts.set([]);
    this.returnFocusKind.set(null);
    this.shownByKind.set({});
    this.revealFocusId.set(null);
    this.confirm.close(false);
  }

  private current(generation: number): boolean {
    return !this.dead && generation === this.generation;
  }

  private readUnits(): void {
    const owner = this.ownerId();
    this.units.set(owner ? readHealthUnits(owner) : { ...DEFAULT_HEALTH_UNITS });
  }

  private updateUnits(units: HealthUnits): void {
    this.units.set(units);
    const owner = this.ownerId();
    if (owner) writeHealthUnits(owner, units);
  }

  private async resolveGate(): Promise<void> {
    const generation = this.generation;
    if (!this.current(generation)) return;
    if (!financeVaultPresent()) {
      this.phase.set('loading');
      this.entries.set([]);
      const exists = await this.vaultExists();
      if (!this.current(generation)) return;
      if (exists === true) {
        this.phase.set('locked');
        return;
      }
      this.phase.set(exists === false && this.ownerId() ? 'setup' : 'unavailable');
      return;
    }
    this.phase.set('loading');
    this.entries.set([]);
    this.unreadable.set(0);
    let result;
    try {
      result = await this.store.load();
    } catch {
      if (this.current(generation)) this.phase.set('unavailable');
      return;
    }
    if (!this.current(generation)) return;
    if (!financeVaultPresent() || result.state === 'locked') {
      this.dropPrivate();
      this.phase.set('locked');
      return;
    }
    if (result.state !== 'ready') {
      this.phase.set('unavailable');
      return;
    }
    this.unreadable.set(result.unreadable);
    this.publish();
    this.phase.set('ready');
  }

  private publish(): void {
    const rows = this.room() === 'clinic' ? this.store.statsSnapshot : this.store.prsSnapshot;
    this.entries.set([...rows]);
    this.workouts.set(this.room() === 'gym' ? [...this.store.workoutsSnapshot] : []);
  }
}
