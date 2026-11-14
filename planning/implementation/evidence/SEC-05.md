# SEC-05 — implementation evidence

- Leaf: [#270](https://github.com/Vivekpsps3/vivek-monorepo/issues/270); parent [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121) remains open. Restore is SEC-06 (#271), not delivered by this leaf.
- Agent/context: explicitly assigned recovery implementation agent; branch `agent/sec-05-recovery-20261114`, isolated worktree `/tmp/vivek-sec-05-recovery-20261114`.
- Base/current main: `0022c5ef8065e08892b6eecdfa6450158ee69ef6`. Implementation revision: `b70826bd676294a0e01d7fa9ad1b2c38d9a1b47a`. Verification covers this source content; the later evidence commit changes documentation only.
- Fresh-state checks: fetched main before starting and before delivery; no open PR or competing SEC-05/06 claim. [Scoped claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/270#issuecomment-6881756328) records branch/worktree/base. Shared Settings, lifecycle, snapshot and browser-fixture files were reserved with the coordinating parent agent.
- Prerequisites verified in actual merged source: CON-03 #350 (`04a5dac19356b3a6e6871a920b34fce0b843d08d`) supplies `COLLECTION_POLICY.recovery`, disjoint owner subsets, foreign/future preservation and parity checks; SAFE-03 #294 (`451297726db7807e5aa68d5040d924ced946952b`) supplies `createVaultRecordCapability` owner/lock-generation guards; SAFE-05 #335 (`a7e16c6fa5bd5543514081e0834022fe38dcd1d1`) supplies `openBoundedWork`, deadline/abort/disposal and late-publication tests. GitHub REST confirms all three PRs merged; the source and relevant regression suites are on current main. Historical evidence saying “PR open” is not treated as live status.

## Acceptance

| Row | Concrete proof | Result | Test/artifact |
| --- | --- | --- | --- |
| A01 | Real Settings export verifies the current passphrase locally, uses a separate password and recovers a marker from every one of the 14 server-allowed collections. Independent Node AES-GCM decoding verifies the authenticated header and complete counts; the encrypted file, requests, console and web storage contain no plaintext markers/passwords. Form passwords clear. Empty descriptors remain present. | PASS | `recovery-export.spec.ts` browser “Settings downloads every allowed collection…”; Finance Karma codec/adapter roundtrips; `test_all_collection_manifest_and_current_owner_only` |
| A02 | Whole-snapshot refusal for unknown collection, Finance schema 3, Health schema 1, ciphertext-size and record-count limits. Codec refuses unknown envelope/schema/KDF work, malformed descriptors/IDs/value, duplicates, count mismatch and per-record/file bounds; wrong password/header/ciphertext tampering fails authentication. No partial download. API size/version/session errors have specific safe UI status and never expose supplied server details. | PASS | Backend recovery snapshot tests (7); `recovery-bundle.spec.ts`; export spec “explains server size/version/session refusals…” and corrupt/oversized cases |
| A03 | Held snapshot subscription is cancelled; late held decrypts after lock/owner/logout/cancel/disposal never publish or read further rows. Held bundle encryption released after lock cannot download. Owner is checked again after held encryption even without an abort signal. One 120s deadline unsubscribes a hung snapshot. Actual Settings cancel/lock/route removal prevents a stale download and clears password fields. | PASS | Finance Karma `recovery-export.spec.ts`, `recovery-bundle.spec.ts`; browser held-read cancel/lock/disposal and held-encryption lock cases; `vault.service.spec.ts` held-wrap lock case |
| Deletion membership proof | A synthetic `future_review` registered in the owner policy appears in the recovery manifest and records without editing another name list. The generic codec exports its registered descriptor and roundtrips it. | PASS | `test_new_owner_registered_collection_needs_no_recovery_list`; export and codec future-collection fixtures |

`/vault/recovery-snapshot` reads one ordered owner-scoped database cursor, deriving
counts and schema descriptors from the existing collection contract. It returns
ciphertext only, has count/aggregate limits, and rejects unknown rows instead of
omitting them. Normal API middleware supplies `Cache-Control: no-store, private`.
The browser uses the SAFE-03 record adapter for decryption and SAFE-05 bounded
work for one action deadline. It never writes private recovery data or credentials
to a server, web storage, logs or temporary plaintext file. No key, protocol, AAD,
revision, schema migration, CSV receipt or Undo behavior changes.

The exact version-1 format, authenticated metadata ordering, KDF, bounds and a
synthetic compatibility body for SEC-06 are in
[Security](../../../docs/SECURITY_MODEL.md#portable-encrypted-recovery-export).
Owned byte buffers are zeroed and application plaintext references dropped on
abort/finally; JavaScript strings/browser-internal crypto copies cannot be
promised secure erasure. Already-running WebCrypto is uncancellable and its late
result cannot pass the publication gate.

## Deletion and compatibility

| Candidate | Baseline consumers | Surviving owner | Actual disposition | Proof |
| --- | --- | --- | --- | --- |
| Handwritten incomplete recovery membership or competing raw recovery export | No portable recovery exporter existed at the base. Searches of Finance crypto/services and Settings found CSV conveniences and existing import/Undo recovery tests, not another full-vault exporter. | `COLLECTION_POLICY.recovery` supplies membership; one `recovery-bundle.ts` codec and one `recovery-export.ts` action. | No fictitious orphan deletion. No new recovery membership literal. Existing owner subsets/parity checks remain intentionally distinct. | New-policy-collection fixture plus all-collection browser/API tests |
| Intentional CSV conveniences and domain import staging | Transactions, Holdings, bank receipts, custom CSV profiles and Fidelity staging | Existing export/import/store services | Retained unchanged. No second vault store or generic stage framework. | Full Finance Karma/Playwright; existing import resume, edited-row-safe Undo, revision and foreign-collection tests |
| One-shot empty-state text sample | Finance `empty-states.spec.ts` | Existing Playwright locator assertions | Replaced sampled `innerText` with awaited live locator assertions; every positive/negative text, axe and screenshot assertion retained. | All 10 affected tests; full Finance gate |
| Town fixed-clock visibility setup | Town check-in test 13 | Existing clock fixture and calendar assertions | Pause timer advancement during the synthetic wall-clock change, resume after the requested refresh. No deadline, request, date/timezone or unchecked-row assertion removed. No Town application behavior changed. | All 5 check-in spec cases; full Town gate |

- Classification: feature plus necessary privacy/lifecycle guards, not a simplification claim. No code moves, generated output, removed support or retired data format.
- Comparison base and replacement closure: `0022c5ef8065e08892b6eecdfa6450158ee69ef6`, all 20 files in implementation commit `b70826b`. `git diff BASE --numstat` gives production **+461/−5 (net +456)**, tests/fixtures **+576/−8 (net +568)**, guidance/documentation before this evidence **+85/−1 (net +84)**. Evidence documentation is additional. Production includes backend, crypto, public API, Settings template/styles/controller. No generated/bundled output is committed.
- New codec: 122 physical lines (1 blank, 2 comment lines); export action: 121 physical lines (2 blank, 1 comment). These are necessary new format/validation and bounded owner-scoped action code, not claimed savings.
- Equivalent recovery implementations before/after: 0 → 1. Persistent record/cache owners remain Finance persistence and Health store over the existing `VaultService`. New state is bounded, action-local bundle buffers and Settings form state; no persistent plaintext cache/store.
- New public entries: owner-authenticated bounded ciphertext snapshot; lazy Finance `exportFinanceRecovery`; mounted Settings form. One codec owns encode/decode. CSV entry points remain separate conveniences. One bounded deadline, abort listeners and owner/unlock subscriptions are disposed in the action/wrapper `finally`; Settings destruction aborts its action.
- Follow-up collection work edits the existing server owner policy and its intentional client boundary copies/parity contract, never a separate recovery list. SEC-06 consumes the same descriptor/codec contract and will supply destination staging/activation. No meaningful assertion or compatibility guarantee was deleted to meet a gate.

## Verification

Environment: `/tmp/node24/bin/node` v24.11.1; shared installed dependencies are
symlinked into the isolated worktree. Python is the existing checkout `.venv`
(Python 3.12). `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` use
`/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`.
Karma coverage is enabled; browser retries remain zero; floors/baselines unchanged.
Initial sandbox invocation failed before command execution (`bwrap` loopback
permission); commands then ran through approved escalation. This is not a test
failure or a skipped gate.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS; all doc/boundary/script checks and 21 Node tests. Rerun after final guidance/test edits. |
| `make lint-web` | PASS; existing ESLint baselines 469/9/1/0, engine purity 1/1. Initial new test `any` findings were fixed; no baseline raised. |
| `make typecheck-web` | PASS across all seven app/spec/package configurations. Initial codec return error fixed. |
| `make lint-python` | PASS; 227 files formatted; Ruff 101 and suppressions 6 match baseline. |
| `make typecheck-python` | PASS; mypy 87 matches baseline. |
| `./scripts/coverage-gate.sh finance` | PASS; 151 tests, 86.26% (floor 83.28%). |
| `./scripts/coverage-gate.sh server` | PASS; 887 tests, 79.10% (floor 61.53%), plus separate uninstrumented performance gate 1 pass. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS; 859/859. Statements 75.51%, branches 65.34%, functions 72.05%, lines 78.74%. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS; 716/716. Statements 82.73%, branches 69.64%, functions 82.67%, lines 86.41%. |
| `make build-frontends` | PASS, also executed by each `make e2e`; production bundle and release manifest generated locally. |
| `make e2e` | PASS on final implementation `b70826b`; production build/release manifest, 256 passed and the same 8 pre-existing conditional viewport/matrix skips. No recovery scenario skipped. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS; 79/79 after calendar fake-clock synchronization repair. |
| `npx playwright test --project=suite` | PASS; 30/30. |

Initial full Finance run: 255 passed, 1 render-sampling failure, 8 existing skips;
the snapshot already showed the expected empty-state content. Live locator
assertions fixed the synchronization while retaining all checks, and the affected
10-test spec and subsequent full gate passed. Initial Town full run: 78 passed,
1 date-refetch timeout. Trace showed a 200-header refresh aborted before its body
was readable. Its unchanged isolated diagnostic passed, demonstrating a timing
race; the explicit stable clock setup preserves all assertions and its complete
5-test spec passes. Final full-gate outcomes are recorded above when complete.
No failed/unrun check is treated as passing, no retry or threshold change added,
and no PR is opened until required final gates pass.

## Handoff

- PR: ready to open after all required local gates passed; closure keyword only `Closes #270`, reference #121 without closing it.
- Roadmap #134: append scoped note after PR creation; never overwrite the body/queue/parent ledger.
- Actual status: SEC-05 implementation committed and all required local verification passed; not merged, deployed, or an activated restore. SEC-06 dependency is still unmet because SEC-05 is not merged.
- Prepared SEC-06 design: `/tmp/vivek-sec-06-implementation-design.md` for the coordinating parent; no dependent application edits. Reuse codec/descriptors, local validation before writes, count/conflict preview, destination DEK encryption, default skip-ID merge, typed replace/pre-export offer, bounded idempotent ciphertext staging and one atomic activation. Preserve CSV receipts/Undo. An already accepted remote commit cannot be retracted by a later local abort; explicit activation semantics and late-publication guards must be stated and tested honestly.
- Next actor: open SEC-05 PR and append leaf/roadmap notes. Parent/user handles review/merge authorization. Only after verified merged SEC-05 (or an explicit approved workflow amendment) create a separate SEC-06 worktree and proceed.
