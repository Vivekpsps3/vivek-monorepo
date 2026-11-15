import { decodeTravelSummary } from './hub-decode';
import { fetchHubMedia, fetchHubSummary, settleHubCard } from './hub-load';

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
    const result = await fetchHubSummary('/travel/api/summary', new AbortController().signal, decodeTravelSummary, 20);
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('reports an expired session without throwing', async () => {
    spyOn(window, 'fetch').and.resolveTo(jsonResponse(401, { detail: 'nope' }));
    const result = await fetchHubSummary('/media/api/summary', new AbortController().signal, decodeTravelSummary, 1000);
    expect(result).toEqual({ status: 'expired' });
  });

  it('cancels an in-flight summary when the caller aborts', async () => {
    const ctrl = new AbortController();
    spyOn(window, 'fetch').and.callFake((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = fetchHubSummary('/travel/api/summary', ctrl.signal, decodeTravelSummary, 5000);
    ctrl.abort();
    await expectAsync(pending).toBeResolvedTo({ status: 'cancelled' });
  });

  it('ignores a late body after the caller aborted', async () => {
    const ctrl = new AbortController();
    let finish: (value: Response) => void = () => undefined;
    spyOn(window, 'fetch').and.returnValue(new Promise<Response>(resolve => {
      finish = resolve;
    }));
    const pending = fetchHubSummary('/travel/api/summary', ctrl.signal, decodeTravelSummary, 5000);
    ctrl.abort();
    finish(jsonResponse(200, { up_next: [], next_trip: { title: 'Previous user' } }));
    await expectAsync(pending).toBeResolvedTo({ status: 'cancelled' });
  });

  it('publishes a decoded empty trip', async () => {
    spyOn(window, 'fetch').and.resolveTo(jsonResponse(200, { up_next: [], today: '2026-11-11', next_trip: null }));
    const empty = await fetchHubSummary('/travel/api/summary', new AbortController().signal, decodeTravelSummary, 1000);
    expect(empty).toEqual({ status: 'ok', body: { up_next: [], next_trip: null } });
  });

  it('turns a malformed summary into unavailable without throwing', async () => {
    spyOn(window, 'fetch').and.resolveTo(jsonResponse(200, { up_next: [], next_trip: { id: '7', title: 'Lisbon' } }));
    const malformed = await fetchHubSummary('/travel/api/summary', new AbortController().signal, decodeTravelSummary, 1000);
    expect(malformed).toEqual({ status: 'unavailable' });
  });

  it('drops a body that decodes after the caller aborts', async () => {
    const ctrl = new AbortController();
    let finishFetch: (value: Response) => void = () => undefined;
    let finishJson: (value: unknown) => void = () => undefined;
    spyOn(window, 'fetch').and.returnValue(new Promise<Response>(resolve => {
      finishFetch = resolve;
    }));
    const pending = fetchHubSummary('/travel/api/summary', ctrl.signal, decodeTravelSummary, 5000);
    finishFetch({
      ok: true,
      status: 200,
      json: () => new Promise(resolve => {
        finishJson = resolve;
      }),
    } as Response);
    await Promise.resolve();
    ctrl.abort();
    finishJson({
      up_next: [],
      next_trip: {
        id: 7,
        title: 'Previous user',
        destination: null,
        start_date: '2026-11-02',
        end_date: '2026-11-06',
        phase: 'upcoming',
        days_until: 0,
        next_action: 'Open the trip',
      },
    });
    await expectAsync(pending).toBeResolvedTo({ status: 'cancelled' });
  });
});

describe('one Media source load', () => {
  const summary = { currently: [], upcoming: [], recent_reviews: [], next_episodes: [] };
  it('starts the summary and both saved months together and shares one snapshot', async () => {
    const calls = spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL) =>
      Promise.resolve(jsonResponse(200, String(input).includes('/calendar?') ? { days: [] } : summary)));
    const result = await fetchHubMedia('2026-12-25', new AbortController().signal);
    expect(result).toEqual({ status: 'ok', body: { ...summary, calendars: [{ days: [] }, { days: [] }] } });
    expect(calls.calls.allArgs().map(args => String(args[0]).split('&')[0])).toEqual([
      '/media/api/summary', '/media/api/calendar?month=2026-12', '/media/api/calendar?month=2027-01',
    ]);
  });

  for (const status of [401, 503]) {
    it(`settles the whole Media source honestly when the second month returns ${status}`, async () => {
      spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL) => Promise.resolve(
        String(input).includes('month=2027-01') ? jsonResponse(status, {}) : jsonResponse(200, String(input).includes('/calendar?') ? { days: [] } : summary),
      ));
      expect(await fetchHubMedia('2026-12-25', new AbortController().signal)).toEqual({ status: status === 401 ? 'expired' : 'unavailable' });
    });
  }

  it('bounds both held months by one source deadline', async () => {
    const aborted: string[] = [];
    spyOn(window, 'fetch').and.callFake((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes('/calendar?')) return Promise.resolve(jsonResponse(200, summary));
      return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => {
        aborted.push(String(input)); reject(new DOMException('timeout', 'AbortError'));
      }));
    });
    expect(await fetchHubMedia('2026-12-25', new AbortController().signal, 20)).toEqual({ status: 'unavailable' });
    expect(aborted.length).toBe(2);
  });

  it('drops every held response on an owner abort', async () => {
    const ctrl = new AbortController();
    const releases: ((value: Response) => void)[] = [];
    spyOn(window, 'fetch').and.callFake(() => new Promise<Response>(resolve => releases.push(resolve)));
    const pending = fetchHubMedia('2026-12-25', ctrl.signal);
    ctrl.abort();
    releases[0](jsonResponse(200, summary));
    releases.slice(1).forEach(release => release(jsonResponse(200, { days: [] })));
    expect(await pending).toEqual({ status: 'cancelled' });
  });
});
