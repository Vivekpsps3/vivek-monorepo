import { fetchHubSummary, settleHubCard } from './hub-load';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('hub summary loading', () => {
  it('keeps one card when another summary fails', () => {
    const media = settleHubCard({ currently: [{ id: 1 }] }, { status: 'ok', body: { currently: [{ id: 1 }] } }, body => body.currently.length === 0);
    const travel = settleHubCard(null, { status: 'unavailable' }, (trip: { id: number } | null) => trip == null);
    expect(media).toEqual({ state: 'ready', data: { currently: [{ id: 1 }] } });
    expect(travel).toEqual({ state: 'unavailable', data: null });
  });

  it('retries onto a fresh snapshot and keeps a stale one when the retry fails', () => {
    const previous = { id: 4, title: 'Lisbon' };
    expect(settleHubCard(null, { status: 'unavailable' }, (trip: typeof previous | null) => trip == null)?.state).toBe('unavailable');
    const recovered = settleHubCard(null, { status: 'ok', body: previous }, trip => trip == null);
    expect(recovered).toEqual({ state: 'ready', data: previous });
    expect(settleHubCard(previous, { status: 'unavailable' }, trip => trip == null)).toEqual({
      state: 'stale',
      data: previous,
    });
  });

  it('drops an expired session and ignores a cancelled load', () => {
    const previous = { id: 4 };
    expect(settleHubCard(previous, { status: 'expired' }, () => false)).toEqual({ state: 'expired', data: null });
    expect(settleHubCard(previous, { status: 'cancelled' }, () => false)).toBeNull();
    expect(settleHubCard(null, { status: 'ok', body: null }, body => body == null)).toEqual({ state: 'empty', data: null });
  });

  it('times out a stalled summary and does not treat that as cancellation', async () => {
    spyOn(window, 'fetch').and.callFake((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'AbortError')));
    }));
    const result = await fetchHubSummary('/travel/api/summary', new AbortController().signal, 20);
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('reports an expired session without throwing', async () => {
    spyOn(window, 'fetch').and.resolveTo(jsonResponse(401, { detail: 'nope' }));
    const result = await fetchHubSummary('/media/api/summary', new AbortController().signal, 1000);
    expect(result).toEqual({ status: 'expired' });
  });

  it('cancels an in-flight summary when the caller aborts', async () => {
    const ctrl = new AbortController();
    spyOn(window, 'fetch').and.callFake((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = fetchHubSummary('/travel/api/summary', ctrl.signal, 5000);
    ctrl.abort();
    await expectAsync(pending).toBeResolvedTo({ status: 'cancelled' });
  });

  it('ignores a late body after the caller aborted', async () => {
    const ctrl = new AbortController();
    let finish: (value: Response) => void = () => undefined;
    spyOn(window, 'fetch').and.returnValue(new Promise<Response>(resolve => {
      finish = resolve;
    }));
    const pending = fetchHubSummary<{ next_trip: { title: string } | null }>('/travel/api/summary', ctrl.signal, 5000);
    ctrl.abort();
    finish(jsonResponse(200, { next_trip: { title: 'Previous user' } }));
    await expectAsync(pending).toBeResolvedTo({ status: 'cancelled' });
  });
});
