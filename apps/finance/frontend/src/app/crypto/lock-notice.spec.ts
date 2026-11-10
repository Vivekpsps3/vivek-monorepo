import { TestBed } from '@angular/core/testing';
import { SESSION_CONTEXT, type SessionPort } from '@vivek/ui';
import { financeTabId } from './dek-holder';
import { LOCK_SIGNAL, VAULT_PRESENCE } from './dek-store';
import { acceptLockNotice, bindLockNotices, type LockSessionNotice } from './lock-notice';

describe('lock session notices', () => {
  const releases: Array<() => void> = [];
  let userId: number | null;

  function session(): SessionPort {
    return { get currentUser() { return userId == null ? null : { id: userId } as SessionPort['currentUser']; } } as SessionPort;
  }

  function bind(drop: (notice: LockSessionNotice) => void): () => void {
    let release: () => void = () => undefined;
    TestBed.runInInjectionContext(() => { release = bindLockNotices(drop); });
    releases.push(release);
    return release;
  }

  function storage(key: string | null, newValue: string | null): void {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  }

  async function post(message: unknown): Promise<void> {
    const sender = new BroadcastChannel('finance-vault-sync-v1');
    sender.postMessage(message);
    sender.close();
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  beforeEach(() => {
    userId = 7;
    TestBed.configureTestingModule({
      providers: [{ provide: SESSION_CONTEXT, useFactory: session }],
    });
  });

  afterEach(() => {
    while (releases.length) releases.pop()?.();
    TestBed.resetTestingModule();
  });

  it('notifies every live subscriber once for one storage lock (LOCAL1)', () => {
    const hits: string[] = [];
    bind(() => hits.push('hub'));
    bind(() => hits.push('pixels'));
    bind(() => hits.push('world'));
    storage(LOCK_SIGNAL, '1');
    expect(hits).toEqual(['hub', 'pixels', 'world']);
  });

  it('accepts a remote lock for the current owner and ignores a foreign owner (LOCAL1 LOCAL2)', async () => {
    const hits: LockSessionNotice[] = [];
    bind(notice => hits.push(notice));
    await post({ version: 1, userId: 7, kind: 'lock', tabId: 'other-tab' });
    await post({ version: 1, userId: 8, kind: 'lock', tabId: 'other-tab' });
    expect(hits).toEqual([{ version: 1, userId: 7, kind: 'lock', tabId: 'other-tab' }]);
  });

  it('follows the session port when the owner changes (LOCAL2)', async () => {
    const hits: string[] = [];
    bind(() => hits.push(String(userId)));
    await post({ version: 1, userId: 7, kind: 'lock', tabId: 'other-tab' });
    userId = 4;
    await post({ version: 1, userId: 7, kind: 'lock', tabId: 'other-tab' });
    await post({ version: 1, userId: 4, kind: 'signout' });
    expect(hits).toEqual(['7', '4']);
  });

  it('rejects malformed, version, and kind mismatches without rewriting them (LOCAL2)', () => {
    const local = financeTabId();
    const rejected = [
      null,
      'lock',
      1,
      [],
      {},
      { version: 2, userId: 7, kind: 'lock' },
      { version: 1, userId: 7, kind: 'invalidate' },
      { version: 1, userId: '7', kind: 'lock' },
      { version: 1, userId: 7, kind: 'lock', tabId: local },
      { version: 1, userId: 9, kind: 'signout', tabId: local },
    ];
    for (const value of rejected) expect(acceptLockNotice(value, 7, local)).toBeNull();
    expect(acceptLockNotice({ version: 1, userId: 7, kind: 'lock', passphrase: 'secret', tabId: 'other' }, 7, local))
      .toEqual({ version: 1, userId: 7, kind: 'lock', tabId: 'other' });
  });

  it('does not treat a sign-out that carries this tab id as an echo (LOCAL2)', async () => {
    const hits: LockSessionNotice[] = [];
    bind(notice => hits.push(notice));
    const local = financeTabId();
    await post({ version: 1, userId: 7, kind: 'lock', tabId: local });
    await post({ version: 1, userId: 7, kind: 'signout', tabId: local });
    expect(hits).toEqual([{ version: 1, userId: 7, kind: 'signout', tabId: local }]);
  });

  it('stops a disposed subscriber and keeps the one that remains (LOCAL3)', () => {
    const hits: string[] = [];
    const releaseHub = bind(() => hits.push('hub'));
    bind(() => hits.push('world'));
    releaseHub();
    releaseHub();
    storage(LOCK_SIGNAL, '2');
    expect(hits).toEqual(['world']);
  });

  it('drops a listener removed during the pass and waits for one added during it', () => {
    const hits: string[] = [];
    let releaseWorld: () => void = () => undefined;
    bind(() => {
      hits.push('hub');
      releaseWorld();
      bind(() => hits.push('late'));
    });
    releaseWorld = bind(() => hits.push('world'));
    storage(LOCK_SIGNAL, '3');
    expect(hits).toEqual(['hub']);
    storage(LOCK_SIGNAL, '4');
    expect(hits).toEqual(['hub', 'hub', 'late']);
  });

  it('keeps later listeners when an earlier one throws', () => {
    const hits: string[] = [];
    bind(() => { hits.push('hub'); throw new Error('boom'); });
    bind(() => hits.push('pixels'));
    storage(VAULT_PRESENCE, null);
    expect(hits).toEqual(['hub', 'pixels']);
  });

  it('ignores dek migration and a cleared lock signal, and repeats a real lock', () => {
    const hits: string[] = [];
    bind(() => hits.push('lock'));
    storage('finance-dek', null);
    storage(LOCK_SIGNAL, null);
    storage(VAULT_PRESENCE, '7');
    expect(hits).toEqual([]);
    storage(null, null);
    storage(LOCK_SIGNAL, '5');
    expect(hits).toEqual(['lock', 'lock']);
  });

  it('still delivers a storage lock when BroadcastChannel is missing, and binds when storage is missing', () => {
    const realChannel = globalThis.BroadcastChannel;
    const hits: string[] = [];
    globalThis.BroadcastChannel = undefined as unknown as typeof BroadcastChannel;
    try {
      bind(() => hits.push('pixels'));
      storage(LOCK_SIGNAL, '6');
      expect(hits).toEqual(['pixels']);
    } finally {
      globalThis.BroadcastChannel = realChannel;
    }
    while (releases.length) releases.pop()?.();

    const realAdd = window.addEventListener.bind(window);
    spyOn(window, 'addEventListener').and.callFake(((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type === 'storage') throw new Error('no storage');
      realAdd(type, listener, options);
    }) as typeof window.addEventListener);
    globalThis.BroadcastChannel = undefined as unknown as typeof BroadcastChannel;
    try {
      const release = bind(() => hits.push('again'));
      expect(() => release()).not.toThrow();
    } finally {
      globalThis.BroadcastChannel = realChannel;
    }
    expect(hits).toEqual(['pixels']);
  });
});
