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
import { SESSION_CONTEXT, UiDialogComponent, UiInputComponent, UiStateComponent } from '@vivek/ui';
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
  private readonly finance = inject(SEARCH_FINANCE);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly query = signal('');
  readonly status = signal<DialogStatus>('idle');
  readonly options = signal<SearchOption[]>([]);
  readonly activeIndex = signal(0);
  readonly formatDay = formatDay;

  private debounce: ReturnType<typeof setTimeout> | null = null;
  private ctrl: AbortController | null = null;
  private generation = 0;
  private ownerId: number | null | undefined = undefined;

  readonly groups = computed(() => {
    const grouped = new Map<SearchOption['group'], SearchOption[]>();
    for (const option of this.options()) {
      const list = grouped.get(option.group) ?? [];
      list.push(option);
      grouped.set(option.group, list);
    }
    return [...grouped.entries()].map(([name, items]) => ({ name, items }));
  });

  readonly activeOption = computed(() => this.options()[this.activeIndex()] ?? null);

  readonly showHint = computed(
    () => this.status() === 'idle' && this.query().trim().length < 2 && this.options().length === 0,
  );
  readonly showNoResults = computed(
    () => this.status() === 'ready' && this.options().length === 0,
  );

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      if (this.debounce !== null) clearTimeout(this.debounce);
      this.ctrl?.abort();
    });
    destroy.onDestroy(this.finance.onLock(() => this.onVaultLock()));
    const session = inject(SESSION_CONTEXT, { optional: true });
    if (!session) return;
    session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => this.onSessionClear());
    session.user$.pipe(takeUntilDestroyed()).subscribe(user => this.onIdentity(user?.id ?? null));
  }

  /** Called by the host when the dialog opens. */
  onOpened(): void {
    this.query.set('');
    this.options.set([]);
    this.status.set('idle');
    this.activeIndex.set(0);
    void this.loadRecents();
    queueMicrotask(() => this.applyComboboxAttrs());
  }

  onQueryChange(value: string): void {
    this.query.set(value);
    this.applyComboboxAttrs();
    if (this.debounce !== null) clearTimeout(this.debounce);
    const q = value.trim();
    if (q.length < 2) {
      this.ctrl?.abort();
      this.status.set('idle');
      void this.loadRecents();
      return;
    }
    this.debounce = setTimeout(() => void this.runSearch(q), DEBOUNCE_MS);
  }

  private async loadRecents(): Promise<void> {
    const generation = ++this.generation;
    const refs = readSearchRecents();
    const serverRefs = refs.filter(ref => ref.app === 'travel' || ref.app === 'media');
    const financeRefs = refs.filter(ref => ref.app === 'finance');
    if (!serverRefs.length && !financeRefs.length) {
      if (generation === this.generation) this.options.set([]);
      return;
    }
    this.ctrl?.abort();
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
    this.options.set(refs.flatMap(ref => {
      const option = byKey.get(`${ref.app}:${ref.kind}:${ref.id}`);
      return option ? [option] : [];
    }));
    this.activeIndex.set(0);
    this.applyComboboxAttrs();
  }

  private async runSearch(q: string): Promise<void> {
    const generation = ++this.generation;
    this.ctrl?.abort();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.status.set('loading');
    const [result, finance] = await Promise.all([
      fetchHubSummary<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, ctrl.signal),
      this.finance.query(q).catch((): SearchFinanceQueryResult => ({ status: 'none' })),
    ]);
    if (generation !== this.generation || result.status === 'cancelled') return;
    if (result.status === 'expired') {
      this.status.set('expired');
      this.options.set([]);
      return;
    }
    if (result.status !== 'ok') {
      this.status.set('unavailable');
      this.options.set([]);
      return;
    }
    const options = result.body.results.map(row =>
      this.toOption(row, row.app === 'media' ? 'Media' : 'Travel'),
    );
    if (finance.status === 'locked') options.push(this.lockedFinanceOption());
    else if (finance.status === 'ready') {
      for (const name of finance.names) options.push(this.financeNameOption(name, 'Finance'));
    }
    this.options.set(options);
    this.activeIndex.set(0);
    this.status.set('ready');
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
    return {
      key: 'finance-locked',
      group: 'Finance',
      title: 'Finance results hidden: locked · Unlock',
      detail: null,
      date: null,
      href: `/finance/vault/unlock?next=${encodeURIComponent(this.currentPath())}`,
      ref: null,
    };
  }

  /** Drop finance names immediately. A search still in flight cannot publish them. */
  private onVaultLock(): void {
    this.generation += 1;
    this.ctrl?.abort();
    if (this.debounce !== null) {
      clearTimeout(this.debounce);
      this.debounce = null;
    }
    this.options.set(this.options().filter(option => option.ref?.app !== 'finance'));
    this.activeIndex.set(0);
    const q = this.query().trim();
    if (q.length >= 2) void this.runSearch(q);
    else this.applyComboboxAttrs();
  }

  /** Logout and identity change drop every row, including Travel and Media. */
  private onSessionClear(): void {
    this.generation += 1;
    this.ctrl?.abort();
    if (this.debounce !== null) {
      clearTimeout(this.debounce);
      this.debounce = null;
    }
    this.options.set([]);
    this.status.set('idle');
    this.activeIndex.set(0);
    this.applyComboboxAttrs();
  }

  private onIdentity(id: number | null): void {
    if (this.ownerId === undefined) {
      this.ownerId = id;
      return;
    }
    if (this.ownerId === id) return;
    this.ownerId = id;
    this.onSessionClear();
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
    const q = this.query().trim();
    if (q.length >= 2) void this.runSearch(q);
  }

  onKeydown(event: KeyboardEvent): void {
    const options = this.options();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex.set((this.activeIndex() + delta + options.length) % options.length);
      this.applyComboboxAttrs();
    } else if (event.key === 'Enter') {
      const option = this.activeOption();
      if (option) {
        event.preventDefault();
        this.activate(option);
      }
    }
  }

  activate(option: SearchOption): void {
    if (option.ref) recordSearchRecent(option.ref);
    this.closed.emit();
    void this.router.navigateByUrl(option.href);
  }

  onClosed(): void {
    this.ctrl?.abort();
    this.closed.emit();
  }

  /**
   * ui-input does not forward combobox ARIA, so the attributes are applied
   * to its inner input directly and kept current as the active option moves.
   */
  private applyComboboxAttrs(): void {
    const input = this.host.nativeElement.querySelector<HTMLInputElement>('ui-input input');
    if (!input) return;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', this.options().length ? 'true' : 'false');
    input.setAttribute('aria-controls', 'search-listbox');
    input.setAttribute('aria-autocomplete', 'list');
    const active = this.activeOption();
    if (active && this.options().length) {
      input.setAttribute('aria-activedescendant', `search-opt-${this.activeIndex()}`);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  optionIndex(option: SearchOption): number {
    return this.options().indexOf(option);
  }
}
