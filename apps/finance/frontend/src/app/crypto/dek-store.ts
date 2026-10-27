/** localStorage key for the browser-only vault key. Not the crypto implementation. */
export const DEK_STORE = 'finance-dek';

/** Clear the persisted key without loading the vault implementation. */
export function clearFinanceSessionStorage(): void {
  try { localStorage.removeItem(DEK_STORE); } catch { /* private mode */ }
}

/** True when this browser still has a saved vault key. Does not import vault crypto. */
export function financeVaultPresent(): boolean {
  try {
    return !!localStorage.getItem(DEK_STORE);
  } catch {
    return false;
  }
}
