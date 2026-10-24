import { EncryptedRecordPersistence } from './encrypted-store.persistence';
import { VaultService } from './vault.service';

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
