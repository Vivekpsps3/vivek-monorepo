import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { bindLockNotices, bindLockSnapshots } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { TownApiService, type DiscoveryJournal, type DiscoveryView } from './town.api';

interface DiscoveryConfirmation {
  readonly id: string;
  readonly name: string;
  readonly expectedRevision: number;
  readonly found: boolean;
}

@Component({
  selector: 'app-town-discoveries',
  imports: [RouterLink],
  templateUrl: './discoveries.component.html',
  styleUrl: './discoveries.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoveriesComponent {
  private readonly api = inject(TownApiService);
  private readonly destroy = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  private owner: number | null = null;
  private generation = 0;
  private openedQuery = false;

  protected readonly journal = signal<DiscoveryJournal | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly loadError = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly hints = signal(false);
  protected readonly confirmation = signal<DiscoveryConfirmation | null>(null);

  constructor() {
    const refresh = () => {
      this.invalidate();
      this.load();
    };
    this.destroy.onDestroy(bindLockSnapshots(refresh));
    this.destroy.onDestroy(bindLockNotices(refresh));
    inject(SessionService).user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(owner => {
      this.invalidate();
      this.owner = owner;
      this.load();
    });
  }

  @HostListener('document:keydown.escape')
  protected cancelFromEscape(): void {
    if (this.confirmation() && !this.busy()) this.cancel();
  }

  protected toggleHints(): void {
    this.hints.update(shown => !shown);
  }

  protected buttonId(item: DiscoveryView): string {
    return `discovery-${item.id}`;
  }

  protected foundCount(journal: DiscoveryJournal): number {
    return journal.discoveries.filter(item => item.found).length;
  }

  protected choose(item: DiscoveryView): void {
    const current = this.journal();
    if (!current || this.busy() || this.confirmation()) return;
    this.error.set('');
    this.notice.set('');
    this.confirmation.set({
      id: item.id,
      name: item.name,
      expectedRevision: current.revision,
      found: item.found,
    });
    this.focus('#discovery-confirmation');
  }

  protected cancel(): void {
    if (this.busy()) return;
    const choice = this.confirmation();
    this.confirmation.set(null);
    this.error.set('');
    if (choice) this.focus(`#discovery-${choice.id}`);
  }

  protected confirm(): void {
    const choice = this.confirmation();
    if (!choice || this.busy() || this.owner === null) return;
    const generation = this.generation;
    const already = choice.found;
    this.busy.set(true);
    this.api.recordDiscovery({
      discovery_id: choice.id,
      expected_revision: choice.expectedRevision,
    }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: journal => {
        if (generation !== this.generation) return;
        this.busy.set(false);
        this.journal.set(journal);
        this.confirmation.set(null);
        this.error.set('');
        this.notice.set(already ? 'Already in the journal.' : 'Found once.');
        this.focus('#discovery-notice');
      },
      error: (failure: unknown) => {
        if (generation !== this.generation) return;
        this.busy.set(false);
        const status = failureStatus(failure);
        const code = failureCode(failure);
        if (status === 409 || code === 'discovery_conflict') {
          this.confirmation.set(null);
          this.error.set('This journal changed. The current discoveries are shown.');
          this.load();
          this.focus('#discovery-error');
          return;
        }
        this.error.set('The discovery did not save. Try again.');
        this.focus('#discovery-error');
      },
    });
  }

  protected load(): void {
    if (this.owner === null || this.loading() || this.busy()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.loadError.set(false);
    this.api.getDiscoveries().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: journal => {
        if (generation !== this.generation) return;
        this.journal.set(journal);
        this.loading.set(false);
        this.openRequested();
      },
      error: () => {
        if (generation !== this.generation) return;
        this.journal.set(null);
        this.loadError.set(true);
        this.loading.set(false);
        this.focus('#discovery-load-error');
      },
    });
  }

  private openRequested(): void {
    if (this.openedQuery || this.error() || this.confirmation() || this.busy()) return;
    const requested = this.params().get('object');
    const journal = this.journal();
    if (!requested || !journal) return;
    const item = journal.discoveries.find(entry => entry.id === requested);
    if (!item) return;
    this.openedQuery = true;
    this.choose(item);
  }

  private invalidate(): void {
    this.generation += 1;
    this.openedQuery = false;
    this.journal.set(null);
    this.loading.set(false);
    this.busy.set(false);
    this.loadError.set(false);
    this.confirmation.set(null);
    this.notice.set('');
    this.error.set('');
    this.hints.set(false);
  }

  private focus(selector: string): void {
    const generation = this.generation;
    afterNextRender(() => {
      if (generation !== this.generation || this.destroy.destroyed) return;
      this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
    }, { injector: this.injector });
  }
}

function failureStatus(failure: unknown): number {
  if (typeof failure === 'object' && failure && 'status' in failure && typeof failure.status === 'number') {
    return failure.status;
  }
  return 0;
}

function failureCode(failure: unknown): string {
  if (typeof failure !== 'object' || !failure || !('error' in failure)) return '';
  const body = failure.error;
  if (typeof body === 'object' && body && 'code' in body && typeof body.code === 'string') return body.code;
  return '';
}
