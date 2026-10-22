/** One in-flight load at a time. A newer start aborts the previous one. */

export function createSequence() {
  let token = 0;
  let controller = null;
  return {
    start() {
      token += 1;
      controller?.abort();
      controller = new AbortController();
      const current = token;
      const signal = controller.signal;
      return {
        signal,
        isCurrent: () => current === token && !signal.aborted,
      };
    },
  };
}

/** Search loads are keyed, so a slower response for another (q, kind) cannot paint. */
export function createKeyedFetch() {
  let controller = null;
  let key = "";
  return {
    start(nextKey) {
      controller?.abort();
      controller = new AbortController();
      key = String(nextKey);
      const expected = key;
      const signal = controller.signal;
      return {
        signal,
        matches: () => key === expected && !signal.aborted,
      };
    },
  };
}
