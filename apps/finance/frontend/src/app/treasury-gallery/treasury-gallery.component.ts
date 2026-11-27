import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  afterRenderEffect,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import {
  AppDatePipe,
  MoneyPipe,
  UiButtonComponent,
  UiPageHeaderComponent,
} from '@vivek/ui';
import { VaultService } from '../crypto/vault.service';
import type { Holding, Transaction } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import {
  UNASSIGNED_ACCOUNT_FILTER,
  emptyGalleryFilters,
  galleryActivityQuery,
  galleryFilterChoices,
  galleryFilterSummary,
  galleryHasAdvancedFilters,
  galleryToday,
  projectTreasuryGallery,
  readGalleryQuery,
  writeGalleryQuery,
  type GalleryFilters,
  type GallerySort,
} from './treasury-gallery';

@Component({
  selector: 'app-treasury-gallery',
  standalone: true,
  imports: [UiPageHeaderComponent, UiButtonComponent, MoneyPipe, AppDatePipe],
  templateUrl: './treasury-gallery.component.html',
  styleUrl: './treasury-gallery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreasuryGalleryComponent implements OnInit, OnDestroy {
  private readonly finance = inject(FinanceService);
  private readonly vault = inject(VaultService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroy$ = new Subject<void>();
  private destroyed = false;
  private sealed = false;
  private arrivalHandled = false;
  private loadGeneration = 0;
  private boundSession = 0;

  readonly asOf = galleryToday();
  readonly unassignedAccount = UNASSIGNED_ACCOUNT_FILTER;
  readonly exposed = signal(true);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly filters = signal<GalleryFilters>(emptyGalleryFilters());
  readonly sort = signal<GallerySort>({ column: 'date', direction: 'desc' });
  readonly openedPosition = signal<number | null>(null);
  readonly openedLedger = signal<number | null>(null);
  private readonly holdings = signal<Holding[]>([]);
  private readonly transactions = signal<Transaction[]>([]);
  readonly choices = computed(() => galleryFilterChoices(this.exposed() ? this.transactions() : [], this.filters()));
  readonly filterSummary = computed(() => galleryFilterSummary(this.filters(), this.choices()));
  readonly activityQuery = computed(() => galleryActivityQuery(this.filters()));
  readonly projection = computed(() => projectTreasuryGallery({
    holdings: this.exposed() ? this.holdings() : [],
    transactions: this.exposed() ? this.transactions() : [],
    filters: this.filters(),
    sort: this.sort(),
    openedPositionId: this.exposed() ? this.openedPosition() : null,
    openedLedgerId: this.exposed() ? this.openedLedger() : null,
    vaultOpen: this.exposed(),
    asOf: this.asOf,
  }));
  readonly activityView = computed(() => {
    const type = this.filters().typeFilter;
    return type === 'income' ? 'income' : type === 'expense' ? 'spending' : 'all';
  });

  constructor() {
    afterRenderEffect(() => {
      const ledgerId = this.openedLedger();
      const positionId = this.openedPosition();
      const loading = this.loading();
      const count = this.projection().plaques.length + this.projection().lines.length;
      const advanced = galleryHasAdvancedFilters(this.filters(), this.sort());
      const root = this.host.nativeElement as HTMLElement;
      if (this.arrivalHandled || this.destroyed || this.sealed) return;
      if (ledgerId == null && positionId == null) {
        if (count > 0 || !loading) this.arrivalHandled = true;
        if (advanced) root.querySelector('details.activity-filters')?.setAttribute('open', '');
        return;
      }
      const selector = ledgerId != null ? `[data-ledger-line="${ledgerId}"]` : `[data-plaque="${positionId}"]`;
      const origin = root.querySelector(selector);
      if (!origin) {
        if (!loading) this.arrivalHandled = true;
        if (advanced) root.querySelector('details.activity-filters')?.setAttribute('open', '');
        return;
      }
      this.arrivalHandled = true;
      if (advanced) root.querySelector('details.activity-filters')?.setAttribute('open', '');
      if (!(origin instanceof HTMLElement)) return;
      origin.focus({ preventScroll: true });
      origin.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  ngOnInit(): void {
    this.boundSession = this.finance.sessionToken;
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (!this.acceptsPublication()) return;
      const query = readGalleryQuery(name => params.get(name));
      this.filters.set(query.filters);
      this.sort.set(query.sort);
      this.openedPosition.set(query.positionId);
      this.openedLedger.set(query.ledgerId);
      this.cdr.markForCheck();
    });
    this.finance.holdings$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      if (!this.acceptsPublication()) return;
      this.holdings.set(rows);
      this.cdr.markForCheck();
    });
    this.finance.transactions$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      if (!this.acceptsPublication()) return;
      this.transactions.set(rows);
      this.cdr.markForCheck();
    });
    this.vault.unlocked$.pipe(takeUntil(this.destroy$)).subscribe(open => {
      if (!open) this.seal();
    });
    this.loadRecords();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.seal();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadRecords(): void {
    const session = this.finance.sessionToken;
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.loadFailed.set(false);
    forkJoin([this.finance.getHoldings(false), this.finance.getTransactions()])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.finishLoad(session, generation, false),
        error: () => this.finishLoad(session, generation, true),
      });
  }

  openPosition(id: number): void {
    if (!this.acceptsPublication() || !this.holdings().some(row => row.id === id)) return;
    this.openedPosition.set(id);
    this.writeRoute(false);
  }

  openLedger(id: number): void {
    if (!this.acceptsPublication() || !this.projection().lines.some(line => line.id === id)) return;
    this.openedLedger.set(id);
    this.writeRoute(false);
  }

  ledgerActivityQuery(id: number): Record<string, string | null> {
    return { ...galleryActivityQuery(this.filters()), edit: String(id) };
  }

  setSearch(value: string): void {
    this.patchFilters({ searchTerm: value }, true);
  }

  setView(value: string): void {
    const typeFilter = value === 'income' ? 'income' : value === 'spending' ? 'expense' : 'all';
    this.patchFilters({ typeFilter }, false);
  }

  setChoice(key: 'accountFilter' | 'categoryFilter' | 'merchantFilter' | 'tripFilter', value: string): void {
    this.patchFilters({ [key]: value }, false);
  }

  setDate(key: 'fromDate' | 'throughDate' | 'selectedCalendarDate', value: string): void {
    if (key === 'selectedCalendarDate') this.patchFilters({ selectedCalendarDate: value || null }, false);
    else if (key === 'fromDate') this.patchFilters({ fromDate: value }, false);
    else this.patchFilters({ throughDate: value }, false);
  }

  inputValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement ? target.value : '';
  }

  setSort(value: string): void {
    if (!this.acceptsPublication()) return;
    const query = readGalleryQuery(name => name === 'sort' ? value : null);
    this.sort.set(query.sort);
    this.writeRoute(false);
  }

  clearFilters(): void {
    if (!this.acceptsPublication()) return;
    this.filters.set(emptyGalleryFilters());
    this.sort.set({ column: 'date', direction: 'desc' });
    this.writeRoute(false);
  }

  private patchFilters(patch: Partial<GalleryFilters>, replaceUrl: boolean): void {
    if (!this.acceptsPublication()) return;
    this.filters.update(current => ({ ...current, ...patch }));
    this.writeRoute(replaceUrl);
  }

  private writeRoute(replaceUrl: boolean): void {
    if (!this.acceptsPublication()) return;
    const left = window.scrollX;
    const top = window.scrollY;
    const focused = document.activeElement;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: writeGalleryQuery({
        filters: this.filters(),
        sort: this.sort(),
        positionId: this.openedPosition(),
        ledgerId: this.openedLedger(),
      }),
      replaceUrl,
    }).then(() => {
      if (this.destroyed || this.sealed) return;
      const restore = () => {
        if (this.destroyed || this.sealed) return;
        if (window.scrollX !== left || window.scrollY !== top) window.scrollTo(left, top);
        if (focused instanceof HTMLElement && focused.isConnected && document.activeElement === document.body) {
          focused.focus({ preventScroll: true });
        }
      };
      restore();
      requestAnimationFrame(restore);
    });
  }

  private finishLoad(session: number, generation: number, failed: boolean): void {
    if (this.destroyed || this.sealed || !this.vault.isUnlocked) return;
    if (session !== this.boundSession || this.finance.sessionToken !== this.boundSession) {
      this.seal();
      return;
    }
    if (generation !== this.loadGeneration) return;
    this.loading.set(false);
    this.loadFailed.set(failed);
    this.cdr.markForCheck();
  }

  private acceptsPublication(): boolean {
    if (this.destroyed || this.sealed || !this.vault.isUnlocked) return false;
    if (this.finance.sessionToken !== this.boundSession) {
      this.seal();
      return false;
    }
    return true;
  }

  private seal(): void {
    if (this.sealed) return;
    this.sealed = true;
    this.loadGeneration += 1;
    this.exposed.set(false);
    this.holdings.set([]);
    this.transactions.set([]);
    this.openedPosition.set(null);
    this.openedLedger.set(null);
    this.filters.set(emptyGalleryFilters());
    this.loading.set(false);
    this.loadFailed.set(false);
    this.cdr.markForCheck();
  }
}
