import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  Injector,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { formatDay } from '@vivek/browser';
import { UiDialogComponent, UiInputComponent, UiStateComponent } from '@vivek/ui';
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
 * Travel and Media results come from GET /api/search. Finance is
 * client-side and this dialog contributes only the locked-vault row.
 * FinanceService already exposes assets$, liabilities$, holdings$,
 * fixedExpenses$, and subscriptions$. Unlocked name matching belongs to
 * HUB-04 (#246, parent #93): one narrow facade, not a private service
 * import or a second matcher here.
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

export type SearchFinanceState = 'none' | 'locked' | 'unlocked';

export interface SearchFinanceProbe {
  state(): Promise<SearchFinanceState>;
}

export const SEARCH_FINANCE_PROBE = new InjectionToken<SearchFinanceProbe>(
  'SEARCH_FINANCE_PROBE',
  {
    providedIn: 'root',
    factory: () => {
      const injector = inject(Injector);
      return {
        async state(): Promise<SearchFinanceState> {
          const api = await import('../../../../finance/frontend/src/public-api');
          if (!api.financeVaultPresent()) return 'none';
          const vault = await api.openFinanceVault(injector);
          return vault.isUnlocked ? 'unlocked' : 'locked';
        },
      };
    },
  },
);

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
  private readonly financeProbe = inject(SEARCH_FINANCE_PROBE);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly query = signal('');
  readonly status = signal<DialogStatus>('idle');
  readonly options = signal<SearchOption[]>([]);
  readonly activeIndex = signal(0);
  readonly formatDay = formatDay;

  private debounce: ReturnType<typeof setTimeout> | null = null;
  private ctrl: AbortController | null = null;
  private generation = 0;

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
    inject(DestroyRef).onDestroy(() => {
      if (this.debounce !== null) clearTimeout(this.debounce);
      this.ctrl?.abort();
    });
  }

  @ViewChild(UiInputComponent) private inputRef?: UiInputComponent;

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
    if (!serverRefs.length) {
      if (generation === this.generation) this.options.set([]);
      return;
    }
    const ctrl = new AbortController();
    const result = await fetchHubSummary<SearchResponse>(
      `/api/search?recent=${encodeURIComponent(recentRefsParam(serverRefs))}`,
      ctrl.signal,
    );
    if (generation !== this.generation || result.status === 'cancelled') return;
    if (result.status !== 'ok') {
      this.options.set([]);
      return;
    }
    const resolved = result.body.results.map(row => this.toOption(row, 'Recent'));
    pruneSearchRecents(
      serverRefs,
      resolved.map(option => option.ref).filter((ref): ref is SearchRecentRef => ref !== null),
    );
    this.options.set(resolved);
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
      this.financeProbe.state().catch((): SearchFinanceState => 'none'),
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
    if (finance === 'locked') {
      options.push({
        key: 'finance-locked',
        group: 'Finance',
        title: 'Finance results hidden: locked · Unlock',
        detail: null,
        date: null,
        href: `/finance/vault/unlock?next=${encodeURIComponent(this.currentPath())}`,
        ref: null,
      });
    }
    this.options.set(options);
    this.activeIndex.set(0);
    this.status.set('ready');
    this.applyComboboxAttrs();
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
