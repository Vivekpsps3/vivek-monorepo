import { ComponentFixture,TestBed } from '@angular/core/testing';
import { ActivatedRoute,Router } from '@angular/router';
import { SESSION_CONTEXT } from '@vivek/ui';
import { Subject } from 'rxjs';
import {
SEARCH_FINANCE,
SearchDialogComponent,
type SearchFinanceName,
type SearchFinancePort,
type SearchFinanceQueryResult,
type SearchFinanceRecentResult,
} from './search-dialog.component';
import { SEARCH_RECENT_KEY,type SearchRecentRef } from './search-recents';

/** Real-timer settle: fetch Response bodies resolve outside fakeAsync. */
function settle(ms = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const TRIP = {
  app: 'travel', kind: 'trip', id: 12, title: 'Kyoto', detail: 'Kyoto, Osaka',
  date: '2026-12-01', matched: 'title', href: '/travel/trips/12', media_kind: null,
};
const MEDIA = {
  app: 'media', kind: 'media', id: 44, title: 'Dune', detail: 'Frank Herbert · 1965',
  date: null, matched: 'title', href: '/media/item/44', media_kind: 'book',
};

describe('SearchDialogComponent', () => {
  let fixture: ComponentFixture<SearchDialogComponent>;
  let component: SearchDialogComponent;
  let fetchSpy: jasmine.Spy;
  let navigated: string[];
  let closedCount: number;
  let financeAnswer: SearchFinanceQueryResult;
  let financeRecents: SearchFinanceRecentResult;
  let financeQueries: string[];
  let lockHandlers: Array<() => void>;
  let cleared: Subject<void>;
  let users: Subject<{ id: number } | null>;
  let financeQueryImpl: (q: string) => Promise<SearchFinanceQueryResult>;
  let lastSignal: AbortSignal | null;
  let hangSearch: boolean;

  function respond(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function defaultFetch(url: string, init?: RequestInit): Promise<Response> {
    lastSignal = (init?.signal as AbortSignal) ?? null;
    if (hangSearch && url.endsWith('q=ky')) {
      // Never resolves on its own; only an abort settles it.
      return new Promise<Response>((_resolve, reject) => {
        lastSignal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')));
      });
    }
    if (url.includes('recent=')) {
      return Promise.resolve(respond({ q: null, results: [TRIP], truncated: false }));
    }
    if (url.includes('q=zz')) {
      return Promise.resolve(respond({ q: 'zz', results: [], truncated: false }));
    }
    if (url.includes('q=boom')) {
      return Promise.resolve(respond({ detail: 'nope' }, 500));
    }
    if (url.includes('q=old')) {
      return Promise.resolve(respond({ detail: 'expired' }, 401));
    }
    return Promise.resolve(respond({ q: 'kyoto', results: [TRIP, MEDIA], truncated: false }));
  }

  beforeEach(() => {
    navigated = [];
    closedCount = 0;
    financeAnswer = { status: 'none' };
    financeRecents = { status: 'none', names: [], missing: [] };
    financeQueries = [];
    lockHandlers = [];
    cleared = new Subject<void>();
    users = new Subject<{ id: number } | null>();
    financeQueryImpl = () => Promise.resolve(financeAnswer);
    lastSignal = null;
    hangSearch = false;
    localStorage.removeItem(SEARCH_RECENT_KEY);
    fetchSpy = spyOn(window, 'fetch').and.callFake(
      (input: RequestInfo | URL, init?: RequestInit) => defaultFetch(String(input), init),
    );
    TestBed.configureTestingModule({
      imports: [SearchDialogComponent],
      providers: [
        {
          provide: SEARCH_FINANCE,
          useValue: {
            query: (q: string) => {
              financeQueries.push(q);
              return financeQueryImpl(q);
            },
            resolveRecents: () => Promise.resolve(financeRecents),
            onLock: (handler: () => void) => {
              lockHandlers.push(handler);
              return () => undefined;
            },
          } satisfies SearchFinancePort,
        },
        {
          provide: SESSION_CONTEXT,
          useValue: { cleared$: cleared, user$: users, currentUser: null },
        },
        { provide: ActivatedRoute, useValue: {} },
        {
          provide: Router,
          useValue: {
            url: '/hub',
            navigateByUrl: (url: string) => {
              navigated.push(url);
              return Promise.resolve(true);
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(SearchDialogComponent);
    component = fixture.componentInstance;
    component.closed.subscribe(() => (closedCount += 1));
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem(SEARCH_RECENT_KEY);
  });

  function openDialog(): void {
    component.onOpened();
    fixture.detectChanges();
  }

  function typeQuery(q: string): void {
    component.onQueryChange(q);
    fixture.detectChanges();
  }

  it('shows the hint state with no recents and a short query', async () => {
    openDialog();
    await settle();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Type at least 2 characters to search.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves recents by ids only and renders the Recent group', async () => {
    const refs: SearchRecentRef[] = [{ app: 'travel', kind: 'trip', id: 12 }];
    localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(refs));
    openDialog();
    await settle(50);
    fixture.detectChanges();
    const heading = fixture.nativeElement.querySelector('#search-group-Recent');
    expect(heading?.textContent).toBe('Recent');
    expect(fixture.nativeElement.textContent).toContain('Kyoto');
    const calledUrl = String(fetchSpy.calls.mostRecent().args[0]);
    expect(calledUrl).toContain('/api/search?recent=travel%3Atrip%3A12');
    // Storage still holds ids only — no titles were written back.
    expect(localStorage.getItem(SEARCH_RECENT_KEY)).toBe(JSON.stringify(refs));
  });

  it('prunes recents the server no longer returns', async () => {
    const refs: SearchRecentRef[] = [
      { app: 'travel', kind: 'trip', id: 12 },
      { app: 'travel', kind: 'trip', id: 999 },
    ];
    localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(refs));
    openDialog();
    await settle(50);
    expect(JSON.parse(localStorage.getItem(SEARCH_RECENT_KEY)!)).toEqual([refs[0]]);
  });

  it('aborts the previous in-flight request when a new search runs', async () => {
    hangSearch = true;
    openDialog();
    await settle();
    typeQuery('ky');
    await settle(200);
    const firstSignal = lastSignal;
    expect(firstSignal).not.toBeNull();
    expect(firstSignal!.aborted).toBeFalse();
    typeQuery('kyo');
    await settle(200);
    // fetchHubSummary links the component's controller to the fetch signal
    // only while the request is in flight — exactly what abort must cancel.
    expect(firstSignal!.aborted).toBeTrue();
    await settle();
  });

  it('shows the Finance locked row when the vault is present but locked', async () => {
    financeAnswer = { status: 'locked' };
    openDialog();
    await settle();
    typeQuery('kyoto');
    await settle(200);
    await settle();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#search-group-Finance')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Finance results hidden: locked · Unlock');
    // Activating it goes to the unlock page and records no recent.
    const locked = component.options().find(option => option.group === 'Finance')!;
    component.activate(locked);
    expect(navigated).toEqual(['/finance/vault/unlock?next=%2Fhub']);
    expect(localStorage.getItem(SEARCH_RECENT_KEY)).toBeNull();
  });

  it('resolves unlocked finance recents locally and prunes missing ids', async () => {
    const refs: SearchRecentRef[] = [
      { app: 'finance', kind: 'account', id: 4 },
      { app: 'finance', kind: 'account', id: 9 },
      { app: 'travel', kind: 'trip', id: 12 },
    ];
    localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(refs));
    financeRecents = {
      status: 'ready',
      names: [{ kind: 'account', id: 4, title: 'Checking', href: '/finance/have' }],
      missing: [{ kind: 'account', id: 9 }],
    };
    openDialog();
    await settle(50);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Checking');
    expect(fixture.nativeElement.textContent).toContain('Kyoto');
    expect(localStorage.getItem(SEARCH_RECENT_KEY)).toBe(JSON.stringify([refs[0], refs[2]]));
    expect(localStorage.getItem(SEARCH_RECENT_KEY)).not.toContain('Checking');
    expect(fetchSpy.calls.allArgs().map(args => String(args[0])).join(' ')).not.toContain('finance');
  });

  it('keeps finance recent ids while locked or unloaded', async () => {
    const refs: SearchRecentRef[] = [{ app: 'finance', kind: 'account', id: 4 }];
    localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(refs));
    financeRecents = { status: 'locked', names: [], missing: [{ kind: 'account', id: 4 }] };
    openDialog();
    await settle(50);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Checking');
    expect(localStorage.getItem(SEARCH_RECENT_KEY)).toBe(JSON.stringify(refs));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not publish finance names that resolve after lock', async () => {
    const savings: SearchFinanceName = { kind: 'account', id: 4, title: 'Savings', href: '/finance/have' };
    let release: (result: SearchFinanceQueryResult) => void = () => undefined;
    financeQueryImpl = () => new Promise(resolve => { release = resolve; });
    openDialog();
    await settle();
    typeQuery('sa');
    await settle(200);
    financeAnswer = { status: 'locked' };
    financeQueryImpl = () => Promise.resolve(financeAnswer);
    lockHandlers.forEach(handler => handler());
    release({ status: 'ready', names: [savings] });
    await settle(50);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Savings');
    expect(fixture.nativeElement.textContent).toContain('Finance results hidden: locked · Unlock');
  });

  it('clears every row on logout and ignores a late finance result', async () => {
    const savings: SearchFinanceName = { kind: 'account', id: 4, title: 'Savings', href: '/finance/have' };
    let release: (result: SearchFinanceQueryResult) => void = () => undefined;
    financeQueryImpl = () => new Promise(resolve => { release = resolve; });
    openDialog();
    await settle();
    typeQuery('sa');
    await settle(200);
    fixture.detectChanges();
    cleared.next();
    fixture.detectChanges();
    release({ status: 'ready', names: [savings] });
    await settle(50);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Savings');
    expect(fixture.nativeElement.textContent).not.toContain('Kyoto');
  });

  it('stops a stalled search at the shared eight-second deadline', async () => {
    jasmine.clock().install();
    try {
      fetchSpy.and.callFake((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
      }));
      openDialog();
      typeQuery('kyoto');
      jasmine.clock().tick(149);
      expect(fetchSpy).not.toHaveBeenCalled();
      jasmine.clock().tick(1);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalled();
      jasmine.clock().tick(7999);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain("Couldn't load search results.");
      jasmine.clock().tick(1);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("Couldn't load search results.");
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
