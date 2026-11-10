# SAFE-03 — implementation evidence

- Leaf issue and parent(s): #203; parents #198 and #197 stay open
- Agent/context, branch/worktree: SAFE-03 in `/tmp/vivek-safe-03`, branch `agent/safe-03`
- Base main SHA, current tested SHA: base `08be484ba3b3535dbcb500749245f2e75ee1f2e4` (SAFE-02 #290 is in that SHA). Gates below ran on this implementation immediately before the evidence commit. Node is `/tmp/node24/bin/node` v24.11.1 because system Node is v20.20.2.
- Fresh-main/prerequisite/active-PR checks: SAFE-02 is merged as #290. PR #193 is already merged. Health still publishes only while its captured owner and generation are current. `openFinanceVault` remains for settings, search, and auth.

## Capability Health actually uses

Health calls five vault operations. Each one captures the current owner and lock generation and returns only while that pair is still current.

| Operation | Envelope / error |
| --- | --- |
| `listRecords(collection, { silent? })` | `Observable` of rows: `collection`, `client_id`, `ciphertext_b64`, `schema_version`, `key_version`, `revision`, `updated_at`. Health reads the identity, ciphertext, schema, key version, and revision. |
| `encryptPayload(value, collection, clientId, schemaVersion, keyVersion)` | ciphertext string. v2 additional data is still collection, client id, schema, and key version. |
| `decryptPayload(ciphertext, collection, clientId, schemaVersion, keyVersion)` | plaintext `T`. A mismatched v2 collection, client id, or key version is refused. Schema 1 stays decryptable without additional data, and Health still skips v1 before decrypt. |
| `upsertRecords([{ collection, client_id, ciphertext_b64, schema_version, key_version, expected_revision }], { silent? })` | saved rows. `expected_revision` null creates. HTTP 409 stays `status === 409`. No blind-index field. |
| `deleteRecords([{ collection, client_id, expected_revision }], { silent? })` | `{ deleted: number }`. HTTP 409 stays `status === 409`. |

A lock or owner change before the result is delivered throws `VaultRecordIneligibleError` with a fixed message and no plaintext. `CryptoKey`, `requireDek`, unlock, setup, blind index, reindex, and `getCounts` are not on the capability.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | `rejectFinanceOnlyOnHealthCapability` typechecks the capability returned by Health's `vault()`. `unlock`, `requireDek`, `lookupBlindIndex`, `reindexRecords`, and `getCounts` are `@ts-expect-error`. Assigning that capability to `VaultService` is `@ts-expect-error`. Supported list/encrypt/decrypt/upsert/delete calls compile, and the encrypt result is `string`. | PASS | `apps/web/src/app/town/health/health-store.service.spec.ts`; `make typecheck-web` |
| LOCAL2 | v2 encrypt/list/decrypt roundtrip, bad collection/client/key additional data, schema 1 compatibility, unsupported schema 3, malformed ciphertext, silent and non-silent list, upsert/delete bodies, and revision 409 | PASS | `vault-record-capability.spec.ts` inside Finance Karma, 762 SUCCESS |
| LOCAL3 | Held decrypt then lock; held encrypt then owner change; held list/upsert then logout. The adapter does not return the plaintext marker. Existing Health lock, owner, logout, disposal, and deadline specs still pass through the capability-typed vault. | PASS | same Finance spec, plus `health-store.service.spec.ts` inside web Karma, 646 SUCCESS |
| LOCAL4 | Health production imports `openVaultRecords` and `VaultRecordCapability`. `HealthVault = Awaited<ReturnType<typeof openFinanceVault>>` is gone. The runtime capability's keys are only the five operations. | PASS | consumer search; `make typecheck-web`; both Karma suites |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| `HealthVault = Awaited<ReturnType<typeof openFinanceVault>>` | `HealthStoreService` and its spec, including `as unknown as HealthVault` | `VaultRecordCapability` from the Finance public API, implemented only by `createVaultRecordCapability` over the existing `VaultService` | Deleted the inferred whole-service alias and the cast. Health calls `openVaultRecords`. | LOCAL1 and LOCAL4 |
| A second vault implementation or temporary full-service wrapper | none | `openFinanceVault` still returns `VaultService` for settings (`whenReady`, `unlocked$`, `isUnlocked`), search (`isUnlocked`), and auth (`ensureLocalDevUnlocked`, `adoptBootstrapVault`) | Not introduced. The record capability is one adapter, not a copied vault. | consumer search |

- Candidate class and protected counterexamples: duplicate live policy for the Health port. Owner, revision, and additional-data checks stay. No vault package and no schema migration.
- Comparison base SHA and full replacement closure: `08be484ba3b3535dbcb500749245f2e75ee1f2e4`. Closure is `public-api.ts`, `vault-record-capability.ts`, and `health-store.service.ts`.
- Production added/deleted/moved: added 230 lines (`vault-record-capability.ts` 205, of which 176 code, 16 comment, 13 blank; `public-api.ts` +12; `health-store.service.ts` +13). Deleted 21 lines from `health-store.service.ts`. Net production +209. The Health file itself is net −8. No moves.
- Independent equivalent implementations before/after: one `VaultService`. The adapter delegates encrypt, decrypt, list, upsert, and delete to it.
- State/cache owners and public entry points before/after: Health memory, generation, and load id stay in `HealthStoreService`. Public entries are `openFinanceVault` for the remaining full-vault callers and `openVaultRecords` for the record capability.
- Remaining old symbol/path search: `HealthVault` has no remaining references. `openFinanceVault` remains only for settings, search, and auth.
- Follow-up change: settings, search, and auth still need `openFinanceVault` because they call vault lifecycle methods Health does not use.
- Tests/docs/generated changes separately: tests added 384 and deleted 27, net +357 (`vault-record-capability.spec.ts` 295 and `health-store.service.spec.ts` +89/−27). This evidence file is the documentation change. Generated build output is not committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: +209. The increase is the explicit capability and the owner/lock-generation gate around the existing operations. Coupling removed is Health's dependence on the concrete whole-service type.
- No behavior/data/meaningful assertion silently removed: SAFE-02 publication guards, v2 refusal, corrupt-row counts, revision conflicts, and `logged_on` preservation remain.

## Verification

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-web` | PASS. eslint baselines matched, including 469 finance findings |
| `make typecheck-web` | PASS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 762 SUCCESS. Statements 74.84%, branches 64.44%, functions 71.75%, lines 77.92% |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 646 SUCCESS. Statements 81.72%, branches 68.27%, functions 80.98%, lines 85.27% |
| `PYTHON=/home/vivek/Deployments/vivek-monorepo/.venv/bin/python make e2e` | PASS. 239 passed, 8 skipped. The worktree has no `.venv`; the first `make e2e` failed with `ModuleNotFoundError: fastapi` before any product assertion. The rerun uses the main checkout's existing environment and the same `make e2e` target. |

`CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. Python product gates were not run because no Python source changed.

## Handoff

- PR URL (leaf closure keyword only): opened with `Closes #203`
- Roadmap #134 append-only status-note URL: posted after the squash merge
- Merged/activation status: merge is requested after this evidence; not a deployment
- Remaining external prerequisites or approved scope decisions: parents #198 and #197 stay open. Settings, search, and auth still use `openFinanceVault`.
- Next actor: none for this leaf after the squash merge and worktree removal
