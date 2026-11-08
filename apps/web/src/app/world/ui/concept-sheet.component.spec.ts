import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WORLD_COPY, type ConceptRecord } from '../world.types';
import { WorldApi } from '../data/world-api';
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
      providers: [provideRouter([]), { provide: WorldApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(ConceptSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('today', '2026-10-29');
    fixture.componentRef.setInput('creating', creating);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function button(label: string): HTMLButtonElement {
    const found = [...fixture.nativeElement.querySelectorAll('button')].find(candidate =>
      candidate.textContent?.trim() === label);
    if (!(found instanceof HTMLButtonElement)) throw new Error(`missing ${label}`);
    return found;
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

  it('puts the beacon sentence in the delete dialog', async () => {
    await open();
    button('Delete').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(WORLD_COPY.deleteTitle);
    expect(fixture.nativeElement.textContent).toContain('Its beacon disappears.');
    button('Cancel').click();
  });

  it('shows the copy failure and keeps a rejected draft', async () => {
    await open(true);
    const name = fixture.nativeElement.querySelector('#concept-name') as HTMLInputElement;
    name.value = 'Beacon';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    spyOn(navigator.clipboard, 'writeText').and.rejectWith(new Error('denied'));
    button('Copy').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(WORLD_COPY.copyFailed);

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#concept-name').value).toBe('Beacon');
    expect(fixture.nativeElement.textContent).toContain('That concept does not exist.');
    expect(api.timezone).toHaveBeenCalled();
  });
});
