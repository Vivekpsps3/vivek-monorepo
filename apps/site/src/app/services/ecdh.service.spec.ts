import { TestBed } from '@angular/core/testing';
import type { Socket } from 'socket.io-client';
import { deriveHkdfBits } from '@vivek/browser';
import { ECDH_SOCKET_FACTORY, EcdhService, deriveEcdhSessionKey } from './ecdh.service';

interface EmittedEvent {
  event: string;
  payload?: Record<string, unknown>;
}

type SocketHandler = (payload?: unknown) => void;

class FakeSocket {
  connected = true;
  readonly emitted: EmittedEvent[] = [];
  readonly handlers = new Map<string, SocketHandler[]>();

  constructor(private readonly serverPublicKey: string) {}

  on(event: string, handler: SocketHandler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  emit(event: string, payload?: Record<string, unknown>): this {
    this.emitted.push({ event, payload });
    if (event === 'exchange_keys' && typeof payload?.['request_id'] === 'string') {
      queueMicrotask(() =>
        this.trigger('server_public_key', {
          request_id: payload['request_id'],
          public_key: this.serverPublicKey,
        })
      );
    }
    return this;
  }

  trigger(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
}

describe('EcdhService', () => {
  let service: EcdhService;
  let socket: FakeSocket;
  let serverPublicKey: string;

  beforeEach(async () => {
    const pair = await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    serverPublicKey = Array.from(
      new Uint8Array(await window.crypto.subtle.exportKey('raw', pair.publicKey)),
      byte => byte.toString(16).padStart(2, '0')
    ).join('');
    socket = new FakeSocket(serverPublicKey);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ECDH_SOCKET_FACTORY,
          useValue: () => socket as unknown as Socket,
        },
      ],
    });
    service = TestBed.inject(EcdhService);
  });

  it('derives the same HKDF session key as the Python server', async () => {
    const input = Uint8Array.from({ length: 32 }, (_, index) => index);
    const expected = '9c5f8dd4b67b07fd632bf245cb2c2bf908f0e19ca67b29c52ee3441a2906139d';
    const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

    expect(hex(await deriveHkdfBits(input, new Uint8Array(32), new TextEncoder().encode('ecdh key agreement')))).toBe(expected);
    expect(hex(await deriveEcdhSessionKey(input))).toBe(expected);
  });

  it('correlates concurrent decrypt replies and sends no shared key to the server', async () => {
    await service.encryptMessage('handshake');
    const encrypted = { iv: Array(12).fill(1), ciphertext: [2, 3], tag: Array(16).fill(4) };
    const first = service.decryptMessage(encrypted);
    const second = service.decryptMessage(encrypted);
    await new Promise(resolve => setTimeout(resolve, 0));
    const requests = socket.emitted
      .filter(item => item.event === 'decrypt_message')
      .map(item => item.payload!);

    expect(requests.length).toBe(2);
    expect(requests[0]['request_id']).not.toBe(requests[1]['request_id']);
    for (const request of requests) expect('shared_key' in request).toBeFalse();

    socket.trigger('decrypted_message', { request_id: requests[1]['request_id'], text: 'second' });
    socket.trigger('decrypted_message', { request_id: requests[0]['request_id'], text: 'first' });
    await expectAsync(Promise.all([first, second])).toBeResolvedTo(['first', 'second']);
  });

  it('performs a fresh key exchange after reconnect', async () => {
    await service.encryptMessage('before disconnect');
    expect(service.isKeyExchangeComplete()).toBeTrue();

    socket.connected = false;
    socket.trigger('disconnect');
    expect(service.isKeyExchangeComplete()).toBeFalse();
    socket.connected = true;
    socket.trigger('connect');

    await service.encryptMessage('after reconnect');
    expect(socket.emitted.filter(item => item.event === 'exchange_keys').length).toBe(2);
    expect(service.isKeyExchangeComplete()).toBeTrue();
  });
});
