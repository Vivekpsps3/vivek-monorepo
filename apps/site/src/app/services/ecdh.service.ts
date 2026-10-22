import { Injectable } from '@angular/core';
import { deriveHkdfBits, toArrayBuffer } from '@vivek/browser';

export async function deriveEcdhSessionKey(sharedSecret: Uint8Array): Promise<Uint8Array> {
  return deriveHkdfBits(sharedSecret, new Uint8Array(32), new TextEncoder().encode('ecdh key agreement'));
}

function bytes(value: unknown): Uint8Array {
  if (!Array.isArray(value) || !value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
    throw new Error('Invalid encrypted message');
  }
  return Uint8Array.from(value);
}

/** Two participants demonstrate ECDH locally. No prompts or keys leave the browser. */
@Injectable({ providedIn: 'root' })
export class EcdhService {
  private sender: CryptoKey | null = null;
  private receiver: CryptoKey | null = null;
  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.initialize();
    void this.ready.catch(() => undefined);
  }

  private async initialize(): Promise<void> {
    const subtle = globalThis.crypto.subtle;
    const alice = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const bob = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const aliceSecret = await subtle.deriveBits({ name: 'ECDH', public: bob.publicKey }, alice.privateKey, 256);
    const bobSecret = await subtle.deriveBits({ name: 'ECDH', public: alice.publicKey }, bob.privateKey, 256);
    this.sender = await subtle.importKey('raw', toArrayBuffer(await deriveEcdhSessionKey(new Uint8Array(aliceSecret))), 'AES-GCM', false, ['encrypt']);
    this.receiver = await subtle.importKey('raw', toArrayBuffer(await deriveEcdhSessionKey(new Uint8Array(bobSecret))), 'AES-GCM', false, ['decrypt']);
  }

  async encryptMessage(plaintext: string): Promise<{ iv: number[]; ciphertext: number[]; tag: number[] }> {
    await this.ready;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.sender!, new TextEncoder().encode(plaintext)));
    return { iv: Array.from(iv), ciphertext: Array.from(encrypted.slice(0, -16)), tag: Array.from(encrypted.slice(-16)) };
  }

  async decryptMessage(payload: unknown): Promise<string> {
    await this.ready;
    if (!payload || typeof payload !== 'object') throw new Error('Invalid encrypted message');
    const data = payload as Record<string, unknown>;
    const iv = bytes(data['iv']);
    const tag = bytes(data['tag']);
    const ciphertext = bytes(data['ciphertext']);
    if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted message');
    const combined = new Uint8Array([...ciphertext, ...tag]);
    const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, this.receiver!, toArrayBuffer(combined));
    return new TextDecoder().decode(result);
  }

  whenReady(): Promise<void> { return this.ready; }

  isKeyExchangeComplete(): boolean { return this.sender !== null && this.receiver !== null; }
}
