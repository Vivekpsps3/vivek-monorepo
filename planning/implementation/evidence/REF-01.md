# REF-01 — implementation evidence

- Leaf issue and parent(s): [#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219). Parents [#197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197), [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199), and [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) stay open.
- Agent/context, branch/worktree: REF-01 in `/tmp/vivek-ref-01`, branch `agent/ref-01`.
- Base main SHA: `3d02609e82fe487b108066cfaba622ee39a07a40`. Implementation commit: `f4b124f`. Gates below ran on that tree before this evidence SHA line was added.
- Fresh-main/prerequisite/active-PR checks: no open pull requests. CON-01 (#206), CON-02 (#207), CON-03 (#208), SAFE-03 (#203), SAFE-04 (#204), VER-01 (#209), and VER-02 (#210) are closed. Current main still has route parity (`apps/server/tests/test_route_parity.py`), collection policy (`scripts/check_collection_policy.py`), source inventory (`scripts/source_inventory.py`), and `bindLockNotices`.
- Selection: DEL-02 (#214) is first in `plan.py list --live` but is not eligible to delete. Login still offers “Migrate old account”, which calls `/auth/login/migrate` and `/auth/passwordless/enroll`, and Finance fixtures still sign in through that route. `assert_ready` checks revision compatibility only. The packet forbids ending that support without an explicit policy decision. REF-01 is the next open leaf. Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/219#issuecomment-6889682461

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | Three measured changes use existing owners. The category filter stays in the Activity query, component, and template. The TMDB fixture stays in `providers.py` `search` plus `test_bundle_m.py`. A collection name is three declarations, and recovery is their union. | PASS | Section 9 of `planning/technical-debt/feature-addition-playbook.md` |
| LOCAL2 | `ref01_probe` is registered only inside the Finance test and then removed. Upsert and delete return 400, the snapshot returns 422, and the ciphertext row remains. No production route, collection, or source file uses the probe name. | PASS | `apps/finance/backend/tests/test_ref01_extension_contract.py` and `apps/server/tests/test_ref01_extension_contract.py` |
| LOCAL3 | Timings below are wall clock on this machine for the named command. Python 3.12 is the repo `.venv`. Node is v24.22.2. Chrome is Playwright Chromium `CHROME_BIN`. | PASS | Scorecard in the same guide section |
| LOCAL4 | The guide points Cards at open DISC-02 (#265) and Sidequests at closed DISC-01 (#264). Neither recipe authorizes an app, a bank connection, or a provider credential. Parents stay open. | PASS | Guide sections 5, 6, and 9 |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Copied research checklist in the feature-addition playbook (58 numbered practices and the duplicate command narrative) | The playbook itself | [Verification](../../../docs/VERIFICATION.md), [Quality](../../../docs/QUALITY.md), [Architecture](../../../docs/ARCHITECTURE.md), root AGENTS, the deletion contract, and the workflow. Six primary-source links stay once. | Deleted the copied rules. The recipes for a field, page, SQL record, encrypted record, provider, and cross-domain view stay. | Doc-path gate. Guide section 9 names the links. |
| Duplicated verification command block in `docs/DEVELOPMENT.md` | Setup readers | `docs/VERIFICATION.md`. Setup (`make install`, `make dev`) stays in Development. The `npm test --prefix` forwarding sentence stays. | Replaced the second command table with links. | Same doc-path gate |
| Temporary `ref01_probe` collection registration | None. It was a measurement, not a caller. | The three existing declaration sites, unchanged | Added the name, parity passed in 0.32s, diff was +3/−2 across 3 files, then `git checkout` restored them. `rg` finds the name only in the proof tests, the lock spec, and this planning record. | `scripts/check_collection_policy.py` before and after revert |

- Candidate class: stale copied docs, plus a disposable proof that must not remain in production. Protected counterexamples (ciphertext, revision conflict, unknown-collection preservation, route 404 ownership, and source-inventory gaps) stay.
- Comparison base SHA: `3d02609e82fe487b108066cfaba622ee39a07a40`. No production file under `apps/` or `packages/` changed. New tests are the Finance vault proof, the server route/discovery proof, one category-filter spec, and one lock-unsubscribe spec.
- Production added/deleted/moved: 0 / 0 / 0.
- Independent equivalent implementations before/after: one feature guide instead of a guide plus a second copied checklist and a second command table. Collection recovery remains one derived union.
- State/cache owners and public entry points before/after: unchanged. No new route, collection, package, or registry.
- Remaining old symbol/path search: `ref01_probe` and `ref01-probe` are absent from production source. They exist only as assertions that the unregistered name fails.
- Follow-up change: a new encrypted collection still edits the server owner subset, the Health owner list, and `FINANCE_FOREIGN_COLLECTIONS`, then `scripts/check_collection_policy.py`.
- Tests/docs/generated changes separately: two new test modules (145 and 47 lines) plus spec additions (lock +10, activity query +28/−2). Planning/docs net is the playbook 46/−197, Development 2/−13, Architecture +2, bank-import +2, and this file.
- Net production delta: 0. The doc deletion is the copied checklist, not a production-line claim. No safety exception is required for production size.
- No behavior/data/meaningful assertion silently removed: bank-import refund, receipt, and parser rules stay in `docs/ADDING_A_BANK_IMPORT.md`. Coverage floors were not changed. The Finance and server coverage notices suggest higher floors; they were not applied.

## Verification

`PATH` put `/tmp/vivek-ref-01/.venv/bin` and `/tmp/node-v24/bin` first. `CHROME_BIN` was `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. An earlier `make test-fast` used system `python3` and failed in `scripts/test_restore_drill.py` with `ModuleNotFoundError: alembic` before any assertion. That run is not a result. The passing `make test-fast` below uses the project virtualenv.

A Finance test that imported `apps.server.tests.test_route_parity` failed `check-shared-boundaries`. The route and discovery assertions moved to the server test. The vault round trip stayed in the Finance test. The passing boundary check is the rerun below.

The one-file Karma include with coverage enforcement exited 1 after 3 SUCCESS because the global coverage floor applies to a partial include. That command is not a gate. The targeted filter check below turns coverage off. The full Finance Karma run is the gate.

| Command | Result |
| --- | --- |
| Activity filter: `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI --code-coverage=false --include='**/transactions-activity-query.spec.ts'` | PASS, exit 0. 4 SUCCESS. Wall 6.85s. |
| Provider fixture: `pytest apps/media/backend/tests/test_bundle_m.py::test_public_tmdb_search_page_reads_cards_and_skips_adult_titles` | PASS. 1 passed in 0.18s. Wall 0.79s. |
| Collection registration experiment, then revert | PASS. Policy script 0.32s while the name was registered and again after revert. |
| Vault proof, focused | PASS. 1 passed in 0.81s before the route half was split. Both proof tests then passed together in 0.85s. |
| `make test-fast` | PASS. Doc paths, 95 packets, boundaries, finance UX gate, 110 unittest cases, e2e discovery guard, 21 Node tests. |
| `make lint-python` | PASS. 236 files formatted. Ruff 101. Suppressions 6. Baselines not raised. |
| `make typecheck-python` | PASS. mypy 87. Baseline not raised. |
| `./scripts/coverage-gate.sh finance` | PASS. 171 passed. Total 87.10% against floor 83.28%. Floor not changed. |
| `./scripts/coverage-gate.sh server` | PASS. 919 passed. Total 79.14% against floor 61.53%. Uninstrumented `GET /api/town` p50 133.31ms. Floor not changed. |
| `make lint-web` | PASS. eslint-finance 467, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Engine purity 1 pass. |
| `make typecheck-web` | PASS. All seven `tsc -p` projects. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS, exit 0. 874 SUCCESS. Statements 75.51%, branches 65.33%, functions 71.83%, lines 78.75%. |

No page, route, or template changed, so this was not exercised in a browser session. The category filter and the disposable lock subscriber ran in Finance Karma.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/370 (`Closes #219` only).
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6889821475
- Merged/activation status: not merged and not deployed. Required checks on the pull request are the next evidence.
- Remaining external prerequisites or approved scope decisions: none for this leaf. DEL-02 still needs an explicit support decision before password-migration routes can be removed. Cards and Sidequests stay discovery, not implementation.
- Next actor: review and required checks, then squash-merge because this task was authorized to merge when checks are green.
