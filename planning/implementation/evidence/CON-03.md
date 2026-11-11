# CON-03 — implementation evidence

- Leaf issue and parent(s): #208; parents #197 and #121 stay open. SAFE-03 (#203) is already merged and was not redone.
- Agent/context, branch/worktree: CON-03 in `/tmp/vivek-con-03`, branch `agent/con-03`
- Base main SHA, current tested SHA: base `85212152bda3ce6cab5cbfcc9c787b564214fc69`. Gates below ran on this working tree immediately before the evidence commit.
- Fresh-main/prerequisite/active-PR checks: #208 had no prior claim. SAFE-03 (#203) is closed. No open pull request overlapped `vault-collection-policy`, `finance-persistence`, `health-store`, or `server-vault`.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | `test_local1_accepted_name_absent_from_policy_fails` adds `future_private` to the server-accepted set and leaves it out of the owner/recovery policy. `scripts/check_collection_policy.py` `evaluate` and `assert_collection_contract` both fail with that name. | PASS | `apps/finance/backend/tests/test_collection_policy.py` inside `./scripts/coverage-gate.sh finance` |
| LOCAL2 | `test_local2_owner_subsets_differ_and_allowed_records_stay` requires disjoint, different Finance and Health subsets, stores one schema-2 ciphertext per accepted collection, and reads those ciphertexts and revisions back. Health spec `LOCAL2` decrypts only `health_stats` and `health_prs` and leaves the Finance ciphertext untouched. Finance persistence still decrypts only Finance rows. | PASS | same Python test; `health-store.service.spec.ts` in web Karma; `encrypted-store.persistence.spec.ts` in Finance Karma |
| LOCAL3 | Finance persistence spec `LOCAL3` loads a schema-1 `future_private` row beside Finance and Health rows. Decrypt and upsert touch only Finance client ids; delete is not called; the unknown ciphertext and revision stay 4. Health spec `LOCAL3` loads and `createStat`s without listing, decrypting, deleting, or rewriting `future_private`. `test_local3_unknown_row_survives_list_save_and_rejected_delete` keeps a directly stored future row through a known upsert and rejects deleting it as an unknown collection. | PASS | Finance and web Karma specs above; `test_collection_policy.py` |
| LOCAL4 | `test_local4_current_schema_record_stays_readable` reads a schema-2 transaction, updates it with `expected_revision` 1 to revision 2, and a stale `expected_revision` 1 returns 409 without changing the saved ciphertext or revision. Existing vault revision tests in `test_vault_encryption.py` still pass in the finance coverage gate. | PASS | `test_collection_policy.py`; finance coverage gate, 144 passed |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Flat `ALLOWED_COLLECTIONS` literal of every name | `validate_collection`, `collection_counts` | `COLLECTION_POLICY` Finance and Health subsets. `ALLOWED_COLLECTIONS` is their recovery union. | The single flat literal is gone. Accept membership is derived, then checked by `assert_collection_contract`. | LOCAL1 and LOCAL2 |
| `EncryptedCollection` union literal and the `bags` object keys | Finance persistence load, save, and reload | `FINANCE_COLLECTIONS`. The type is `typeof FINANCE_COLLECTIONS[number]`. Bags are built from that array. | Both duplicate literals removed. | persistence spec, including LOCAL3 |
| `collection.startswith("health_")` schema rule | vault upsert | `collection in COLLECTION_POLICY.health` | Prefix membership removed. Health records still require schema 2. | `test_health_collections_reject_schema_version_other_than_two` |
| Separate `HEALTH_STATS_COLLECTION` / `HEALTH_PRS_COLLECTION` string literals | Health store list, decrypt, upsert, and delete | `HEALTH_OWNER_COLLECTIONS`. The two constants are indexes of that array, not a second spelling. | The two string literals removed. | Health LOCAL2 and LOCAL3; parity script |
| `FINANCE_FOREIGN_COLLECTIONS` | Finance load and persisted reads, so Health ciphertext is not decrypted | Same export. It is the language-boundary copy of the Health owner subset, with the distinct job of refusing those names even if a Finance bag is added. | Retained and parity-checked. Not folded into the Finance bag list. | `test_foreign_copy_must_match_the_health_subset`; `test_live_collection_policy_parity_script` |

- Candidate class and protected counterexamples: duplicate live membership lists. Owner subsets stay different on purpose. No new collection, wire format, AAD, key, or dynamic client accept list. `seed_dev_db.py` `COLLECTIONS` remains a partial dev seed sample, not the vault policy. `wipe_encrypted_user_data` remains account deletion and is not a name list.
- Comparison base SHA and full replacement closure: `85212152bda3ce6cab5cbfcc9c787b564214fc69`. Closure is `encrypted_storage.py`, `encrypted-store.persistence.ts`, `health-store.service.ts`, and `scripts/check_collection_policy.py`.
- Production added/deleted/moved: `encrypted_storage.py` +72/−7, `encrypted-store.persistence.ts` +38/−30, `health-store.service.ts` +4/−2. App production net +75. No moves. The Python increase is the owner policy and `assert_collection_contract`. The persistence increase replaces two name lists with one array, a derived bag builder, and `isFinanceOwned`.
- Independent equivalent implementations before/after: one server accept set, now derived from two owner subsets. One Finance bag list. One Health owner list. The Finance foreign set remains a checked copy, not a second codec.
- State/cache owners and public entry points before/after: Finance bags and Health in-memory stats/PRs are unchanged. `ALLOWED_COLLECTIONS` remains the server accept and recovery enumeration set.
- Remaining old symbol/path search: `startswith("health_")` is gone from vault upsert. `FINANCE_FOREIGN_COLLECTIONS`, `HEALTH_STATS_COLLECTION`, and `HEALTH_PRS_COLLECTION` remain as the documented boundary copy and the Health call-site names.
- Follow-up change: a new private collection needs the Python owner subset and the matching client list (`FINANCE_COLLECTIONS`, or `HEALTH_OWNER_COLLECTIONS` plus `FINANCE_FOREIGN_COLLECTIONS`). The parity script fails until those copies agree. SEC export/restore UI is still out of scope.
- Tests/docs/generated changes separately: tests added `test_collection_policy.py` (314 lines), persistence spec +84, health spec +50. This evidence file is the documentation change. Generated build output is not committed. `scripts/check_collection_policy.py` is 85 lines and is the cross-language check, not an app store.
- Net production delta and specific reviewed safety/compatibility exception if positive: app production +75. The increase is the explicit contract and the derived bag builder. Duplicate membership literals were removed; the language-boundary copies stay because Finance and Health do not share a runtime module.
- No behavior/data/meaningful assertion silently removed: unknown collections are still rejected on write, Health schema 2 is unchanged, Finance legacy schema 1 still upserts, revisions and ciphertext round-trips are unchanged, and unknown or foreign rows are still not decrypted or deleted by the other owner.

## Verification

`CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` were `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `PYTHON` was `/home/vivek/Deployments/vivek-monorepo/.venv/bin/python`. Karma used port 9994 only for the runs; `apps/karma.conf.js` was reverted and is not part of the diff.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS |
| `make lint-python` and `make typecheck-python` | PASS. Ruff 101, suppressions 6, mypy 87 match their baselines |
| `./scripts/coverage-gate.sh finance` | PASS. 144 passed. Total coverage 86.15% (floor 83.28%). Notice: measured rose from 84.37%; floor was not changed |
| `./scripts/coverage-gate.sh server` | PASS. Total coverage 87.28% (floor 61.53%), including the server perf gate. Floor was not changed |
| `make lint-web` | PASS. eslint-finance 469, eslint-site 9, eslint-packages 1, eslint-world-engine 0 |
| `make typecheck-web` | PASS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 819 SUCCESS. Statements 75.51%, branches 65.06%, functions 72.03%, lines 78.65% |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 714 SUCCESS. Statements 83.25%, branches 70.21%, functions 82.81%, lines 86.92% |
| `make e2e` | PASS. Production bundle written, then Finance Playwright 245 passed, 8 skipped. This run includes `make build-frontends` |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS on the rerun, 79 passed. The first run timed out one Town visibility refetch (`town-checkin.spec.ts` “13”) after 60s while the other 78 passed. That test alone then passed in 727ms. It waits on `/api/town` after a clock jump and does not use the collection policy. The full config was run again and passed |
| `npx playwright test --project=suite` | PASS. 26 passed |

## Handoff

- PR URL (leaf closure keyword only): not opened yet. The pull request will use `Closes #208` and will name parents #197 and #121 without closing them.
- Roadmap #134 append-only status-note URL: not posted yet.
- Merged/activation status: not merged. Not a deployment. No SEC export/restore UI.
- Remaining external prerequisites or approved scope decisions: parents #197 and #121 stay open. A future SEC packet owns restore. No new collection shipped here.
- Next actor: open the pull request, append the #134 note, wait for Backend, Frontend, Unified Site Release, and Playwright, then squash-merge.
