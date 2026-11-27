import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { ResidentsComponent } from './residents.component';
import { TownApiService, type DialogueDirectory, type DialogueResident } from './town.api';

function resident(
  id: string,
  name: string,
  place: string,
  purpose: string,
  present: boolean,
  rank = 0,
  completed: string[] = [],
): DialogueResident {
  const conversations = [
    ['welcome', 'Welcome', 2],
    ['how-it-works', 'How this place works', 0],
    ['preference', 'A preference', 0],
    ['activity', 'A short activity', 0],
    ['reflection', 'A reflection', 0],
  ].map(([conversationId, title, stamps]) => ({
    id: String(conversationId),
    title: String(title),
    line: 'A public line.',
    stamps: Number(stamps),
    completed: completed.includes(String(conversationId)),
  }));
  return { id, name, place, purpose, present, rank, conversations };
}

function directory(rank = 0, completed: string[] = []): DialogueDirectory {
  return {
    revision: rank,
    hour: 0,
    residents: [
      resident('mara', 'Mara', 'Library', 'Mara keeps the Reading Hall and explains the shelves.', false, rank, completed),
      resident('ada', 'Ada', 'Treasury', 'Ada explains the public rules of the square.', true),
      resident('imani', 'Imani', 'Terminal', 'Imani points toward the harbor terminal.', true),
      resident('jun', 'Jun', 'Gym', 'Jun explains the training floor.', true),
      resident('wren', 'Wren', 'Arcade', 'Wren keeps the music room and the arcade.', true),
      resident('sol', 'Sol', 'Hall', 'Sol keeps the Hall and the study.', true),
    ],
  };
}

describe('Residents', () => {
  let user: BehaviorSubject<{ id: number } | null>;
  let loads: Subject<DialogueDirectory>[];
  let writes: Subject<DialogueDirectory>[];
  let api: { getResidents: jasmine.Spy; completeConversation: jasmine.Spy };

  beforeEach(() => {
    user = new BehaviorSubject<{ id: number } | null>({ id: 1 });
    loads = [];
    writes = [];
    const request = (responses: Subject<DialogueDirectory>[]) => jasmine.createSpy().and.callFake(() => {
      const pending = new Subject<DialogueDirectory>();
      responses.push(pending);
      return pending;
    });
    api = { getResidents: request(loads), completeConversation: request(writes) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'town/residents', component: ResidentsComponent }]),
        { provide: SessionService, useValue: { user$: user } },
        { provide: TownApiService, useValue: api },
      ],
    });
  });

  async function open(page = '/town/residents?resident=mara', initial = directory()) {
    const harness = await RouterTestingHarness.create(page);
    loads[0].next(initial);
    harness.detectChanges();
    const el = harness.routeNativeElement!;
    function click(name: string): void {
      const button = Array.from(el.querySelectorAll('button')).find(item => item.textContent?.trim() === name);
      expect(button).withContext(name).toBeTruthy();
      button?.click();
      harness.detectChanges();
    }
    function typeNote(value: string): void {
      const note = el.querySelector<HTMLTextAreaElement>('#dialogue-note');
      expect(note).not.toBeNull();
      note!.value = value;
      note!.dispatchEvent(new Event('input'));
      harness.detectChanges();
    }
    return { harness, el, click, typeNote };
  }

  it('shows each purpose and keeps an away resident talkable', async () => {
    const { el } = await open();
    expect(el.querySelectorAll('article').length).toBe(6);
    expect(el.textContent).toContain('Mara keeps the Reading Hall and explains the shelves.');
    expect(el.textContent).toContain('Ada explains the public rules of the square.');
    expect(el.textContent).toContain('Imani points toward the harbor terminal.');
    expect(el.textContent).toContain('Jun explains the training floor.');
    expect(el.textContent).toContain('Wren keeps the music room and the arcade.');
    expect(el.textContent).toContain('Sol keeps the Hall and the study.');
    expect(el.querySelector('[data-resident="mara"]')?.getAttribute('data-present')).toBe('false');
    expect(el.textContent).toContain('Away from the Library right now.');
    expect(el.textContent).toContain('Talk about Welcome');
    expect(el.textContent).not.toMatch(/quest|you missed|yesterday|weight|blood pressure|paycheck/i);
    expect(el.querySelector('#talk-mara-welcome')?.hasAttribute('disabled')).toBeFalse();
  });

  it('keeps a failed note and retries the same identity without applying a conflict', async () => {
    const { harness, el, click, typeNote } = await open();
    click('Talk about Welcome');
    typeNote('Synthetic session note');
    click('Finish talk');
    const body = { resident_id: 'mara', conversation_id: 'welcome', expected_revision: 0 };
    expect(api.completeConversation).toHaveBeenCalledOnceWith(body);
    writes[0].error({ status: 503 });
    harness.detectChanges();
    expect(el.querySelector<HTMLTextAreaElement>('#dialogue-note')?.value).toBe('Synthetic session note');
    expect(el.textContent).toContain('Try it again');
    expect(el.textContent).toContain('Finish Welcome with Mara?');
    click('Retry talk');
    expect(api.completeConversation.calls.argsFor(1)).toEqual([body]);
    writes[1].error({ status: 409, error: { code: 'dialogue_conflict', message: 'STALE' } });
    loads[1].next(directory(1, ['welcome']));
    harness.detectChanges();
    expect(el.textContent).toContain('This conversation changed');
    expect(el.textContent).not.toContain('STALE');
    expect(el.textContent).not.toContain('Synthetic session note');
    expect(el.textContent).not.toContain('Finish Welcome with Mara?');
    expect(el.querySelector('main')?.getAttribute('data-revision')).toBe('1');
    expect(el.textContent).toContain('Mara keeps the Reading Hall and explains the shelves.');
  });

  it('drops a held success and the note after the owner changes', async () => {
    const { harness, el, click, typeNote } = await open();
    click('Talk about Welcome');
    typeNote('Synthetic session note');
    click('Finish talk');
    user.next({ id: 2 });
    loads[1].next(directory());
    writes[0].next(directory(9, ['welcome']));
    harness.detectChanges();
    expect(el.querySelector('main')?.getAttribute('data-revision')).toBe('0');
    expect(el.textContent).not.toContain('Rank is 9');
    expect(el.textContent).not.toContain('Synthetic session note');
    expect(el.textContent).not.toContain('Finish Welcome with Mara?');
  });

  it('drops a late error after the owner changes', async () => {
    const { harness, el, click, typeNote } = await open();
    click('Talk about Welcome');
    typeNote('Synthetic session note');
    click('Finish talk');
    user.next({ id: 2 });
    writes[0].error({ status: 503 });
    loads[1].next(directory());
    harness.detectChanges();
    expect(el.textContent).not.toContain('Try it again');
    expect(el.textContent).not.toContain('Synthetic session note');
    expect(el.textContent).not.toContain('Finish Welcome with Mara?');
  });

  it('clears a note on escape and reports replay or a non-welcome rank once', async () => {
    const { harness, el, click, typeNote } = await open();
    click('Talk about Welcome');
    typeNote('Synthetic session note');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    harness.detectChanges();
    expect(el.textContent).not.toContain('Synthetic session note');
    expect(el.textContent).not.toContain('Finish Welcome with Mara?');
  });

  it('reports a replay and a later conversation without another welcome', async () => {
    const welcomeDone = directory(1, ['welcome']);
    const { harness, el, click } = await open('/town/residents?resident=mara', welcomeDone);
    click('Replay Welcome');
    click('Finish talk');
    expect(api.completeConversation.calls.mostRecent().args[0]).toEqual({
      resident_id: 'mara',
      conversation_id: 'welcome',
      expected_revision: 1,
    });
    writes[0].next(welcomeDone);
    harness.detectChanges();
    expect(el.textContent).toContain('Rank stays at 1.');
    click('Talk about How this place works');
    click('Finish talk');
    writes[1].next(directory(2, ['welcome', 'how-it-works']));
    harness.detectChanges();
    expect(el.textContent).toContain('Rank is 2. No extra Stamps.');
    expect(api.completeConversation.calls.mostRecent().args[0]).toEqual({
      resident_id: 'mara',
      conversation_id: 'how-it-works',
      expected_revision: 1,
    });
  });

  it('shows an unknown resident as absent and a failed load as recoverable', async () => {
    const harness = await RouterTestingHarness.create('/town/residents?resident=nobody');
    loads[0].next(directory());
    harness.detectChanges();
    const el = harness.routeNativeElement!;
    expect(el.textContent).toContain('That resident is not in the directory.');
    expect(el.textContent).toContain('Mara keeps the Reading Hall and explains the shelves.');
    user.next(null);
    harness.detectChanges();
    expect(el.textContent).not.toContain('Mara keeps the Reading Hall');
    user.next({ id: 3 });
    loads.at(-1)?.error({ status: 503 });
    harness.detectChanges();
    expect(el.textContent).toContain('Residents are unavailable right now.');
    expect(el.textContent).not.toContain('Synthetic session note');
  });
});
