import { BehaviorSubject, Subject } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SessionService } from '../../platform/session.service';
import { WorldApi } from '../data/world-api';
import { LibraryStudyComponent, studyConceptId } from './library-study.component';

describe('study concept ids', () => {
  it('keeps a safe positive id and rejects anything else', () => {
    expect(studyConceptId(null)).toBeNull();
    expect(studyConceptId('41')).toBe(41);
    expect(studyConceptId('0')).toBe('invalid');
    expect(studyConceptId('nope')).toBe('invalid');
    expect(studyConceptId('9007199254740993')).toBe('invalid');
    expect(studyConceptId('9223372036854775808')).toBe('invalid');
  });
});

describe('Library study clock', () => {
  const users = new BehaviorSubject<{ id: number } | null>({ id: 1 });
  const cleared = new Subject<void>();

  it('drops a town clock that belongs to the previous owner', async () => {
    const pending: Array<{ resolve: (value: unknown) => void }> = [];
    const api = {
      timezone: () => 'America/Los_Angeles',
      listConcepts: () => Promise.resolve([]),
      getTown: () => new Promise(resolve => pending.push({ resolve })),
    };
    users.next({ id: 1 });
    await TestBed.configureTestingModule({
      imports: [LibraryStudyComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: {
          paramMap: new BehaviorSubject(convertToParamMap({ conceptId: '41' })),
          queryParamMap: new BehaviorSubject(convertToParamMap({})),
        } },
        { provide: WorldApi, useValue: api },
        { provide: SessionService, useValue: { user$: users, cleared$: cleared, currentUser: { id: 1 } } },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<LibraryStudyComponent> = TestBed.createComponent(LibraryStudyComponent);
    fixture.detectChanges();
    expect(pending.length).toBe(1);
    expect(fixture.nativeElement.querySelector('[data-today]')?.getAttribute('data-today')).toBe('');
    users.next({ id: 2 });
    expect(pending.length).toBe(2);
    pending[0]?.resolve({ town: { today: '1999-01-01' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('1999-01-01');
    expect(fixture.nativeElement.querySelector('[data-today]')?.getAttribute('data-today')).toBe('');
    pending[1]?.resolve({ town: { today: '2026-10-29' } });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-today]')?.getAttribute('data-today')).toBe('2026-10-29');
    expect(fixture.nativeElement.textContent).toContain("That concept doesn't exist.");
    fixture.destroy();
  });
});
