import { VAULT_PRESENCE, financeVaultPresent } from '../../../../finance/frontend/src/public-api';

/** Same presence rule as the Town treasury lot. Dialogue does not read a ledger. */
export function dialogueVaultOpen(ownerId: number | null): boolean {
  if (ownerId == null || !financeVaultPresent()) return false;
  try {
    const marked = localStorage.getItem(VAULT_PRESENCE);
    if (marked == null) return true;
    return marked === String(ownerId);
  } catch {
    return false;
  }
}

export interface SceneChoice {
  readonly id: string;
  readonly label: string;
  readonly reply: string;
}

export interface ResidentScene {
  readonly residentId: 'mara' | 'ada' | 'imani' | 'jun';
  readonly conversationId: 'welcome' | 'how-it-works' | 'preference' | 'activity' | 'reflection';
  readonly paragraphs: readonly string[];
  readonly choices: readonly [SceneChoice, SceneChoice];
}

export interface MentionedObject {
  readonly label: string;
  readonly detail: string;
  readonly sample: boolean;
}

export interface AdaMentionInput {
  readonly locked: boolean;
  readonly publicLabel: string | null;
  readonly account: string | null;
  readonly spending: string | null;
  readonly goal: string | null;
}

export interface ImaniMentionInput {
  readonly empty: boolean;
  readonly tripTitle: string | null;
  readonly destination: string | null;
  readonly taken: string | null;
}

export interface JunMentionInput {
  readonly locked: boolean;
  readonly workout: string | null;
  readonly badge: string | null;
  readonly measurement: string | null;
}

export const SAMPLE_CIVIC_LEDGER: MentionedObject = Object.freeze({
  label: 'Sample civic ledger',
  detail: 'Labeled sample. Not a Finance record.',
  sample: true,
});

export const TREASURY_PUBLIC_OBJECT = 'Treasury door';
export const TERMINAL_PUBLIC_OBJECT = 'Harbor terminal';
export const GYM_PUBLIC_OBJECT = 'Training floor';

export const SAMPLE_DEPARTURE_BOARD: MentionedObject = Object.freeze({
  label: 'Sample departure board',
  detail: 'Labeled sample. Not a saved trip.',
  sample: true,
});

export const SAMPLE_TRAINING_CARD: MentionedObject = Object.freeze({
  label: 'Sample training card',
  detail: 'Labeled sample. Not a Health record.',
  sample: true,
});

const PUBLIC_DOOR: MentionedObject = Object.freeze({
  label: TREASURY_PUBLIC_OBJECT,
  detail: 'A public door. Records stay in Finance.',
  sample: false,
});

const PUBLIC_TERMINAL: MentionedObject = Object.freeze({
  label: TERMINAL_PUBLIC_OBJECT,
  detail: 'A public desk. Trips stay in Travel.',
  sample: false,
});

const PUBLIC_FLOOR: MentionedObject = Object.freeze({
  label: GYM_PUBLIC_OBJECT,
  detail: 'A public floor. Records stay in Health.',
  sample: false,
});

const SCENES: readonly ResidentScene[] = [
  scene('mara', 'welcome', [
    'Mara keeps the Reading Hall. The shelves, the desk, and the wall calendar stay here when you are away.',
    'This first meeting is not a review of what you have read.',
  ], [
    choice('shelves', 'Start with the shelves.', 'The shelves, then.'),
    choice('desk', 'Start with the reading desk.', 'The desk, then.'),
  ]),
  scene('mara', 'how-it-works', [
    'Saved books open in Media. The hall does not keep a second library.',
    'A labeled sample can stand in when a shelf is empty or locked. It does not become a saved book.',
  ], [
    choice('shelves', 'Explain the public shelves.', 'The shelves point at Media. They do not copy a title into this talk.'),
    choice('sample', 'Leave the sample on the desk.', 'The sample stays labeled. It is not one of your books.'),
  ]),
  scene('mara', 'preference', [
    'Mara asks which part of the hall you like to linger in. The answer is a taste, not a grade.',
  ], [
    choice('shelves', 'The quiet shelves.', 'Quiet shelves.'),
    choice('desk', 'The desk in the room light.', 'The desk.'),
  ]),
  scene('mara', 'activity', [
    'There is one small thing to notice. You can look at the bookshelves, or at a labeled sample.',
  ], [
    choice('shelves', 'Look at the bookshelves.', 'Bookshelves. The public shelves in the Reading Hall.'),
    choice('sample', 'Look at the sample shelf item.', 'Sample shelf item. Labeled sample. Not your library.'),
  ]),
  scene('mara', 'reflection', [
    'Mara looks at the hall, not at a private reading log.',
    'A chapter can end without a score.',
  ], [
    choice('return', 'The hall is for returning to a page.', 'Returning to a page.'),
    choice('leave', 'The hall is for leaving a page open.', 'Leaving a page open.'),
  ]),
  scene('ada', 'welcome', [
    'Ada keeps the public rules of the square. This meeting does not open a private record.',
    'What she sets beside her is either the Treasury door or a labeled sample.',
  ], [
    choice('rules', 'Hear the public rules.', 'The rules of the square, said in public.'),
    choice('shut', 'Leave the door shut.', 'The door stays shut for this meeting.'),
  ]),
  scene('ada', 'how-it-works', [
    'The Treasury door leads to Finance. This talk does not copy what is behind it.',
    'When Finance is locked, the object is a labeled sample.',
  ], [
    choice('door', 'Point at the public door.', 'The door is public. The records are not in this talk.'),
    choice('sample', 'Use the labeled sample.', 'The sample is labeled. It is not a record.'),
  ]),
  scene('ada', 'preference', [
    'Ada asks what you want the square to feel like. The answer is a taste, not a score.',
  ], [
    choice('rules', 'Rules anyone can read.', 'Public rules.'),
    choice('wait', 'A door that waits.', 'A door that waits.'),
  ]),
  scene('ada', 'activity', [
    'Notice one object. If Finance is locked, it is the labeled sample.',
  ], [
    choice('object', 'Notice the object she set out.', 'That object only.'),
    choice('decline', 'Do not ask for a private record.', 'No private record.'),
  ]),
  scene('ada', 'reflection', [
    'Ada looks at the square, not at a private plan.',
    'A chapter can end without a score.',
  ], [
    choice('public', 'The square can stay public.', 'Public square.'),
    choice('wait', 'The door can wait.', 'The door can wait.'),
  ]),
  scene('imani', 'welcome', [
    'Imani keeps the harbor terminal. The departure board, the booking desk, and the map room stay here when you are away.',
    'This first meeting is not a review of a route.',
  ], [
    choice('board', 'Start with the departure board.', 'The board, then.'),
    choice('desk', 'Start with the booking desk.', 'The desk, then.'),
  ]),
  scene('imani', 'how-it-works', [
    'Saved trips stay in Travel. The terminal does not keep a second itinerary.',
    'An empty board still leaves room to imagine a route. A labeled sample does not become a saved trip.',
  ], [
    choice('board', 'Explain the public board.', 'The board points at Travel. It does not copy a route into this talk.'),
    choice('sample', 'Leave the sample on the desk.', 'The sample stays labeled. It is not a saved trip.'),
  ]),
  scene('imani', 'preference', [
    'Imani asks which kind of route you like to imagine. The answer is a taste, not a Travel record.',
  ], [
    choice('train', 'Imagine a slow coastal train.', 'A slow coastal train.'),
    choice('ferry', 'Imagine a night ferry.', 'A night ferry.'),
  ]),
  scene('imani', 'activity', [
    'There is one small thing you can notice. You can look at the sample departure board, or leave it.',
    'Looking does not write to Travel.',
  ], [
    choice('board', 'Look at the sample board.', 'Sample departure board. Labeled sample. Not a saved trip.'),
    choice('leave', 'Leave the board alone.', 'The board stays as it is.'),
  ]),
  scene('imani', 'reflection', [
    'Imani looks at the terminal, not at a private itinerary.',
    'A chapter can end without a score.',
  ], [
    choice('imagine', 'The terminal is for imagining a route.', 'Imagining a route.'),
    choice('unwritten', 'The terminal can leave a route unwritten.', 'An unwritten route.'),
  ]),
  scene('jun', 'welcome', [
    'Jun keeps the training floor. The routine desk, the station, and the bench stay in the room.',
    'This first meeting does not open a Health record.',
  ], [
    choice('desk', 'Start at the routine desk.', 'The desk, then.'),
    choice('floor', 'Start with the open floor.', 'The open floor, then.'),
  ]),
  scene('jun', 'how-it-works', [
    'The Gym is a room you can walk. Health keeps any measurements.',
    'When Health is locked, the card on the desk is a labeled sample. It does not start a session.',
  ], [
    choice('floor', 'Explain the public floor.', 'The floor is a room. Records stay in Health.'),
    choice('sample', 'Use the labeled sample.', 'The sample is labeled. It is not a session.'),
  ]),
  scene('jun', 'preference', [
    'Jun asks how you like the room to feel. The answer is a taste, not a result.',
  ], [
    choice('quiet', 'A quiet corner.', 'A quiet corner.'),
    choice('path', 'A clear path across the floor.', 'A clear path.'),
  ]),
  scene('jun', 'activity', [
    'You can notice one part of the room, or leave it. Noticing does not log a workout.',
  ], [
    choice('floor', 'Notice the open floor.', 'The open floor only.'),
    choice('leave', 'Leave the floor alone.', 'No session from this talk.'),
  ]),
  scene('jun', 'reflection', [
    'Jun looks at the floor, not at a private log.',
    'A chapter can end without a score.',
  ], [
    choice('return', 'The floor can stay a place to return to.', 'A place to return to.'),
    choice('wait', 'The floor can wait.', 'The floor can wait.'),
  ]),
];

const BY_KEY = new Map(SCENES.map(item => [key(item.residentId, item.conversationId), item]));

export function residentScenes(): readonly ResidentScene[] {
  return SCENES;
}

export function sceneFor(residentId: string, conversationId: string): ResidentScene | null {
  return BY_KEY.get(key(residentId, conversationId)) ?? null;
}

/** First completion raises rank by one. Only welcome grants 2 Stamps. A reply does not change that. */
export function dialogueRankEffect(completed: boolean, conversationId: string, stamps: number): string {
  if (completed) return 'Rank stays. No Stamps.';
  if (conversationId === 'welcome' && stamps === 2) return 'Rank rises by 1. 2 Stamps, once.';
  return 'Rank rises by 1. No Stamps.';
}

/**
 * Locked Finance never contributes account, spending, or private goal text.
 * A public label that contains one of those values is refused as well.
 */
export function adaMention(input: AdaMentionInput): MentionedObject {
  const secrets = [input.account, input.spending, input.goal].filter(secret => typeof secret === 'string' && secret.trim() !== '');
  const label = input.publicLabel?.trim() ?? '';
  const tainted = label !== '' && secrets.some(secret => label.includes(secret as string));
  if (input.locked || label === '' || tainted) return SAMPLE_CIVIC_LEDGER;
  return PUBLIC_DOOR.label === label ? PUBLIC_DOOR : Object.freeze({
    label,
    detail: PUBLIC_DOOR.detail,
    sample: false,
  });
}

/**
 * Empty Travel, or any trip title, destination, or taken phrase, stays a labeled sample.
 * A non-empty board still does not name a trip.
 */
export function imaniMention(input: ImaniMentionInput): MentionedObject {
  const secrets = [input.tripTitle, input.destination, input.taken].filter(secret => typeof secret === 'string' && secret.trim() !== '');
  if (input.empty || secrets.length > 0) return SAMPLE_DEPARTURE_BOARD;
  return PUBLIC_TERMINAL;
}

/** Locked Health, or any workout, badge, or measurement, stays a labeled sample. */
export function junMention(input: JunMentionInput): MentionedObject {
  const secrets = [input.workout, input.badge, input.measurement].filter(secret => typeof secret === 'string' && secret.trim() !== '');
  if (input.locked || secrets.length > 0) return SAMPLE_TRAINING_CARD;
  return PUBLIC_FLOOR;
}

export function authoredLines(scene: ResidentScene, mention: MentionedObject | null): readonly string[] {
  return [
    ...scene.paragraphs,
    ...scene.choices.flatMap(choice => [choice.label, choice.reply]),
    ...(mention ? [mention.label, mention.detail] : []),
  ];
}

function scene(
  residentId: ResidentScene['residentId'],
  conversationId: ResidentScene['conversationId'],
  paragraphs: readonly string[],
  choices: readonly [SceneChoice, SceneChoice],
): ResidentScene {
  return Object.freeze({ residentId, conversationId, paragraphs: Object.freeze(paragraphs), choices: Object.freeze(choices) });
}

function choice(id: string, label: string, reply: string): SceneChoice {
  return Object.freeze({ id, label, reply });
}

function key(residentId: string, conversationId: string): string {
  return `${residentId}:${conversationId}`;
}
