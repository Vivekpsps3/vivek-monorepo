# FIXUP-13 — Use the canonical Finance Imports entry from Home

- Leaf issue and parent(s): [#591](https://github.com/Vivekpsps3/vivek-monorepo/issues/591) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/fixup-13`, worktree `/tmp/vivek-fixup-13`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/591#issuecomment-7223829771).
- Base main SHA `5444db9f4eaf4d23948428b58d19c1e686abc677` (GAME-07 merge #642). Tested SHA `ddbef00d92f27f153aedd2f17cc8c02847aca64e`.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` before the implementation commit. The branch had no commits, so updating onto `5444db9f` fast-forwarded. FUX-03 (#392, PR #527, `b7bb3cc4bb00d4ee77f6a2ad5432ab1241e962bc`), FUX-07 (#396, PR #531, `c5bfd45411796d85a9b0ccc04df9c801ced46b17`), and NAV-02 (#387, PR #499, `8126d6efef2e6e0564d7dccc67e17d785204d4f9`) are ancestors. Dated `add=1` remains the manual editor. `/finance/imports?start=bank` remains the Imports wizard, with receipts and undo. `returnPath` still allows that Imports URL and `/finance/spending?add=1`. No other finance-ui PR was open. Town files from GAME-07 were not edited.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-13-A1 | Empty synthetic vault. Import card activity opens `/finance/imports?start=bank` and the existing “Import from bank” dialog. Preview of the synthetic Chase CSV shows “new” and GROCER. `transactions` and `import_batches` stay empty until confirm. Cancel returns to Imports history (0), not Activity. Done writes three transactions, shows Import history (1) and Undo, then Home. Keyboard Cancel returns focus to the bank Import button. The same button reopens the wizard. | PASS | `home.spec.ts` cancel journeys at 390×844 touch (light and dark) and 1280×800 keyboard (light and dark), reduced motion, 44px target, no horizontal scroll. Receipt journey at 1280×800 light. `dashboard.component.spec.ts` asserts the empty-home href `/finance/imports?start=bank`. |
| FIXUP-13-A2 | `/finance/spending?add=1` stays on Activity, opens the bank wizard, and Cancel stays on Activity. `/finance/spending?date=2026-10-20&add=1` opens Add transaction, not the bank wizard. A seeded Home and a post-import Home show fact tiles before First steps, omit “Import card activity” and a second “Add a balance” link, and keep “Add activity” on Imports while the dated tile stays “Add a transaction”. Progress still counts all four steps. | PASS | `home.spec.ts` legacy journey at 390×844 dark, seeded Home order, and the receipt return. `dashboard.component.spec.ts` vault-with-records case. |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Date-less Activity import alias as Home’s entry, and the repeated starter CTAs | Home empty card and the activity first step both linked `/finance/spending?add=1` | Bank wizard stays `startImportWizard` on Imports. Bare `/finance/spending?add=1` remains a bookmark on Activity. Dated manual add stays on the activity tile and Calendar. | Home and the activity first step now use `/finance/imports?start=bank`. `firstStepRows` hides the balance and activity links while the starter card is visible, and hides a second balance link when the empty balance tile already offers it. | Empty and seeded Home Playwright journeys, plus the legacy URL journey. `spending-hub.component.ts` has no date-less import alias and was not edited. |

- Candidate class and protected counterexamples: presentation and entry replacement. The import preview, commit, dedupe, receipts, undo, and onboarding count stay with their current owners. No shared abstraction and no `packages/ui` edit.
- Comparison base SHA `5444db9f4eaf4d23948428b58d19c1e686abc677`. Replacement closure is the Home dashboard and the Imports page focus return. Tests and this evidence file are separate.
- Production added/deleted: 35 physical lines added and 5 removed (`dashboard.component.ts` 16/1, `dashboard.component.html` 2/2, `imports.component.ts` 17/2). Two of the added lines are doc comments. The positive delta is the duplicate-action filter and Cancel/Done focus return, not a second wizard.
- Independent equivalent implementations before/after: one bank wizard. Home no longer starts it through the date-less Activity alias.
- State/cache owners and public entry points before/after: vault writes still happen only on confirm inside the existing import workflow. `/finance/imports?start=bank` is the Home entry. `/finance/spending?add=1` remains the legacy bookmark. Dated `add=1` remains manual add.
- Remaining old symbol/path search: `transactions.component.ts` still starts the wizard for a date-less `add=1` on Activity. Calendar and the Home activity tile still pass a date with `add=1`. `queue.json`, the completion registry, and CI were not edited.
- Follow-up change: none in this leaf.
- Tests/docs/generated changes separately: `dashboard.component.spec.ts` adds 69 lines. `home.spec.ts` adds 157 and removes 2. This evidence file is the documentation change. No binaries. `dist/` and Playwright output are not committed.
- Net production delta and exception: +30 production lines. The extra lines keep the first import on the existing Imports flow and stop repeating starter actions. They do not add a parallel import path.
- No behavior/data/meaningful assertion silently removed: preview, dedupe, revision, receipt, undo, and the four-step progress count stay. Labels “Add a balance”, “Add activity”, and “Add a transaction” stay.

## Verification

Commands ran from `/tmp/vivek-fixup-13` on tested SHA `ddbef00d92f27f153aedd2f17cc8c02847aca64e`, before this evidence file. `CHROME_BIN` was Playwright Chromium `chromium-1248` because this shell had no `google-chrome` binary. Coverage floors were not changed. `make test-fast` invokes `python3`; the first local run failed in `scripts/test_restore_drill.py` with `ModuleNotFoundError: alembic` on the system interpreter. The recorded run puts a wrapper named `python3` on `PATH` that execs `/tmp/vivek-fixup-13/.venv/bin/python`, which has alembic, and then runs the same Makefile target.

| Command | Result |
| --- | --- |
| `PATH="$HOME/.grok/fixup13-py:$PATH" make test-fast` | PASS. Shared-boundary and finance UX F1 checks passed. 135 Python unittest tests OK. 21 Node tests passed. |
| `make lint-web` | PASS. ESLint baselines match (finance 344, site 9, packages 1, world-engine 0). |
| `make typecheck-web` | PASS. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 555 tests. Statements 65.3% (8482/12989). Branches 52.22% (3911/7489). Functions 61.65% (2040/3309). Lines 68.79% (7488/10884). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 749 tests. Statements 77.95% (12472/15998). Branches 65.93% (5643/8559). Functions 80.18% (2723/3396). Lines 83.25% (10860/13045). |
| `make e2e` | PASS. Production build wrote release `bc667a4e53e569e6342cc61f5ca75302cfa552bbdcadb6d86485def82935ebbd`. Existing initial-bundle warning is 731.13 kB against 650 kB. Playwright 303 passed, 5 skipped, including the four FIXUP-13 cancel journeys, the receipt, and the legacy URL. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/643
- Roadmap #134 append-only status-note URL: added after merge.
- Merged/activation status: not merged yet.
- Remaining external prerequisites or approved scope decisions: none for this leaf. Parent issues stay open. #277 stays open.
- Next actor: wait for green checks, then merge. Do not deploy.
