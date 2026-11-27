# FIXUP-21 — Give Treasury inspection one useful record and an explicit edit

- Leaf issue and parent(s): [#609](https://github.com/Vivekpsps3/vivek-monorepo/issues/609) under [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Agent/context, branch/worktree: branch `agent/fixup-21`, worktree `/tmp/vivek-fixup-21`. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/609#issuecomment-7224876664). No subagents. The shared checkout was not edited. Town, Travel, Media, and server files were not edited.
- Base main SHA `26ae69b33a442e4c2a38d29e00f006a4ae2c3a77`. Tested SHA `9412dae96de3e93c5a8e3ee8e9a9f1a367786dda`.
- Fresh-main/prerequisite/active-PR checks: fetched `origin/main` before the worktree. ROOM-01 (#451, PR #599, `95e298d5`) and ROOM-02 (#452, PR #601, `a64f25fa`) are ancestors. Both issues are closed. The hall still uses `AccountBalanceEditor`. The gallery still reads `projectTreasuryGallery`. ROOM-03 planning study was not edited. GAME-08 (#476, PR #644) was open on Town files and was left alone. `public-api.ts` was not edited.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| FIXUP-21-A1 | Synthetic Harbor checking `asset:11` (notes Statement), zero savings, Harbor card `debt:21`, and VOO. Touch or keyboard on the checking drawer reveals Published balance and Statement beside the drawer. No dialog and no upsert. Edit opens Edit asset for Harbor checking. Invalid `-20` stays in the dialog. Escape and Cancel return focus to Edit and write nothing. Save returns focus to Edit. Lock balances returns focus to the drawer and hides the digits. | PASS | `accounts-hall.spec.ts` at 390×844 touch and 1280×800 keyboard, light and night, reduced motion. Save, Cancel, and lock journey at 1280. Component spec keeps the held-response case on `edit()`. |
| FIXUP-21-A2 | Twelve synthetic PIER holdings and eighteen Kiosk ledger lines. At 390×844 light, touch selects PIER11 and then Kiosk 17. Each detail sits under its control. Edit in Activity opens the existing Edit transaction dialog on Kiosk 17 with `edit=117` and `month=all`. Back returns to the same gallery query, the ledger line stays focused, and scroll stays within 120px. No upsert. The same path at 1280×800 night uses the keyboard. | PASS | `treasury-gallery.spec.ts` rich journeys. Automatic price checks are off so a quote refresh is not counted as an inspection write. |

The smaller gallery fixture covers 390×844 and 1280×800 in light and night. Before a choice, both inspectors are absent, filters are collapsed, and the first ledger row is above y1600 at 390. Opening TIDE shows that holding, including the stale quote label, next to its plaque, and does not reveal HARBOR. A dated ledger choice shows Boardwalk Cafe, stays within 80px of the prior scroll, and links Activity with the same date filter. Lock still clears tickers.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Gallery inspector aside and `showInspector` scroll to `[data-inspector-position]` | `openPosition` and `openLedger` both painted the first useful holding and ledger line in that aside and scrolled to the position | One inline record next to the opened plaque or ledger line. `projectTreasuryGallery` reports an inspector only after that record is opened. | Removed the aside and the position scroll. Advanced filters remain in `details.activity-filters`. Sort stays on the gallery. Activity and Holdings links use the existing routes. | Gallery unit specs expect no aside and no `scrollIntoView` on a click. Playwright checks proximity and scroll. Planning study still has its own inspector. |
| Hall aside that repeated the open drawer and said the editor was already open | First drawer tap called `unlock`, which opened `AccountBalanceEditor` | `inspect` reveals the published drawer. `edit` opens the same `AccountBalanceEditor`. | Removed the aside. Details render under the drawer. | Hall Playwright: first tap has no dialog; Edit opens Edit asset; focus returns after Cancel, save, and lock. |

- Candidate class and protected counterexamples: replacement of the repeated inspector panels and the ledger's position scroll. Account editor, transactions editor, holdings list, vault lock, and ROOM-03 planning study stay.
- Comparison base SHA `26ae69b33a442e4c2a38d29e00f006a4ae2c3a77`. Replacement closure is the accounts hall and treasury gallery components, styles, and `treasury-gallery.ts` query helpers. No new production file.
- Production added/deleted: 318 lines added and 156 removed across the seven production files. Net +162. The added lines are the inline records, the collapsed filter summary, the Activity query, and scroll restoration after a gallery query write. This is a usability repair, not a simplification claim.
- Independent equivalent implementations before/after: one account editor and one transactions editor. The gallery does not grow a second editor or ledger.
- State/cache owners and public entry points before/after: revealed drawer and opened gallery ids stay in the room components and the gallery query. Records stay in the encrypted store. `projectTreasuryGallery` and `galleryGain` remain the public exports. Unopened inspectors are now null instead of the first useful row. Finance callers were updated. `public-api.ts` was not edited.
- Remaining old symbol/path search: `showInspector` is gone from the gallery component. Planning study still scrolls its own inspector. `queue.json`, the completion registry, and CI were not edited.
- Follow-up change: none in this leaf.
- Tests/docs/generated changes separately: tests add 232 lines and remove 30. This evidence file is the documentation change. No bundle is committed.
- Net production delta and exception: +162 production lines for the inline record and the exact Activity handoff. No reviewed boundary exception.
- No behavior/data/meaningful assertion silently removed: held save and lock semantics, hidden amounts before a choice, and the Activity editor stay. Selecting or closing still does not write.

## Verification

Commands ran from `/tmp/vivek-fixup-21` on the tree committed as `9412dae96de3e93c5a8e3ee8e9a9f1a367786dda`, before this evidence file. `make test-fast` used `PATH="/tmp/vivek-fixup-21/.venv/bin:$PATH"` because system `python3` has no alembic. Karma used `CHROME_BIN` and Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Python lint, typecheck, and coverage gates were not run. The diff has no Python product file.

The first `make e2e` failed two rich-gallery tests: automatic price checks were still on, and the quote refresh upserted the twelve holdings. The zero-upsert assertion stayed. The fixture now turns that preference off. The recorded `make e2e` is the rerun.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch FIXUP-21` | Prints `make test-fast`, `make lint-web`, `make typecheck-web`, Finance Karma, root Karma, and `make e2e`. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (120 active packets, 25 parents, 99 completed packets). 135 unittest tests OK. Node script tests 21 pass. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. |
| `make typecheck-web` | PASS. Web, Finance, packages, and site. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 555 SUCCESS. Statements 65.22% (8537/13088), branches 52.34% (3970/7585), functions 61.73% (2052/3324), lines 68.76% (7533/10955). |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 749 SUCCESS. Statements 77.95% (12472/15998), branches 65.93% (5643/8559), functions 80.18% (2723/3396), lines 83.25% (10860/13045). |
| `make e2e` | PASS. 305 passed, 5 skipped (3.6m). Includes the hall journeys and both gallery fixtures. |

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/645. The body is only `Closes #609`.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: none. Portfolio has no position deep link, so Open in Holdings uses `t=holdings` only. Gallery sort stays local because Activity does not read a sort query.
- Next actor: review and merge this leaf only.
