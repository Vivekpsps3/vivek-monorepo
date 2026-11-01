import { DEK_STORE } from './dek-store';
let dek: CryptoKey | null = null, localLock = false, lockEpoch = 0;
const tabId = Math.random().toString(36).slice(2);
export const financeTabId = (): string => tabId;
export const hasDek = (): boolean => dek != null;
export const readDek = (): CryptoKey | null => dek;
export const readLockEpoch = (): number => lockEpoch;
export const lockedHere = (): boolean => localLock;
export const holdDek = (next: CryptoKey | null): void => { dek = next; if (next) localLock = false; };
/** Drop the legacy localStorage DEK. A migration, not a lock: no epoch bump and no lock signal. */
export const migrateLegacyDek = (): void => { try { localStorage.removeItem(DEK_STORE); } catch { /* private mode */ } };
export const wipeDek = (): void => { dek = null; localLock = true; lockEpoch += 1; try { localStorage.removeItem(DEK_STORE); } catch { /* private mode */ } };
