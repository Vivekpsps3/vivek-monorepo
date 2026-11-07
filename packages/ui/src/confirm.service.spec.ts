import { ConfirmService, type ConfirmState } from './confirm.service';

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('ConfirmService confirmAction (K2)', () => {
  let service: ConfirmService;
  let state: ConfirmState | null;

  beforeEach(() => {
    service = new ConfirmService();
    state = null;
    service.state$.subscribe(value => (state = value));
  });

  it('confirmAction resolves true only after run resolves', async () => {
    const gate = deferred();
    let settled: boolean | undefined;
    const result = service.confirmAction({ title: 'Erase', message: 'Sure?', run: () => gate.promise });
    void result.then(value => (settled = value));
    service.confirmRun();
    await flush();
    expect(settled).toBeUndefined();
    gate.resolve();
    await expectAsync(result).toBeResolvedTo(true);
    expect(state).toBeNull();
  });

  it('cancel resolves false and never calls run', async () => {
    const run = jasmine.createSpy('run').and.resolveTo();
    const result = service.confirmAction({ title: 'Erase', message: 'Sure?', run });
    service.close(false);
    await expectAsync(result).toBeResolvedTo(false);
    expect(run).not.toHaveBeenCalled();
    expect(state).toBeNull();
  });

  it('a rejected run keeps the dialog open with the error and does not settle', async () => {
    let settled: boolean | undefined;
    const result = service.confirmAction({
      title: 'Erase',
      message: 'Sure?',
      errorMessage: 'Could not erase. Try again.',
      run: () => Promise.reject(new Error('boom')),
    });
    void result.then(value => (settled = value));
    service.confirmRun();
    await flush();
    expect(state).not.toBeNull();
    expect(state?.error).toBe('Could not erase. Try again.');
    expect(state?.busy).toBe(false);
    expect(settled).toBeUndefined();
    service.close(false);
    await expectAsync(result).toBeResolvedTo(false);
  });

  it('close is ignored while busy', async () => {
    const gate = deferred();
    const result = service.confirmAction({ title: 'Erase', message: 'Sure?', run: () => gate.promise });
    service.confirmRun();
    expect(state?.busy).toBe(true);
    service.close(false);
    service.close(true);
    expect(state).not.toBeNull();
    gate.resolve();
    await expectAsync(result).toBeResolvedTo(true);
  });

  it('a new request while busy resolves false and keeps the busy dialog', async () => {
    const gate = deferred();
    const first = service.confirmAction({ title: 'Erase', message: 'Sure?', run: () => gate.promise });
    service.confirmRun();
    const second = service.confirmAction({ title: 'Other', message: 'Other?', run: () => Promise.resolve() });
    await expectAsync(second).toBeResolvedTo(false);
    const third = service.ask('Other', 'Other?');
    await expectAsync(third).toBeResolvedTo(false);
    expect(state?.title).toBe('Erase');
    expect(state?.busy).toBe(true);
    gate.resolve();
    await expectAsync(first).toBeResolvedTo(true);
  });

  it('ask still settles a replaced caller as false', async () => {
    const replaced = service.ask('First', 'First?');
    const replacement = service.ask('Second', 'Second?');
    await expectAsync(replaced).toBeResolvedTo(false);
    expect(state?.title).toBe('Second');
    service.close(true);
    await expectAsync(replacement).toBeResolvedTo(true);
  });

  it('a retry after a rejected run can still resolve true', async () => {
    let attempts = 0;
    const result = service.confirmAction({
      title: 'Erase',
      message: 'Sure?',
      run: () => (++attempts === 1 ? Promise.reject(new Error('boom')) : Promise.resolve()),
    });
    service.confirmRun();
    await flush();
    expect(state?.error).toBeTruthy();
    service.confirmRun();
    await expectAsync(result).toBeResolvedTo(true);
    expect(attempts).toBe(2);
  });
});
