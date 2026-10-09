# Security model

This app uses server-blind user data storage for finance data: the browser owns
finance plaintext, and the backend owns only ciphertext, auth, sync metadata,
and account administration.

## Goal

Protect user finance data from database readers, backups, admin tooling, and
normal apps/finance/backend/server operators. Admins should be able to manage accounts,
disable access, reset contents, and delete data, but they should not be able to
decrypt user finance records or reset vault access.

## Non-goals

- Protect against a fully malicious server that serves modified JavaScript to
  capture vault passphrases.
- Protect against a compromised browser, extension, or endpoint after the user
  unlocks their vault.
- Make admins able to recover user finance data after vault secrets are lost.

If malicious frontend delivery is in scope, the app needs a trusted client
distribution model such as a signed static bundle, native wrapper, or local app.
A normal web deployment can still make the database and backend server-blind, but
the operator controls the code delivered to browsers.

## Required architecture

1. Browser generates a random per-user data encryption key and signing keypair.
2. Browser wraps the data key and signing private key with a vault passphrase-derived key only (no recovery-key path).
3. The backend stores the signing public key, encrypted wraps, and a hash of each short-lived, single-use login challenge.
4. Vault passphrases, signing private keys, and unwrapped data keys never reach the backend.
5. Browser signs an account-bound challenge locally; only the public-key verification result creates a session.
6. Browser encrypts finance records before upload and decrypts them after download.
7. Backend stores ciphertext, non-sensitive sync metadata, and optional blind indexes only; it never computes over private plaintext.

## Plaintext allowed on the backend

- User account identity and role data in `users`.
- Sessions, CSRF token hashes, and account audit events.
- Global provider registries such as banks and brokerages.
- Public market quote cache, subject to the holdings privacy decision below.
- Encrypted record metadata: owner user ID, collection name, client record ID, schema version, key version, timestamps, and sync revision.

## Plaintext not allowed on the backend

- Transaction amounts, dates, categories, descriptions, account masks, import filenames if sensitive, and dedupe source material.
- Asset and liability names, amounts, dates, and notes.
- Job income, fixed expense, subscription, and payment-account details.
- Holdings symbols, shares, purchase prices, brokerage account masks, and nicknames unless the holdings quote decision explicitly accepts symbol leakage.
- Planning profiles, assumptions, generated input snapshots, and run artifacts.
- Tax document vault data. Tax document storage has been removed and should not be reintroduced without a new product/security decision.

## Recovery rules

- There is no password reset. Admins cannot reset a vault passphrase, generate a signing key, or alter encrypted vault material.
- There is no recovery-key path. If a user loses their vault passphrase, encrypted finance data cannot be recovered; admins can only delete the encrypted data and let the user start over.

## Holdings price privacy

Automated server-side quote lookup conflicts with encrypted holdings if symbols
are private. Manual/imported prices do not disclose symbols. An explicit
Portfolio refresh, employer stock price refresh, one-off quote lookup, or Stock Lab research request discloses
only the requested ticker symbols to the public market endpoint and yfinance.
Shares, values, employee purchase contributions, cost bases, employer titles,
account details, and saved scenario inputs remain encrypted; the backend market
cache stores only public symbol-level data.

Longer-term choices if stricter holdings privacy is required:

1. Encrypt symbols and use manual/current imported prices.
2. Disclose symbols to the backend for quote lookup with explicit UI disclosure.
3. Fetch quotes directly from the browser, accepting third-party/API-key tradeoffs.
4. Serve broad public quote datasets so the browser can look up symbols locally.

Do not claim ticker symbols are server-blind when a Portfolio refresh, employer
stock price refresh, or Stock Lab request has sent them to the backend.

## Local intelligence privacy gate (SEC-001)

Client-side financial signals, detectors, and local snapshots must obey:

| Rule | Requirement |
|------|-------------|
| Network | Detectors and signal modules send **no** requests. No amounts, merchants, shares, account masks, or private evidence leave the browser. |
| Mutation | Signals never write assets, liabilities, holdings, transactions, or recurring cashflow. Actions are reversible user navigation only. |
| Evidence | Evidence strings stay in-memory or encrypted vault collections if persisted later; never server plaintext logs. |
| Ticker exception | Only explicit Portfolio refresh / Stock Lab research may disclose symbols, under the holdings privacy section above. |
| Versioning | Each detector has a stable `detectorId` + version; fixtures prove deterministic outputs. |

Feature contracts for new analytics must list transmitted fields (default: **none**)
and ship unit tests that run pure detectors over synthetic fixtures.

No client-side signal/detector code currently ships; these rules bind any future implementation.

## Migration ordering

Schema-v1 ciphertext is decrypted locally only after account authentication and
rewritten as schema-v2 records with authenticated-record AAD. Verify the
encrypted replacement before deleting legacy plaintext rows, then checkpoint the
SQLite WAL and run `VACUUM`. Password migration follows the same ordering: a
legacy password session can enroll a signing key only after the vault is
available; enrollment clears the password hash without uploading any vault secret.

## Admin tooling

Raw SQL and metrics that expose finance details are incompatible with
server-blind storage. Admin tooling should be limited to counts, table health,
schema/migration state, account management, session revocation, and destructive
data reset.

## Verification expectations

- API responses before vault unlock contain no finance plaintext.
- Logs contain no finance plaintext.
- Admin UI contains no finance plaintext.
- SQLite database bytes contain no known finance plaintext after migration, cleanup, WAL checkpoint, and `VACUUM`.
- Wrong-user record access is rejected server-side even though payloads are encrypted.
- Tampered ciphertext or associated data fails to decrypt in the browser.
