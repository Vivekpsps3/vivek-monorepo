import { HEALTH_BADGES } from './health/health.constants';
import { GAME_MEDAL_EXPLANATION } from './health/health-progress';
import {
  JOURNAL_MEDAL_EXPLANATION,
  projectHallJournal,
  type JournalSource,
} from './hall-journal';
import type {
  ArcadeCollection,
  DialogueDirectory,
  DiscoveryJournal,
  QuestJournal,
  QuestView,
} from './town.api';

const NONCE = 'abcdefghijklmnop';

function quest(kept: boolean, sample = false): QuestView {
  return {
    id: 'find-your-shelves',
    title: 'Find your shelves',
    detail: 'Optional. No deadline.',
    completed: kept ? 3 : 1,
    total: 3,
    reward_stamps: 10,
    keepsake: { id: 'library-seal', name: 'library seal', kind: 'seal', kept },
    steps: [
      {
        id: 'meet-librarian',
        label: 'Meet the librarian',
        action_id: 'find-your-shelves:meet-librarian',
        source: null,
        sample_action_id: null,
        sample_label: null,
        sample_detail: null,
        recorded_action: 'find-your-shelves:meet-librarian',
      },
      {
        id: 'inspect-saved',
        label: 'Inspect a saved item',
        action_id: 'find-your-shelves:inspect-saved',
        source: 'library',
        sample_action_id: 'find-your-shelves:inspect-saved:sample',
        sample_label: 'Sample shelf item',
        sample_detail: 'Labeled sample. Not your library.',
        recorded_action: sample ? 'find-your-shelves:inspect-saved:sample' : null,
      },
      {
        id: 'choose-display',
        label: 'Choose a shelf display',
        action_id: 'find-your-shelves:choose-display',
        source: null,
        sample_action_id: null,
        sample_label: null,
        sample_detail: null,
        recorded_action: kept ? 'find-your-shelves:choose-display' : null,
      },
    ],
  };
}

function source(patch: Partial<JournalSource> = {}): JournalSource {
  const quests: QuestJournal = { revision: 3, quests: [quest(true, true)] };
  const discoveries: DiscoveryJournal = {
    revision: 1,
    discoveries: [{
      id: 'ferry-bell',
      name: 'Ferry bell',
      district: 'harbor',
      hint: 'Beside the model ferry at the terminal.',
      reaction: 'You ring the model ferry bell. The sound stays in town. No trip is created.',
      found: true,
    }, {
      id: 'arcade-sign',
      name: 'Arcade sign',
      district: 'culture',
      hint: 'On the arcade wall.',
      reaction: 'You tap the arcade sign.',
      found: false,
    }],
  };
  const residents: DialogueDirectory = {
    revision: 1,
    hour: 4,
    residents: [{
      id: 'mara',
      name: 'Mara',
      place: 'Library',
      purpose: 'Mara keeps the Reading Hall and explains the shelves.',
      present: false,
      rank: 1,
      conversations: [
        { id: 'welcome', title: 'Welcome', line: 'A first meeting.', stamps: 2, completed: true },
        { id: 'how-it-works', title: 'How this place works', line: 'A public explanation.', stamps: 0, completed: false },
      ],
    }, {
      id: 'ada',
      name: 'Ada',
      place: 'Treasury',
      purpose: 'Ada explains the public rules of the square.',
      present: true,
      rank: 0,
      conversations: [
        { id: 'welcome', title: 'Welcome', line: 'A first meeting.', stamps: 2, completed: false },
      ],
    }],
  };
  const arcade: ArcadeCollection = {
    games: [{
      game_id: 'memory-shelves',
      name: 'Marathon finisher',
      score: 6,
      score_kind: 'moves',
      source_nonce: NONCE,
      civil_day: '2026-11-28',
      medals: [{
        civil_day: '2026-11-28',
        grant_key: 'minigame:memory-shelves:2026-11-28',
        amount: 5,
        nonce: 'first-win-nonce1',
      }, {
        civil_day: '2026-11-28',
        grant_key: 'minigame:memory-shelves:2026-11-28',
        amount: 5,
        nonce: 'duplicate-nonce1',
      }],
    }, {
      game_id: 'harbor-rhythm',
      name: 'Harbor Rhythm',
      score: 0,
      score_kind: 'accuracy',
      source_nonce: 'harbor-nonce-1234',
      civil_day: '2026-11-28',
      medals: [],
    }],
  };
  return { quests, discoveries, residents, arcade, ...patch };
}

describe('Hall journal projection', () => {
  it('uses the Health room medal sentence without copying a Health badge', () => {
    expect(JOURNAL_MEDAL_EXPLANATION).toBe(GAME_MEDAL_EXPLANATION);
  });

  it('projects the same earned records and once-only badges from the same reads', () => {
    const first = projectHallJournal(source());
    const again = projectHallJournal(source());
    expect(again).toEqual(first);

    const chapters = first[0].items[0];
    expect(chapters.badge).toBe('library seal, once');
    expect(chapters.explanation).toBe(
      'Finished Find your shelves. 10 Stamps, once. Keepsake: library seal. '
      + 'Meet the librarian (recorded find-your-shelves:meet-librarian); '
      + 'Inspect a saved item (recorded find-your-shelves:inspect-saved:sample); '
      + 'Choose a shelf display (recorded find-your-shelves:choose-display).',
    );
    expect(chapters.source).toBe(
      'quest:find-your-shelves find-your-shelves:meet-librarian '
      + 'find-your-shelves:inspect-saved:sample find-your-shelves:choose-display',
    );
    expect(chapters.sample).toBe('Sample shelf item. Labeled sample. Not your library.');

    const found = first[1].items[0];
    const missed = first[1].items[1];
    expect(found.badge).toBe('Journal stamp, once');
    expect(found.explanation).toContain('No trip is created.');
    expect(found.explanation).toContain('Journal stamp, once. No Stamps.');
    expect(found.explanation).not.toContain('Beside the model ferry');
    expect(found.source).toBe('discovery:ferry-bell');
    expect(missed.earned).toBeFalse();
    expect(missed.badge).toBeNull();
    expect(missed.explanation).not.toContain('You tap the arcade sign.');

    const mara = first[2].items[0];
    const ada = first[2].items[1];
    expect(mara.badge).toBe('Rank 1 of 5. 2 Stamps, once.');
    expect(mara.explanation).toContain('Rank 1 of 5. No decay.');
    expect(mara.explanation).toContain('Welcome finished once. 2 Stamps, once.');
    expect(mara.source).toBe('meeting:mara mara:welcome');
    expect(ada.earned).toBeFalse();
    expect(ada.badge).toBeNull();
    expect(ada.source).toBe('resident:ada');
    expect(ada.explanation).not.toContain('2 Stamps, once');

    const memory = first[3].items[0];
    const harbor = first[3].items[1];
    expect(memory.title).toBe('Memory Shelves');
    expect(memory.badge).toBe('5 Stamps, once');
    expect(memory.explanation).toContain('Score 6 moves.');
    expect(memory.explanation).toContain('5 Stamps, once, on 2026-11-28. Source minigame:memory-shelves:2026-11-28.');
    expect(memory.explanation).toContain(JOURNAL_MEDAL_EXPLANATION);
    expect(memory.explanation).toContain('It is not a Finance total or a Media membership.');
    expect(memory.explanation).not.toContain('Marathon finisher');
    expect(memory.source).toBe(`play:${NONCE} minigame:memory-shelves:2026-11-28`);
    expect(harbor.badge).toBeNull();
    expect(harbor.earned).toBeTrue();
    expect(harbor.explanation).toContain('Accuracy 0.');
    expect(harbor.explanation).toContain('Score kept. No extra Stamps.');

    const text = JSON.stringify(first);
    for (const name of Object.values(HEALTH_BADGES)) expect(text).not.toContain(name);
    expect(text).not.toMatch(/\$\d|mmHg|\bbpm\b/);
  });

  it('leaves an unfinished chapter and an empty arcade without a badge', () => {
    const pages = projectHallJournal(source({
      quests: { revision: 1, quests: [quest(false)] },
      arcade: { games: [] },
    }));
    expect(pages[0].items[0].earned).toBeFalse();
    expect(pages[0].items[0].badge).toBeNull();
    expect(pages[0].items[0].sample).toBeNull();
    expect(pages[0].items[0].explanation).toContain('Not finished. 1 of 3 steps.');
    expect(pages[0].items[0].explanation).toContain('10 Stamps once');
    expect(pages[3].items.map(item => item.title)).toEqual(['Memory Shelves', 'Harbor Rhythm']);
    expect(pages[3].items.every(item => item.badge == null && item.earned === false)).toBeTrue();
    expect(pages[3].items[0].explanation).toContain('No score yet.');
  });
});
