import { EcdhService } from './ecdh.service';

describe('Browser encryption demo', () => {
  it('round-trips Unicode messages between independently derived participant keys', async () => {
    const service = new EcdhService();
    const encrypted = await service.encryptMessage('Hello 🌍 — private text');
    expect(await service.decryptMessage(encrypted)).toBe('Hello 🌍 — private text');
    expect(service.isKeyExchangeComplete()).toBeTrue();
    const second = await service.encryptMessage('Hello 🌍 — private text');
    expect(second.iv).not.toEqual(encrypted.iv);
  });

  it('rejects tampering and ciphertext from another session', async () => {
    const service = new EcdhService();
    const encrypted = await service.encryptMessage('secret');
    const altered = { ...encrypted, tag: encrypted.tag.map((v, i) => i === 0 ? v ^ 1 : v) };
    await expectAsync(service.decryptMessage(altered)).toBeRejected();
    await expectAsync(new EcdhService().decryptMessage(encrypted)).toBeRejected();
    await expectAsync(service.decryptMessage({ iv: [], tag: [], ciphertext: [] })).toBeRejected();
  });
});
