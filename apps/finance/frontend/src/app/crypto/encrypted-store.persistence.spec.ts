import { of } from 'rxjs';
import { EncryptedRecordPersistence, FINANCE_FOREIGN_COLLECTIONS } from './encrypted-store.persistence';
import { VaultService, type EncryptedRecordDto } from './vault.service';

describe('record update queue', () => {
  it('serializes two independent updates of the same holding', async () => {
    const persistence = new EncryptedRecordPersistence({} as VaultService, () => 4);
    let running = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = persistence.runRecordUpdate('holdings', 7, 4, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await gate;
      running -= 1;
      return 'first';
    });
    for (let step = 0; step < 10; step += 1) await Promise.resolve();
    expect(running).toBe(1);

    let secondStarted = false;
    const second = persistence.runRecordUpdate('holdings', 7, 4, async () => {
      secondStarted = true;
      running += 1;
      peak = Math.max(peak, running);
      running -= 1;
      return 'second';
    });
    for (let step = 0; step < 10; step += 1) await Promise.resolve();
    expect(secondStarted).toBeFalse();
    expect(peak).toBe(1);

    release();
    await expectAsync(first).toBeResolvedTo('first');
    await expectAsync(second).toBeResolvedTo('second');
    expect(peak).toBe(1);
  });
});

describe('foreign health collections', () => {
  const rows: EncryptedRecordDto[] = [
    {
      collection: 'transactions',
      client_id: 'txn-000001',
      ciphertext_b64: 'opaque-tx',
      schema_version: 2,
      key_version: 1,
      revision: 1,
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      collection: 'health_stats',
      client_id: 'hlt_stats0001',
      ciphertext_b64: 'opaque-stats',
      schema_version: 2,
      key_version: 1,
      revision: 1,
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      collection: 'health_prs',
      client_id: 'hlt_prs000001',
      ciphertext_b64: 'opaque-prs',
      schema_version: 2,
      key_version: 1,
      revision: 1,
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  it('decrypts Finance rows only and keeps health data out of every bag', async () => {
    const decrypted: string[] = [];
    const vault = {
      isUnlocked: true,
      listRecords: () => of(rows),
      decryptPayload: async (ciphertextB64: string, collection: string) => {
        decrypted.push(collection);
        expect(ciphertextB64).toBe('opaque-tx');
        return { id: 11 };
      },
      reportFallbackFailure(): void {},
    } as unknown as VaultService;
    const persistence = new EncryptedRecordPersistence(vault, () => 1);

    await persistence.ensureLoaded({ silent: true });

    expect(decrypted).toEqual(['transactions']);
    expect(persistence.list<{ id: number }>('transactions')).toEqual([{ id: 11 }]);
    const bags = (persistence as unknown as {
      bags: Record<string, Map<string, { data: { id?: number } }>>;
    }).bags;
    expect(bags['health_stats']).toBeUndefined();
    expect(bags['health_prs']).toBeUndefined();
    const stored = JSON.stringify(Object.values(bags).map(bag => Array.from(bag.values())));
    expect(stored).not.toContain('opaque-stats');
    expect(stored).not.toContain('opaque-prs');
    expect(stored).not.toContain('health_stats');
    expect(stored).not.toContain('health_prs');
  });

  it('names exactly health_stats and health_prs', () => {
    expect(Array.from(FINANCE_FOREIGN_COLLECTIONS).sort()).toEqual(['health_prs', 'health_stats']);
  });
});
