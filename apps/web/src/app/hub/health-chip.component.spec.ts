import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { HealthChipComponent } from './health-chip.component';
import { SessionService } from '../platform/session.service';

function setup(admin: boolean) {
  const users = new BehaviorSubject<{id: number} | null>({id: 1});
  const session = { user$: users.asObservable(), isAdmin: () => admin && users.value !== null };
  TestBed.configureTestingModule({providers: [provideRouter([]), {provide: SessionService, useValue: session}]});
  const fetcher = spyOn(globalThis, 'fetch').and.callFake(async url => ({ok: true, status: 200, json: async () => ({status: String(url).includes('travel') ? 'ok' : 'down'})} as Response));
  const fixture = TestBed.createComponent(HealthChipComponent);
  fixture.detectChanges();
  return {fixture, users, fetcher};
}

describe('Admin workspace service health', () => {
  it('never reads health data for a normal owner', fakeAsync(() => {
    const {fixture, fetcher} = setup(false);
    fixture.componentInstance.onVisibility();
    flushMicrotasks();
    expect(fetcher).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  }));

  it('shows partial outages, bounds visible refreshes and clears on logout', fakeAsync(() => {
    const {fixture, fetcher, users} = setup(true);
    flushMicrotasks(); fixture.detectChanges();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('a').textContent).toContain('Media degraded');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/hub/admin');
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    tick(299_999); fixture.componentInstance.onVisibility(); flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(2);
    tick(1); fixture.componentInstance.onVisibility(); flushMicrotasks();
    expect(fetcher).toHaveBeenCalledTimes(4);
    users.next(null); fixture.detectChanges();
    expect(fixture.componentInstance.degraded()).toBe('');
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  }));

  it('discards held old-owner responses and aborts on destruction', fakeAsync(() => {
    const {fixture, fetcher, users} = setup(true);
    flushMicrotasks();
    let finish!: (response: Response) => void;
    fetcher.and.callFake(() => new Promise<Response>(resolve => { finish = resolve; }));
    users.next({id: 2});
    const options = fetcher.calls.mostRecent().args[1];
    users.next(null);
    expect(options?.signal?.aborted).toBeTrue();
    finish(new Response('{"status":"down"}')); flushMicrotasks();
    expect(fixture.componentInstance.degraded()).toBe('');
    fixture.destroy();
  }));
});
