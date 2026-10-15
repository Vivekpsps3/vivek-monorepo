import { InjectionToken, Injectable, inject } from '@angular/core';
import { deriveHkdfBits, toArrayBuffer } from '@vivek/browser';
import { io, type Socket } from 'socket.io-client';

export type EcdhSocketFactory = (url: string) => Socket;
export const ECDH_SOCKET_FACTORY = new InjectionToken<EcdhSocketFactory>('ECDH_SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => (url: string) => io(url),
});

interface PendingDecryption {
  resolve: (text: string) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface ServerKeyResponse {
  request_id?: unknown;
  public_key?: unknown;
}

/** Matches cryptography.hazmat HKDF(salt=None, info=b'ecdh key agreement'). */
export async function deriveEcdhSessionKey(sharedSecret: Uint8Array): Promise<Uint8Array> {
  return deriveHkdfBits(sharedSecret, new Uint8Array(32), new TextEncoder().encode('ecdh key agreement'));
}

function bytesFrom(value: unknown, field: string): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (Array.isArray(value) && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return Uint8Array.from(value);
  }
  throw new Error(`Invalid ${field}`);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesFromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('Invalid server public key');
  return Uint8Array.from(hex.match(/.{2}/g)!, byte => Number.parseInt(byte, 16));
}

@Injectable({ providedIn: 'root' })
export class EcdhService {
  private readonly socket: Socket | null;
  private sharedKey: Uint8Array | null = null;
  private privateKey: CryptoKey | null = null;
  private readonly decryptionPromises = new Map<string, PendingDecryption>();
  private messageCounter = 0;
  private keyExchangePromise!: Promise<void>;
  private resolveKeyExchange!: () => void;
  private rejectKeyExchange!: (reason: Error) => void;
  private exchangeRequestId: string | null = null;
  private keyExchangeAttempt = 0;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private resetOnNextConnect = false;

  constructor() {
    if (typeof window === 'undefined') {
      this.socket = null;
      this.keyExchangePromise = Promise.reject(new Error('The encryption demo is available in a browser.'));
      void this.keyExchangePromise.catch(() => undefined);
      return;
    }

    const serverUrl = window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:5000' : 'https://vivekpanchagnula.com/';
    this.socket = inject(ECDH_SOCKET_FACTORY)(serverUrl);
    this.resetKeyExchangePromise();
    this.setupSocketListeners();
    if (this.socket.connected) this.beginKeyExchange();
  }

  private resetKeyExchangePromise(): void {
    this.keyExchangePromise = new Promise<void>((resolve, reject) => {
      this.resolveKeyExchange = resolve;
      this.rejectKeyExchange = reject;
    });
    // Keep a failed handshake handled until a caller awaits it.
    void this.keyExchangePromise.catch(() => undefined);
  }

  private setupSocketListeners(): void {
    this.socket!.on('connect', () => this.beginKeyExchange());

    this.socket!.on('server_public_key', (response: ServerKeyResponse) => {
      if (
        typeof response?.request_id !== 'string' ||
        response.request_id !== this.exchangeRequestId ||
        typeof response.public_key !== 'string'
      ) {
        return;
      }
      const attempt = this.keyExchangeAttempt;
      void this.deriveSharedKey(response.public_key, attempt)
        .then(() => {
          if (attempt !== this.keyExchangeAttempt || !this.sharedKey) return;
          this.clearHandshakeTimer();
          this.resetOnNextConnect = false;
          this.resolveKeyExchange();
        })
        .catch(error => this.failKeyExchange(error, attempt));
    });

    this.socket!.on('decrypted_message', (result: { request_id?: string; text?: string }) => {
      if (typeof result?.request_id !== 'string') return;
      this.settleDecryption(result.request_id, result.text ?? '');
    });

    this.socket!.on('error', (errorData: { request_id?: string; message?: string }) => {
      const error = new Error(errorData?.message || 'Encryption request failed');
      if (typeof errorData?.request_id === 'string' && this.decryptionPromises.has(errorData.request_id)) {
        this.rejectDecryption(errorData.request_id, error);
      } else if (errorData?.request_id === this.exchangeRequestId || (!errorData?.request_id && !this.sharedKey)) {
        this.failKeyExchange(error);
      }
    });

    this.socket!.on('connect_error', (error: Error) => this.invalidateConnection(error));
    this.socket!.on('disconnect', () => this.invalidateConnection(new Error('The encryption server disconnected')));
  }

  private beginKeyExchange(): void {
    if (this.resetOnNextConnect) this.resetKeyExchangePromise();
    this.resetOnNextConnect = false;
    this.keyExchangeAttempt += 1;
    const attempt = this.keyExchangeAttempt;
    this.sharedKey = null;
    this.privateKey = null;
    this.exchangeRequestId = `key-${Date.now()}-${attempt}`;
    this.clearHandshakeTimer();
    this.handshakeTimer = setTimeout(
      () => this.failKeyExchange(new Error('Key exchange timed out. Reload to start a new connection.'), attempt),
      15_000
    );
    void this.generateEccKey(attempt, this.exchangeRequestId).catch(error => this.failKeyExchange(error, attempt));
  }

  private async generateEccKey(attempt: number, requestId: string): Promise<void> {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    if (attempt !== this.keyExchangeAttempt || !this.socket?.connected) return;
    this.privateKey = keyPair.privateKey;

    const exportedKey = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
    if (attempt !== this.keyExchangeAttempt || !this.socket.connected) return;
    this.socket.emit('exchange_keys', {
      request_id: requestId,
      public_key: bytesToHex(new Uint8Array(exportedKey)),
    });
  }

  private async deriveSharedKey(serverPublicKeyHex: string, attempt: number): Promise<void> {
    const privateKey = this.privateKey;
    if (!privateKey) throw new Error('The client key exchange has not started');
    const serverPublicKeyBytes = bytesFromHex(serverPublicKeyHex);
    const serverPublicKey = await window.crypto.subtle.importKey(
      'raw',
      toArrayBuffer(serverPublicKeyBytes),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    const secret = await window.crypto.subtle.deriveBits(
      { name: 'ECDH', public: serverPublicKey },
      privateKey,
      256
    );
    const sharedKey = await deriveEcdhSessionKey(new Uint8Array(secret));
    if (attempt === this.keyExchangeAttempt) this.sharedKey = sharedKey;
  }

  async encryptMessage(plaintext: string): Promise<{ iv: number[]; ciphertext: number[]; tag: number[] }> {
    await this.keyExchangePromise;
    if (!this.sharedKey) throw new Error('Key exchange not complete');

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await window.crypto.subtle.importKey('raw', toArrayBuffer(this.sharedKey), { name: 'AES-GCM' }, false, ['encrypt']);
    const ciphertextWithTag = new Uint8Array(
      await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(new TextEncoder().encode(plaintext)))
    );
    const tagLength = 16;
    return {
      iv: Array.from(iv),
      ciphertext: Array.from(ciphertextWithTag.slice(0, -tagLength)),
      tag: Array.from(ciphertextWithTag.slice(-tagLength)),
    };
  }

  async decryptMessage(encryptedData: unknown): Promise<string> {
    await this.keyExchangePromise;
    if (!this.sharedKey) throw new Error('Key exchange not complete');
    if (!encryptedData || typeof encryptedData !== 'object') throw new Error('Missing encryption data');

    const data = encryptedData as Record<string, unknown>;
    const iv = bytesFrom(data['iv'], 'initialization vector');
    const ciphertext = bytesFrom(data['ciphertext'], 'ciphertext');
    const tag = bytesFrom(data['tag'], 'authentication tag');
    if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encryption data');

    const requestId = `message-${Date.now()}-${this.messageCounter++}`;
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rejectDecryption(requestId, new Error('Decryption request timed out'));
      }, 30_000);
      this.decryptionPromises.set(requestId, { resolve, reject, timeout });
      this.socket!.emit('decrypt_message', {
        request_id: requestId,
        iv: bytesToHex(iv),
        ciphertext: bytesToHex(ciphertext),
        tag: bytesToHex(tag),
      });
    });
  }

  isKeyExchangeComplete(): boolean {
    return this.sharedKey !== null;
  }

  private settleDecryption(requestId: string, text: string): void {
    const pending = this.decryptionPromises.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.decryptionPromises.delete(requestId);
    pending.resolve(text);
  }

  private rejectDecryption(requestId: string, error: Error): void {
    const pending = this.decryptionPromises.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.decryptionPromises.delete(requestId);
    pending.reject(error);
  }

  private failKeyExchange(reason: unknown, attempt = this.keyExchangeAttempt): void {
    if (attempt !== this.keyExchangeAttempt) return;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    this.clearHandshakeTimer();
    this.keyExchangeAttempt += 1;
    this.sharedKey = null;
    this.privateKey = null;
    this.exchangeRequestId = null;
    this.rejectKeyExchange(error);
    this.resetOnNextConnect = true;
  }

  private invalidateConnection(reason: Error): void {
    this.failKeyExchange(reason);
    this.sharedKey = null;
    this.privateKey = null;
    this.exchangeRequestId = null;
    this.resetOnNextConnect = true;
    for (const requestId of this.decryptionPromises.keys()) this.rejectDecryption(requestId, reason);
    this.keyExchangePromise = Promise.reject(reason);
    void this.keyExchangePromise.catch(() => undefined);
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer === null) return;
    clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
  }
}
