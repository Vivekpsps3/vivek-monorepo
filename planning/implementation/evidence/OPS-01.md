# OPS-01 — implementation evidence

- Leaf issue and parent(s): [OPS-01](../issues/OPS-01.md) / [#272](https://github.com/Vivekpsps3/vivek-monorepo/issues/272). Parent [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125) stays open.
- Agent/context, branch/worktree: OPS-01 in `/tmp/vivek-ops-01`, branch `agent/ops-01`.
- Base main SHA, current tested SHA: worktree started at `0ed83e95a3727acc4f512dd2ac77211d8a622407`. `origin/main` had moved to `c252b4db5c799d9b26c6be38f01e07c4e78eff87` (#319) before edits; this branch fast-forwarded to that commit. Product revision under test: `c660e3c254df04496ebf2ed76223b68db0e6367a`.
- Fresh-main/prerequisite/active-PR checks: no packet dependencies. Open PR #319 touched `.github/workflows/ci.yml` and merged before editing, so this branch contains that Node install change and does not edit `ci.yml`. No other open PR claimed `deploy.yml`, `ops/actions-runner/`, or the operations docs at implementation time.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| A01 | Read-only GitHub settings for `c252b4db5c799d9b26c6be38f01e07c4e78eff87`, compared with `ci.yml`, `deploy.yml`, `register.sh`, and `compose.yml`. Trusted pushes and same-repository pull requests request `monorepo-ci` or `monorepo-ci-release`. Other pull requests request `ubuntu-latest`. Deploy requests `monorepo-prod` only when its job condition passes. | PASS | `ops/actions-runner/test_routing.py` routing and doc tests; redacted API snapshot below |
| A02 | Fork or missing head repository does not receive trusted or production labels. A failed, pull-request, or fork `workflow_run` does not pass the deploy condition. A manual run whose latest push CI failed is rejected even when an older success exists. A stale SHA, a non-SHA, an empty run id, a missing rehearsal, and a later failed rehearsal are rejected. Checkout still requires the resolved SHA. Rollback still restores the previous image definition. | PASS | `python3 -m unittest ops/actions-runner/test_routing.py` (10 tests) and `scripts/test_deploy_site.py` inside `make test-fast` |
| A03 | `pool.sh` and `register.sh` are the pool commands. `compose.yml` owns CPU, memory, and log caps. `OPERATIONS.md` owns release, rehearsal, rollback, the manual pin review, and diagnostics. `LOCAL-RUNNER.md` no longer copies the deploy procedure or a host inventory. No Dependabot file and no second logger were added. | PASS | `test_one_command_owner_and_no_copied_host_authority` and `test_published_docs_do_not_carry_secrets_or_new_addresses` |

### Redacted settings snapshot

Collected with read-only `gh api` after the fast-forward, for repository `Vivekpsps3/vivek-monorepo`, default branch `main`, visibility public. No tokens, addresses, runner names, or online/offline host state are recorded.

| Check | Result |
| --- | --- |
| Branch protection | HTTP 404, branch not protected. The endpoint exists; the setting is absent. |
| Rulesets | Empty list. |
| Production environment | Present. No protection rules, no wait timer, no deployment branch policy. Admins can bypass. |
| Actions permissions | Enabled. All actions allowed. SHA pinning is not required by the setting. Workflow files pin the actions they use. |
| Workflow token | Default permission `read`. The token cannot approve pull requests. |
| Fork-approval route | HTTP 404. The public API does not expose that setting here. |
| Actions access policy | HTTP 422. The policy applies only to internal and private repositories. |
| Runner groups | HTTP 500 with an empty body. Group restriction is unverified. |
| CODEOWNERS | HTTP 404 at `.github/CODEOWNERS` and `CODEOWNERS`. |
| Dependabot config | HTTP 404. No `.github/dependabot.yml` in the tree. |
| Registered label sets | 5 runners: 3 with `self-hosted`/`Linux`/`X64`/`monorepo-ci`, 1 with `monorepo-ci-release`, 1 with `monorepo-prod`. |
| CI for `c252b4db` | Latest same-repository push run concluded `failure` (Playwright). Backend, Frontend, and Unified Site Release concluded `success`. |
| Deploy for `c252b4db` | Workflow run concluded `skipped`. This change did not deploy. |

`gh api --jq` with `@tsv` on that push run returned the latest conclusion `failure`, which is the value the manual guard now requires.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Competing runner and deploy instructions, including the copied host-capacity figures and the release procedure repeated in `docs/LOCAL-RUNNER.md` | Operators reading `LOCAL-RUNNER.md`, `OPERATIONS.md`, and `docs/SRE-FOLLOWUPS.md` | Commands: `ops/actions-runner/pool.sh` and `register.sh`. Resources: `ops/actions-runner/compose.yml`. Routing: `.github/workflows/ci.yml` and `deploy.yml`. Release, rollback, pin review, and diagnostics: `docs/OPERATIONS.md` | Removed the copied host inventory and the second release procedure from `LOCAL-RUNNER.md`. Shortened the SRE items so they point at those owners. No runner script was unreferenced, so none was deleted. | `test_one_command_owner_and_no_copied_host_authority`; `git diff --numstat c252b4db..c660e3c` |

- Candidate class and protected counterexamples: duplicate live policy in the docs. Exact-tested-SHA checkout, seeded rehearsal, migration-before-start, and image rollback stay. No protocol, money, or date meaning changed.
- Comparison base SHA and full replacement closure: `c252b4db5c799d9b26c6be38f01e07c4e78eff87`. Closure: `.github/workflows/deploy.yml`, `Makefile` (test discovery only), `docs/LOCAL-RUNNER.md`, `docs/OPERATIONS.md`, `docs/SRE-FOLLOWUPS.md`, `ops/actions-runner/test_routing.py`.
- Production added/deleted/moved: `deploy.yml` +16 / -5, net +11. Three of the added lines are comments. Moved 0. `ci.yml`, `compose.yml`, `pool.sh`, `register.sh`, `entrypoint.sh`, and `Dockerfile` are unchanged.
- Independent equivalent implementations before/after: release steps were stated in both `LOCAL-RUNNER.md` and `OPERATIONS.md`; capacity numbers were copied from Compose into the runner doc. After this change, each of those has one owner.
- State/cache owners and public entry points before/after: no new controller, daemon, ledger, or state file. `pool.sh` remains `start`, `stop`, and `status`. `register.sh` remains `release` and `worker`. Deploy still calls `scripts/deploy-site.sh` with the resolved SHA.
- Remaining old symbol/path search: `deploy-site.sh` remains in `deploy.yml`, `docs/OPERATIONS.md`, and `scripts/deploy-site.sh`. It is not in `docs/LOCAL-RUNNER.md`. `pool.sh` is not in `docs/OPERATIONS.md`.
- Follow-up change: which production files and independent policy owners now need editing: a routing change edits the workflow `runs-on` expression and `register.sh` labels together. A release rule edits `deploy.yml` and `docs/OPERATIONS.md`. A capacity change edits `ops/actions-runner/compose.yml` only.
- Tests/docs/generated changes separately: tests +438 (`ops/actions-runner/test_routing.py`) and Makefile +1/-1. Docs +74/-121, net -47. No generated bundle is committed.
- Net production delta and specific reviewed safety/compatibility exception if positive: production net +11 in `deploy.yml`. The addition is the safety guard: a manual deploy uses the latest push run for that SHA, and the rehearsal conclusion is the last matching step. The previous `status=success` query accepted run id 1 in a fixture whose newer run had failed.
- No behavior/data/meaningful assertion silently removed: `scripts/test_deploy_site.py` still covers wrong checkout, failed build, backup or migration failure, and previous-image rollback. Those tests passed inside `make test-fast`.

## Verification

| Command | Tested revision | Result |
| --- | --- | --- |
| `make test-fast` | First attempt on the dirty tree, before `npm ci` | FAIL. `check-shared-boundaries` could not import `typescript` because the worktree had no `node_modules`. |
| `npm ci` in the worktree | Same tree | Completed. Not a product gate. |
| `make test-fast` | Rerun after `npm ci`, then contained in `c660e3c` | PASS. Doc paths OK. Planning validation 94 packets. Unittest 63 OK, including 10 routing fixtures and `scripts/test_deploy_site.py`. Node script tests 15 pass, 0 fail. |
| `make lint-python` | Same tree | PASS. Ruff 101 findings match the baseline. Suppressions 6 match the baseline. |
| `make typecheck-python` | Same tree | PASS. Mypy 87 findings match the baseline. |
| `node scripts/test-release-manifest.mjs` | Same tree | PASS. |
| `make docker-build` | Image label `org.opencontainers.image.revision=c252b4db5c799d9b26c6be38f01e07c4e78eff87` because this commit did not exist yet. App sources match that parent. | PASS. |
| `make test-suite-routes` | That image | PASS. Unified checks passed. |
| `make db-validate-seeded` | Same image and parent | PASS. Modes `adopt` and `upgrade`. Upgrade schema diff empty. Smoke routes returned 200. |
| `./scripts/coverage-gate.sh server` | Same tree | PASS. 874 passed, 2 xfailed. Total coverage 80.63%. Required floor 61.53% reached. The suggested floor increase was not applied. |

`python3 planning/implementation/plan.py launch OPS-01` printed the commands above plus the duplicate lint and typecheck entries from the two profiles. Each distinct command is listed once.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/323 (`Closes #272`). Parent #125 is referenced and stays open.
- Roadmap #134 append-only status-note URL: https://github.com/Vivekpsps3/vivek-monorepo/issues/134#issuecomment-6786265102
- Merged/activation status: not merged. Not deployed. The deploy workflow for `c252b4db` was skipped. No off-host destination or notification path was configured.
- Remaining external prerequisites or approved scope decisions: branch protection, rulesets, CODEOWNERS, production-environment reviewers, a deployment branch policy, fork-approval confirmation, and runner-group policy remain unset or unreadable. Automated advisory delivery and an external notification destination stay unresolved. Parent #125 stays open.
- Next actor: integration owner after merge. Merge is not done.

No unstated decision from this context is necessary to continue.
