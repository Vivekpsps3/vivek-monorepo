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
  readonly residentId: 'mara' | 'ada' | 'imani' | 'jun' | 'wren' | 'sol';
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

/** Review and concept-note text are refused whole. This talk does not copy either one. */
export interface CultureMentionInput {
  readonly locked: boolean;
  readonly review: string | null;
  readonly conceptNote: string | null;
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

export const SAMPLE_ARCADE_SIGN: MentionedObject = Object.freeze({
  label: 'Sample arcade sign',
  detail: 'Labeled sample. Not a review or a concept note.',
  sample: true,
});

export const MUSIC_BAR_OBJECT = 'Music bar';

const PUBLIC_MUSIC: MentionedObject = Object.freeze({
  label: MUSIC_BAR_OBJECT,
  detail: 'A public room. Albums and games stay in Media.',
  sample: false,
});

export const SAMPLE_RULES_CARD: MentionedObject = Object.freeze({
  label: 'Sample rules card',
  detail: 'Labeled sample. Not a review or a concept note.',
  sample: true,
});

export const RULES_BOARD_OBJECT = 'Rules board';

const PUBLIC_RULES: MentionedObject = Object.freeze({
  label: RULES_BOARD_OBJECT,
  detail: 'A public board. Reviews and concept notes are not copied here.',
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
  scene('wren', 'welcome', [
    'Wren keeps the music room and the arcade. The bar, the sign, and the play floor stay here when you are away.',
    'This first meeting is not a review of what you heard or played.',
  ], [
    choice('bar', 'Start in the music room.', 'The music room, then.'),
    choice('floor', 'Start on the play floor.', 'The play floor, then.'),
  ]),
  scene('wren', 'how-it-works', [
    'Saved music stays in Media. A game stays with its play. This talk does not keep a second copy.',
    'A labeled sample can stand in. It does not become a review or a concept note.',
  ], [
    choice('room', 'Explain the public room.', 'The room points at Media. It does not copy a note into this talk.'),
    choice('sample', 'Leave the sample by the sign.', 'The sample stays labeled. It is not a score.'),
  ]),
  scene('wren', 'preference', [
    'Wren asks what you like to linger with. The answer is a taste, not a grade of music or of play.',
  ], [
    choice('music', 'A quiet piece of music.', 'Quiet music.'),
    choice('play', 'A short game on the floor.', 'A short game.'),
  ]),
  scene('wren', 'activity', [
    'You can notice the sample sign, or leave the floor. Noticing does not save a score or copy a review.',
  ], [
    choice('sign', 'Look at the sample sign.', 'Sample arcade sign. Labeled sample. Not a review.'),
    choice('leave', 'Leave the floor alone.', 'The floor stays as it is.'),
  ]),
  scene('wren', 'reflection', [
    'Wren looks at the music room and the play floor, not at a private review.',
    'A chapter can end without a score.',
  ], [
    choice('music', 'The room is for hearing a piece again.', 'Hearing a piece again.'),
    choice('play', 'The floor is for playing again.', 'Playing again.'),
  ]),
  scene('sol', 'welcome', [
    'Sol keeps the Hall and the study. The rules and the desk stay here when you are away.',
    'This first meeting does not open a review or a concept note.',
  ], [
    choice('rules', 'Start with the rules.', 'The rules, then.'),
    choice('study', 'Start with the study desk.', 'The desk, then.'),
  ]),
  scene('sol', 'how-it-works', [
    'The Hall shows public rules. Learning stays with you. This talk does not copy a note from the study.',
    'When a note is closed, the card on the desk is a labeled sample.',
  ], [
    choice('rules', 'Explain the public rules.', 'The rules are public. A review is not in this talk.'),
    choice('sample', 'Use the labeled sample.', 'The sample is labeled. It is not a concept note.'),
  ]),
  scene('sol', 'preference', [
    'Sol asks how you like to learn the rules of a place. The answer is a taste, not a grade.',
  ], [
    choice('rules', 'Read the rules in the open.', 'Rules in the open.'),
    choice('study', 'Sit with one idea.', 'One idea, unnamed.'),
  ]),
  scene('sol', 'activity', [
    'You can notice the rules, or leave them. Noticing does not copy a review or a concept note.',
  ], [
    choice('rules', 'Notice the public rules.', 'The public rules only.'),
    choice('leave', 'Leave the notes alone.', 'No note from this talk.'),
  ]),
  scene('sol', 'reflection', [
    'Sol looks at the Hall, not at a private review or a concept note.',
    'A chapter can end without a score.',
  ], [
    choice('rules', 'The Hall is for reading a rule again.', 'Reading a rule again.'),
    choice('learn', 'The study can wait.', 'The study can wait.'),
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

/** Before a chapter reflection, the talk does not mark it done. Afterward, a visit does not record it again. */
export function chapterVisit(completed: boolean): string {
  if (completed) return 'Already visited. This talk is not recorded again.';
  return 'Not visited yet. This talk does not mark a chapter done.';
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

/** A locked room, or any review or concept note, stays the labeled arcade sign. */
export function wrenMention(input: CultureMentionInput): MentionedObject {
  if (input.locked || cultureSecrets(input)) return SAMPLE_ARCADE_SIGN;
  return PUBLIC_MUSIC;
}

/** A locked Hall, or any review or concept note, stays the labeled rules card. */
export function solMention(input: CultureMentionInput): MentionedObject {
  if (input.locked || cultureSecrets(input)) return SAMPLE_RULES_CARD;
  return PUBLIC_RULES;
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

function cultureSecrets(input: CultureMentionInput): boolean {
  return [input.review, input.conceptNote].some(secret => typeof secret === 'string' && secret.trim() !== '');
}
