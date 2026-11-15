import { withVaultStore } from './dek-store';

describe('vault IndexedDB abort eligibility', () => {
  for (const state of ['pending', 'done'] as const) {
    it(`rejects an aborted transaction with a ${state} request without reading a pending error`, async () => {
      let errorRead = false;
      const failure = new DOMException('Synthetic request failure', 'UnknownError');
      const request = {
        readyState: state,
        get error() {
          errorRead = true;
          if (state === 'pending') throw new DOMException('Request is still pending', 'InvalidStateError');
          return failure;
        },
      } as unknown as IDBRequest<undefined>;
      const tx = { error: null, objectStore: () => ({}) } as unknown as IDBTransaction;
      const close = jasmine.createSpy('close');
      const open = { result: { transaction: () => tx, close } } as unknown as IDBOpenDBRequest;
      spyOn(indexedDB, 'open').and.returnValue(open);
      const pending = withVaultStore('readwrite', () => request);
      open.onsuccess?.call(open, new Event('success'));
      expect(() => tx.onabort?.call(tx, new Event('abort'))).not.toThrow();
      await expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({ name: state === 'pending' ? 'AbortError' : 'UnknownError' }));
      expect(errorRead).toBe(state === 'done');
      expect(close).toHaveBeenCalledTimes(1);
    });
  }
});
