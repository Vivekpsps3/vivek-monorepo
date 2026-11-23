# GAME-01 — implementation evidence

- Leaf issue and parent(s): [#465](https://github.com/Vivekpsps3/vivek-monorepo/issues/465) GAME-01. Parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and [#313](https://github.com/Vivekpsps3/vivek-monorepo/issues/313) stay open. Roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134) stays open. [#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277) stays open and was not edited.
- Agent/context, branch/worktree: sole implementer, no subagents; `agent/game-01`; `/tmp/vivek-game-01`. The shared checkout was not edited. Finance, Travel, Media, and Health measurement records were not edited. Travel migration tests only gained the new schema-head labels.
- Base main SHA, current tested SHA: product and tests are `b4078b0f29c73ecd5065f3dea7f50f1dcf1300f5`. Gates below ran in `/tmp/vivek-game-01` on that tree before this evidence file. `origin/main` at branch start was `e5e1fde32cdcca8b97811cd7017206b70f291e1b` (FIT-07, pull request #600). It moved to `a64f25fa434e202576037abcf5495974fcce45f0` (ROOM-02, pull request #601). That update was merged with a fast-forward. No rebase and no force-push.
- Fresh-main/prerequisite/active-PR checks: no leaf dependency. The Town scene frame in `library-room.scene.ts` remains y-down, with the origin at the room's top left. It was not changed. A room-layout refund check belongs to the workshop leaf, because no layout table exists. This refund returns the full recorded price of an unlock the owner still holds.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| GAME-01-A1 | Synthetic owner 1 starts at 0. Two racing 10-Stamp quest grants with one grant key produce one receipt and balance 10. Two racing 10-Stamp purchases when the balance is 10 produce one receipt and balance 0. A repeated HTTP grant returns the same receipt. | PASS | `apps/server/tests/test_town_stamps.py` grant, purchase, and HTTP retry cases. Playwright grant `quest:chapter-1` for 10 and purchase `tile-fountain` for 10, then the dialog shows 0 Stamps. |
| GAME-01-A2 | Owner 2 cannot read owner 1's receipt or unlock. Upgrade keeps a habit row and an extra `kept_unsupported` table. Downgrade drops only the stamp tables and the new compatibility row. Unknown catalog ids that pass the charset are stored. | PASS | Other-owner and migration cases in `test_town_stamps.py`. `make db-check` and `make db-validate-seeded`. |
| GAME-01-LIFE | A failed refund keeps the typed phrase. Owner invalidation clears the phrase and drops a late wallet of 999. A failed reload keeps the typed draft and offers Retry. | PASS | `stamp-wallet.component.spec.ts`. |
| GAME-01-VIEW | 390×844 and 1280×800, light and night (`suite-theme` / `data-theme`), keyboard and reduced motion. Stamps and Refund are at least 44px. Refund focuses the phrase field. Escape returns focus to Stamps. Axe on `app-stamp-wallet` has no serious or critical violations. No horizontal scroll. The dialog animation name is none. | PASS | Four journeys in `apps/web/e2e/town-stamps.spec.ts`, inside the Town Playwright run of 224 passed. Screenshots stayed in Playwright attachments and were not committed. |

Fixtures are synthetic grant keys and catalog ids. The wallet does not accept weight, steps, trip id, or a money field. Named consumers are the workshop market, chapter quests, and minigames. The dialog links the market to `/town/cosmetics` and minigames to `/town/memory`. Chapter quests are named in the list and have no route in this leaf. Memory shelves still award no Stamps. `/town/home` has no Stamp gate.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| No earlier Stamp wallet | Cosmetic catalog prices are display labels. Memory copy says the play does not award Stamps. | `apps/server/town/stamps.py` and `StampWalletComponent` | Retained. No prior wallet path existed to delete. Catalog prices and Town XP were not moved into the wallet. | Catalog and memory specs still pass inside Town Playwright and web Karma. |

- Candidate class and protected counterexamples: habits, cosmetic catalog, memory shelves, and the y-down scene frame stay. Account deletion removes `town_stamp_entitlements`, then `town_stamp_receipts`, then `town_stamp_wallets` before the user row. There is no cascade from `users`.
- Comparison base SHA and full replacement closure (including new files): `a64f25fa434e202576037abcf5495974fcce45f0`. New production files: `apps/server/town/stamps.py`, `apps/server/alembic/versions/site_town_stamps_v1.py`, and `stamp-wallet.component.ts`, `.html`, and `.css`. Changed production files: `town/models.py`, `town/router.py`, `town/schemas.py`, `schema.py`, `identity/admin.py`, `checks.py`, `town.api.ts`, and `town.component.ts`, `.html`, and `.css`.
- Production added/deleted/moved; comments/blank-only churn separately: server production +665/−1, web production +228/−1, net +891. Guidance +12/−12 (`apps/server/AGENTS.md` 300 words, `apps/web/src/app/town/AGENTS.md` 291 words, `apps/web/AGENTS.md` unchanged at 297, `FEATURES.md`, `docs/QUALITY.md`). `scripts/restore-drill.py` +8/−1. Blank-only lines are not split out. This evidence file is additional docs after that count.
- Independent equivalent implementations before/after: 0 / 1 stamp ledger. 1 / 1 cosmetic catalog. 1 / 1 Town XP path. The wallet does not price catalog rows and does not change XP.
- State/cache owners and public entry points before/after: entry is the Stamps button on `/town`. Reads and writes are `GET /api/town/stamps` and `POST /api/town/stamps/grants`, `/purchases`, and `/refunds`. Balance and receipts live in Town tables keyed by owner. The dialog replaces its wallet from the response. A generation counter drops a late response after close or owner change.
- Remaining old symbol/path search, including config and discovery: `town-stamps.spec.ts` is in the Town Playwright allowlist (`listed project=town files=24`). `TOWN_CONSTANTS_VERSION` stays 1. No new route was added.
- Follow-up change: which production files and independent policy owners now need editing: the workshop market owns named prices and a placement check before refund. Chapter quests and minigames own their grant rules. No queue or parent ledger was edited.
- Tests/docs/generated changes separately: tests +910/−15. Guidance is above. This evidence file is docs. No generated bundle is committed. The initial web bundle stays over the 650 kB warning budget at 721.45 kB. The budget was not raised.
- Net production delta and specific reviewed safety/compatibility exception if positive: +891 production lines. The positive delta is the wallet, its migration, and the dialog. It is not a simplification claim. No Reviewed boundary exception was added. Coverage floors were not lowered. Server coverage measured 81.17% against a stored 61.87% and floor 61.53%. Travel coverage measured 89.32% against a stored 81.41% and floor 80.41%. The floors stay where they are.
- No behavior/data/meaningful assertion silently removed: confirmed. Town Playwright passed 224 tests. Suite Playwright passed 61. Web Karma passed 713.

## Verification

Commands ran in `/tmp/vivek-game-01` on `b4078b0f29c73ecd5065f3dea7f50f1dcf1300f5`. `make test-fast` used `PATH="/tmp/vivek-game-01/.venv/bin:$PATH"` because `/usr/bin/python3` has no Alembic. Karma used `CHROME_BIN` and Playwright used `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`. `make db-validate-seeded` used `SITE_IMAGE=personal-site:game-01`, `SEED_PORT=18191`, and `SITE_PORT=18195`. That image was built from this worktree and was not deployed. `node_modules` and `.venv` are symlinks to the shared checkout and are not committed. An earlier Town Playwright run failed because the refund phrase was focused before the field existed, and two Pixel specs timed out while other suites were running. The focus call now waits for the render. The Pixel specs passed alone and again inside the full Town run recorded here.

| Command | Result |
| --- | --- |
| `python3 planning/implementation/plan.py launch GAME-01` | Prints the commands below. It does not edit the queue. Travel coverage is an extra root gate because the schema-head pins changed. |
| `make test-fast` | PASS. Doc paths OK. Planning validation PASS (103 active packets, 25 parents, 99 completed packets, forty TD owners). 135 unittest tests OK. E2E discovery lists town files=24. Node script tests 21 pass / 0 fail. |
| `make lint-python` | PASS. 266 files already formatted. Ruff 90 findings match the baseline. Suppressions 6 findings match the baseline. |
| `make typecheck-python` | PASS. Mypy 79 findings match the baseline. |
| `./scripts/coverage-gate.sh server` | PASS. 463 passed, 1 skipped. Total 81.17% (6337 statements, 1193 missed). Floor 61.53%. Perf gate `GET /api/town` p50 224.55 ms, 1 passed. |
| `./scripts/coverage-gate.sh travel` | PASS. 232 passed. Total 89.32% (4206 statements, 449 missed). Floor 80.41%. |
| `make db-check` | PASS. `schema_drift_check` ok at `site_town_stamps_v1`. |
| `make db-validate-seeded` | PASS. Adopt action `stamp_and_upgrade`. Upgrade from `site_trip_draft_v1` to `site_town_stamps_v1`. Upgrade schema diff is empty. |
| `make lint-web` | PASS. eslint-finance 344, eslint-site 9, eslint-packages 1, eslint-world-engine 0. Each matches its baseline. Engine purity 1 pass. |
| `make typecheck-web` | PASS. Web app and spec, Finance, packages, and site. Re-run on the committed tree. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 713 SUCCESS. Statements 78.18% (11820/15118), branches 65.74% (5215/7932), functions 80.52% (2539/3153), lines 83.39% (10285/12333). |
| `make build-frontends` | PASS. Release manifest written. Initial bundle 721.45 kB, over the existing 650 kB warning by 71.45 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 224 passed (2.4m), including four Stamp wallet journeys. |
| `npx playwright test --project=suite` | PASS. 61 passed. Re-run on the committed tree. |

## Handoff

- PR URL (leaf closure keyword only): recorded after the pull request exists.
- Roadmap #134 append-only status-note URL: recorded after merge.
- Merged/activation status (actual evidence, not assumption): not merged yet. No deployment.
- Remaining external prerequisites or approved scope decisions: the workshop market, chapter quests, and minigames are named consumers and are not implemented here. Refund does not look for a placed unlock. The scene frame stays y-down.
- Next actor: review and merge this leaf only.
