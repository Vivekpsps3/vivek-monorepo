# ROOM-02 — implementation evidence

- Leaf issue and parent(s): [#452](https://github.com/Vivekpsps3/vivek-monorepo/issues/452) ROOM-02. Parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) stays open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/room-02`; `/tmp/vivek-room-02`. The shared checkout was not edited. Town, Health, Travel, Media, and server product files were not edited by this leaf. FIT-07 arrived through the merge below and those files were left as merged.
- Base main SHA, current tested SHA: product and tests are `94f94e872a4fcf0310f31ff828aefa9f57dabec7`. Finance Karma, root Karma, lint, typecheck, and `make e2e` ran in `/tmp/vivek-room-02` on that tree before this evidence file. The pull-request URL line is the only later edit. `origin/main` at branch start was `95e298d599c2f96dfda4776df5dede6c0e48c5cc` (ROOM-01, pull request #599). It moved to `49bb1d1c2d5333996dbe40e7afecc2f341d91544` (pull request #594, planning only), then to `e5e1fde32cdcca8b97811cd7017206b70f291e1b` (FIT-07, pull request #600). Both updates were merged into this branch. The second merge is `651a8839b27e39bd30fb397027d7010b65a91f45`. No rebase and no force-push.
- Fresh-main/prerequisite/active-PR checks: SCENE-03 (#441, merge `57b69462126defe6bf3b8853237a8b18c1c9abcf`, pull request #555), FUX-01 (#390, merge `9ae590269cde2f2cda1b03f54eb717d163efee94`, pull request #520), and FUX-03 (#392, merge `b7bb3cc4bb00d4ee77f6a2ad5432ab1241e962bc`, pull request #527) are ancestors of `e5e1fde32cdcca8b97811cd7017206b70f291e1b`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/452#issuecomment-7111772969). `packages/ui` return-context was not edited, so a vault unlock from the gallery returns to `/finance/have` and the ticker list starts hidden again.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| ROOM-02-A1 | Synthetic HARBOR, TIDE, an unnamed position, Boardwalk Cafe on 2026-08-15, and Lighthouse Books on 2026-08-16. Open TIDE. The inspector shows that position: symbol TIDE, shares 2, bought Mar 2, quote 2026-10-01. Filter the desk to 2026-08-15 and open the cafe line. The inspector shows that ledger row: Boardwalk Cafe, Groceries, Aug 15, $18.40. The URL keeps `position` and `ledger` with the Activity filter names. | PASS | `treasury-gallery.spec.ts`, `treasury-gallery.component.spec.ts`, and `treasury-gallery.spec.ts` Playwright at 390 and 1280, light and night. |
| ROOM-02-A2 | Same records, automatic price check off, frozen day 2026-10-15. TIDE's quote is 14 days old. Its gain slot says Unavailable. The readout gain is HARBOR's $49.12, and the stale $60 is not added. Lock Finance. The unlock screen and the next gallery visit have no HARBOR, TIDE, or Boardwalk Cafe text, and no dollar amounts until a position is opened again. | PASS | Unit projection, component lock and owner cases, and Playwright `a locked vault keeps no ticker list and a late quote cannot restore one`. |
| ROOM-02-LIFE | A failed reload keeps the search draft. Lock clears tickers, amounts, and the search. A late holdings emission and a changed session token cannot repaint the gallery. | PASS | `treasury-gallery.component.spec.ts` failure, lock, and owner cases. |
| ROOM-02-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. Inspector position and ledger start fully in view. After a phone tap, the inspector is scrolled back into view. Buttons and links inside the gallery are at least 44px. Axe violations on `app-treasury-gallery` are empty. No horizontal scroll. Animations in the gallery are 0. | PASS | Four Playwright viewport journeys plus the lock journey. Screenshots stayed in the Playwright attachments and were not committed. |

Fixtures are synthetic. Symbols, dates, and categories stay visible so a record can be chosen. Shares, values, basis, and ledger amounts stay hidden until that record is opened. The readout says portfolio value adds published position values and that this room does not keep another ledger or price a quote. `galleryGain` returns null for Stale, Unknown, Unavailable, and Provisional. Live, cached, and imported quotes still use `holdingGain`. The desk calls `filterTransactionActivity` and `sortTransactionActivity`.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No earlier treasury-gallery module | Holdings table and Activity page | `TreasuryGalleryComponent` reads `holdings$` and `transactions$` | Retained. The gallery does not replace those screens, add a second ledger, or add a crypto protocol. | Holdings and Activity specs still pass inside Finance Karma and `make e2e`. |

- Candidate class and protected counterexamples: Holdings, Activity filters, vault lock, and quote freshness stay. No earlier gallery module existed to delete.
- Comparison base SHA and full replacement closure (including new files): `e5e1fde32cdcca8b97811cd7017206b70f291e1b`. New production files under `apps/finance/frontend/src/app/treasury-gallery/`: `treasury-gallery.ts`, and the component, template, and stylesheet. Changed production files: `have-hub.component.ts`, `assets-liabilities.component.html`, and `public-api.ts`.
- Production added/deleted/moved; comments/blank-only churn separately: production +1034/−3, net +1031, counted on `94f94e87` against `49bb1d1c` and the same finance numstat against `e5e1fde3`. Guidance +3/−3 (`apps/finance/AGENTS.md` at 299 words, `docs/FRONTEND.md`). Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 1 / 1 holdings store and 1 / 1 activity filter. 0 / 1 treasury gallery. The gallery reads published holdings and transactions. 0 / 0 second ledger.
- State/cache owners and public entry points before/after: entry is `/finance/have?t=gallery` inside `HaveHubComponent`. Opened ids live in the gallery component and the route query. Lock seals the gallery so a late stream cannot repaint tickers. Holdings remains `/finance/have?t=holdings`. Activity remains `/finance/spending`.
- Remaining old symbol/path search, including config and discovery: `treasury-gallery.spec.ts` is discovered with the Finance Playwright files (`listed project=finance files=51`). `projectTreasuryGallery` and `galleryGain` are exported from `public-api.ts`. No new finance section-nav item.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +509/−0 (`treasury-gallery.spec.ts`, `treasury-gallery.component.spec.ts`, `e2e/treasury-gallery.spec.ts`, and the hub spec row). Guidance is above. This evidence file is docs. No generated bundle is committed. `make e2e` exited 0. Release `98f88f553107c8657c6c55354c629858e6742615f5673d105e593d34aa226a91`. The initial bundle stays over the 650 kB warning budget at 721.45 kB. The budget was not raised. Gallery copy is in a lazy chunk. Existing unused-import warnings on Dashboard and Stock Lab remain.
- Net production delta and specific reviewed safety/compatibility exception if positive: +1031 production lines. The positive delta is the gallery. It is not a simplification claim. No Reviewed boundary exception was added.
- No behavior/data/meaningful assertion silently removed: confirmed. Finance Playwright passed 292 tests, 5 skipped. The skipped tests are the existing activity and 1280 target rows.

## Verification

Commands ran in `/tmp/vivek-room-02` on `94f94e87`. `make test-fast` and `make e2e` used `PATH="/tmp/vivek-room-02/.venv/bin:$PATH"` because `/usr/bin/python3` has no project dependencies. Karma and Playwright used `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The leaf diff has no Python product file. `make test-fast` was run again after this evidence file was added.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch ROOM-02` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, Finance Karma, root Karma, and `make e2e`. It does not edit the queue. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (103 active packets, 25 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists finance files=51. Node script tests 21 pass / 0 fail. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 540 SUCCESS. Statements 64.51% (8165/12655), branches 51.29% (3729/7270), functions 60.64% (1963/3237), lines 67.92% (7201/10601). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 698 SUCCESS. Statements 78% (11598/14868), branches 65.69% (5160/7854), functions 80.39% (2485/3091), lines 83.2% (10085/12121). |
| `make e2e` | PASS. 292 passed, 5 skipped (3.4m), including five Treasury gallery tests. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/601. The body is only `Closes #452`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. Vault return still drops `t=gallery` because that query is outside the existing return allowlist, and that file was not part of this leaf.
- Next actor: review and merge this leaf only.
