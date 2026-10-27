import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { SessionService as AuthService } from '../platform/session.service';
import { AuthUser } from '../platform/auth/auth.models';
import { DEK_STORE } from '../../../../finance/frontend/src/testing';
import { VaultService } from '../../../../finance/frontend/src/testing';
import { Asset, Holding, Liability } from '../../../../finance/frontend/src/testing';
import { FinanceService } from '../../../../finance/frontend/src/testing';
import { ThemeService } from '@vivek/ui';
import { HubComponent } from './hub.component';

function person(id: number, name = 'Ada'): AuthUser {
  return {
    id,
    email: `${name.toLowerCase()}@pending.local`,
    username: name.toLowerCase(),
    display_name: name,
    role: 'user',
    is_active: true,
    must_change_password: false,
    created_at: '2026-10-14T00:00:00',
    updated_at: '2026-10-14T00:00:00',
  };
}

function trip(title: string) {
  return {
    id: 7,
    title,
    destination: title,
    start_date: '2026-11-02',
    end_date: '2026-11-06',
    phase: 'upcoming',
    days_until: 4,
    next_action: 'Open the trip',
    href: '/travel/#/trips/7',
  };
}

function mediaBody() {
  return {
    currently: [{ id: 3, kind: 'tv', title: 'The Wire', progress_label: 'S1 E2' }],
    recent_reviews: [],
    upcoming: [{ id: 9, kind: 'movie', title: 'Later', when: 'upcoming', precision: 'day', release_on: '2026-12-02' }],
    next_episodes: [{ entry_id: 3, show_title: 'The Wire', season: 1, episode: 3 }],
  };
}

interface PendingCall {
  url: string;
  resolve: (value: Response) => void;
}

describe('HubComponent', () => {
  let fixture: ComponentFixture<HubComponent>;
  let users: BehaviorSubject<AuthUser | null>;
  let auth: { user$: BehaviorSubject<AuthUser | null>; logout: jasmine.Spy; updateDisplayName: jasmine.Spy };
  let vaultReads: number;
  let vaultUnlocked: boolean;
  let financeCalls: number;
  let financeError: unknown;
  let assets$: BehaviorSubject<Asset[]>;
  let liabilities$: BehaviorSubject<Liability[]>;
  let holdings$: BehaviorSubject<Holding[]>;
  const pending: PendingCall[] = [];

  function json(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response;
  }

  function takeCall(urlPart: string): PendingCall {
    const index = pending.findIndex(call => call.url.includes(urlPart));
    if (index < 0) throw new Error(`missing fetch ${urlPart}; have ${pending.map(call => call.url).join(', ')}`);
    return pending.splice(index, 1)[0];
  }

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(HubComponent);
    fixture.detectChanges();
    await Promise.resolve();
  }

  async function paint(): Promise<void> {
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    pending.length = 0;
    vaultReads = 0;
    vaultUnlocked = false;
    financeCalls = 0;
    financeError = null;
    localStorage.removeItem(DEK_STORE);
    users = new BehaviorSubject<AuthUser | null>(person(1));
    auth = {
      user$: users,
      logout: jasmine.createSpy('logout'),
      updateDisplayName: jasmine.createSpy('updateDisplayName').and.resolveTo(person(1)),
    };
    assets$ = new BehaviorSubject<Asset[]>([]);
    liabilities$ = new BehaviorSubject<Liability[]>([]);
    holdings$ = new BehaviorSubject<Holding[]>([]);
    spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL) => new Promise<Response>(resolve => {
      pending.push({ url: String(input), resolve });
    }));
    await TestBed.configureTestingModule({
      imports: [HubComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ThemeService,
          useValue: { current: 'system', choice$: new BehaviorSubject('system'), set: jasmine.createSpy('set') },
        },
        {
          provide: VaultService,
          useValue: {
            whenReady: () => {
              vaultReads += 1;
              return Promise.resolve();
            },
            get isUnlocked() {
              vaultReads += 1;
              return vaultUnlocked;
            },
          },
        },
        {
          provide: FinanceService,
          useValue: {
            loadDashboard: () => {
              financeCalls += 1;
              return financeError ? throwError(() => financeError) : of(null);
            },
            assets$,
            liabilities$,
            holdings$,
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem(DEK_STORE);
  });

  it('opens account settings when the header changes the query on a mounted Hub', async () => {
    const query = new BehaviorSubject(convertToParamMap({}));
    TestBed.overrideProvider(ActivatedRoute, {useValue: {queryParamMap: query}});
    await render();
    expect(fixture.componentInstance.settingsOpen).toBeFalse();
    takeCall('/travel/').resolve(json(200, {next_trip: null}));
    takeCall('/media/').resolve(json(200, {currently: [], recent_reviews: [], upcoming: [], next_episodes: []}));
    query.next(convertToParamMap({settings: 'account'}));
    await paint();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')?.textContent).toContain('Account settings');
  });

  it('recovers one failed summary without loading the vault or signing out', async () => {
    await render();
    expect(pending.map(call => call.url).sort()).toEqual(['/media/api/summary', '/travel/api/summary']);
    takeCall('/travel/').resolve(json(503, {}));
    takeCall('/media/').resolve(json(200, mediaBody()));
    await paint();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Travel is not available from here right now.');
    expect(text).toContain('The Wire');
    expect(text).toContain('Series');
    expect(text).toContain('Vault locked');
    expect(text).toContain('Open Travel');
    expect(text).toContain('Open Media');
    expect(text).toContain('Open Finance');
    expect(vaultReads).toBe(0);
    expect(financeCalls).toBe(0);
    expect(auth.logout).not.toHaveBeenCalled();

    fixture.nativeElement.querySelector('section[aria-labelledby="travel-heading"] button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Retrying…');
    takeCall('/travel/').resolve(json(200, { next_trip: trip('Lisbon') }));
    await paint();
    expect(fixture.nativeElement.textContent).toContain('Lisbon');
    expect(fixture.nativeElement.textContent).toContain('The Wire');
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('keeps the other cards when a session rejection is not a sign-out', async () => {
    await render();
    takeCall('/travel/').resolve(json(401, { detail: 'expired' }));
    takeCall('/media/').resolve(json(200, mediaBody()));
    await paint();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Session expired for Travel');
    expect(text).toContain('The Wire');
    expect(auth.logout).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('keeps a stale snapshot when a retry fails and clears it on sign-out', async () => {
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: trip('Lisbon') }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    await paint();
    expect(fixture.nativeElement.textContent).toContain('Lisbon');

    fixture.componentInstance.retryTravel();
    fixture.detectChanges();
    takeCall('/travel/').resolve(json(503, {}));
    await paint();
    expect(fixture.nativeElement.textContent).toContain('Lisbon');
    expect(fixture.nativeElement.textContent).toContain('Showing the last trip snapshot.');

    users.next(null);
    await paint();
    expect(fixture.nativeElement.textContent).not.toContain('Lisbon');
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('ignores a late summary from the previous user', async () => {
    await render();
    const firstTravel = takeCall('/travel/');
    const firstMedia = takeCall('/media/');
    users.next(person(2, 'Bea'));
    await Promise.resolve();
    firstTravel.resolve(json(200, { next_trip: trip('Secret') }));
    firstMedia.resolve(json(200, mediaBody()));
    await paint();
    expect(fixture.nativeElement.textContent).not.toContain('Secret');

    takeCall('/travel/').resolve(json(200, { next_trip: trip('Kyoto') }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    await paint();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Kyoto');
    expect(text).toContain('Bea');
    expect(text).not.toContain('Secret');
    expect(text).not.toContain('The Wire');
  });

  it('reads finance only after the vault key is present and still shows travel when finance fails', async () => {
    localStorage.setItem(DEK_STORE, 'present');
    vaultUnlocked = true;
    financeError = new Error('finance down');
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: trip('Lisbon') }));
    takeCall('/media/').resolve(json(503, {}));
    await paint();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Lisbon');
    expect(text).toContain('Media is not available from here right now.');
    expect(text).toContain('Finance could not be read.');
    expect(vaultReads).toBeGreaterThan(0);
    expect(financeCalls).toBe(1);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(text).toContain('Open Finance');
  });

  it('shows an unlocked finance snapshot without blocking an empty travel card', async () => {
    localStorage.setItem(DEK_STORE, 'present');
    vaultUnlocked = true;
    assets$.next([{ id: 1, name: 'House', category: 'property', current_value: 500, as_of_date: '2026-10-15' } as Asset]);
    liabilities$.next([{ id: 1, name: 'Card', category: 'credit', balance_owed: 25, as_of_date: '2026-10-15' } as Liability]);
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, mediaBody()));
    await paint();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Nothing on the calendar');
    expect(text).toContain('The Wire');
    expect(text).toMatch(/\$475/);
    expect(text).not.toContain('Vault locked');
  });

  it('labels trips and dates and clears summaries on sign-out', async () => {
    await render();
    const component = fixture.componentInstance;
    expect(component.tripWhen({ ...trip('Now'), phase: 'in_progress', days_until: 0 })).toBe('Underway');
    expect(component.tripWhen({ ...trip('Now'), phase: 'upcoming', days_until: 0 })).toBe('Leaves today');
    expect(component.tripWhen({ ...trip('Now'), phase: 'upcoming', days_until: 1 })).toBe('Tomorrow');
    expect(component.tripPlace({ ...trip('Named'), destination: null })).toBe('Named');
    expect(component.formatDay(null)).toBe('No date');
    expect(component.formatDay('nope')).toBe('nope');
    expect(component.formatDay('2026-11-02')).toContain('2026');
    expect(component.mediaWhen({ id: 1, kind: 'book', title: 'Dune', when: 'unknown' })).toBe('No date');
    expect(component.mediaWhen({ id: 2, kind: 'movie', title: 'Later', when: 'upcoming', precision: 'day', release_on: '2026-12-02' })).toContain('2026');
    expect(component.kindLabel('album')).toBe('Album');
    component.draftName = '   ';
    await component.saveName();
    expect(component.nameError).toBe('Enter a name.');
    component.draftName = 'a'.repeat(161);
    await component.saveName();
    expect(component.nameError).toContain('160');
    auth.updateDisplayName.and.rejectWith(new Error('offline'));
    component.draftName = 'Ada Lovelace';
    await component.saveName();
    expect(component.nameError).toBe('offline');
    auth.updateDisplayName.and.resolveTo(person(1, 'Ada Lovelace'));
    await component.saveName();
    expect(component.nameError).toBe('');
    users.next(null);
    expect(component.financeState).toBe('locked');
    component.toggleSettings();
    component.closeSettings();
    expect(component.settingsOpen).toBeFalse();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    await paint();
  });

  it('renders account settings as a dialog outside menu semantics', async () => {
    const admin = person(1);
    admin.role = 'admin';
    users.next(admin);
    await render();
    takeCall('/travel/').resolve(json(200, { next_trip: null }));
    takeCall('/media/').resolve(json(200, { currently: [], recent_reviews: [], upcoming: [], next_episodes: [] }));
    await paint();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
    fixture.componentInstance.toggleSettings();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Account settings');
    expect(dialog.textContent).toContain('Change username');
    expect(dialog.textContent).toContain('Save name');
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });
});
