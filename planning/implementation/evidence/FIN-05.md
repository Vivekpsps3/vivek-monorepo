# FIN-05 — implementation evidence

- Leaf issue and parent(s): #224. Parent #65 stays open. Retained Finance race rows from #128 stay open as a reference and are not closed by this leaf.
- Agent/context, branch/worktree: FIN-05 in `/tmp/vivek-fin-05`, branch `agent/fin-05`.
- Base main SHA, current tested SHA: base `04a5dac19356b3a6e6871a920b34fce0b843d08d` (CON-03). Gates below ran on this working tree immediately before the evidence commit.
- Fresh-main/prerequisite/active-PR checks: #224 was claimed before edits. CON-03 is the base and its collection policy was not redone. No open pull request overlapped the Finance vault, import, or transaction files at claim time.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FQA1 failed rewrite propagation | `rejects a queued save when the legacy rewrite fails and does not post that save` holds `updateAsset` of asset `Queued` while the schema-1 rewrite is in flight. The read retry and the write retry are both silent posts of `asset-1` at `expected_revision` 3. The name `Queued` is never encrypted. The save rejects and the fallback toast fires once. | PASS | `vault-load-silence.spec.ts` in Finance Karma |
| FQA1 queued rewrite upsert | Same test, plus the existing `applies two saves of another record in call order while a rewrite is in flight`, which flushes the rewrite before either user post and keeps call order. | PASS | `vault-load-silence.spec.ts` |
| FQA1 422 / session-change toasts | `does not toast a 422 that arrives after the session changes` clears the session, flushes 422, expects `Vault session changed`, and expects no toast and no reload GET. `toasts a 422 from a normal write and stays quiet for a silent write` still toasts the live session once. | PASS | `vault-load-silence.spec.ts` |
| FQA1 bank/brokerage lock lookup | `FQA1 a locked bank or brokerage lookup throws and does not return the cached rows` returns Checking and mask `9999`, then rejects both getters with `Vault locked` after the vault object locks. `does not deliver bank or brokerage accounts after a lock` releases the lookups after `clearSessionState` and publishes nothing. `clears cached bank accounts when a refresh hits a locked vault and keeps them on other errors` clears the workflow list on `Vault locked` and keeps Chase on `offline`. | PASS | `fin-05-races.spec.ts`, `finance.service.spec.ts`, `transactions-import-workflow.spec.ts` |
| FQA1 deleteHolding routing | `FQA3 deletes a holding without removing the transaction that shares its id, then reloads` sends DELETE `holdings` / `holding-1` and leaves both transactions. `FQA3 deletes a transaction without removing the holding that shares its id, then reloads` sends DELETE `transactions` / `txn-1` and leaves both holdings. | PASS | `fin-05-races.spec.ts` |
| FQA1 pre-queue brokerage-stage snapshot | `builds the replacement from holdings observed after the queued edit` waits until holding id 5 is visible inside the queue, writes that id with shares 4, and does not write the preallocated id 99. | PASS | `encrypted-store.record-queue.spec.ts` |
| FQA2 held rewrite and owner switch | Unit: `does not toast a 422 that arrives after the session changes`; `does not activate or write holdings after the session changes while the snapshot waits` sets the session to 2 before release, rejects with `Vault session changed`, writes no holdings, and does not record `activated`. `does not publish a holding or transaction delete into the next session` resolves both deletes after `clearSessionState` and does not call the publishers. Browser: `FQA2 a held legacy rewrite released after lock does not toast or replace the next session` holds the schema-1 `Cash marker` upsert, locks, releases it, unlocks again, and still shows one Cash marker, one Tea marker, and VOO id 9, with no fallback toast. | PASS | unit specs above; `e2e/fin-05-races.spec.ts` inside `make e2e` |
| FQA3 holding versus transaction delete | Service/API rows above. Browser: `FQA3 deleting a holding then a transaction leaves the other records after reload` deletes MSFT, reloads, leaves VOO, deletes Bakery, reloads, leaves Tea marker and Cash marker. Delete bodies are `holdings` then `transactions`. | PASS | `fin-05-races.spec.ts`; `e2e/fin-05-races.spec.ts` |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Pre-queue `getStoredHoldings` then `savePreparedHoldings` in holding activation | Brokerage stage port and `EncryptedStoreService` wiring | `EncryptedRecordPersistence.commitHoldingReplacements`, which locks current holding ids plus the preallocated ids, re-reads inside `withRecordUpdates`, and writes only when the id set and session still match | Both port methods removed. Callers use `commitHoldingReplacements`. | Stage queue test and session-abort test |
| 422 toast before the session check in `persistUpsert` | Every encrypted upsert | The same `persistUpsert`. A generation mismatch throws `Vault session changed` before the toast or a 409 reload. | The early toast branch is gone. A 422 on the live session still toasts once. | Session-change 422 test; live 422 test |
| Import refresh that kept the previous bank list on `Vault locked` | `transactions-import-workflow` bank fork | `lookupOrClear`: `Vault locked` and `Vault session changed` become `[]`; any other error stays `null` so the previous list remains | The single catch-all that treated lock like an offline error is gone. | Workflow lock and empty-lookup tests |
| Eight-attempt `reloadCollectionSnapshot` loop | Reload versus a local version bump | Same loop | Retained. It is the snapshot owner for reload, not a per-operation rewrite fallback. | Existing reload tests in the 830 Finance Karma run |

- Candidate class and protected counterexamples: stale per-operation snapshot and error branches. `FINANCE_COLLECTIONS`, `FINANCE_FOREIGN_COLLECTIONS`, and `isFinanceOwned` stay as CON-03 left them. No new cipher, AAD, or staging engine. Bank-import parsers and the custom-CSV mapper were not edited.
- Comparison base SHA and full replacement closure: `04a5dac19356b3a6e6871a920b34fce0b843d08d`. Closure is `encrypted-store.persistence.ts`, `encrypted-store.brokerage-stages.ts`, `encrypted-store.service.ts`, `finance.service.ts`, and `transactions-import-workflow.ts`.
- Production added/deleted/moved: persistence +40, brokerage stages +18/−13, store service +4/−2, finance service +8/−2, import workflow +14/−2. App production net +65. No moves.
- Independent equivalent implementations before/after: one holdings replacement writer. The pre-queue snapshot read and the later prepared save were two steps; one queue-owned commit remains. One upsert error path. One bank-lookup recovery path.
- State/cache owners and public entry points before/after: bags, record queues, and reload queues are unchanged. `deleteHolding` and `deleteTransaction` still publish only for the session that started them. Bank and brokerage lists still come from the store, and both now refuse a locked vault.
- Remaining old symbol/path search: `getStoredHoldings` and `savePreparedHoldings` have no remaining matches. `commitHoldingReplacements` is the live entry.
- Follow-up change: none in this leaf. FIN-04 still owns the custom CSV adapter. #65 and #128 stay open.
- Tests/docs/generated changes separately: `fin-05-races.spec.ts` 130, `e2e/fin-05-races.spec.ts` 87, `vault-load-silence.spec.ts` +48, `encrypted-store.record-queue.spec.ts` +138/−2, `finance.service.spec.ts` +51, `transactions-import-workflow.spec.ts` +48/−1, `synthetic-vault.ts` +9/−4. Test and e2e net +504. Schema-1 synthetic seeds set the wire version only and skip AAD; schema 2 seeds are unchanged. This file is the documentation change. `apps/karma.conf.js` was restored and is not in the diff.
- Net production delta and specific reviewed safety/compatibility exception if positive: app production +65. The increase is the queue-owned holding replacement and the session check that drops a late 422, lock lookup, or delete publish. Those are the residual race fixes. No second writer was added.
- No behavior/data/meaningful assertion silently removed: existing rewrite order, silent-load, 409, lock-epoch, and delete-undo assertions remain in the Finance Karma and Playwright runs. The stage harness builds through `commitHoldingReplacements` and still asserts the queued holding id.

## Verification

`CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `PYTHON` was `/home/vivek/Deployments/vivek-monorepo/.venv/bin/python`. Karma used port 9998 only for the runs; `apps/karma.conf.js` was reverted and is not part of the diff. `./scripts/coverage-gate.sh finance` was not run: the diff has no Python backend files. The launch profile `finance_front` does not include it.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS, including this evidence file. 98 Python tests, doc paths, blame, shared boundaries, and e2e discovery |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0 |
| `make typecheck-web` | PASS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 830 SUCCESS. Statements 75.63%, branches 65.04%, functions 72.34%, lines 78.79% |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 714 SUCCESS. Statements 83.19%, branches 70.14%, functions 82.81%, lines 86.87% |
| `make e2e` | PASS. Production bundle written, then Finance Playwright 247 passed, 8 skipped, including both `fin-05-races.spec.ts` cases |

## Handoff

- PR URL (leaf closure keyword only): pending the commit that contains this file. The pull request will use `Closes #224` only.
- Roadmap #134 append-only status-note URL: pending the pull request.
- Merged/activation status: not merged. Not a deployment.
- Remaining external prerequisites or approved scope decisions: #65 and #128 stay open. FIN-04 owns the custom CSV adapter.
- Next actor: open the pull request, append the #134 note, wait for Backend, Frontend, Unified Site Release, and Playwright, then squash-merge.
