import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, distinctUntilChanged, map } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { artifactLabel, sceneryFor, shownRows } from './keepsake-view';
import type { KeepsakeShelf } from './keepsake.types';
import { TownApiService } from './town.api';

type Phase = 'idle' | 'loading' | 'refreshing' | 'ready' | 'unavailable';

@Component({
  selector: 'app-keepsake-shelf',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './keepsake-shelf.component.html',
  styleUrl: './keepsake-shelf.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeepsakeShelfComponent {
  readonly day = input<string | null>(null);
  readonly persist = input(false);

  private readonly api = inject(TownApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly draft = signal('');
  readonly expanded = signal(false);
  readonly shelf = signal<KeepsakeShelf | null>(null);
  readonly phase = signal<Phase>('idle');
  readonly notice = signal<string | null>(null);
  private readonly ownerId = signal<number | null>(null);
  private readonly localSelection = signal<string | null>(null);
  private readonly routeOn = signal(this.route.snapshot.queryParamMap.get('on'));
  private readonly objectParam = signal(this.route.snapshot.queryParamMap.get('object'));

  protected readonly activeDay = computed(() => this.day() ?? this.routeOn());
  protected readonly selectedId = computed(() => this.persist() ? this.objectParam() : this.localSelection());
  protected readonly artifactLabel = artifactLabel;
  protected readonly sceneryFor = sceneryFor;
  protected readonly view = computed(() => {
    const shelf = this.visibleShelf();
    if (!shelf) return null;
    const draft = this.draft();
    const expanded = this.expanded();
    const keepsakes = shownRows(shelf.keepsakes, draft, expanded);
    const souvenirs = shownRows(shelf.souvenirs, draft, expanded);
    const planned = shownRows(shelf.planned, draft, expanded);
    const ineligible = shownRows(shelf.ineligible, draft, expanded);
    const toggle = [keepsakes, souvenirs, planned, ineligible].some(group => group.matched > 3);
    return { shelf, keepsakes, souvenirs, planned, ineligible, toggle };
  });

  private epoch = 0;
  private subscription: Subscription | null = null;
  private alive = true;
  private seenOwner: number | null | undefined = undefined;
  private returnFocus = true;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.routeOn.set(params.get('on'));
      this.objectParam.set(params.get('object'));
    });
    this.session.user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(id => {
      if (this.seenOwner !== undefined && this.seenOwner !== id) {
        this.invalidate();
        this.clearPrivate();
      }
      this.seenOwner = id;
      this.ownerId.set(id);
    });
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.invalidate();
      this.clearPrivate();
      this.ownerId.set(null);
    });
    effect(() => {
      const owner = this.ownerId();
      const day = this.activeDay();
      untracked(() => this.fetch(owner, day));
    });
    this.destroyRef.onDestroy(() => {
      this.alive = false;
      this.epoch += 1;
      this.subscription?.unsubscribe();
    });
  }

  protected visibleShelf(): KeepsakeShelf | null {
    const shelf = this.shelf();
    if (!shelf || shelf.on !== this.activeDay()) return null;
    return shelf;
  }

  protected onFind(event: Event): void {
    const target = event.target;
    this.draft.set(target instanceof HTMLInputElement ? target.value : '');
  }

  protected toggleMore(): void {
    this.expanded.update(value => !value);
  }

  protected choose(id: string): void {
    if (this.persist()) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { object: id },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      return;
    }
    this.localSelection.set(id);
  }

  protected dayLink(): { on: string } | null {
    const day = this.day();
    return day ? { on: day } : null;
  }

  retry(): void {
    this.fetch(this.ownerId(), this.activeDay());
  }

  private invalidate(): void {
    this.epoch += 1;
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  private clearPrivate(): void {
    this.draft.set('');
    this.expanded.set(false);
    this.shelf.set(null);
    this.notice.set(null);
    this.localSelection.set(null);
    this.returnFocus = true;
    if (this.persist() && this.objectParam()) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { object: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  private contains(body: KeepsakeShelf, id: string): boolean {
    return [...body.keepsakes, ...body.souvenirs, ...body.planned, ...body.ineligible].some(item => item.id === id);
  }

  private focusSoon(target: string): void {
    afterNextRender(() => {
      if (!this.alive) return;
      if (target === 'heading') this.focusHeading();
      else this.focusSelected(target);
    }, { injector: this.injector });
  }

  private focusHeading(): void {
    const heading = this.host.nativeElement.querySelector<HTMLElement>('#keepsake-heading');
    heading?.focus();
  }

  private focusSelected(id: string): void {
    const button = this.host.nativeElement.querySelector<HTMLButtonElement>(
      `[data-keepsake="${CSS.escape(id)}"] button`,
    );
    button?.focus();
  }

  private fetch(owner: number | null, day: string | null): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.epoch += 1;
    const epoch = this.epoch;
    if (!this.alive) return;
    if (owner == null) {
      this.phase.set('idle');
      this.shelf.set(null);
      return;
    }
    const current = this.shelf();
    if (current && current.on !== day) {
      this.shelf.set(null);
      this.localSelection.set(null);
    }
    this.notice.set(null);
    this.phase.set(this.shelf() ? 'refreshing' : 'loading');
    this.subscription = this.api.getKeepsakes(day).subscribe({
      next: body => this.publish(body, owner, day, epoch),
      error: () => this.fail(owner, day, epoch),
    });
  }

  private publish(body: KeepsakeShelf, owner: number, day: string | null, epoch: number): void {
    if (!this.alive || epoch !== this.epoch || this.ownerId() !== owner || this.activeDay() !== day) return;
    this.shelf.set(body);
    this.phase.set('ready');
    this.notice.set(null);
    const selected = this.selectedId();
    if (selected && !this.contains(body, selected)) {
      this.localSelection.set(null);
      if (this.persist()) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { object: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
      this.focusSoon('heading');
      this.returnFocus = false;
      return;
    }
    if (this.returnFocus) {
      this.returnFocus = false;
      if (this.persist() && selected) this.focusSoon(selected);
    }
  }

  private fail(owner: number, day: string | null, epoch: number): void {
    if (!this.alive || epoch !== this.epoch || this.ownerId() !== owner || this.activeDay() !== day) return;
    if (this.shelf() && this.shelf()?.on === day) {
      this.phase.set('ready');
      this.notice.set('This refresh failed. The shelf still shows the last records.');
      return;
    }
    this.phase.set('unavailable');
    this.notice.set(null);
  }
}
