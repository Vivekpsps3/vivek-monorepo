import { DEK_STORE, VAULT_PRESENCE } from '../../../../finance/frontend/src/public-api';
import {
  SAMPLE_CIVIC_LEDGER,
  TREASURY_PUBLIC_OBJECT,
  adaMention,
  authoredLines,
  dialogueRankEffect,
  dialogueVaultOpen,
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

  it('authors ten conversations and no one else', () => {
    expect(residentScenes().length).toBe(10);
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
    expect(sceneFor('imani', 'welcome')).toBeNull();
    expect(sceneFor('jun', 'welcome')).toBeNull();
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
