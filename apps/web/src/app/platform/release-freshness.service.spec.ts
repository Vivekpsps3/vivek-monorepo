import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { ReleaseFreshnessService, releaseManifestUrl } from './release-freshness.service';

describe('ReleaseFreshnessService', () => {
  const loadedRelease = 'a'.repeat(64);
  const newerRelease = 'b'.repeat(64);
  let routerEvents: Subject<unknown>;
  let releaseMeta: HTMLMetaElement;

  beforeEach(() => {
    routerEvents = new Subject<unknown>();
    releaseMeta = document.createElement('meta');
    releaseMeta.name = 'app-release';
    releaseMeta.content = loadedRelease;
    document.head.append(releaseMeta);
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { events: routerEvents } }],
    });
  });

  afterEach(() => {
    releaseMeta.remove();
    TestBed.inject(ReleaseFreshnessService).ngOnDestroy();
  });

  it('compares the loaded HTML release with a no-store manifest', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(response({ release: newerRelease }));
    const service = TestBed.inject(ReleaseFreshnessService);

    await service.checkForUpdate(true);

    expect(fetchSpy).toHaveBeenCalledWith(releaseManifestUrl(document), {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    expect(service.loadedRelease).toBe(loadedRelease);
    expect(service.latestRelease()).toBe(newerRelease);
    expect(service.updateAvailable()).toBeTrue();
    expect(service.noticeVisible()).toBeTrue();
  });

  it('treats offline and invalid manifest responses as unknown, not as an update', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.rejectWith(new TypeError('offline'));
    const service = TestBed.inject(ReleaseFreshnessService);

    await service.checkForUpdate(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(service.latestRelease()).toBeNull();
    expect(service.updateAvailable()).toBeFalse();
    expect(service.noticeVisible()).toBeFalse();
  });

  it('offers a manual recovery after a lazy chunk navigation failure', async () => {
    spyOn(window, 'fetch').and.resolveTo(response({ release: loadedRelease }));
    const service = TestBed.inject(ReleaseFreshnessService);
    service.start();

    routerEvents.next(new NavigationError(
      1,
      '/stock-lab',
      new TypeError('Failed to fetch dynamically imported module'),
    ));
    await service.checkForUpdate(true);

    expect(service.chunkLoadFailure()).toBeTrue();
    expect(service.noticeVisible()).toBeTrue();
    expect(service.updateAvailable()).toBeFalse();
  });

  it('throttles navigation, focus, and visible-tab checks without reloading automatically', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(response({ release: loadedRelease }));
    const service = TestBed.inject(ReleaseFreshnessService);
    service.start();
    await service.checkForUpdate(true);

    routerEvents.next(new NavigationEnd(1, '/', '/'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(service.updateAvailable()).toBeFalse();
    expect(service.noticeVisible()).toBeFalse();
  });

  it('unsubscribes navigation and tab-return listeners when destroyed', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(response({ release: loadedRelease }));
    const service = TestBed.inject(ReleaseFreshnessService);
    service.start();
    await service.checkForUpdate(true);
    service.ngOnDestroy();

    routerEvents.next(new NavigationEnd(2, '/have', '/have'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

function response(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}
