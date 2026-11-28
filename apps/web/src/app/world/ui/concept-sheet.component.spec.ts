import { BehaviorSubject, Subject } from 'rxjs';
import { ComponentFixture,TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../platform/session.service';
import { WorldApi } from '../data/world-api';
import { WORLD_COPY,type ConceptRecord } from '../world.types';
import { ConceptSheetComponent } from './concept-sheet.component';

const concept: ConceptRecord = {
  id: 4,
  name: 'Rivers',
  note: 'A week of water',
  source: 'https://example.com/rivers',
  understood_on: null,
  archived: false,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

describe('ConceptSheetComponent', () => {
  let fixture: ComponentFixture<ConceptSheetComponent>;
  const users = new BehaviorSubject<{ id: number } | null>({ id: 1 });
  const cleared = new Subject<void>();
  let api: {
    timezone: jasmine.Spy;
    listConcepts: jasmine.Spy;
    createConcept: jasmine.Spy;
    patchConcept: jasmine.Spy;
    deleteConcept: jasmine.Spy;
  };

  beforeEach(() => {
    spyOn(window, 'matchMedia').and.callFake((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
    users.next({ id: 1 });
    api = {
      timezone: jasmine.createSpy('timezone').and.returnValue('America/Los_Angeles'),
      listConcepts: jasmine.createSpy('listConcepts').and.callFake((archived: boolean) => Promise.resolve(archived ? [] : [concept])),
      createConcept: jasmine.createSpy('createConcept').and.rejectWith({ status: 404, message: 'That concept does not exist.' }),
      patchConcept: jasmine.createSpy('patchConcept'),
      deleteConcept: jasmine.createSpy('deleteConcept').and.resolveTo(undefined),
    };
  });

  afterEach(() => {
    fixture?.destroy();
  });

  async function open(creating = false): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ConceptSheetComponent],
      providers: [
        provideRouter([]),
        { provide: WorldApi, useValue: api },
        { provide: SessionService, useValue: { user$: users, cleared$: cleared, currentUser: { id: 1 } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ConceptSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('today', '2026-10-29');
    fixture.componentRef.setInput('creating', creating);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('rejects a name past 80 characters and keeps the date bounds on the form', async () => {
    await open(true);
    const name = fixture.nativeElement.querySelector('#concept-name') as HTMLInputElement;
    const note = fixture.nativeElement.querySelector('#concept-note') as HTMLTextAreaElement;
    const source = fixture.nativeElement.querySelector('#concept-source') as HTMLInputElement;
    const understood = fixture.nativeElement.querySelector('#concept-understood') as HTMLInputElement;
    expect(name.maxLength).toBe(80);
    expect(note.maxLength).toBe(2000);
    expect(source.maxLength).toBe(500);
    expect(understood.min).toBe('2000-01-01');
    expect(understood.max).toBe('2026-10-29');
    expect(fixture.nativeElement.textContent).toContain(WORLD_COPY.sourceHelper);
    name.value = 'A'.repeat(81);
    name.dispatchEvent(new Event('input'));
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(WORLD_COPY.nameBounds);
    expect(api.createConcept).not.toHaveBeenCalled();
  });

  it('keeps a failed draft and drops a late create after the owner changes', async () => {
    await open(true);
    const name = fixture.nativeElement.querySelector('#concept-name') as HTMLInputElement;
    name.value = 'Rivers';
    name.dispatchEvent(new Event('input'));
    api.createConcept.and.rejectWith({ status: 409, message: 'You already have a concept with that name.', fieldErrors: {} });
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('You already have a concept with that name.');
    expect(name.value).toBe('Rivers');
    let release: ((value: ConceptRecord) => void) | undefined;
    api.createConcept.and.callFake(() => new Promise(resolve => { release = resolve; }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    users.next({ id: 2 });
    release?.({ ...concept, id: 8, name: 'Late private' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Late private');
    expect((fixture.nativeElement.querySelector('#concept-name') as HTMLInputElement).value).toBe('');
  });

  it('shows an archived concept and the same missing copy for an unknown id', async () => {
    const archived = { ...concept, archived: true, understood_on: '2026-08-15', note: 'Dated annotation' };
    api.listConcepts.and.callFake((isArchived: boolean) => Promise.resolve(isArchived ? [archived] : []));
    await open();
    fixture.componentRef.setInput('focusId', 4);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const archivedTab = [...fixture.nativeElement.querySelectorAll('[role="tab"]')].at(-1) as HTMLButtonElement;
    expect(archivedTab.getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Dated annotation');
    expect(fixture.nativeElement.textContent).toContain('2026-08-15');
    expect(fixture.nativeElement.textContent).not.toContain(WORLD_COPY.missing);
    fixture.componentRef.setInput('focusId', 99);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(WORLD_COPY.missing);
    expect(archivedTab.getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Dated annotation');
  });

  it('does not publish a held concept list after lock', async () => {
    const pending: Array<(value: ConceptRecord[]) => void> = [];
    api.listConcepts.and.callFake(() => new Promise(resolve => pending.push(resolve)));
    await TestBed.configureTestingModule({
      imports: [ConceptSheetComponent],
      providers: [
        provideRouter([]),
        { provide: WorldApi, useValue: api },
        { provide: SessionService, useValue: { user$: users, cleared$: cleared, currentUser: { id: 1 } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ConceptSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('today', '2026-10-29');
    fixture.detectChanges();
    expect(pending.length).toBe(2);
    cleared.next();
    for (const resolve of pending) resolve([{ ...concept, name: 'Held private concept', note: 'Held private note' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Held private concept');
    expect(fixture.nativeElement.textContent).not.toContain('Held private note');
  });

});
