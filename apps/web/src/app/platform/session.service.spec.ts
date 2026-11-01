import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import type { SessionUser } from '@vivek/auth';
import { authNavigation } from '@vivek/ui';
import { SessionService } from './session.service';

function pauseNextOpen(): { ready: Promise<void>; release: () => void; restore: () => void } {
  const realOpen = indexedDB.open.bind(indexedDB);
  let release!: () => void;
  let markReady!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { markReady = resolve; });
  let armed = true;
  spyOn(indexedDB, 'open').and.callFake((name: string, version?: number) => {
    if (!armed) return realOpen(name, version);
    armed = false;
    const real = realOpen(name, version);
    let db: IDBDatabase | null = null;
    let failure: DOMException | null = null;
    let onsuccess: ((ev: Event) => void) | null = null;
    let onerror: ((ev: Event) => void) | null = null;
    let onupgradeneeded: ((ev: Event) => void) | null = null;
    let upgrade: Event | null = null;
    const fake = {} as IDBOpenDBRequest;
    const replayUpgrade = () => { if (upgrade && onupgradeneeded) onupgradeneeded.call(fake, upgrade); };
    Object.defineProperties(fake, {
      result: { configurable: true, get: () => db },
      error: { configurable: true, get: () => failure },
      onsuccess: { configurable: true, get: () => onsuccess, set: (fn: (ev: Event) => void) => { onsuccess = fn; } },
      onerror: { configurable: true, get: () => onerror, set: (fn: (ev: Event) => void) => { onerror = fn; } },
      onupgradeneeded: { configurable: true, get: () => onupgradeneeded, set: (fn: (ev: Event) => void) => { onupgradeneeded = fn; replayUpgrade(); } },
    });
    real.onupgradeneeded = ev => { db = real.result; upgrade = ev; replayUpgrade(); };
    real.onsuccess = () => { db = real.result; markReady(); void gate.then(() => onsuccess?.call(fake, new Event('success'))); };
    real.onerror = () => { failure = real.error; markReady(); void gate.then(() => onerror?.call(fake, new Event('error'))); };
    return fake;
  });
  return { ready, release, restore: () => { delete (indexedDB as unknown as { open?: unknown }).open; } };
}

function person(id: number): SessionUser {
  return { id, username: `user${id}`, email: `user${id}@example.test`, display_name: `User ${id}`, role: 'user', is_active: true, must_change_password: false, created_at: '2026-01-01', updated_at: '2026-01-01' };
}

describe('Suite session isolation', () => {
  let service: SessionService;
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.removeItem('suite-session-ended');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
    document.cookie = 'finance_csrf=fixture';
    localStorage.setItem('finance-dek', 'fixture-key');
  });
  afterEach(() => {
    document.cookie = 'finance_csrf=; Max-Age=0';
    localStorage.removeItem('finance-dek');
    localStorage.removeItem('suite-session-ended');
    http.verify();
  });
  it('shares one probe and preserves an unlocked browser key on a valid reload', () => {
    const first: Array<SessionUser | null> = [];
    const second: Array<SessionUser | null> = [];
    service.loadSession().subscribe(user => first.push(user));
    service.loadSession().subscribe(user => second.push(user));
    http.expectOne('/api/auth/me').flush({ user: person(1) });
    expect(first).toEqual([person(1)]);
    expect(second).toEqual(first);
    expect(localStorage.getItem('finance-dek')).toBe('fixture-key');
  });
  it('clears the persisted key and domain state on actual expiry', () => {
    let cleared = 0;
    service.cleared$.subscribe(() => cleared += 1);
    service.loadSession().subscribe();
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Expired' });
    expect(service.currentUser).toBeNull();
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(cleared).toBe(1);
  });
  it('does not resurrect a signed-out user when a probe completes late', () => {
    let user: SessionUser | null | undefined;
    service.loadSession().subscribe(value => user = value);
    const request = http.expectOne('/api/auth/me');
    service.clearLocalSession();
    request.flush({ user: person(1) });
    expect(service.currentUser).toBeNull();
    expect(user).toBeNull();
  });
  it('ignores an old expiry after another session has been accepted', () => {
    service.loadSession().subscribe();
    const request = http.expectOne('/api/auth/me');
    service.acceptUser(person(2));
    request.flush({}, { status: 401, statusText: 'Old session' });
    expect(service.currentUser?.id).toBe(2);
    expect(localStorage.getItem('finance-dek')).toBe('fixture-key');
  });
  it('clears Finance state before publishing a different user', () => {
    service.acceptUser(person(1));
    let cleared = 0;
    service.cleared$.subscribe(() => cleared += 1);
    service.acceptUser(person(2));
    expect(service.currentUser?.id).toBe(2);
    expect(localStorage.getItem('finance-dek')).toBeNull();
    expect(cleared).toBe(1);
  });
  for (const previousMarker of [null, 'previous-sign-out']) {
    const storageState = previousMarker ? 'an existing marker' : 'empty storage';
    it(`accepts sign-out from another tab without rebroadcasting it with ${storageState}`, async () => {
      if (previousMarker) localStorage.setItem('suite-session-ended', previousMarker);
      const writes = spyOn(Storage.prototype, 'setItem').and.callThrough();
      const navigate = spyOn(authNavigation, 'assignPath');
      service.acceptUser(person(1));
      window.dispatchEvent(new StorageEvent('storage', { key: 'suite-session-ended', newValue: 'other-tab' }));
      expect(service.currentUser).toBeNull();
      expect(localStorage.getItem('finance-dek')).toBeNull();
      expect(localStorage.getItem('suite-session-ended')).toBe(previousMarker);
      expect(writes).not.toHaveBeenCalled();
      const started = Date.now();
      while (!navigate.calls.any() && Date.now() - started < 5000) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(navigate).toHaveBeenCalledOnceWith('/auth/login');
    });
  }
  it('clears local state even when the sign-out request fails', async () => {
    const navigate = spyOn(authNavigation, 'assignPath');
    service.acceptUser(person(1));
    const pending = service.logout();
    http.expectOne('/api/auth/logout').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(service.currentUser).toBeNull();
    expect(localStorage.getItem('finance-dek')).toBeNull();
    await pending;
    expect(navigate).toHaveBeenCalledWith('/auth/login');
  });
  it('clears private state immediately and ignores a logout finishing after a new sign-in', async () => {
    const navigate = spyOn(authNavigation, 'assignPath');
    service.acceptUser(person(1));
    const pending = service.logout();
    expect(service.currentUser).toBeNull();
    expect(localStorage.getItem('finance-dek')).toBeNull();
    service.acceptUser(person(2));
    http.expectOne('/api/auth/logout').flush({});
    await pending;
    expect(service.currentUser?.id).toBe(2);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('waits for the IndexedDB delete before leaving for login', async () => {
    const navigate = spyOn(authNavigation, 'assignPath');
    service.acceptUser(person(1));
    const paused = pauseNextOpen();
    try {
      const pending = service.logout();
      http.expectOne('/api/auth/logout').flush({}, { status: 503, statusText: 'Unavailable' });
      await paused.ready;
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(navigate).not.toHaveBeenCalled();
      paused.release();
      await pending;
      expect(navigate).toHaveBeenCalledOnceWith('/auth/login');
    } finally {
      paused.release();
      paused.restore();
    }
  });
  it('does not leave for login when the IndexedDB delete fails', async () => {
    const navigate = spyOn(authNavigation, 'assignPath');
    service.acceptUser(person(1));
    const del = IDBObjectStore.prototype.delete;
    const spy = spyOn(IDBObjectStore.prototype, 'delete').and.callFake(function (this: IDBObjectStore, query?: IDBValidKey | IDBKeyRange) {
      const request = del.call(this, query as IDBValidKey);
      setTimeout(() => { try { this.transaction.abort(); } catch { /* already finished */ } }, 0);
      return request;
    });
    try {
      const pending = service.logout();
      http.expectOne('/api/auth/logout').flush({}, { status: 503, statusText: 'Unavailable' });
      await expectAsync(pending).toBeRejected();
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      spy.and.callThrough();
    }
  });
  it('does not publish a profile response from the previous account', async () => {
    service.acceptUser(person(1));
    const pending = service.updateDisplayName('Old account name');
    const rejected = expectAsync(pending).toBeRejected();
    service.acceptUser(person(2));
    http.expectOne('/api/account/name').flush({ ...person(1), display_name: 'Old account name' });
    await rejected;
    expect(service.currentUser).toEqual(person(2));
  });
  it('does not continue a username challenge after the session ends', async () => {
    service.acceptUser(person(1));
    const pending = service.changeUsername('new.name', 'passphrase');
    const rejected = expectAsync(pending).toBeRejected();
    const lookup = http.expectOne('/api/auth/passwordless/lookup');
    service.clearLocalSession();
    lookup.flush({ auth: {} });
    await rejected;
    http.expectNone('/api/auth/passwordless/challenge');
    http.expectNone('/api/auth/me');
    expect(service.currentUser).toBeNull();
  });
});
