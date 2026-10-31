import { DEK_STORE } from './dek-store';
let dek: CryptoKey | null = null, localLock = false;
const tabId = Math.random().toString(36).slice(2);
export const financeTabId = (): string => tabId;
export const hasDek = (): boolean => dek != null;
export const readDek = (): CryptoKey | null => dek;
export const lockedHere = (): boolean => localLock;
export const holdDek = (next: CryptoKey | null): void => { dek = next; if (next) localLock = false; };
export const wipeDek = (): void => { dek = null; localLock = true; try { localStorage.removeItem(DEK_STORE); } catch { /* private mode */ } };
