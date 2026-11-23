# SCENE-07 — implementation evidence

- Leaf issue and parent(s): [#445](https://github.com/Vivekpsps3/vivek-monorepo/issues/445) SCENE-07. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#254](https://github.com/Vivekpsps3/vivek-monorepo/issues/254), [#317](https://github.com/Vivekpsps3/vivek-monorepo/issues/317), [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81), and [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/scene-07`; `/tmp/vivek-scene-07`. The shared checkout was not edited. Travel, Media, Town scene files, and Pixels were not edited by this leaf. HOME-02 arrived through the merge below.
- Base main SHA, current tested SHA: work started from `73a289b481dc5227df62a0b2ff07270681ac1bad` (ROOM-13, pull request #574). The implementation commit is `a20be155`. `origin/main` then moved to `ab2507c9e51c6c3c4dbcf5b307d30f50b3e406b6` (HOME-02, pull request #577). That merge is `8184b0757c309d3cc1b36ef314e436d64c47b965`. Post-merge gates below ran on `8184b075`.
- Fresh-main/prerequisite/active-PR checks: SCENE-06 (#444, pull request #571) and NAV-03 (#388, registry SHA `18c8553f95fc78a0c14c7ecd461609964a4f20de`, pull request #500) are ancestors of `73a289b`. Fetch before the branch and again before the implementation commit. No rebase and no force-push. Pixel scores were not changed. The editor does not call `/api/town` and does not grant XP or stamps.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| SCENE-07-A1 | Synthetic note, three focus slots, and an https link. Clock `2027-01-03T20:00:00Z` in America/Los_Angeles. Save Monday `2026-12-28`, edit it, save Monday `2027-01-04`, reload, delete the first week, and restore the backup under the same owner. | PASS | `apps/web/e2e/town-review.spec.ts` at 390×844 and 1280×800, light and night, plus the 1280 light restore. `review.spec.ts` checks the ISO boundary, 120/121 emoji, and the exact key set. |
| SCENE-07-A2 | A held save of marker text, then lock, owner change, or leaving the route. The editor records no `/api/town` request. | PASS | `review-editor.component.spec.ts` and `review-store.service.spec.ts` for the held save. Playwright locks from Settings and returns to a locked review with no marker and no note text. |
| SCENE-07-LIFE | A 409 keeps the same-session draft and the discard baseline, and asks to save again. A 503 keeps the draft. A dirty week change stays on the open week. | PASS | `review-store.service.spec.ts` conflict and 503. `review-editor.component.spec.ts` conflict message and blocked week change. |
| SCENE-07-VIEW | 390×844 touch and 1280×800 keyboard, light and night, reduced motion. Targets at least 44px. Axe serious and critical violations on `app-weekly-review` are empty. No horizontal scroll. | PASS | `town-review.spec.ts` viewport matrix. |
| REVIEW1 | Codec, save, edit, reload, delete, and recent-week navigation keep `v`, `week`, `focus`, `note`, and `obsidian` only. | PASS | `review.spec.ts`, store spec, and `town-review.spec.ts`. |
| REVIEW2 | Lock, owner change, and leave clear markers and do not publish the held text. Conflict keeps the draft. | PASS | Editor and store Karma. Playwright is the visible lock. The e2e session cannot switch owners, so owner change is the Karma `SessionDouble`. |
| REVIEW3 | Recovery restore returns the week under the current owner. Hub has one "Weekly review" link. Pinning it opens `/town/review` and does not show the other week's note. | PASS | `town-review.spec.ts` restore and pin. `encrypted-store.persistence.spec.ts` does not decrypt `town_reviews`. |

The editor is `/town/review`, with a Hall back link. It is not mounted inside the Hall room. Town scene files were outside this leaf. `apps/finance/frontend/src/public-api.ts` is unchanged. The vault envelope stays schema version 2. The review payload is version 1. There is no second store and no new crypto protocol. An Obsidian value renders as one link. Hub does not copy note text. Pixels still says weekly review is not available; that file was not edited.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No prior review editor or `town_reviews` collection at `73a289b`. | None. Clinic and Gym still call `HealthStoreService.load`, which lists only `health_stats`, `health_prs`, and `health_workouts`. | `ReviewStoreService` and `WeeklyReviewComponent` on `/town/review`. One Hub shortcut. | Nothing deleted. The collection was added to the three existing allowlists so Finance still refuses to decrypt it. | `health-store.service.spec.ts` listed collections. Persistence spec. `town-review.spec.ts`. |

- Candidate class and protected counterexamples: Town scene files, Pixel scores, Travel, and Media stay. The health measurement load does not read reviews.
- Comparison base SHA and full replacement closure (including new files): `27c99dc28370c5d2c49382bc1486faeb98c3573f` through implementation `a20be155`. New production files: `review.ts`, `review-store.service.ts`, `review-editor.component.ts`, `.html`, and `.css`.
- Production added/deleted/moved; comments/blank-only churn separately: production +1151/−3, net +1148, counted from `27c99dc` to `a20be155` for the editor, store, codec, route, Hub link, health collection name, Finance allowlists, and return-context week rule. Route documents are +8/−1. Town `AGENTS.md` and `docs/QUALITY.md` are +2/−2 and are not in that production count. Blank-only lines are not split out.
- Independent equivalent implementations before/after: 0 / 1 review editor. 1 / 1 vault envelope. 1 / 1 Hub shortcut list.
- State/cache owners and public entry points before/after: `/town/review` is the route. `week` is the ISO Monday query. Ciphertext stays in `town_reviews`. The editor drops drafts on lock, owner change, and destroy. Export and restore use the existing recovery snapshot for the current owner.
- Remaining old symbol/path search, including config and discovery: `town-review.spec.ts` is in `townTestMatch`, the discovery test, and `docs/QUALITY.md`, alongside the HOME-02 cosmetic catalog allowlist. `/town/review` is in `routes.json` and `route-examples.json`.
- Follow-up change: which production files and independent policy owners now need editing: none inside this leaf. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: the implementation commit is +2217/−18 including tests. This evidence file is docs. No generated bundle is committed. Post-merge `make build-frontends` exited 0. Release `e3a58485e8fc7d4bcc0c0e03863a5e8acc204fa0a9d3dac4980de206ed0e601e`. The initial bundle stays over the 650 kB warning budget at 681.20 kB. The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +1148 production lines. This is the editor, the store, and the wiring the missing collection needed. The positive delta is the feature.
- No behavior/data/meaningful assertion silently removed: confirmed. Hub's first unpinned shortcut stays Holdings. Town stays on the first compact screen. Health measurements still omit `town_reviews`.

## Verification

Launch commands ran in `/tmp/vivek-scene-07`. `make test-fast` and Python gates used `PATH="/tmp/vivek-scene-07/.venv/bin:$PATH"`. Karma used `CHROME_BIN=/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. Commands marked post-merge ran on `8184b075` after HOME-02. Earlier commands ran on the implementation tree that became `a20be155`, before that merge. The merge did not change Finance product files or the review editor.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch SCENE-07` | Printed `make test-fast`, web lint and typecheck, Finance Karma, web Karma, `make e2e`, `make build-frontends`, Town Playwright, and `npx playwright test --project=suite`. |
| `make test-fast` | PASS before the implementation commit and again post-merge. |
| `make lint-web` | PASS before the implementation commit. |
| `make typecheck-web` | PASS before the implementation commit and again post-merge. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 521 SUCCESS. Statements 63.34%, branches 49.46%, functions 59.22%, lines 66.77%. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS post-merge. 679 SUCCESS. Statements 77.92% (10925/14020), branches 65.56% (4833/7371), functions 80.02% (2332/2914), lines 82.95% (9514/11469). |
| `make build-frontends` | PASS post-merge. Release hash above. Initial total 681.20 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS post-merge. 196 passed (2.7m), including the four review viewports, the pin, the lock, the restore, and the cosmetic catalog. |
| `npx playwright test --project=suite` | PASS on the implementation tree. 61 passed (58.2s). The merge did not change suite specs. |
| `make e2e` | PASS on the implementation tree. 281 passed, 5 skipped (2.5m). The merge did not change Finance product files. |
| `make lint-python` and `make typecheck-python` | PASS. |
| `./scripts/coverage-gate.sh finance` | PASS. 160 passed. Total coverage 81.41% (floor 81.03%). |
| `scripts/check_collection_policy.py` | PASS. |
| `pytest` collection policy, vault health collections, and route parity | PASS post-merge for route parity. 48 passed, 1 skipped, for the three modules together before the merge; route parity alone passed again after it. |

Town `AGENTS.md` is 300 words after the HOME-02 merge. The doc-path gate allows 300.

## Handoff

- PR URL (leaf closure keyword only): opened from this branch after this file. The body is only the leaf keyword for #445.
- Roadmap #134 append-only status-note URL: added after the merge, without editing the issue body.
- Merged/activation status (actual evidence, not assumption): not merged when this sentence is written.
- Remaining external prerequisites or approved scope decisions: none for this leaf. The editor is a route with a Hall back link, not a scene inside the Hall room.
- Next actor: open the pull request, wait for required checks, then merge.
