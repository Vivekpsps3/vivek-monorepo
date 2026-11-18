import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController,provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture,TestBed,fakeAsync,tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastService } from '@vivek/ui';
import type { TravelEvent } from '../hub-decode';
import { UpNextComponent } from './up-next.component';

function reminderEvent(): TravelEvent {
  return { id: 7, kind: 'reminder', date: '2026-12-24', time: '09:00', tz: null, title: 'Check in', overdue: true,
    trip_id: 12, trip_title: 'Kyoto', href: '/travel/trips/12',
    reminder: { id: 7, title: 'Check in', due_at: '2026-12-24T09:00', done: false, kind: 'flight', notes: 'Keep this note' } };
}

describe('Up next reminder actions and source states', () => {
  let fixture: ComponentFixture<UpNextComponent>;
  let http: HttpTestingController;
  let event: TravelEvent;
  let undo: (() => void) | undefined;
  let toast: { success: jasmine.Spy; error: jasmine.Spy };
  const payload = { title: 'Check in', due_at: '2026-12-24T09:00', done: true, kind: 'flight', notes: 'Keep this note' };

  beforeEach(() => {
    undo = undefined;
    toast = { success: jasmine.createSpy('success').and.callFake((_message: string, action: () => void) => { undo = action; }), error: jasmine.createSpy('error') };
    TestBed.configureTestingModule({ imports: [UpNextComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ToastService, useValue: toast }] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(UpNextComponent);
    event = reminderEvent();
    for (const [key, value] of Object.entries({ ownerId: 1, today: new Date(2026, 11, 25),
      travel: { next_trip: null, up_next: [event] }, travelState: 'ready', mediaState: 'empty', financeState: 'locked' })) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  function done(): HTMLButtonElement { return fixture.nativeElement.querySelector('.done-check'); }

  it('sends one complete replacement, retains the done row, and Undo restores every field', () => {
    done().click(); done().click();
    fixture.detectChanges();
    expect(done().disabled).toBeTrue();
    const request = http.expectOne('/travel/api/reminders/7');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(payload);
    request.flush({}); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('li.done')).not.toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Reminder marked done.', jasmine.any(Function));
    undo!();
    const restored = http.expectOne('/travel/api/reminders/7');
    expect(restored.request.body).toEqual({ ...payload, done: false });
    restored.flush({}); fixture.detectChanges();
    expect(done().disabled).toBeFalse();
    expect(fixture.nativeElement.querySelector('li.done')).toBeNull();
  });

  it('rolls back a failed Done, allows retry, and rolls back a failed Undo', () => {
    done().click();
    http.expectOne('/travel/api/reminders/7').flush({}, { status: 503, statusText: 'Offline' });
    fixture.detectChanges();
    expect(done().disabled).toBeFalse();
    expect(event.reminder?.done).toBeFalse();
    expect(toast.error).toHaveBeenCalledWith('Couldn\'t mark "Check in" done. Try again.');
    done().click(); http.expectOne('/travel/api/reminders/7').flush({});
    undo!(); http.expectOne('/travel/api/reminders/7').flush({}, { status: 503, statusText: 'Offline' });
    fixture.detectChanges();
    expect(event.reminder?.done).toBeTrue();
    expect(toast.error).toHaveBeenCalledWith('Couldn\'t undo "Check in". Try again.');
  });

  it('ends a hung reminder write at eight seconds and restores the draft', fakeAsync(() => {
    done().click();
    const request = http.expectOne('/travel/api/reminders/7');
    tick(8_000); fixture.detectChanges();
    expect(request.cancelled).toBeTrue();
    expect(event.reminder?.done).toBeFalse();
    expect(done().disabled).toBeFalse();
  }));

  for (const change of ['owner', 'reload', 'dispose'] as const) {
    it(`cancels a pending write on ${change} and cannot publish its success`, () => {
      done().click();
      const request = http.expectOne('/travel/api/reminders/7');
      if (change === 'owner') fixture.componentRef.setInput('ownerId', 2);
      if (change === 'reload') fixture.componentRef.setInput('travelPending', true);
      if (change === 'dispose') fixture.destroy(); else fixture.detectChanges();
      expect(request.cancelled).toBeTrue();
      expect(event.reminder?.done).toBeFalse();
      expect(toast.success).not.toHaveBeenCalled();
    });
  }

  it('invalidates a previous successful Undo after the source reloads', () => {
    done().click(); http.expectOne('/travel/api/reminders/7').flush({});
    fixture.componentRef.setInput('travel', { next_trip: null, up_next: [] }); fixture.detectChanges();
    undo!(); http.expectNone('/travel/api/reminders/7');
  });

  it('keeps usable rows and source recovery with filters, stale data and expiration', () => {
    fixture.componentRef.setInput('mediaState', 'unavailable'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Check in');
    expect(fixture.nativeElement.textContent).toContain("Couldn't load Media dates.");
    const retry = spyOn(fixture.componentInstance.retryMedia, 'emit');
    (fixture.nativeElement.querySelector('.source-state button') as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalled();
    fixture.componentInstance.toggleSource('travel'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Check in');
    expect(fixture.nativeElement.textContent).toContain('Media dates');
    fixture.componentInstance.toggleSource('travel');
    fixture.componentRef.setInput('travelState', 'stale');
    fixture.componentRef.setInput('travelUpdatedAt', Date.now()); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Updated just now');
    expect(done().disabled).toBeTrue();
    fixture.componentRef.setInput('mediaState', 'expired'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Your session ended. Sign in again to see what's up next.");
    expect(fixture.nativeElement.querySelector('li')).toBeNull();
  });

  it('exposes only a Finance integer and clears it on lock', () => {
    fixture.componentRef.setInput('financeState', 'ready'); fixture.componentRef.setInput('billsDue', 2); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('2 bills due this week');
    expect(fixture.nativeElement.querySelector('.finance-row a').getAttribute('href')).toBe('/finance/recurring?t=spend');
    fixture.componentRef.setInput('financeState', 'locked'); fixture.componentRef.setInput('billsDue', null); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('2 bills');
    expect(fixture.nativeElement.textContent).toContain('Bills hidden: Finance is locked');
  });
  it('shows three chronological actions and keeps an owning-app link for later rows', () => {
    fixture.componentRef.setInput('travel', { next_trip: null, up_next: Array.from({ length: 7 }, (_, index) => ({
      ...event, id: index + 1, kind: 'trip_start', reminder: null, overdue: false, time: null,
      date: index === 0 ? '2026-12-25' : index === 1 ? '2026-12-26' : '2027-01-03', title: `Trip ${index + 1}`,
    })) });
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.event-title'));
    expect(links.map(link => link.textContent?.trim())).toEqual(['Trip 1', 'Trip 2', 'Trip 3']);
    expect(fixture.nativeElement.textContent).toContain('Tomorrow');
    expect(fixture.nativeElement.querySelector('.more a').getAttribute('href')).toBe('/travel/calendar');
    expect(fixture.nativeElement.textContent).not.toContain('Trip 4');
    expect(fixture.nativeElement.textContent).not.toContain('Trip 7');
  });

  it('shows one planning action for a complete empty window, and no empty claim for an unavailable source', () => {
    fixture.componentRef.setInput('travel', { next_trip: null, up_next: [] });
    fixture.componentRef.setInput('financeState', 'empty'); fixture.componentRef.setInput('billsDue', 0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nothing due in the next two weeks.');
    expect(fixture.nativeElement.querySelectorAll('a').length).toBe(2);
    expect(fixture.nativeElement.querySelector('ui-button a').getAttribute('href')).toBe('/travel/trips/new');
    fixture.componentRef.setInput('mediaState', 'unavailable'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Nothing due');
    expect(fixture.nativeElement.textContent).toContain("Couldn't load Media dates.");
  });

});
