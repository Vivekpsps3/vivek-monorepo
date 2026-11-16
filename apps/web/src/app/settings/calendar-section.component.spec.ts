import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { ConfirmService } from '@vivek/ui';
import { SessionService } from '../platform/session.service';
import { CalendarSectionComponent } from './calendar-section.component';

const API = '/api/account/calendar-feeds';
const feed = {id: 1, scope: 'travel' as const, timezone: 'UTC'};
const revealed = {...feed, url: 'https://calendar.example.test/calendar/feed.ics?token=synthetic-only'};

function setup() {
  const users = new BehaviorSubject<{id: number} | null>({id: 1});
  const cleared = new Subject<void>();
  const session = {user$: users, cleared$: cleared, get currentUser() { return users.value; }};
  TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting(), {provide: SessionService, useValue: session}, {provide: ConfirmService, useValue: {ask: () => Promise.resolve(true)}}]});
  const fixture = TestBed.createComponent(CalendarSectionComponent);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(API).flush([]);
  return {fixture, http, users, cleared};
}

describe('Calendar subscription Settings lifecycle', () => {
  it('retains a URL only in the one-time disclosure and clears it on session clearing and destruction', fakeAsync(() => {
    const {fixture, http, cleared} = setup(); flushMicrotasks();
    fixture.componentInstance.create();
    http.expectOne(API).flush(revealed); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.componentInstance.revealed()?.url).toBe(revealed.url);
    expect(JSON.stringify(fixture.componentInstance.feeds())).not.toContain('token=');
    cleared.next(); fixture.detectChanges();
    expect(fixture.componentInstance.revealed()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('synthetic-only');
    fixture.destroy(); http.verify();
  }));

  it('rejects a held old-owner completion and cancels requests on route destruction', fakeAsync(() => {
    const {fixture, http, users} = setup(); flushMicrotasks();
    fixture.componentInstance.create();
    const old = http.expectOne(API);
    users.next({id: 2});
    http.expectOne(API).flush([]); flushMicrotasks();
    old.flush(revealed); flushMicrotasks();
    expect(fixture.componentInstance.revealed()).toBeNull();
    expect(fixture.componentInstance.feeds()).toEqual([]);
    fixture.componentInstance.create();
    const pending = http.expectOne(API);
    fixture.destroy(); flushMicrotasks();
    expect(pending.cancelled).toBeTrue();
    http.verify();
  }));

  it('keeps create selection on failure and uses the existing confirmation before rotation/revocation', fakeAsync(() => {
    const {fixture, http} = setup(); flushMicrotasks();
    const component = fixture.componentInstance;
    component.scope = 'media'; component.timezone = 'Asia/Kolkata';
    component.create();
    const failed = http.expectOne(API);
    expect(failed.request.body).toEqual({scope: 'media', timezone: 'Asia/Kolkata'});
    failed.flush({}, {status: 503, statusText: 'Unavailable'}); flushMicrotasks();
    expect(component.scope).toBe('media'); expect(component.timezone).toBe('Asia/Kolkata');
    expect(component.error()).toContain('selection is kept');
    component.feeds.set([feed]);
    component.rotate(feed); flushMicrotasks();
    http.expectOne(API + '/1/rotate').flush(revealed); flushMicrotasks();
    expect(component.revealed()?.url).toBe(revealed.url);
    component.revoke(feed); flushMicrotasks();
    http.expectOne(API + '/1').flush(null); flushMicrotasks();
    expect(component.revealed()).toBeNull(); expect(component.feeds()).toEqual([]);
    fixture.destroy(); http.verify();
  }));
});
