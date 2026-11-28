import type {
  ArcadeCollection,
  ArcadeGame,
  ArcadeMedal,
  DialogueDirectory,
  DialogueResident,
  DiscoveryJournal,
  DiscoveryView,
  QuestJournal,
  QuestStepView,
  QuestView,
} from './town.api';

/** Same sentence as the Health room's game-medal note. A spec keeps the two copies equal. */
export const JOURNAL_MEDAL_EXPLANATION =
  'A game medal records a minigame. It does not record a lift, a run, or a medical result.';

export const JOURNAL_COLLECTIONS = ['chapters', 'discoveries', 'friendship', 'arcade'] as const;
export type JournalCollectionId = (typeof JOURNAL_COLLECTIONS)[number];

export interface JournalSource {
  quests: QuestJournal;
  discoveries: DiscoveryJournal;
  residents: DialogueDirectory;
  arcade: ArcadeCollection;
}

export interface JournalItem {
  id: string;
  title: string;
  earned: boolean;
  badge: string | null;
  explanation: string;
  source: string;
  sample: string | null;
  hint: string | null;
  kind: 'chapter' | 'discovery' | 'friendship' | 'minigame';
}

export interface JournalCollection {
  id: JournalCollectionId;
  title: string;
  summary: string;
  items: JournalItem[];
}

const ARCADE: readonly { id: ArcadeGame['game_id']; title: string; scoreKind: ArcadeGame['score_kind'] }[] = [
  { id: 'memory-shelves', title: 'Memory Shelves', scoreKind: 'moves' },
  { id: 'harbor-rhythm', title: 'Harbor Rhythm', scoreKind: 'accuracy' },
];

const REWARD_RULE =
  'The first win each Town day grants 5 Stamps. A replay keeps the score and grants no more. Both games share a cap of 10 Stamps a day.';

export function projectHallJournal(source: JournalSource): readonly JournalCollection[] {
  const quests = list(source.quests?.quests);
  const discoveries = list(source.discoveries?.discoveries);
  const residents = list(source.residents?.residents);
  return [
    {
      id: 'chapters',
      title: 'Chapters',
      summary: `${quests.length} chapters. A finished chapter keeps its keepsake and grants its Stamps once.`,
      items: quests.map(chapterItem),
    },
    {
      id: 'discoveries',
      title: 'Discoveries',
      summary: `${discoveries.length} places. Each found place keeps one journal stamp and grants no Stamps.`,
      items: discoveries.map(discoveryItem),
    },
    {
      id: 'friendship',
      title: 'Friendship',
      summary: `${residents.length} residents. Rank stays from 0 to 5. Only a first welcome grants 2 Stamps.`,
      items: residents.map(friendshipItem),
    },
    {
      id: 'arcade',
      title: 'Arcade',
      summary: `Memory Shelves and Harbor Rhythm. ${REWARD_RULE}`,
      items: ARCADE.map(game => arcadeItem(game, arcadeGames(source.arcade).find(row => row.game_id === game.id))),
    },
  ];
}

export function isJournalCollection(value: string | null): value is JournalCollectionId {
  return value != null && (JOURNAL_COLLECTIONS as readonly string[]).includes(value);
}

function list<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function chapterItem(quest: QuestView): JournalItem {
  const kept = quest.keepsake?.kept === true;
  const stamps = quest.reward_stamps;
  const keepsake = quest.keepsake?.name ?? 'keepsake';
  const steps = list(quest.steps).map(step => {
    const recorded = step.recorded_action ? `recorded ${step.recorded_action}` : 'not recorded';
    return `${step.label} (${recorded})`;
  }).join('; ');
  const explanation = kept
    ? `Finished ${quest.title}. ${stamps} Stamps, once. Keepsake: ${keepsake}. ${steps}.`
    : `Not finished. ${quest.completed} of ${quest.total} steps. Finishing grants ${stamps} Stamps once and the ${keepsake}. ${quest.detail} ${steps}.`;
  const recorded = list(quest.steps).flatMap(step => step.recorded_action ? [step.recorded_action] : []);
  return {
    id: quest.id,
    title: quest.title,
    earned: kept,
    badge: kept ? `${keepsake}, once` : null,
    explanation,
    source: ['quest:' + quest.id, ...recorded].join(' '),
    sample: chapterSample(quest),
    hint: null,
    kind: 'chapter',
  };
}

function chapterSample(quest: QuestView): string | null {
  const lines = list(quest.steps).flatMap((step: QuestStepView) => {
    if (!step.recorded_action || step.recorded_action !== step.sample_action_id) return [];
    const label = step.sample_label ?? 'Labeled sample';
    const detail = step.sample_detail ?? 'Labeled sample.';
    return [`${label}. ${detail}`];
  });
  return lines.length ? lines.join(' ') : null;
}

function discoveryItem(item: DiscoveryView): JournalItem {
  const found = item.found === true;
  return {
    id: item.id,
    title: item.name,
    earned: found,
    badge: found ? 'Journal stamp, once' : null,
    explanation: found
      ? `${item.reaction} Journal stamp, once. No Stamps.`
      : 'Not found yet. A journal stamp is once. No Stamps.',
    source: `discovery:${item.id}`,
    sample: null,
    hint: item.hint,
    kind: 'discovery',
  };
}

function friendshipItem(resident: DialogueResident): JournalItem {
  const conversations = list(resident.conversations);
  const done = conversations.filter(item => item.completed);
  const welcome = done.find(item => item.id === 'welcome' && item.stamps === 2);
  const rank = resident.rank;
  const ranked = rank >= 1 && rank <= 5;
  const talks = done.map(item => {
    if (item.id === 'welcome' && item.stamps === 2) return `${item.title} finished once. 2 Stamps, once.`;
    return `${item.title} finished once. Rank rises by 1. No Stamps.`;
  });
  const rankLine = rank >= 0 && rank <= 5
    ? `Rank ${rank} of 5. No decay.`
    : `Rank ${rank} is not a friendship record.`;
  const refs = [
    ...(welcome ? [`meeting:${resident.id}`] : []),
    ...done.map(item => `${resident.id}:${item.id}`),
  ];
  return {
    id: resident.id,
    title: resident.name,
    earned: ranked,
    badge: ranked ? (welcome ? `Rank ${rank} of 5. 2 Stamps, once.` : `Rank ${rank} of 5. No Stamps.`) : null,
    explanation: [rankLine, ...talks].join(' '),
    source: refs.length ? refs.join(' ') : `resident:${resident.id}`,
    sample: null,
    hint: null,
    kind: 'friendship',
  };
}

function arcadeGames(value: ArcadeCollection | null | undefined): readonly ArcadeGame[] {
  return list(value?.games);
}

function arcadeItem(
  game: (typeof ARCADE)[number],
  row: ArcadeGame | undefined,
): JournalItem {
  const score = validScore(row?.score);
  const medals = validMedals(game.id, row?.medals);
  const scoreLine = score == null
    ? 'No score yet.'
    : game.scoreKind === 'moves' ? `Score ${score} moves.` : `Accuracy ${score}.`;
  const kept = score != null && medals.length === 0 ? 'Score kept. No extra Stamps.' : '';
  const grants = medals.map(medal => `5 Stamps, once, on ${medal.civil_day}. Source ${medal.grant_key}.`).join(' ');
  const nonce = row?.source_nonce && /^[A-Za-z0-9_-]{16,64}$/.test(row.source_nonce)
    ? `play:${row.source_nonce}`
    : `minigame:${game.id}`;
  const source = [nonce, ...medals.map(medal => medal.grant_key)].join(' ');
  return {
    id: game.id,
    title: game.title,
    earned: score != null,
    badge: medals.length ? '5 Stamps, once' : null,
    explanation: [scoreLine, kept, REWARD_RULE, grants, JOURNAL_MEDAL_EXPLANATION, 'It is not a Finance total or a Media membership.'].filter(Boolean).join(' '),
    source,
    sample: null,
    hint: null,
    kind: 'minigame',
  };
}

function validScore(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1000) return null;
  return value;
}

function validMedals(gameId: string, medals: readonly ArcadeMedal[] | undefined): ArcadeMedal[] {
  const seen = new Set<string>();
  const kept: ArcadeMedal[] = [];
  for (const medal of list(medals)) {
    if (medal.amount !== 5 || typeof medal.civil_day !== 'string' || typeof medal.grant_key !== 'string') continue;
    if (medal.grant_key !== `minigame:${gameId}:${medal.civil_day}` || seen.has(medal.grant_key)) continue;
    seen.add(medal.grant_key);
    kept.push(medal);
  }
  return kept;
}
