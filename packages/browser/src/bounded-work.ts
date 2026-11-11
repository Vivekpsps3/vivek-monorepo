/**
 * One deadline and one child signal for a user action.
 * Caller abort and the deadline stay distinct. dispose() drops the timer
 * and listeners and does not abort, so a finished action is not rewritten.
 */
export type BoundedStep<T> =
  | { status: 'ok'; value: T }
  | { status: 'deadline' }
  | { status: 'cancelled' }
  | { status: 'failed'; error: unknown };

export interface BoundedWork {
  readonly signal: AbortSignal;
  /** A parent signal aborted. A deadline alone leaves this false. */
  callerAborted(): boolean;
  timedOut(): boolean;
  /**
   * Run one step on this action's single deadline.
   * An already-stopped action does not start the step.
   * A result that arrives after the action stops is ignored.
   */
  run<T>(step: () => Promise<T>): Promise<BoundedStep<T>>;
  /** Idempotent. Clears the timer and parent listeners. */
  dispose(): void;
}

export function mayPublish(work: BoundedWork, stillOwner: boolean): boolean {
  return stillOwner && !work.signal.aborted;
}

export function openBoundedWork(options?: {
  parents?: readonly (AbortSignal | undefined)[];
  /** Caller-owned controller. World budget abort uses this so lock can cancel the child. */
  controller?: AbortController;
  deadlineMs?: number;
}): BoundedWork {
  const controller = options?.controller ?? new AbortController();
  const parents = (options?.parents ?? []).filter((parent): parent is AbortSignal => parent != null);
  let timedOut = false;
  let disposed = false;
  const removeListeners: Array<() => void> = [];
  const onParent = (): void => {
    controller.abort();
  };
  for (const parent of parents) {
    if (parent.aborted) controller.abort();
    else {
      parent.addEventListener('abort', onParent, { once: true });
      removeListeners.push(() => parent.removeEventListener('abort', onParent));
    }
  }
  if (options?.deadlineMs != null) {
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.deadlineMs);
    removeListeners.push(() => clearTimeout(timer));
  }

  function callerAborted(): boolean {
    return parents.some(parent => parent.aborted);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    while (removeListeners.length > 0) removeListeners.pop()?.();
  }

  function stoppedStatus(): 'cancelled' | 'deadline' {
    return callerAborted() ? 'cancelled' : 'deadline';
  }

  async function run<T>(step: () => Promise<T>): Promise<BoundedStep<T>> {
    if (callerAborted()) return { status: 'cancelled' };
    if (controller.signal.aborted) return { status: 'deadline' };
    let removeAbort = (): void => undefined;
    const stopped = new Promise<'cancelled' | 'deadline'>(resolve => {
      const onAbort = (): void => resolve(stoppedStatus());
      controller.signal.addEventListener('abort', onAbort, { once: true });
      removeAbort = () => controller.signal.removeEventListener('abort', onAbort);
    });
    const stepResult = new Promise<T>((resolve, reject) => {
      try {
        resolve(step());
      } catch (error) {
        reject(error);
      }
    });
    const finished = stepResult.then(
      (value): BoundedStep<T> => ({ status: 'ok', value }),
      (error: unknown): BoundedStep<T> => ({ status: 'failed', error }),
    );
    let outcome: BoundedStep<T>;
    try {
      outcome = await Promise.race([
        stopped.then((status): BoundedStep<T> => ({ status })),
        finished,
      ]);
    } finally {
      removeAbort();
    }
    if (controller.signal.aborted && (outcome.status === 'ok' || outcome.status === 'failed')) {
      return { status: stoppedStatus() };
    }
    return outcome;
  }

  return {
    signal: controller.signal,
    callerAborted,
    timedOut: () => timedOut,
    run,
    dispose,
  };
}
