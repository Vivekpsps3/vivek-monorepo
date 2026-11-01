export { FinanceService } from './app/services/finance.service';
export { VaultService } from './app/crypto/vault.service';
export { hasDek } from './app/crypto/dek-holder';
export { createVaultMaterial } from './app/crypto/vault-crypto';
export { DEK_STORE, LOCK_SIGNAL, VAULT_PRESENCE } from './app/crypto/dek-store';
export type { Asset, Holding, Liability } from './app/models/transaction.model';
export { environment } from './environments/environment';
