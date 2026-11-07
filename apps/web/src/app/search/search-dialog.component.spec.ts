import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SEARCH_FINANCE_PROBE,
  SearchDialogComponent,
  type SearchFinanceState,
} from './search-dialog.component';
import { SEARCH_RECENT_KEY, type SearchRecentRef } from './search-recents';

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
  let financeState: SearchFinanceState;
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
    financeState = 'none';
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
          provide: SEARCH_FINANCE_PROBE,
          useValue: { state: () => Promise.resolve(financeState) },
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

  function inputEl(): HTMLInputElement {
    return fixture.nativeElement.querySelector('ui-input input') as HTMLInputElement;
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

  it('debounces 150ms and groups results', async () => {
    openDialog();
    await settle();
    typeQuery('ky');
    expect(fetchSpy).not.toHaveBeenCalled();
    await settle(200);
    await settle();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#search-group-Travel')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#search-group-Media')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Dec 1');
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

  it('exposes the combobox ARIA contract and wraps arrow navigation', async () => {
    openDialog();
    await settle();
    typeQuery('kyoto');
    await settle(200);
    await settle();
    fixture.detectChanges();
    const input = inputEl();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe('search-listbox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-activedescendant')).toBe('search-opt-0');

    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(input.getAttribute('aria-activedescendant')).toBe('search-opt-1');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(input.getAttribute('aria-activedescendant')).toBe('search-opt-0'); // wraps
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(input.getAttribute('aria-activedescendant')).toBe('search-opt-1'); // wraps back
  });

  it('Enter navigates, closes and records the recent by id', async () => {
    openDialog();
    await settle();
    typeQuery('kyoto');
    await settle(200);
    await settle();
    fixture.detectChanges();
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(navigated).toEqual(['/travel/trips/12']);
    expect(closedCount).toBe(1);
    expect(JSON.parse(localStorage.getItem(SEARCH_RECENT_KEY)!)).toEqual([
      { app: 'travel', kind: 'trip', id: 12 },
    ]);
  });

  it('shows the no-results state', async () => {
    openDialog();
    await settle();
    typeQuery('zz');
    await settle(200);
    await settle();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No matches for "zz".');
  });

  it('shows the unavailable state with the spec copy and a Retry', async () => {
    openDialog();
    await settle();
    typeQuery('boom');
    await settle(200);
    await settle();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load search results.");
    expect(fixture.nativeElement.textContent).toContain('Retry');
  });

  it('shows the expired state with the spec copy', async () => {
    openDialog();
    await settle();
    typeQuery('old');
    await settle(200);
    await settle();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Your session ended. Sign in again to see search results.',
    );
  });

  it('shows Searching… while the request is in flight', async () => {
    let resolveFetch: ((response: Response) => void) | null = null;
    fetchSpy.and.callFake(
      () => new Promise<Response>(resolve => (resolveFetch = resolve)),
    );
    openDialog();
    typeQuery('kyoto');
    await settle(200);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Searching…');
    resolveFetch!(respond({ q: 'kyoto', results: [TRIP], truncated: false }));
    await settle(50);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Kyoto');
  });

  it('shows the Finance locked row when the vault is present but locked', async () => {
    financeState = 'locked';
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

  it('shows no Finance group when there is no vault on the device', async () => {
    financeState = 'none';
    openDialog();
    await settle();
    typeQuery('kyoto');
    await settle(200);
    await settle();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#search-group-Finance')).toBeNull();
  });
});
