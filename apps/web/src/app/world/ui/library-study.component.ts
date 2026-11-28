import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { SessionService } from '../../platform/session.service';
import { WorldApi } from '../data/world-api';
import { ConceptSheetComponent } from './concept-sheet.component';

const MAX_CONCEPT_ID = 9223372036854775807n;

/** Route id for one saved concept. `null` is the study list. `invalid` is not an id. */
export function studyConceptId(raw: string | null): number | 'invalid' | null {
  if (raw == null || raw === '') return null;
  if (!/^[1-9]\d{0,18}$/.test(raw)) return 'invalid';
  let wide: bigint;
  try {
    wide = BigInt(raw);
  } catch {
    return 'invalid';
  }
  const id = Number(raw);
  if (wide > MAX_CONCEPT_ID || !Number.isSafeInteger(id)) return 'invalid';
  return id;
}

function townToday(value: unknown): string {
  const today = (value as { town?: { today?: unknown } } | null)?.town?.today;
  return typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : '';
}

@Component({
  selector: 'app-library-study',
  imports: [RouterLink, ConceptSheetComponent],
  templateUrl: './library-study.component.html',
  styleUrl: './library-study.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryStudyComponent {
  private readonly api = inject(WorldApi);
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });
  private clock = new AbortController();
  private owner: number | null = null;

  protected readonly today = signal('');
  protected readonly parsed = computed(() => studyConceptId(this.params().get('conceptId')));
  protected readonly focusId = computed(() => {
    const parsed = this.parsed();
    return typeof parsed === 'number' ? parsed : null;
  });
  protected readonly absent = computed(() => this.parsed() === 'invalid');
  protected readonly creating = computed(() => this.query().get('new') === '1' && this.focusId() == null && !this.absent());

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.clock.abort());
    this.session.user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(owner => {
      this.owner = owner;
      this.today.set('');
      this.clock.abort();
      this.clock = new AbortController();
      if (owner == null) return;
      const signal = this.clock.signal;
      void this.api.getTown(signal).then(town => {
        if (signal.aborted || this.owner !== owner) return;
        this.today.set(townToday(town));
      }).catch(() => {
        if (!signal.aborted && this.owner === owner) this.today.set('');
      });
    });
  }
}
