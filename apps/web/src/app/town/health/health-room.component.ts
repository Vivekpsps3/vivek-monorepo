import { Location, NgTemplateOutlet } from '@angular/common';
import { AfterViewChecked, ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, InjectionToken, Injector, OnInit, afterRenderEffect, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { localTodayIso } from '@vivek/browser';
import {
  ConfirmService,
  ReturnContext,
  UiButtonComponent,
  UiInputComponent,
  UiPageHeaderComponent,
  UiSegmentedComponent,
  UiSelectComponent,
  UiSkeletonComponent,
  isHealthEntryId,
  vaultReturnQuery,
  type UiSelectOption,
} from '@vivek/ui';
import { bindLockSnapshots, financeVaultExists, financeVaultPresent } from '../../../../../finance/frontend/src/public-api';
import { SessionService } from '../../platform/session.service';
import { HealthEntryDialogComponent, type HealthEntryValue } from './health-entry-dialog.component';
import { HealthWorkoutDialogComponent } from './health-workout-dialog.component';
import { HEALTH_HISTORY_PAGE, buildClinicSeries, pageClinicSeries, sparklineGeometry } from './health-history';
import {
  EMPTY_HEALTH_PROGRESS,
  GAME_MEDAL_EXPLANATION,
  boundProgressWall,
  progressDateWindow,
  projectHealthProgress,
  type GameMedalInput,
} from './health-progress';
import { ClinicRoomComponent } from './clinic-room.component';
import {
  CLINIC_VITALS,
  clinicObjectId,
  clinicUnitLine,
  clinicVitalNoun,
  clinicVitalTitle,
  type ClinicObjectId,
  type ClinicVitalId,
} from './clinic-room';
import { GymFloorComponent } from './gym-floor.component';
import { gymFloorId, type GymFloorId, type GymGate } from './gym-floor';
import { GymMezzanineComponent } from './gym-mezzanine.component';
import { gymUpId, type GymUpId } from './gym-mezzanine';
import { HealthSparklineComponent } from './health-sparkline.component';
import {
  DEFAULT_HEALTH_UNITS,
  EMPTY_HEALTH_DRAFT,
  corruptNotice,
  draftFromPr,
  draftFromStat,
  formatHealthPr,
  healthDeletePhrase,
  healthPrDeletePhrase,
  isClinicKind,
  isPrKind,
  isVitalKind,
  readHealthUnits,
  reformatDistanceDraft,
  reformatWeightDraft,
  sameStoredPr,
  sameStoredStat,
  writeHealthUnits,
  type HealthClinicKind,
  type HealthDraft,
  type HealthEditorKind,
  type HealthPrKind,
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
  draftFromExercise,
  draftFromPlan,
  draftFromRoutine,
  draftFromSession,
  emptyWorkoutDraft,
  formatWorkout,
  reformatWorkoutDraft,
  workoutFromDraft,
  type WorkoutDefinitionChoice,
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

function prDeleteCopy(kind: HealthPrKind): {
  title: string;
  noun: string;
  confirm: string;
  cancel: string;
  busy: string;
} {
  if (kind === 'lift') {
    return {
      title: 'Delete this lift?',
      noun: 'lift',
      confirm: 'Delete lift',
      cancel: 'Keep lift',
      busy: 'Deleting lift',
    };
  }
  if (kind === 'run') {
    return {
      title: 'Delete this run?',
      noun: 'run',
      confirm: 'Delete run',
      cancel: 'Keep run',
      busy: 'Deleting run',
    };
  }
  return {
    title: 'Delete this record?',
    noun: 'record',
    confirm: 'Delete record',
    cancel: 'Keep record',
    busy: 'Deleting record',
  };
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
    RouterLink,
    ClinicRoomComponent,
    GymFloorComponent,
    GymMezzanineComponent,
    HealthEntryDialogComponent,
    HealthWorkoutDialogComponent,
    HealthLinkedFocusDirective,
    HealthSparklineComponent,
    NgTemplateOutlet,
    UiButtonComponent,
    UiInputComponent,
    UiPageHeaderComponent,
    UiSegmentedComponent,
    UiSelectComponent,
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
  /** Minigame results to show apart from Health trophies. Earned medals are not invented here. */
  readonly gameMedals = input<readonly GameMedalInput[]>([]);
  protected readonly medalNote = GAME_MEDAL_EXPLANATION;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly returns = inject(ReturnContext);
  private readonly location = inject(Location);
  /** Only the original Health entry can launch once the vault is ready. */
  private quickAddOpened = false;
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
  /** Aborted when this room leaves. Lock and owner change abort the store itself. */
  private readonly life = new AbortController();
  private read: AbortController | null = null;
  private releaseRead: (() => void) | null = null;

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
  protected readonly floorObject = signal<GymFloorId | null>(null);
  protected readonly upObject = signal<GymUpId | null>(null);
  protected readonly clinicObject = signal<ClinicObjectId | null>(null);
  /** Folder title while the lab archive is open. Cleared with the other private draft. */
  private readonly openLabTitle = signal<string | null>(null);
  protected readonly vitalStations = CLINIC_VITALS;
  protected readonly wallExercise = signal('');
  protected readonly wallFrom = signal('');
  protected readonly wallTo = signal('');
  protected readonly appliedFrom = signal('');
  protected readonly appliedTo = signal('');
  protected readonly wallDateError = signal('');
  private readonly wallErrorTick = signal(0);
  protected readonly idleWorkoutDraft = emptyWorkoutDraft('exercise', '');
  private readonly returnWorkoutFocus = signal<string | null>(null);
  private readonly returnFocusKind = signal<HealthClinicKind | null>(null);
  protected readonly emptyDraft = EMPTY_HEALTH_DRAFT;
  protected readonly clinicAdds: readonly { kind: HealthClinicKind; label: string; id: string }[] = [
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
  protected readonly listedMeasurements = computed(() => {
    const selected = this.clinicObject();
    return this.measurementPages().filter(page => page.kind !== selected);
  });
  protected readonly selectedVitalId = computed((): ClinicVitalId | null => {
    const id = this.clinicObject();
    return id === 'weight' || id === 'rhr' || id === 'bp' || id === 'sleep' ? id : null;
  });
  protected readonly selectedVital = computed(() => {
    const id = this.selectedVitalId();
    if (!id) return null;
    return this.measurementPages().find(page => page.kind === id) ?? null;
  });
  protected readonly labPage = computed(() => this.clinicPages().find(page => page.kind === 'lab') ?? null);
  protected readonly checkupPage = computed(() => this.clinicPages().find(page => page.kind === 'checkup') ?? null);
  protected readonly selectedLabFolder = computed(() => {
    const title = this.openLabTitle();
    if (!title || this.clinicObject() !== 'labs' || this.phase() !== 'ready') return null;
    return this.labPage()?.visibleFolders.find(folder => folder.title === title) ?? null;
  });
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
  protected readonly customExerciseCount = computed(() => {
    const editing = this.workoutDraft();
    const skip = editing?.kind === 'exercise' ? editing.clientId : '';
    return this.workouts().filter(entry =>
      entry.clientId !== skip && entry.value.kind === 'exercise' && !entry.value.archived).length;
  });
  protected readonly exerciseChoices = computed((): WorkoutDefinitionChoice[] => this.workouts().flatMap(entry => {
    if (entry.value.kind !== 'exercise' || entry.value.archived) return [];
    return [{ id: entry.clientId, name: entry.value.name, exerciseType: entry.value.exercise_type }];
  }));
  protected readonly progress = computed(() => {
    if (this.room() !== 'gym' || this.phase() !== 'ready') return EMPTY_HEALTH_PROGRESS;
    const records = this.entries().flatMap(entry => isStat(entry.value)
      ? []
      : [{ clientId: entry.clientId, value: entry.value }]);
    const sessions = this.workouts().flatMap(entry => entry.value.kind === 'session'
      ? [{ clientId: entry.clientId, value: entry.value }]
      : []);
    return projectHealthProgress(
      records,
      sessions,
      this.units(),
      this.today(),
      this.store.statsSnapshot.map(entry => entry.value),
      this.gameMedals(),
    );
  });
  protected readonly wallChoices = computed((): UiSelectOption[] => this.progress().groups.flatMap(group =>
    group.series.map(series => ({ value: series.key, label: series.title }))));
  protected readonly wallKey = computed(() => {
    const choices = this.wallChoices();
    const picked = this.wallExercise();
    if (picked && choices.some(choice => choice.value === picked)) return picked;
    return choices[0]?.value ?? '';
  });
  protected readonly wallSeries = computed(() => {
    const key = this.wallKey();
    for (const group of this.progress().groups) {
      const series = group.series.find(item => item.key === key);
      if (series) return series;
    }
    return null;
  });
  protected readonly wallBound = computed(() => boundProgressWall(
    this.wallSeries()?.history ?? [],
    this.appliedFrom(),
    this.appliedTo(),
  ));
  protected readonly wallChart = computed(() => sparklineGeometry(
    this.wallBound().points.map(point => ({ y: point.y, y2: null })),
  ));
  protected readonly floorGate = computed((): GymGate => {
    const phase = this.phase();
    if (phase === 'locked' || phase === 'setup' || phase === 'unavailable') return phase;
    return 'ready';
  });
  protected readonly activeRoutineName = computed(() => {
    const entry = this.workouts().find(item => item.value.kind === 'routine' && !item.value.archived);
    return entry?.value.kind === 'routine' ? entry.value.name : '';
  });
  protected readonly canResumeWorkout = computed(() =>
    this.workoutDraft()?.kind === 'session' || !!this.latestDraftSession());
  protected readonly canStartAnotherWorkout = computed(() => {
    const held = this.workoutDraft();
    return held?.kind === 'session' ? !!held.clientId : !!this.latestDraftSession();
  });
  protected readonly floorCanFinish = computed(() => {
    const held = this.workoutDraft();
    if (held) return held.kind === 'session';
    return this.workouts().some(item => item.value.kind === 'session' && item.value.state === 'draft');
  });
  protected readonly workoutRows = computed(() => this.workouts().map(entry => ({
    clientId: entry.clientId,
    label: formatWorkout(entry.value, this.units()),
    kind: entry.value.kind,
    archived: entry.value.kind !== 'session' && entry.value.archived,
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
      this.life.abort();
      this.releaseRead?.();
      this.read?.abort();
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
    effect(() => {
      const object = this.params().get('object');
      if (this.room() === 'gym') {
        this.clinicObject.set(null);
        this.openLabTitle.set(null);
        this.floorObject.set(gymFloorId(object));
        this.upObject.set(gymUpId(this.params().get('up')));
        return;
      }
      this.floorObject.set(null);
      this.upObject.set(null);
      const clinicId = clinicObjectId(object);
      this.clinicObject.set(clinicId);
      if (clinicId !== 'labs') this.openLabTitle.set(null);
    });
    effect(() => {
      if (this.phase() !== 'ready' || this.quickAddOpened || !this.quickAddOrigin()) return;
      this.quickAddOpened = true;
      if (this.room() === 'clinic') this.openCreate('weight');
      else this.openCurrentWorkout();
    });
    afterRenderEffect(() => {
      const tick = this.wallErrorTick();
      const message = this.wallDateError();
      if (!tick || !message || this.dialogOpen() || this.workoutDialogOpen() || this.phase() !== 'ready') return;
      queueMicrotask(() => {
        if (this.dead || this.wallErrorTick() !== tick || this.wallDateError() !== message) return;
        document.getElementById('health-wall-date-error')?.focus();
      });
    });
    afterRenderEffect(() => {
      const message = this.workoutFormError();
      if (!message || this.workoutDialogOpen() || this.phase() !== 'ready' || this.room() !== 'gym') return;
      this.scheduleReturnFocus(
        () => this.workoutFormError() === message && !this.workoutDialogOpen() && this.phase() === 'ready',
        () => document.getElementById('health-floor-error'),
        () => undefined,
      );
    });
    afterRenderEffect(() => {
      const kind = this.returnFocusKind();
      if (!kind || this.phase() !== 'ready' || this.dialogOpen()) return;
      this.scheduleReturnFocus(
        () => this.returnFocusKind() === kind && this.phase() === 'ready' && !this.dialogOpen(),
        () => document.querySelector<HTMLElement>(`#health-add-${kind} button`),
        () => this.returnFocusKind.set(null),
      );
    });
    afterRenderEffect(() => {
      const id = this.returnWorkoutFocus();
      if (!id || this.phase() !== 'ready' || this.dialogOpen() || this.workoutDialogOpen()) return;
      this.scheduleReturnFocus(
        () => this.returnWorkoutFocus() === id && this.phase() === 'ready' && !this.dialogOpen() && !this.workoutDialogOpen(),
        () => document.querySelector<HTMLElement>(`#${id} button`),
        () => this.returnWorkoutFocus.set(null),
      );
    });
  }

  ngOnInit(): void {
    this.readUnits();
    void this.resolveGate();
  }

  protected today(): string {
    return localTodayIso();
  }

  private roomPath(): string {
    const entry = this.entryId();
    const path = this.room() === 'clinic' ? '/town/clinic' : '/town/gym';
    const target = this.router.createUrlTree([path], {
      queryParams: {
        entry,
        object: this.room() === 'clinic'
          ? clinicObjectId(this.params().get('object'))
          : gymFloorId(this.params().get('object')),
        up: this.room() === 'gym' ? gymUpId(this.params().get('up')) : null,
      },
    });
    return this.router.serializeUrl(target);
  }

  protected returnQuery(): { next?: string } {
    return vaultReturnQuery(this.roomPath());
  }

  protected unlockReturn(): Record<string, unknown> | undefined {
    return this.quickAddOrigin() ? this.returns.link(this.roomPath()) : undefined;
  }

  private quickAddOrigin(): string | null {
    const state = this.location.getState() as { healthQuickAdd?: unknown } | null;
    if (state?.healthQuickAdd !== true) return null;
    const origin = this.returns.origin();
    const path = origin?.split('?')[0];
    return path === '/hub' || path === '/hub/agenda' ? origin : null;
  }

  private finishQuickAdd(): void {
    const origin = this.quickAddOpened ? this.quickAddOrigin() : null;
    if (origin) this.returns.back(origin);
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
    this.rememberFocusAnchor();
    this.dialogOpen.set(true);
  }

  protected openPr(kind: HealthPrKind): void {
    this.formError.set('');
    this.returnWorkoutFocus.set(`health-add-${kind}`);
    const draft = this.draft();
    if (!draft || draft.kind !== kind || draft.clientId) {
      this.draft.set({
        ...EMPTY_HEALTH_DRAFT,
        kind,
        direction: kind === 'other' ? 'higher' : '',
      });
    }
    this.rememberFocusAnchor();
    this.dialogOpen.set(true);
  }

  protected progressId(key: string, action: 'edit' | 'delete' | 'session'): string {
    const slug = key.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    return `health-progress-${action}-${slug || 'series'}`;
  }

  protected openWorkout(kind: WorkoutKind, focusId = `health-add-${kind}`): void {
    this.workoutFormError.set('');
    this.returnWorkoutFocus.set(focusId);
    const draft = this.workoutDraft();
    if (!draft || draft.kind !== kind || draft.clientId !== '') {
      this.workoutDraft.set(emptyWorkoutDraft(kind, this.today()));
    }
    this.rememberFocusAnchor();
    this.workoutDialogOpen.set(true);
  }

  protected resumeWorkout(clientId: string): void {
    this.openSavedSession(clientId, `health-resume-${clientId}`, 'draft');
  }

  protected editWorkout(clientId: string): void {
    this.openSavedSession(clientId, `health-edit-${clientId}`, 'completed');
  }

  protected editCatalog(clientId: string): void {
    if (this.workoutBusy()) return;
    this.workoutFormError.set('');
    const held = this.workoutDraft();
    if (!held || held.clientId !== clientId) {
      const entry = this.workouts().find(item => item.clientId === clientId);
      if (!entry || (entry.value.kind !== 'exercise' && entry.value.kind !== 'routine')) return;
      this.workoutDraft.set(entry.value.kind === 'exercise'
        ? draftFromExercise({ clientId: entry.clientId, revision: entry.revision, value: entry.value })
        : draftFromRoutine({ clientId: entry.clientId, revision: entry.revision, value: entry.value }));
    }
    this.returnWorkoutFocus.set(`health-edit-${clientId}`);
    this.rememberFocusAnchor();
    this.workoutDialogOpen.set(true);
  }

  protected startFromRoutine(clientId: string): void {
    this.startCopy(clientId, 'routine');
  }

  protected startFromSession(clientId: string): void {
    this.startCopy(clientId, 'session');
  }

  protected chooseWallExercise(value: string): void {
    this.wallExercise.set(value);
  }

  protected applyWallDates(): void {
    const next = progressDateWindow(this.wallFrom(), this.wallTo(), this.today());
    if (!next) {
      const start = this.wallFrom().trim();
      const end = this.wallTo().trim();
      const ordered = start && end && start > end && progressDateWindow(start, '', this.today()) && progressDateWindow('', end, this.today());
      this.wallDateError.set(ordered
        ? 'The start date is after the end date.'
        : 'Use a real date from 1900 through today.');
      this.wallErrorTick.update(tick => tick + 1);
      return;
    }
    this.wallDateError.set('');
    this.appliedFrom.set(next.from);
    this.appliedTo.set(next.to);
  }

  protected clearWallDates(): void {
    this.wallFrom.set('');
    this.wallTo.set('');
    this.appliedFrom.set('');
    this.appliedTo.set('');
    this.wallDateError.set('');
  }

  protected focusWall(): void {
    const target = document.getElementById('health-wall-exercise')
      ?? document.getElementById('health-progress-title');
    target?.focus();
  }

  protected focusSection(id: string): void {
    document.getElementById(id)?.focus();
  }

  protected focusCabinet(): void {
    this.focusSection('health-cabinet-title');
  }

  /** The object id is the durable gym URL. Zoom stays on this floor. */
  protected selectFloor(id: GymFloorId | null): void {
    if (this.dead || this.room() !== 'gym') return;
    this.floorObject.set(id);
    // The health-room unit route has no router snapshot. A real visit still records the object.
    if (!this.route.snapshot) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { object: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** The object id is the durable clinic URL. Zoom stays in this room. */
  protected selectClinic(id: ClinicObjectId | null): void {
    if (this.dead || this.room() !== 'clinic') return;
    this.clinicObject.set(id);
    if (id !== 'labs') this.openLabTitle.set(null);
    if (!this.route.snapshot) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { object: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected vitalPage(kind: ClinicVitalId) {
    return this.measurementPages().find(page => page.kind === kind) ?? null;
  }

  protected vitalTitle(kind: ClinicVitalId): string {
    return clinicVitalTitle(kind);
  }

  protected vitalNoun(kind: ClinicVitalId): string {
    return clinicVitalNoun(kind);
  }

  protected stationUnit(kind: ClinicVitalId): string {
    return clinicUnitLine(kind, this.units());
  }

  /** Opens one lab folder in this session. The name stays off the clinic URL. */
  protected openLab(title: string): void {
    if (this.dead || this.phase() !== 'ready' || this.clinicObject() !== 'labs') return;
    const folder = this.labPage()?.visibleFolders.find(item => item.title === title);
    if (!folder) return;
    this.openLabTitle.set(title);
    const focusId = folder.id;
    // The heading is created on the next render. A microtask still sees the index.
    setTimeout(() => {
      if (this.dead || this.openLabTitle() !== title) return;
      document.getElementById(focusId)?.focus();
    });
  }

  protected closeLab(): void {
    if (this.dead) return;
    const title = this.openLabTitle();
    const folder = this.labPage()?.visibleFolders.find(item => item.title === title);
    this.openLabTitle.set(null);
    const focusId = folder ? `health-open-${folder.id}` : 'clinic-object-title';
    setTimeout(() => {
      if (this.dead || this.openLabTitle() !== null) return;
      const host = document.getElementById(focusId);
      const button = host?.querySelector('button');
      (button instanceof HTMLElement ? button : host)?.focus();
    });
  }

  /** The upstairs id is the durable `up` query. The floor object stays put. */
  protected selectUp(id: GymUpId | null): void {
    if (this.dead || this.room() !== 'gym') return;
    this.upObject.set(id);
    if (!this.route.snapshot) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { up: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected useRoutineDesk(): void {
    if (this.phase() !== 'ready' || this.workoutBusy()) return;
    const routine = this.workouts().find(item => item.value.kind === 'routine' && !item.value.archived);
    if (!routine) return;
    this.selectFloor('station');
    this.startFromRoutine(routine.clientId);
  }

  protected recordAtStation(): void {
    if (this.phase() !== 'ready' || this.workoutBusy()) return;
    this.selectFloor('station');
    this.openCurrentWorkout('health-floor-record');
  }

  protected openCurrentWorkout(focusId = 'health-add-session'): void {
    if (this.phase() !== 'ready' || this.workoutBusy()) return;
    const held = this.workoutDraft();
    if (held?.kind === 'session') {
      if (held.clientId === '') {
        this.returnWorkoutFocus.set(focusId);
        this.rememberFocusAnchor();
        this.workoutDialogOpen.set(true);
        return;
      }
      this.openSavedSession(held.clientId, focusId, held.state === 'draft' ? 'draft' : 'completed');
      return;
    }
    const saved = this.latestDraftSession();
    if (saved) {
      this.openSavedSession(saved.clientId, focusId, 'draft');
      return;
    }
    this.openWorkout('session', focusId);
  }

  protected finishAtBench(): void {
    if (this.dead || this.phase() !== 'ready' || this.workoutBusy()) return;
    const held = this.workoutDraft();
    let draft: WorkoutDraft | null = null;
    if (held?.kind === 'session') draft = { ...held, state: 'completed' };
    else if (!held) {
      const saved = this.latestDraftSession();
      if (!saved || saved.value.kind !== 'session') return;
      draft = {
        ...draftFromSession({
          clientId: saved.clientId,
          revision: saved.revision,
          value: saved.value,
        }),
        state: 'completed',
      };
    }
    if (!draft) return;
    this.selectFloor('bench');
    this.workoutDraft.set(draft);
    void this.saveWorkout(workoutFromDraft(draft, this.today(), this.units()));
  }

  private latestDraftSession(): HealthEntry<WorkoutRecord> | null {
    const rows = this.workouts();
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const entry = rows[index];
      if (entry.value.kind === 'session' && entry.value.state === 'draft') return entry;
    }
    return null;
  }

  protected archiveWorkout(clientId: string): void {
    if (this.workoutBusy()) return;
    const generation = this.generation;
    const entry = this.workouts().find(item => item.clientId === clientId);
    if (!entry || entry.value.kind === 'session' || entry.value.archived) return;
    const noun = entry.value.kind === 'exercise' ? 'exercise' : 'routine';
    void this.confirm.confirmAction({
      title: `Archive this ${noun}?`,
      message: `This keeps the ${noun} in the vault and leaves every saved session as it was.`,
      confirmLabel: `Archive ${noun}`,
      cancelLabel: 'Keep it',
      busyLabel: `Archiving ${noun}`,
      phrase: noun === 'exercise' ? 'ARCHIVE EXERCISE' : 'ARCHIVE ROUTINE',
      errorMessage: `Could not archive this ${noun}. It is still saved. Try again.`,
      run: async () => {
        if (!this.current(generation)) return;
        const latest = this.store.workoutsSnapshot.find(item => item.clientId === clientId);
        if (!latest || latest.value.kind === 'session' || latest.value.archived) throw new Error('missing');
        const saved = await this.store.updateWorkoutCatalog(latest, { ...latest.value, archived: true }, this.today(), this.life.signal);
        if (!this.current(generation)) return;
        const draft = this.workoutDraft();
        if (draft?.clientId === clientId) this.workoutDraft.set({ ...draft, archived: true, revision: saved.revision });
        this.publish();
      },
    }).then(confirmed => {
      if (confirmed && this.current(generation)) this.returnWorkoutFocus.set(`health-edit-${clientId}`);
    });
  }

  protected onWorkoutDraft(draft: WorkoutDraft): void {
    if (this.dead) return;
    this.workoutDraft.set(draft);
    if (this.workoutFormError()) this.workoutFormError.set('');
  }

  protected onWorkoutClosed(): void {
    this.workoutDialogOpen.set(false);
    this.workoutFormError.set('');
    this.finishQuickAdd();
  }

  protected openEdit(clientId: string): void {
    const entry = this.entries().find(item => item.clientId === clientId);
    if (!entry) return;
    if (isStat(entry.value)) {
      const draft = draftFromStat({ clientId: entry.clientId, value: entry.value }, this.units());
      if (!draft) return;
      this.formError.set('');
      this.draft.set(draft);
      this.rememberFocusAnchor();
      this.dialogOpen.set(true);
      return;
    }
    this.formError.set('');
    this.draft.set(draftFromPr({ clientId: entry.clientId, value: entry.value }, this.units()));
    this.returnWorkoutFocus.set(`health-edit-${clientId}`);
    this.rememberFocusAnchor();
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
    this.finishQuickAdd();
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

  /** Accessible name for the one edit control on a lab or checkup row. */
  protected rowLabel(rows: readonly { clientId: string; label: string }[], clientId: string): string {
    return rows.find(row => row.clientId === clientId)?.label ?? '';
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
    const draft = this.draft();
    if (draft?.kind === 'run' && draft.distance !== '') {
      this.draft.set(reformatDistanceDraft(draft, previous.distance, value));
    }
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
          await this.store.deleteWorkout(latest, this.life.signal);
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

  protected removePr(clientId: string): void {
    const generation = this.generation;
    const entry = this.entries().find(item => item.clientId === clientId);
    if (!entry || isStat(entry.value) || !isPrKind(entry.value.kind)) return;
    const kind = entry.value.kind;
    const measured = entry.value.measured_on;
    const copy = prDeleteCopy(kind);
    void this.confirm.confirmAction({
      title: copy.title,
      message: `This permanently deletes the ${copy.noun} measured on ${measured}. This cannot be undone.`,
      confirmLabel: copy.confirm,
      cancelLabel: copy.cancel,
      busyLabel: copy.busy,
      phrase: healthPrDeletePhrase(kind),
      errorMessage: 'Could not delete this entry. It is still saved. Try again.',
      run: async () => {
        if (!this.current(generation)) return;
        const latest = this.store.prsSnapshot.find(item => item.clientId === clientId);
        if (!latest) throw new Error('missing');
        try {
          await this.store.deletePr(latest, this.life.signal);
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
      if (confirmed && this.current(generation)) this.returnWorkoutFocus.set(`health-add-${kind}`);
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
          await this.store.deleteStat(latest, this.life.signal);
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
          await this.store.updateStat(current, value, this.life.signal);
        } else {
          await this.store.createStat(value, this.life.signal);
        }
      } else if (clientId) {
        const current = this.store.prsSnapshot.find(item => item.clientId === clientId);
        if (!this.current(generation)) return;
        if (!current) {
          this.formError.set('That entry is no longer saved. Your draft is still here.');
          return;
        }
        if (current.value.kind !== value.kind) {
          this.formError.set('That record is a different kind. Your draft is still here.');
          return;
        }
        if (sameStoredPr(current.value, value)) {
          this.finishSaved(generation, submitted);
          return;
        }
        await this.store.updatePr(current, value, this.life.signal);
      } else {
        await this.store.createPr(value, this.life.signal);
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
      if (submitted?.clientId) {
        const current = this.store.workoutsSnapshot.find(item => item.clientId === submitted.clientId);
        if (!this.current(generation)) return;
        if (!current || current.value.kind !== value.kind) {
          this.workoutFormError.set('That workout is no longer saved. Your draft is still here.');
          return;
        }
        const revision = submitted.revision ?? current.revision;
        const pinned = { ...current, revision };
        if (value.kind === 'session') {
          await this.store.updateWorkoutSession(pinned, value, this.today(), this.life.signal);
          if (this.current(generation)) {
            this.returnWorkoutFocus.set(value.state === 'draft'
              ? `health-resume-${submitted.clientId}`
              : `health-edit-${submitted.clientId}`);
          }
        } else {
          await this.store.updateWorkoutCatalog(pinned, value, this.today(), this.life.signal);
          if (this.current(generation)) this.returnWorkoutFocus.set(`health-edit-${submitted.clientId}`);
        }
      } else {
        const created = await this.store.createWorkout(value, this.today(), this.life.signal);
        if (this.current(generation) && submitted?.startedFrom && created.value.kind === 'session') {
          this.returnWorkoutFocus.set(created.value.state === 'draft'
            ? `health-resume-${created.clientId}`
            : `health-edit-${created.clientId}`);
        }
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
    if (submitted && isPrKind(submitted.kind)) {
      this.returnWorkoutFocus.set(submitted.clientId
        ? `health-edit-${submitted.clientId}`
        : `health-add-${submitted.kind}`);
    }
    this.draft.set(null);
    this.dialogOpen.set(false);
    this.formError.set('');
    this.finishQuickAdd();
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
    this.rememberFocusAnchor();
    this.workoutDialogOpen.set(true);
  }

  private startCopy(clientId: string, kind: 'routine' | 'session'): void {
    if (this.workoutBusy()) return;
    const entry = this.workouts().find(item => item.clientId === clientId);
    if (!entry) return;
    const source = entry.value;
    if (kind === 'routine' && (source.kind !== 'routine' || source.archived)) return;
    if (kind === 'session' && (source.kind !== 'session' || source.state !== 'completed')) return;
    if (source.kind === 'exercise') return;
    this.workoutFormError.set('');
    this.workoutDraft.set(draftFromPlan(source, this.today(), kind));
    this.returnWorkoutFocus.set(kind === 'routine' ? `health-start-${clientId}` : `health-again-${clientId}`);
    this.rememberFocusAnchor();
    this.workoutDialogOpen.set(true);
  }

  private finishWorkout(generation: number, submitted: WorkoutDraft | null): void {
    if (!this.current(generation)) return;
    const draft = this.workoutDraft();
    if (submitted && draft && JSON.stringify(draft) !== JSON.stringify(submitted)) return;
    this.workoutDraft.set(null);
    this.workoutDialogOpen.set(false);
    this.workoutFormError.set('');
    this.finishQuickAdd();
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
    this.focusAnchor = null;
    this.workouts.set([]);
    this.returnFocusKind.set(null);
    this.openLabTitle.set(null);
    this.shownByKind.set({});
    this.revealFocusId.set(null);
    this.wallExercise.set('');
    this.wallFrom.set('');
    this.wallTo.set('');
    this.appliedFrom.set('');
    this.appliedTo.set('');
    this.wallDateError.set('');
    this.wallErrorTick.set(0);
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

  /** The control that was focused when a dialog opened. Dialog restore returns here. */
  private focusAnchor: Element | null = null;

  private rememberFocusAnchor(): void {
    this.focusAnchor = document.activeElement;
  }

  /** A dialog's background stays inert until the dialog is gone, so focus waits one turn. */
  private scheduleReturnFocus(
    still: () => boolean,
    locate: () => HTMLElement | null,
    clear: () => void,
  ): void {
    const anchor = this.focusAnchor;
    setTimeout(() => {
      if (this.dead || !still()) return;
      const button = locate();
      if (!button) return;
      let node: HTMLElement | null = button;
      while (node) {
        if (node.inert) return;
        node = node.parentElement;
      }
      const active = document.activeElement;
      clear();
      if (
        active instanceof HTMLElement
        && active.isConnected
        && active !== document.body
        && active !== document.documentElement
        && active !== anchor
      ) return;
      button.focus();
    });
  }

  /** A newer read or leaving the room aborts the previous vault read. */
  private openRead(): AbortSignal {
    this.releaseRead?.();
    this.read?.abort();
    const controller = new AbortController();
    this.read = controller;
    const onLife = (): void => controller.abort();
    if (this.life.signal.aborted) controller.abort();
    else {
      this.life.signal.addEventListener('abort', onLife, { once: true });
      this.releaseRead = () => this.life.signal.removeEventListener('abort', onLife);
    }
    return controller.signal;
  }

  private async resolveGate(): Promise<void> {
    const generation = this.generation;
    const signal = this.openRead();
    if (!this.current(generation) || signal.aborted) return;
    this.phase.set('loading');
    this.entries.set([]);
    this.unreadable.set(0);
    if (financeVaultPresent()) {
      let result;
      try {
        result = await this.store.load({ signal });
      } catch {
        if (this.current(generation) && !signal.aborted) this.phase.set('unavailable');
        return;
      }
      if (!this.current(generation) || signal.aborted) return;
      if (financeVaultPresent() && result.state !== 'locked') {
        if (result.state === 'ready') {
          this.unreadable.set(result.unreadable);
          this.publish();
        }
        this.phase.set(result.state);
        return;
      }
      this.dropPrivate();
    }
    const exists = await this.vaultExists();
    if (!this.current(generation) || signal.aborted) return;
    if (exists === true) {
      this.phase.set('locked');
      return;
    }
    this.phase.set(exists === false && this.ownerId() ? 'setup' : 'unavailable');
  }

  private publish(): void {
    const rows = this.room() === 'clinic' ? this.store.statsSnapshot : this.store.prsSnapshot;
    this.entries.set([...rows]);
    this.workouts.set(this.room() === 'gym' ? [...this.store.workoutsSnapshot] : []);
  }
}
