import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { bindLockNotices, bindLockSnapshots } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import {
  isJournalCollection,
  projectHallJournal,
  type JournalCollection,
  type JournalItem,
  type JournalSource,
} from './hall-journal';
import { TownApiService } from './town.api';
import { TownPlaceComponent, type PlaceCrumb } from './town-place.component';

@Component({
  selector: 'app-hall-journal',
  imports: [RouterLink, TownPlaceComponent],
  templateUrl: './hall-journal.component.html',
  styleUrl: './hall-journal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HallJournalComponent {
  private readonly api = inject(TownApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private owner: number | null = null;
  private generation = 0;
  private focusedItem: string | null = null;
  private seenCollection: string | null | undefined;

  protected readonly pages = signal<readonly JournalCollection[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly find = signal('');
  protected readonly hints = signal(false);
  protected readonly signedOut = signal(false);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly collectionId = computed(() => this.params().get('collection'));
  protected readonly active = computed(() => {
    const pages = this.pages();
    const id = this.collectionId();
    if (!pages || !isJournalCollection(id)) return null;
    return pages.find(page => page.id === id) ?? null;
  });
  protected readonly selected = computed(() => {
    const page = this.active();
    const id = recordId(this.query().get('item'));
    if (!page || !id) return null;
    return page.items.find(item => item.id === id) ?? null;
  });
  protected readonly crumbs = computed((): readonly PlaceCrumb[] => {
    const page = this.active();
    const journal: PlaceCrumb = page
      ? { label: 'Journal', href: '/town/hall/journal' }
      : { label: 'Journal' };
    const base: PlaceCrumb[] = [
      { label: 'Town', href: '/town' },
      { label: 'Hall', href: '/town/hall' },
      journal,
    ];
    return page ? [...base, { label: page.title }] : base;
  });

  constructor() {
    effect(() => {
      const id = this.collectionId();
      if (this.seenCollection !== undefined && this.seenCollection !== id) this.find.set('');
      this.seenCollection = id;
    });
    effect(() => {
      const id = this.selected()?.id ?? null;
      if (!id) {
        this.focusedItem = null;
        return;
      }
      if (id === this.focusedItem) return;
      this.focusedItem = id;
      const generation = this.generation;
      queueMicrotask(() => {
        if (generation !== this.generation || this.selected()?.id !== id || this.destroy.destroyed) return;
        this.host.nativeElement.querySelector<HTMLElement>('#journal-item')?.focus();
      });
    });
    const refresh = (): void => {
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
      this.signedOut.set(owner == null);
      this.load();
    });
  }

  @HostListener('document:keydown.escape')
  protected closeFromEscape(): void {
    if (this.selected()) this.closeItem();
  }

  protected unknownCollection(): boolean {
    const id = this.collectionId();
    return id != null && !isJournalCollection(id);
  }

  protected ownerMissing(): boolean {
    return this.signedOut() && !this.loading() && this.pages() == null;
  }

  protected queryItem(): string | null {
    return recordId(this.query().get('item'));
  }

  protected earnedCount(page: JournalCollection): number {
    return page.items.filter(item => item.earned).length;
  }

  protected visible(page: JournalCollection): readonly JournalItem[] {
    const query = this.find().trim().toLowerCase();
    if (!query) return page.items;
    return page.items.filter(item => item.title.toLowerCase().includes(query));
  }

  protected onFind(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.find.set(target.value);
  }

  protected toggleHints(): void {
    this.hints.update(value => !value);
  }

  protected itemQuery(id: string | null): { item: string | null } {
    return { item: id };
  }

  protected closeItem(): void {
    const id = this.selected()?.id;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { item: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (id) this.focus(`#journal-open-${id}`);
  }

  protected load(): void {
    if (this.owner === null || this.loading()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.loadError.set(false);
    forkJoin({
      quests: this.api.getQuests(),
      discoveries: this.api.getDiscoveries(),
      residents: this.api.getResidents(),
      arcade: this.api.getArcade(),
    }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: source => this.publish(source, generation),
      error: () => this.fail(generation),
    });
  }

  private publish(source: JournalSource, generation: number): void {
    if (generation !== this.generation) return;
    this.pages.set(projectHallJournal(source));
    this.loading.set(false);
    this.focus('#journal-item');
  }

  private fail(generation: number): void {
    if (generation !== this.generation) return;
    this.loading.set(false);
    this.loadError.set(true);
    this.focus(this.pages() ? '#journal-stale' : '#journal-load-error');
  }

  private invalidate(): void {
    this.generation += 1;
    this.pages.set(null);
    this.loading.set(false);
    this.loadError.set(false);
    this.find.set('');
    this.hints.set(false);
    this.focusedItem = null;
  }

  private focus(selector: string): void {
    const generation = this.generation;
    afterNextRender(() => {
      if (generation !== this.generation || this.destroy.destroyed) return;
      this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
    }, { injector: this.injector });
  }
}

function recordId(value: string | null): string | null {
  if (value == null || !/^[a-z0-9-]{1,64}$/.test(value)) return null;
  return value;
}
