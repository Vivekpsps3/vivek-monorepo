# ROOM-01 — implementation evidence

- Leaf issue and parent(s): [#451](https://github.com/Vivekpsps3/vivek-monorepo/issues/451) ROOM-01. Parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stays open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-01`; `/tmp/vivek-room-01`. The shared checkout was not edited. Town, Health, Travel, Media, and server product files were not edited. GAME-10 arrived through the fast-forward below and those files were left as merged.
- Base main SHA, current tested SHA: product and tests are the worktree on `df970e356ce8be8198b5bd3fa5543d359b2943d2` plus this leaf. Every gate below ran in `/tmp/vivek-room-01` on that tree. `origin/main` was fetched again before the note and was still `df970e35` (GAME-10, pull request #598). The branch started at `26dc5f33dffdd384b34d089d150dd3d8e1f71159` (ROOM-14, pull request #597). `origin/main` then moved to `df970e35`. That update is a fast-forward merge. No rebase and no force-push.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441, merge `57b69462`, pull request #555) and FUX-02 (#391, merge `850353ed`, pull request #526) are ancestors of `df970e35`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/451#issuecomment-7110141649). `packages/ui` return-context was not edited, so a vault unlock from the hall returns to `/finance/have` and the hall starts hidden again.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-01-A1 | Synthetic Harbor checking `asset:11`, a zero savings account, Harbor card `debt:21`, and VOO. Unlock the checking drawer. The editor opens that same account: name Harbor checking, value 1200, date 2026-10-01, notes Statement, review interval 0. The card stays Hidden. | PASS | `accounts-hall.component.spec.ts` and `accounts-hall.spec.ts` unlock at 390 and 1280, light and night. |
| ROOM-01-A2 | Same records, automatic price check off, published total `$1,250.00`. Save checking as 1399.25. The hall amount and total each change once, to `$1,399.25` and `$1,449.25`. The accounts list shows the same checking row and hero. One upsert. Lock balances, and a later Lock Finance, clear the hall digits immediately. The stored balance stays. | PASS | Playwright edit journey. Mutation observers on `data-hall-amount` and `data-hall-total` each see one change. `vault.mutations` stays one upsert. |
| ROOM-01-LIFE | A held checking save is replaced by a debt draft. The debt save fails and keeps 80. The late checking response does not toast. Lock, then a late assets and net-worth stream, leaves no digits. A second page holds the upsert, locks, and the late 503 does not restore the unpublished name or the digits. | PASS | Component spec held-response case. Playwright `a drawer save that finishes after lock cannot restore its draft or digits`. |
| ROOM-01-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. Drawer and link targets are at least 44px. Axe violations on `app-accounts-hall` are empty before and after an invalid `-20` correction. Escape returns focus to the drawer and writes nothing. No horizontal scroll. Animations in the hall are 0. | PASS | Four Playwright viewport journeys. Screenshots stayed in the Playwright attachments and were not committed. |

Fixtures are synthetic. Names, categories, and source dates stay visible so a drawer can be chosen. Amounts stay hidden until that drawer is unlocked. The explanation says net worth adds accounts to investments, then subtracts debts, and that this room does not keep another ledger. `projectAccountHall` copies the passed `NetWorth` and does not call `computeNetWorth`. A unit case sets a row to 99999 and keeps the passed total at 1250.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Inline account dialog in `assets-liabilities.component.html` and its form rules | `AssetsLiabilitiesComponent` open, save, and close | `AccountBalanceEditor` and `AccountBalanceEditorComponent` | Moved. The accounts list and the hall both use that editor. No second ledger and no new crypto protocol. | Existing assets-liabilities save specs still pass. Hall save calls `updateAsset` once with `silent: true` and `review_interval_days: 0`. |

- Candidate class and protected counterexamples: Holdings, the assets list, vault unlock, and the published net-worth stream stay. No earlier accounts-hall module existed to delete.
- Comparison base SHA and full replacement closure (including new files): `df970e356ce8be8198b5bd3fa5543d359b2943d2`. New production files under `apps/finance/frontend/src/app/accounts-hall/`: `account-hall.ts`, `account-balance-editor.ts`, and the editor and hall component, template, and stylesheet. Changed production files: `assets-liabilities.component.ts`, `.html`, `.css`, `have-hub.component.ts`, and `public-api.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: production +892/−192, net +700, counted on the uncommitted tree against `df970e35`. Guidance +4/−3 (`apps/finance/AGENTS.md` at 292 words, `docs/FRONTEND.md`). Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 1 / 1 account editor. 0 / 1 accounts hall. The hall reads `assets$`, `liabilities$`, and `netWorth$`. 0 / 0 second ledger.
- State/cache owners and public entry points before/after: entry is `/finance/have?t=hall` inside `HaveHubComponent`. The revealed key lives in the hall component. Leaving the route or locking drops it. `Lock balances` clears digits without sealing the vault. Vault lock seals the hall so a late stream cannot repaint amounts. The accounts list remains `/finance/have`.
- Remaining old symbol/path search, including config and discovery: `accounts-hall.spec.ts` is discovered with the Finance Playwright files (`listed project=finance files=50`). `projectAccountHall` and `accountHallKey` are exported from `public-api.ts`. No new finance section-nav item.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +422/−1 (`account-hall.spec.ts`, `accounts-hall.component.spec.ts`, `accounts-hall.spec.ts`, and the hub and list spec edits). This evidence file is docs. No generated bundle is committed. `make e2e` exited 0. Release `d18b0c0dacbbb817a65238a6632673ccaa550c7762a81aed98be826da1d80a10`. The initial bundle stays over the 650 kB warning budget at 687.76 kB. The budget was not raised. Existing unused-import warnings on Dashboard and Stock Lab remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +700 production lines. The positive delta is the hall and the extracted editor. It is not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Finance Playwright passed 287 tests, 5 skipped. The skipped tests are the existing activity and 1280 target rows.

## Verification

Commands ran in `/tmp/vivek-room-01` on `df970e35` plus this leaf. `make test-fast` used `PATH="/tmp/vivek-room-01/.venv/bin:$PATH"` because `/usr/bin/python3` has no project dependencies. Karma and Playwright used `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file. `make test-fast` was run again after this evidence file was added. That rerun passed with the same counts.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch ROOM-01` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, Finance Karma, root Karma, and `make e2e`. It does not edit the queue. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (88 active packets, 24 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists finance files=50. Node script tests 21 pass / 0 fail. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 528 SUCCESS. Statements 63.9% (7930/12410), branches 49.87% (3504/7025), functions 60.01% (1908/3179), lines 67.32% (7000/10398). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 698 SUCCESS. Statements 77.95% (11591/14868), branches 65.6% (5153/7854), functions 80.36% (2484/3091), lines 83.16% (10081/12121). |
| `make e2e` | PASS. 287 passed, 5 skipped (2.4m), including six Accounts hall tests. |

## Handoff

- PR URL (leaf closure keyword only): recorded when the pull request opens. The body is only `Closes #451`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. Vault return still drops `t=hall` because that query is outside the existing return allowlist, and that file was not part of this leaf.
- Next actor: review and merge this leaf only.
