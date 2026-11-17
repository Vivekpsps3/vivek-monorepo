import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { LibraryRoomComponent } from './library-room.component';
import { TownApiService } from './town.api';

describe('Reading Hall load ownership', () => {
  it('ignores held Library progress on owner change and on room destruction', () => {
    const user$ = new BehaviorSubject<{ id: number } | null>({ id: 1 });
    const original = new Subject();
    const next = new Subject();
    const pendingOnExit = new Subject();
    const getTown = jasmine.createSpy().and.returnValues(original, next, pendingOnExit);
    TestBed.configureTestingModule({
      imports: [LibraryRoomComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { user$ } },
        { provide: TownApiService, useValue: { getTown } },
      ],
    });
    const fixture = TestBed.createComponent(LibraryRoomComponent);
    const contents = () => (fixture.nativeElement as HTMLElement).textContent;
    fixture.detectChanges();
    expect(contents()).toContain('Loading Library progress');
    expect(original.observed).toBeTrue();

    user$.next({ id: 2 });
    expect(original.observed).toBeFalse();
    original.next({ buildings: { library: { level: 19, source: 'ok', today_xp: 7, today_cap: 10 } } });
    fixture.detectChanges();
    expect(contents()).not.toContain('Level 19');
    expect(contents()).toContain('Loading Library progress');
    next.next({ buildings: { library: { level: 3, source: 'ok', today_xp: 2, today_cap: 10 } } });
    fixture.detectChanges();
    expect(contents()).toContain('Level 3 · 2 / 10 Media XP today');

    user$.next({ id: 3 });
    fixture.detectChanges();
    expect(contents()).not.toContain('Level 3');
    expect(pendingOnExit.observed).toBeTrue();
    fixture.destroy();
    expect(pendingOnExit.observed).toBeFalse();
  });
});
