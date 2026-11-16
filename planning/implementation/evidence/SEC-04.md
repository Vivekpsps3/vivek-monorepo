# SEC-04 — implementation evidence

- Leaf: [#269](https://github.com/Vivekpsps3/vivek-monorepo/issues/269); parent: [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121).
- Fresh Codex worker context, branch `agent/sec-04`, isolated worktree `/tmp/vivek-sec-04`.
- Base main: `7c3b0117426ddc304fc5e90ad63e4bb8254b2e2e`; tested implementation: `892ce28a06f99afd21768cfa902894b8245a4ed2`. Evidence-only commits do not change that implementation.
- Fetched main and checked the live leaf/open PRs before claiming; no competing claim or PR. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/269#issuecomment-6906006378). Verified SEC-03 #376 merge at the base above and exact-head CI run 43794179763; SAFE-03 `451297726db7807e5aa68d5040d924ced946952b` and SAFE-04 `0ab6221023b1557d2dda1ff4038b08c1107a0366` are ancestors with their public capability/lock contracts present. Root checkout's unrelated World edits were never edited, reset, stashed or staged.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| A01 | `passphrase-change.spec.ts` creates a real account, seeds authenticated schema-2 ciphertext and real HMAC blind indexes for every current collection derived from the server's Finance/Health policy, and changes through Settings. Exactly one credential POST and no requesting-page record write/legacy wrap write. Exact recovery snapshots (ciphertext/revisions/content descriptors) and every blind-index lookup survive. The requesting cookie/CSRF remains usable; an independent server session receives 401; another same-origin Settings tab locks. Old passphrase rejects after reload; new unlocks. A fresh browser rejects old sign-in, accepts new, mounts the unlocked form and exports/decrypts every original marker. | PASS |
| A02 | Browser wrong-current/confirm plus conflict, network and 503 cases: linked/focused fields or alert, no mutation on local failure, both old server wraps unchanged, old passphrase still signs in elsewhere, same-session draft retained and retry succeeds with fresh metadata/proof. Captured requests/logs/localStorage/sessionStorage contain no passphrases or private markers. Phone light/dark cases verify async wrong-current focus, linked invalid attributes, 44px inputs, no horizontal overflow and successful change. Real-crypto unit cases preserve the held non-extractable DEK, signing public key, ciphertext and blind indexes. API rejection/rollback matrix retains owner/CSRF/origin/purpose/KDF/replay and both-write failure assertions. | PASS |
| A03 | Browser fetches and commits a real rotation, holds the response until after lock/sign-out/actual Appearance mount, then waits for route completion and UI frames before checking no success toast, resurrected form draft or stored/logged marker. Unit tests cover lock, owner change, same-owner session revision and destruction while UI is held; service tests cancel held background HTTP on lock/manual supersession, suppress stale toasts/writes, protect manual work from a later upgrade, and reject held responses from changed owners. Existing recovery held-encryption/race suites also pass. | PASS |
| Compatibility | Existing 310k wraps still read/log in and upgrade both wraps atomically. New work factors are at least the existing value and current floor; same keys/recovery columns/record AAD remain. Auth primitive test verifies a new-passphrase signature against the original public key and rejects old-passphrase unwrap. A stale revision leaves both wraps/proof/session state intact; subsequent independent old-release PUTs return 410 with reload guidance and cannot change the winner. Restore still rejects a stage whose destination wrap changed. | PASS |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Disposition/proof |
| --- | --- | --- | --- |
| `ensureAuthWrap`, `applyKdfUpgrade`, `rewrapAuthWrap`, `rewrapVaultDek`, two independent browser PUTs | Nonblocking login/unlock KDF upgrades | `VaultService.rotateCredentialWraps`, also called by the new passphrase form | Deleted all four orchestration helpers and both independent saves. One coherent credential GET, fresh purpose proof and one revision-bound POST. Unit request assertions, background cancellation/race cases and browser request counts prove migration. |
| Signing/vault independent persistence handlers and `VaultUpdateRequest` | Previous browser KDF release; current browser callers migrated above | Existing atomic identity rotation; shared signing/vault persistence owners retained | Deleted both persistence bodies and orphan request schema/import/logger. Two tiny authenticated 410 tombstones give old clients safe reload guidance. Late legacy-writer API test proves neither wrap/revision/session can change after a winner. GET wrappers and historical low-iteration format support remain. |
| Separate Settings lock listeners/state paths | Existing Settings backup/restore and new passphrase draft | Existing `FinanceLockService`, `bindLockSnapshots`, session stream and destroy hook | Added the new draft to existing cleanup; no BroadcastChannel/storage listener, lock parser, record store or second UI orchestration. Existing requesting-session policy is deliberate: keep cookie/CSRF, then lock participating local keys and require new-passphrase unlock. |

- Classification: feature plus safety repair, not a simplification claim. Retiring unchecked old-release writes is necessary to guarantee that a delayed upgrade cannot undo rotation. Reads/unlock remain supported; this is not a format or recovery retirement.
- Full production closure against base: Finance vault service, Finance router/schema, identity router, auth wrapping primitive, Settings Finance/account controls. Physical production **+228/-146, net +82**, moved 0; no generated/bundled files. New code owns validation/focus, bounded cancellation, browser proof/rewrap and session-safe publication. Existing audit messages moved from retired writers to the atomic operation. Formatting/blank/comment churn is included, not counted as executable simplification.
- Tests **+521/-123, net +398**; existing meaningful partial-save, weak-KDF, rate-budget, legacy login and restore conflict assertions migrated to the stronger atomic contract. Product docs/guidance before this evidence **+26/-9**. No migration history, dependency/lockfile, quality baseline or gate changed.
- Independent live browser persistence workflows: two saves to one atomic save. Server mutation implementations: atomic plus two unchecked compatibility writers to atomic only; two rejecting tombstones remain. Persistent status/auth-wrap/DEK/record owners stay with their existing services. One transient credential action/controller and its 120-second bounded work replace unbounded async upgrade work; subscriptions/timer dispose in `finally`, and lock/owner/revision/manual supersession abort immediately.
- Removed-symbol search finds no production `ensureAuthWrap`, `applyKdfUpgrade`, `rewrapAuthWrap`, `rewrapVaultDek`, `VaultUpdateRequest`, `update_passwordless_wraps`, or `vault_update_wraps`; only the two explicit retired PUT decorators remain. Current production browser code has no legacy-wrap PUT.
- Follow-up passphrase UX changes touch the existing Settings component/template; protocol changes touch VaultService and the owned identity schema/route. No new registry, facade, cache or generic framework was introduced.
- Commit acceptance boundary: abort cannot undo a server-accepted rotation. Interrupted-response copy says to try the new passphrase before retrying. Strings/browser-internal crypto copies cannot be securely erased; application refs and owned decrypted signing bytes are cleared. Remote-held keys cannot be erased. No deployment/activation claim.

## Verification

Commands below ran locally on the final implementation. Node `/tmp/node24/bin/node` v24.11.1; uncommitted worktree symlinks reused the original `node_modules` and `.venv`, with no dependency edits. `PATH` includes the virtualenv for fast Python scripts. Browser executables were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` through `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Separate coverage files avoid artifact races. No retries, skipped suites, changed baselines or lowered floors.

| Command | Final result |
| --- | --- |
| `PATH="$PWD/.venv/bin:/tmp/node24/bin:$PATH" make test-fast` | PASS: doc/planning paths, boundaries, 111 Python script tests and 21 Node script tests; discovery is listing, not browser proof |
| `make lint-python` | PASS: 239 files formatted; Ruff 91 and suppressions 6 match existing baselines |
| `make typecheck-python` | PASS: mypy 82 findings match existing baseline |
| `COVERAGE_FILE=/tmp/sec04-finance.coverage ./scripts/coverage-gate.sh finance` | PASS: 159 tests; 82.23%, floor 81.03% |
| `COVERAGE_FILE=/tmp/sec04-server.coverage ./scripts/coverage-gate.sh server` | PASS: 357 tests; 74.27%, floor 61.53%; performance test 1 passed, Town p50 145.43ms |
| `make lint-web` | PASS: all existing ratchets and engine-purity check |
| `make typecheck-web` | PASS: all seven TypeScript configurations |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 502 tests |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 384 tests |
| `npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI` | PASS: 9 tests |
| `node --test packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs apps/finance/frontend/src/auth-ux.test.mjs` | PASS: 19 tests |
| `make e2e` (includes `make build-frontends`) | PASS: 207 tests, 5 existing unrelated skips; all 9 new rotation cases pass |
| `npx playwright test --config apps/media/e2e/playwright.config.ts` | PASS: 95 tests |
| `npx playwright test --config apps/travel/e2e/playwright.config.js` | PASS: 143 tests |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS: 109 tests |
| `npx playwright test --project=suite` | PASS: 31 tests |
| `git diff --check` | PASS |

Earlier failures were corrected and rerun: restore fixture initially changed only salt while retaining identical wrapped bytes (now changes the actual wrapped DEK and retains its conflict assertion); cancelled HTTP mocks cannot be flushed (now assert cancellation and retain real held-response browser proof); the login-lock test waited for an obsolete wrap GET (now asserts no credential request after lock). Browser fixtures now avoid unrelated automatic transaction reindexing, scope the Settings Finance link, wait for actual route disposal, and wait for sign-out's replacement document before settling the held response. Async wrong-current focus now enables the field before focusing. These failed attempts were not counted as passes.

Synthetic phone screenshots/traces live under `test-results/finance` only and are not committed. The new browser cases add no skips. Existing unrelated Finance viewport/platform skips remain reported explicitly by the full run.

## Handoff

- PR: https://github.com/Vivekpsps3/vivek-monorepo/pull/377; `Closes #269`, `Refs #121`. Opened only after all required local gates passed.
- Roadmap #134 scoped note: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6906371387. Root integration owner separately reconciles parent/queue/archive after merge.
- State at this evidence commit: PR open with complete required local verification; exact-head CI and merge pending. The PR and completion registry supply subsequent merged proof. No deployment/activation claim.
- Remaining external prerequisites: none for this leaf; all dependency contracts merged and verified. No deployment authorized.
- Next actor: SEC-04 worker verifies exact-head CI and merges under the user's authorization, explicitly verifies #269 closure, and sends proof to the root integration owner for parent/roadmap/archive reconciliation.
