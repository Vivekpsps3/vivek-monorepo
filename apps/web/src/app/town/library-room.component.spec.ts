import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { readingRoom, readingRoomObjects } from './library-room.assets';
import { LibraryRoomComponent } from './library-room.component';
import { REST_CAMERA, roomRect, roomToScreen } from './library-room.scene';
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

  it('selects only a tap, keeps a committed view through progress failure, and drops an unfinished drag', () => {
    const user$ = new BehaviorSubject<{ id: number } | null>({ id: 1 });
    const progress = new Subject<unknown>();
    TestBed.configureTestingModule({
      imports: [LibraryRoomComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { user$ } },
        { provide: TownApiService, useValue: { getTown: () => progress } },
      ],
    });
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(LibraryRoomComponent);
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '640px';
    fixture.detectChanges();
    for (const image of host.querySelectorAll('img')) image.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    const viewport = host.querySelector('.viewport') as HTMLElement;
    const rect = viewport.getBoundingClientRect();
    expect(rect.width).toBeGreaterThan(200);
    const desk = readingRoomObjects.find(object => object.asset.id === 'desk')!;
    const shelves = readingRoomObjects.find(object => object.asset.id === 'shelves')!;
    const deskRect = roomRect(desk);
    const shelvesRect = roomRect(shelves);
    const shared = {
      x: (Math.max(deskRect.left, shelvesRect.left) + Math.min(deskRect.left + deskRect.width, shelvesRect.left + shelvesRect.width)) / 2,
      y: (Math.max(deskRect.top, shelvesRect.top) + Math.min(deskRect.top + deskRect.height, shelvesRect.top + shelvesRect.height)) / 2,
    };
    const screen = roomToScreen(shared, REST_CAMERA, { width: rect.width, height: rect.height }, readingRoom.bounds);
    const piece = host.querySelector('[data-scene-object="desk"]') as HTMLElement;
    const box = piece.getBoundingClientRect();
    const predicted = roomToScreen(
      { x: deskRect.left, y: deskRect.top },
      REST_CAMERA,
      { width: rect.width, height: rect.height },
      readingRoom.bounds,
    );
    expect(box.left).toBeCloseTo(rect.left + predicted.x, 0);
    expect(box.top).toBeCloseTo(rect.top + predicted.y, 0);
    expect(box.width).toBeCloseTo(piece.querySelector('img')!.getBoundingClientRect().width, 0);

    const pointer = (type: string, x: number, y: number) => viewport.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y, button: 0,
    }));
    pointer('pointerdown', rect.left + screen.x, rect.top + screen.y);
    pointer('pointerup', rect.left + screen.x, rect.top + screen.y);
    expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { object: 'desk' }, replaceUrl: true,
    }));
    navigate.calls.reset();

    const zoomIn = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Zoom in') as HTMLButtonElement;
    zoomIn.click();
    fixture.detectChanges();
    const stage = host.querySelector('.stage') as HTMLElement;
    const zoomed = stage.style.transform;
    expect(zoomed).toContain('scale(1.5)');
    progress.error(new Error('unavailable'));
    fixture.detectChanges();
    expect(host.textContent).toContain('Library progress is unavailable');
    expect(stage.style.transform).toBe(zoomed);

    const movedX = rect.left + screen.x - 36;
    const movedY = rect.top + screen.y - 20;
    pointer('pointerdown', rect.left + screen.x, rect.top + screen.y);
    pointer('pointermove', movedX, movedY);
    fixture.detectChanges();
    expect(stage.style.transform).not.toBe(zoomed);
    pointer('pointercancel', movedX, movedY);
    fixture.detectChanges();
    expect(stage.style.transform).toBe(zoomed);
    pointer('pointerup', movedX, movedY);
    expect(navigate).not.toHaveBeenCalled();

    pointer('pointerdown', rect.left + screen.x, rect.top + screen.y);
    pointer('pointermove', movedX, movedY);
    user$.next({ id: 2 });
    fixture.detectChanges();
    expect(stage.style.transform).toBe(zoomed);
    pointer('pointerup', movedX, movedY);
    expect(navigate).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('Level 19');
  });
});
