import { DEK_STORE, VAULT_PRESENCE } from '../../../../finance/frontend/src/public-api';
import {
  GYM_PUBLIC_OBJECT,
  SAMPLE_CIVIC_LEDGER,
  SAMPLE_DEPARTURE_BOARD,
  SAMPLE_TRAINING_CARD,
  TERMINAL_PUBLIC_OBJECT,
  TREASURY_PUBLIC_OBJECT,
  adaMention,
  authoredLines,
  dialogueRankEffect,
  dialogueVaultOpen,
  imaniMention,
  junMention,
  residentScenes,
  sceneFor,
} from './resident-scenes';

const SECRETS = ['Northwind Checking', 'Spent 4321 on synthetic rent', 'Private goal harbor cottage'] as const;
const PRAISE = /great job|well done|amazing|proud of you|excellent|good work|impressive|fantastic|awesome/i;
const PRIVATE_WORDS = /account|spending|private goal|paycheck|balance/i;

describe('Mara and Ada scenes', () => {
  afterEach(() => {
    localStorage.removeItem(VAULT_PRESENCE);
    localStorage.removeItem(DEK_STORE);
  });

  it('authors ten conversations and leaves the other residents alone', () => {
    expect(residentScenes().filter(scene => scene.residentId === 'mara' || scene.residentId === 'ada').length).toBe(10);
    const ids = ['welcome', 'how-it-works', 'preference', 'activity', 'reflection'];
    for (const residentId of ['mara', 'ada']) {
      for (const conversationId of ids) {
        const scene = sceneFor(residentId, conversationId);
        expect(scene?.choices.length).toBe(2);
        expect(new Set(scene?.choices.map(choice => choice.id)).size).toBe(2);
        for (const line of authoredLines(scene!, null)) {
          expect(line).not.toMatch(PRAISE);
          expect(line).not.toMatch(PRIVATE_WORDS);
        }
      }
    }
    expect(sceneFor('wren', 'activity')).toBeNull();
    expect(sceneFor('sol', 'reflection')).toBeNull();
  });

  it('gives both replies the same rank effect', () => {
    const scene = sceneFor('mara', 'welcome')!;
    expect(dialogueRankEffect(false, scene.conversationId, 2)).toBe('Rank rises by 1. 2 Stamps, once.');
    expect(dialogueRankEffect(false, 'how-it-works', 0)).toBe('Rank rises by 1. No Stamps.');
    expect(dialogueRankEffect(false, 'preference', 0)).toBe('Rank rises by 1. No Stamps.');
    expect(dialogueRankEffect(false, 'activity', 0)).toBe('Rank rises by 1. No Stamps.');
    expect(dialogueRankEffect(false, 'reflection', 0)).toBe('Rank rises by 1. No Stamps.');
    expect(dialogueRankEffect(true, 'welcome', 2)).toBe('Rank stays. No Stamps.');
    expect(dialogueRankEffect(false, 'welcome', 0)).toBe('Rank rises by 1. No Stamps.');
    expect(dialogueRankEffect(false, scene.conversationId, 2)).toBe(dialogueRankEffect(false, scene.conversationId, 2));
  });

  it('hides account, spending, and private goal text when Finance is locked', () => {
    const mention = adaMention({
      locked: true,
      publicLabel: TREASURY_PUBLIC_OBJECT,
      account: SECRETS[0],
      spending: SECRETS[1],
      goal: SECRETS[2],
    });
    expect(mention).toEqual(SAMPLE_CIVIC_LEDGER);
    const lines = authoredLines(sceneFor('ada', 'activity')!, mention);
    for (const secret of SECRETS) expect(lines.join('\n')).not.toContain(secret);
    expect(lines).toContain('Sample civic ledger');
    expect(lines).toContain('Labeled sample. Not a Finance record.');
  });

  it('refuses a public label that repeats a private value and keeps a clean door', () => {
    const tainted = adaMention({
      locked: false,
      publicLabel: `Door for ${SECRETS[0]}`,
      account: SECRETS[0],
      spending: SECRETS[1],
      goal: SECRETS[2],
    });
    expect(tainted.sample).toBeTrue();
    expect(authoredLines(sceneFor('ada', 'welcome')!, tainted).join('\n')).not.toContain(SECRETS[0]);
    const open = adaMention({
      locked: false,
      publicLabel: TREASURY_PUBLIC_OBJECT,
      account: SECRETS[0],
      spending: SECRETS[1],
      goal: SECRETS[2],
    });
    expect(open).toEqual({ label: 'Treasury door', detail: 'A public door. Records stay in Finance.', sample: false });
    expect(authoredLines(sceneFor('ada', 'how-it-works')!, open).join('\n')).not.toContain(SECRETS[1]);
    expect(adaMention({ locked: false, publicLabel: '   ', account: null, spending: null, goal: null }).sample).toBeTrue();
  });

  it('treats a missing or other owner vault as locked', () => {
    expect(dialogueVaultOpen(null)).toBeFalse();
    expect(dialogueVaultOpen(1)).toBeFalse();
    localStorage.setItem(VAULT_PRESENCE, '2');
    expect(dialogueVaultOpen(1)).toBeFalse();
    localStorage.setItem(VAULT_PRESENCE, '1');
    expect(dialogueVaultOpen(1)).toBeTrue();
    localStorage.removeItem(VAULT_PRESENCE);
    localStorage.setItem(DEK_STORE, 'present');
    expect(dialogueVaultOpen(1)).toBeTrue();
  });
});

const TRIP_FACTS = ['Synthetic harbor', 'Lisbon quay', 'status done'] as const;
const HEALTH_FACTS = ['Back squat 100 kg', 'Marathon finisher', '72 bpm'] as const;
const OUTCOME = /you (took|went|traveled|flew)|marked taken|trip taken|workout logged|personal record|marathon|lifted|you ran|blood pressure|heart rate/i;

describe('Imani and Jun scenes', () => {
  const ids = ['welcome', 'how-it-works', 'preference', 'activity', 'reflection'];

  it('authors ten conversations and does not author Wren or Sol', () => {
    expect(residentScenes().length).toBe(20);
    for (const residentId of ['imani', 'jun']) {
      for (const conversationId of ids) {
        const scene = sceneFor(residentId, conversationId);
        expect(scene?.choices.length).toBe(2);
        expect(new Set(scene?.choices.map(choice => choice.id)).size).toBe(2);
        expect(scene?.choices[0].reply).not.toBe(scene?.choices[1].reply);
        const effect = dialogueRankEffect(false, conversationId, conversationId === 'welcome' ? 2 : 0);
        expect(effect).toBe(conversationId === 'welcome' ? 'Rank rises by 1. 2 Stamps, once.' : 'Rank rises by 1. No Stamps.');
        expect(dialogueRankEffect(true, conversationId, 2)).toBe('Rank stays. No Stamps.');
        for (const line of authoredLines(scene!, null)) {
          expect(line).not.toMatch(PRAISE);
          expect(line).not.toMatch(OUTCOME);
          for (const fact of [...TRIP_FACTS, ...HEALTH_FACTS]) expect(line).not.toContain(fact);
        }
      }
      const activity = sceneFor(residentId, 'activity');
      expect(activity?.choices.map(choice => choice.id)).toContain('leave');
    }
    expect(sceneFor('wren', 'welcome')).toBeNull();
    expect(sceneFor('sol', 'activity')).toBeNull();
  });

  it('keeps an empty or named trip on the sample board', () => {
    expect(imaniMention({ empty: true, tripTitle: null, destination: null, taken: null })).toEqual(SAMPLE_DEPARTURE_BOARD);
    const named = imaniMention({
      empty: false,
      tripTitle: TRIP_FACTS[0],
      destination: TRIP_FACTS[1],
      taken: TRIP_FACTS[2],
    });
    expect(named).toEqual(SAMPLE_DEPARTURE_BOARD);
    const lines = authoredLines(sceneFor('imani', 'how-it-works')!, named).join('\n');
    for (const fact of TRIP_FACTS) expect(lines).not.toContain(fact);
    expect(imaniMention({ empty: false, tripTitle: '  ', destination: null, taken: null })).toEqual({
      label: TERMINAL_PUBLIC_OBJECT,
      detail: 'A public desk. Trips stay in Travel.',
      sample: false,
    });
    const clean = authoredLines(sceneFor('imani', 'activity')!, imaniMention({
      empty: false, tripTitle: null, destination: null, taken: null,
    })).join('\n');
    expect(clean).toContain('Harbor terminal');
    expect(clean).not.toMatch(OUTCOME);
  });

  it('keeps a locked Health record or a badge off the training card', () => {
    expect(junMention({ locked: true, workout: null, badge: null, measurement: null })).toEqual(SAMPLE_TRAINING_CARD);
    const named = junMention({
      locked: false,
      workout: HEALTH_FACTS[0],
      badge: HEALTH_FACTS[1],
      measurement: HEALTH_FACTS[2],
    });
    expect(named).toEqual(SAMPLE_TRAINING_CARD);
    const lines = authoredLines(sceneFor('jun', 'activity')!, named).join('\n');
    for (const fact of HEALTH_FACTS) expect(lines).not.toContain(fact);
    expect(lines).toContain('Noticing does not log a workout.');
    expect(junMention({ locked: false, workout: '  ', badge: null, measurement: null })).toEqual({
      label: GYM_PUBLIC_OBJECT,
      detail: 'A public floor. Records stay in Health.',
      sample: false,
    });
  });
});
