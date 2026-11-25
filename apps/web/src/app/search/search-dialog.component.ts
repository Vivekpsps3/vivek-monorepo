import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  Injector,
  computed,
  inject,
  input,
  output,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { formatDay } from '@vivek/browser';
import { ReturnContext, SESSION_CONTEXT, UiDialogComponent, UiInputComponent, UiStateComponent, returnPath, vaultUnlockHref } from '@vivek/ui';
import { fetchHubSummary } from '../hub/hub-load';
import {
  pruneSearchRecents,
  readSearchRecents,
  recentRefsParam,
  recordSearchRecent,
  type SearchRecentRef,
} from './search-recents';

/**
 * Unified search dialog. Ctrl/⌘-K or the header button opens it.
 * Travel and Media come from GET /api/search. Finance names come from the
 * lazy public facade over already-loaded account, holding, and bill streams.
 * Persisted recents stay {app, kind, id}.
 */

export interface SearchResultRow {
  app: string;
  kind: string;
  id: number;
  title: string;
  detail: string | null;
  date: string | null;
  matched: string;
  href: string;
  media_kind: string | null;
}

export interface SearchResponse {
  q: string | null;
  results: SearchResultRow[];
  truncated: boolean;
}

export interface SearchOption {
  key: string;
  group: 'Recent' | 'Travel' | 'Media' | 'Finance';
  title: string;
  detail: string | null;
  date: string | null;
  href: string;
  ref: SearchRecentRef | null;
  returnSource?: string;
}

export interface SearchFinanceName {
  kind: 'account' | 'holding' | 'bill';
  id: number;
  title: string;
  href: string;
}

export type SearchFinanceQueryResult =
  | { status: 'none' | 'locked' | 'unloaded' }
  | { status: 'ready'; names: SearchFinanceName[] };

export interface SearchFinanceRecentResult {
  status: 'none' | 'locked' | 'unloaded' | 'ready';
  names: SearchFinanceName[];
  missing: { kind: string; id: number }[];
}

export interface SearchFinancePort {
  query(q: string): Promise<SearchFinanceQueryResult>;
  resolveRecents(refs: readonly { kind: string; id: number }[]): Promise<SearchFinanceRecentResult>;
  onLock(handler: () => void): () => void;
}

const EMPTY_RECENTS: SearchFinanceRecentResult = { status: 'none', names: [], missing: [] };

export const SEARCH_FINANCE = new InjectionToken<SearchFinancePort>('SEARCH_FINANCE', {
  providedIn: 'root',
  factory: () => {
    const injector = inject(Injector);
    const destroyRef = inject(DestroyRef);
    const handlers = new Set<() => void>();
    const fire = () => {
      for (const handler of [...handlers]) handler();
    };
    let release: (() => void) | null = null;
    let destroyed = false;
    destroyRef.onDestroy(() => {
      destroyed = true;
      release?.();
      release = null;
    });
    void import('../../../../finance/frontend/src/public-api').then(api => {
      if (destroyed) return;
      const unbindNotices = runInInjectionContext(injector, () => api.bindLockNotices(() => fire()));
      const unbindSnapshots = api.bindLockSnapshots(() => fire());
      release = () => {
        unbindNotices();
        unbindSnapshots();
      };
      if (destroyed) {
        release();
        release = null;
      }
    }).catch(() => undefined);
    const namesOf = (rows: { kind: SearchFinanceName['kind']; id: number; title: string; href: string }[]): SearchFinanceName[] =>
      rows.map(name => ({ kind: name.kind, id: name.id, title: name.title, href: name.href }));
    return {
      async query(q: string): Promise<SearchFinanceQueryResult> {
        try {
          const api = await import('../../../../finance/frontend/src/public-api');
          const result = await api.searchFinanceNames(injector, q);
          if (result.status !== 'ready') return { status: result.status };
          return { status: 'ready', names: namesOf(result.names) };
        } catch {
          return { status: 'none' };
        }
      },
      async resolveRecents(refs): Promise<SearchFinanceRecentResult> {
        try {
          const api = await import('../../../../finance/frontend/src/public-api');
          const result = await api.resolveFinanceSearchRecents(injector, refs);
          return {
            status: result.status,
            names: namesOf(result.names),
            missing: result.missing.map(ref => ({ kind: ref.kind, id: ref.id })),
          };
        } catch {
          return EMPTY_RECENTS;
        }
      },
      onLock(handler: () => void): () => void {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };
  },
});

type DialogStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'expired';

const DEBOUNCE_MS = 150;

@Component({
  selector: 'suite-search-dialog',
  standalone: true,
  imports: [UiDialogComponent, UiInputComponent, UiStateComponent],
  templateUrl: './search-dialog.component.html',
  styleUrl: './search-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchDialogComponent implements AfterViewChecked {
  open = input(false);
  closed = output<void>();

  ngAfterViewChecked(): void {
    if (this.open()) this.applyComboboxAttrs();
  }

  private readonly router = inject(Router);
  private readonly context = inject(ReturnContext);
  private readonly finance = inject(SEARCH_FINANCE);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly query = signal('');
  readonly status = signal<DialogStatus>('idle');
  private readonly results = signal<SearchOption[]>([]);
  private readonly activeKey = signal<string | null>(null);
  readonly financePending = signal(false);
  readonly formatDay = formatDay;

  private debounce: ReturnType<typeof setTimeout> | null = null;
  private ctrl: AbortController | null = null;
  private generation = 0;
  private ownerId: number | null | undefined = undefined;

  readonly groups = computed(() => {
    const grouped = new Map<SearchOption['group'], SearchOption[]>();
    for (const option of this.results()) {
      const list = grouped.get(option.group) ?? [];
      list.push(option);
      grouped.set(option.group, list);
    }
    return [...grouped.entries()].map(([name, items]) => ({ name, items }));
  });

  readonly options = computed(() => this.groups().flatMap(group => group.items));
  readonly activeIndex = computed(() => Math.max(0, this.options().findIndex(option => option.key === this.activeKey())));
  readonly activeOption = computed(() => this.options()[this.activeIndex()] ?? null);

  readonly showHint = computed(
    () => this.status() === 'idle' && this.query().trim().length < 2 && this.options().length === 0,
  );
  readonly showNoResults = computed(
    () => this.status() === 'ready' && !this.financePending() && this.options().length === 0,
  );

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => this.cancelPendingSearch());
    destroy.onDestroy(this.finance.onLock(() => this.onVaultLock()));
    const session = inject(SESSION_CONTEXT, { optional: true });
    if (!session) return;
    session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.ownerId = null;
      this.onSessionClear();
    });
    session.user$.pipe(takeUntilDestroyed()).subscribe(user => this.onIdentity(user?.id ?? null));
  }

  /** Called by the host when the dialog opens. */
  onOpened(): void {
    this.resetDialog();
    if (this.ownerId !== null && this.status() !== 'expired') {
      this.status.set('idle');
      void this.loadRecents();
    }
    queueMicrotask(() => this.applyComboboxAttrs());
  }

  onQueryChange(value: string): void {
    if (this.ownerId === null || this.status() === 'expired') return;
    this.query.set(value);
    this.cancelPendingSearch();
    this.results.set([]);
    this.activeKey.set(null);
    this.applyComboboxAttrs();
    const q = value.trim();
    if (q.length < 2) {
      this.status.set('idle');
      void this.loadRecents();
      return;
    }
    this.status.set('loading');
    this.debounce = setTimeout(() => {
      this.debounce = null;
      this.runSearch(q);
    }, DEBOUNCE_MS);
  }

  private cancelPendingSearch(): void {
    this.generation += 1;
    if (this.debounce !== null) clearTimeout(this.debounce);
    this.debounce = null;
    this.ctrl?.abort();
    this.ctrl = null;
    this.financePending.set(false);
  }

  private resetDialog(): void {
    this.cancelPendingSearch();
    this.query.set('');
    this.results.set([]);
    this.activeKey.set(null);
    this.applyComboboxAttrs();
  }

  private async loadRecents(): Promise<void> {
    const generation = this.generation;
    const refs = readSearchRecents();
    const serverRefs = refs.filter(ref => ref.app === 'travel' || ref.app === 'media');
    const financeRefs = refs.filter(ref => ref.app === 'finance');
    if (!serverRefs.length && !financeRefs.length) return;
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    const serverPromise = serverRefs.length
      ? fetchHubSummary<SearchResponse>(
        `/api/search?recent=${encodeURIComponent(recentRefsParam(serverRefs))}`,
        ctrl.signal,
      )
      : Promise.resolve({ status: 'ok' as const, body: { q: null, results: [] as SearchResultRow[], truncated: false } });
    const financePromise = financeRefs.length
      ? this.finance.resolveRecents(financeRefs).catch((): SearchFinanceRecentResult => EMPTY_RECENTS)
      : Promise.resolve(EMPTY_RECENTS);
    const [result, finance] = await Promise.all([serverPromise, financePromise]);
    if (generation !== this.generation || result.status === 'cancelled') return;
    this.ctrl = null;
    if (result.status === 'expired') {
      this.expireSearch();
      return;
    }
    const serverOptions = result.status === 'ok'
      ? result.body.results.map(row => this.toOption(row, 'Recent'))
      : [];
    if (result.status === 'ok') {
      pruneSearchRecents(
        serverRefs,
        serverOptions.map(option => option.ref).filter((ref): ref is SearchRecentRef => ref !== null),
      );
    }
    const financeNames = finance.status === 'ready' ? finance.names : [];
    if (finance.status === 'ready' && finance.missing.length) {
      pruneSearchRecents(
        finance.missing.map(ref => ({ app: 'finance', kind: ref.kind, id: ref.id })),
        [],
      );
    }
    const byKey = new Map<string, SearchOption>();
    for (const option of serverOptions) byKey.set(option.key, option);
    for (const name of financeNames) {
      const option = this.financeNameOption(name, 'Recent');
      byKey.set(option.key, option);
    }
    this.results.set(refs.flatMap(ref => {
      const option = byKey.get(`${ref.app}:${ref.kind}:${ref.id}`);
      return option ? [option] : [];
    }));
    this.applyComboboxAttrs();
  }

  private runSearch(q: string): void {
    const generation = this.generation;
    void this.loadServerResults(q, generation);
    void this.loadFinanceResults(q, generation);
  }

  private async loadServerResults(q: string, generation: number): Promise<void> {
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.status.set('loading');
    const result = await fetchHubSummary<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, ctrl.signal);
    if (generation !== this.generation || result.status === 'cancelled') return;
    this.ctrl = null;
    if (result.status === 'expired') {
      this.expireSearch();
      return;
    }
    const server = result.status === 'ok'
      ? result.body.results.map(row => this.toOption(row, row.app === 'media' ? 'Media' : 'Travel'))
      : [];
    this.results.update(options => [...server, ...options.filter(option => option.group === 'Finance')]);
    this.status.set(result.status === 'ok' ? 'ready' : 'unavailable');
    this.applyComboboxAttrs();
  }

  private expireSearch(): void {
    this.resetDialog();
    this.status.set('expired');
  }

  private async loadFinanceResults(q: string, generation: number): Promise<void> {
    this.financePending.set(true);
    const finance = await this.finance.query(q).catch((): SearchFinanceQueryResult => ({ status: 'none' }));
    if (generation !== this.generation) return;
    const local: SearchOption[] = [];
    if (finance.status === 'locked') local.push(this.lockedFinanceOption());
    else if (finance.status === 'ready') {
      for (const name of finance.names) local.push(this.financeNameOption(name, 'Finance'));
    }
    this.results.update(options => [...options.filter(option => option.group !== 'Finance'), ...local]);
    this.financePending.set(false);
    this.applyComboboxAttrs();
  }

  private financeNameOption(name: SearchFinanceName, group: SearchOption['group']): SearchOption {
    return {
      key: `finance:${name.kind}:${name.id}`,
      group,
      title: name.title,
      detail: null,
      date: null,
      href: name.href,
      ref: { app: 'finance', kind: name.kind, id: name.id },
    };
  }

  private lockedFinanceOption(): SearchOption {
    const returnSource = returnPath(this.currentPath()) ?? '/hub';
    return {
      key: 'finance-locked',
      group: 'Finance',
      title: 'Finance results hidden: locked · Unlock',
      detail: null,
      date: null,
      href: vaultUnlockHref(returnSource),
      returnSource,
      ref: null,
    };
  }

  /** Drop finance names immediately. A search still in flight cannot publish them. */
  private onVaultLock(): void {
    this.cancelPendingSearch();
    this.results.update(options => options.filter(option => option.ref?.app !== 'finance'));
    this.applyComboboxAttrs();
    const q = this.query().trim();
    if (this.ownerId !== null && this.status() !== 'expired' && q.length >= 2) this.runSearch(q);
  }

  /** Logout and identity change drop the query and every result. */
  private onSessionClear(): void {
    this.status.set('idle');
    this.resetDialog();
  }

  private onIdentity(id: number | null): void {
    if (this.ownerId !== undefined && this.ownerId !== id) this.onSessionClear();
    this.ownerId = id;
  }

  private toOption(row: SearchResultRow, group: SearchOption['group']): SearchOption {
    return {
      key: `${row.app}:${row.kind}:${row.id}`,
      group,
      title: row.title,
      detail: row.detail,
      date: row.date,
      href: row.href,
      ref: { app: row.app, kind: row.kind, id: row.id },
    };
  }

  /** Path restored after sign-in or unlock (used by the template too). */
  currentPath(): string {
    return this.router.url || '/hub';
  }

  retry(): void {
    if (this.status() !== 'unavailable') return;
    this.searchInput()?.focus();
    void this.loadServerResults(this.query().trim(), this.generation);
  }

  onKeydown(event: KeyboardEvent): void {
    const options = this.options();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const index = (this.activeIndex() + delta + options.length) % options.length;
      this.highlight(options[index]);
      this.host.nativeElement.querySelector(`#search-opt-${index}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      const option = this.activeOption();
      if (option) {
        event.preventDefault();
        this.activate(option);
      }
    }
  }

  highlight(option: SearchOption): void {
    if (!this.options().includes(option)) return;
    this.activeKey.set(option.key);
    this.applyComboboxAttrs();
  }

  activate(option: SearchOption): void {
    if (!this.options().includes(option)) return;
    if (option.ref) recordSearchRecent(option.ref);
    this.onClosed();
    const state = option.returnSource ? this.context.link(option.returnSource) : undefined;
    void this.router.navigateByUrl(option.href, { state });
  }

  onClosed(): void {
    this.resetDialog();
    this.closed.emit();
  }

  private searchInput(): HTMLInputElement | null {
    return this.host.nativeElement.querySelector('ui-input input');
  }

  /**
   * ui-input does not forward combobox ARIA, so the attributes are applied
   * to its inner input directly and kept current as the active option moves.
   */
  private applyComboboxAttrs(): void {
    const input = this.searchInput();
    if (!input) return;
    input.setAttribute('role', 'combobox');
    const active = this.activeOption();
    input.setAttribute('aria-expanded', active ? 'true' : 'false');
    input.setAttribute('aria-autocomplete', 'list');
    if (active) {
      input.setAttribute('aria-controls', 'search-listbox');
      input.setAttribute('aria-activedescendant', `search-opt-${this.activeIndex()}`);
    } else {
      input.removeAttribute('aria-controls');
      input.removeAttribute('aria-activedescendant');
    }
  }

  optionIndex(option: SearchOption): number {
    return this.options().indexOf(option);
  }
}
