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
import {
  DEFAULT_HEALTH_UNITS,
  EMPTY_HEALTH_DRAFT,
  corruptNotice,
  draftFromStat,
  formatHealthPr,
  formatHealthStat,
  healthDeletePhrase,
  isVitalKind,
  readHealthUnits,
  reformatWeightDraft,
  sameStoredStat,
  writeHealthUnits,
  type HealthDraft,
  type HealthEditorKind,
  type HealthUnits,
  type HealthVitalKind,
} from './health-entry';
import {
  HEALTH_CONFLICT_MESSAGE,
  HealthConflictError,
  HealthLockedError,
  HealthStoreService,
  type HealthEntry,
} from './health-store.service';
import type { HealthPr, HealthStat } from './health.types';

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

function vitalName(kind: HealthVitalKind): string {
  switch (kind) {
    case 'weight': return 'weight';
    case 'rhr': return 'resting heart rate';
    case 'bp': return 'blood pressure';
    case 'sleep': return 'sleep';
  }
}

function isStat(value: HealthStat | HealthPr): value is HealthStat {
  return value.kind === 'weight' || value.kind === 'rhr' || value.kind === 'bp'
    || value.kind === 'sleep' || value.kind === 'lab' || value.kind === 'checkup';
}

@Component({
  selector: 'app-health-room',
  imports: [
    HealthEntryDialogComponent,
    HealthLinkedFocusDirective,
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
  protected readonly draft = signal<HealthDraft | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  private readonly returnFocusKind = signal<HealthVitalKind | null>(null);
  protected readonly emptyDraft = EMPTY_HEALTH_DRAFT;
  protected readonly vitalAdds: readonly { kind: HealthVitalKind; label: string; id: string }[] = [
    { kind: 'weight', label: 'Add weight', id: 'health-add-weight' },
    { kind: 'rhr', label: 'Add resting heart rate', id: 'health-add-rhr' },
    { kind: 'bp', label: 'Add blood pressure', id: 'health-add-bp' },
    { kind: 'sleep', label: 'Add sleep', id: 'health-add-sleep' },
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
  protected readonly rows = computed(() => {
    const units = this.units();
    if (this.room() === 'clinic') {
      return this.entries().flatMap(entry => isStat(entry.value)
        ? [{
          clientId: entry.clientId,
          label: formatHealthStat(entry.value, units),
          kind: entry.value.kind,
          vital: isVitalKind(entry.value.kind),
        }]
        : []);
    }
    return this.entries().flatMap(entry => isStat(entry.value)
      ? []
      : [{
        clientId: entry.clientId,
        label: formatHealthPr(entry.value, units),
        kind: entry.value.kind,
        vital: false,
      }]);
  });
  protected readonly missingEntry = computed(() => {
    const id = this.entryId();
    return !!id && this.phase() === 'ready' && !this.rows().some(row => row.clientId === id);
  });
  protected readonly notice = computed(() => corruptNotice(this.unreadable()));

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

  protected openCreate(kind: HealthVitalKind): void {
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
    this.updateUnits({ ...this.units(), weight: value });
    const draft = this.draft();
    if (!draft || (draft.kind !== 'weight' && draft.kind !== 'lift') || draft.weight === '') return;
    this.draft.set(reformatWeightDraft(draft, previous, value));
  }

  protected setDistance(value: string | number | null): void {
    if (value !== 'km' && value !== 'mi') return;
    this.updateUnits({ ...this.units(), distance: value });
  }

  protected removeEntry(clientId: string): void {
    const generation = this.generation;
    const entry = this.entries().find(item => item.clientId === clientId);
    if (!entry || !isStat(entry.value) || !isVitalKind(entry.value.kind)) return;
    const kind = entry.value.kind;
    const measured = entry.value.measured_on;
    void this.confirm.confirmAction({
      title: 'Delete this measurement?',
      message: `This permanently deletes the ${vitalName(kind)} measured on ${measured}. This cannot be undone.`,
      confirmLabel: 'Delete measurement',
      cancelLabel: 'Keep measurement',
      busyLabel: 'Deleting measurement',
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

  private dropPrivate(): void {
    this.entries.set([]);
    this.unreadable.set(0);
    this.draft.set(null);
    this.formError.set('');
    this.dialogOpen.set(false);
    this.busy.set(false);
    this.returnFocusKind.set(null);
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
  }
}
