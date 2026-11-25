# GAME-02 — implementation evidence

- Leaf [#471](https://github.com/Vivekpsps3/vivek-monorepo/issues/471) and parents [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304), [#313](https://github.com/Vivekpsps3/vivek-monorepo/issues/313).
- Sole worker on `agent/game-02`, isolated worktree `/tmp/vivek-game-02`. Base `f26e921340cc1fecebd1861c613de94d2d5890af`. Product and tests verified at `59baf8fd7b74cddb4177889dd69eda3a2fd06e61`.
- Fresh main includes the Stamp wallet [#602](https://github.com/Vivekpsps3/vivek-monorepo/pull/602), catalog [#577](https://github.com/Vivekpsps3/vivek-monorepo/pull/577), layout writes [#622](https://github.com/Vivekpsps3/vivek-monorepo/pull/622), room entry [#555](https://github.com/Vivekpsps3/vivek-monorepo/pull/555), and Home placement, recovery and browse through [#625](https://github.com/Vivekpsps3/vivek-monorepo/pull/625). No competing pull request or claim at branch start. [Claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/471#issuecomment-7144729904).

## Acceptance

| Row | Current proof | Result |
| --- | --- | --- |
| GAME-02-A1 | Two browser tabs both see 10 Stamps, confirm different 10-Stamp pieces, and receive one 201 and one 409. The wallet finishes with 0 Stamps, one entitlement and one spend receipt. The server independently races the same writes, verifies the canonical price, and checks idempotent retries. | PASS |
| GAME-02-A2 | Buy Shell stool, place two distinct instances from one Home inventory entry, and save. Refund shows the removal requirement and preserves balance, entitlement, revision and both items. Removing all saved copies permits a full refund. The placement/refund transaction race admits only one winner. Unreadable layout entries fail closed. | PASS |
| GAME-02-LIFE | Failed requests preserve the same purchase/refund key and confirmation. Held responses after owner and item-route changes cannot republish a balance. Route destruction unsubscribes, and both local and cross-tab lock bindings clear the displayed wallet and confirmation. Older active unlocks stay visible and use their recorded price. | PASS |
| GAME-02-VIEW | Keyboard and touch complete confirm, cancel, place and refund at 390×844 and 1280×800 in light and night, with reduced motion. The wallet dialog returns focus on Escape. Confirmation focuses its question, Cancel restores the initiating button and outcomes take focus. The priced action is in the first viewport with 44px controls. Axe found zero serious or critical violations in the wallet and Workshop. | PASS |

`apps/web/e2e/town-stamps.spec.ts` attaches the ready, confirmation and refunded screenshots. I reviewed the four size and theme captures and increased the artwork's display size. The user has yet to review the artwork independently. The lazy Workshop chunk adds 13,924 raw bytes and 4,786 gzip bytes. The selected Shell stool loads one 389-byte theme-specific SVG. The Workshop reads one wallet, plus a refresh on a cross-tab conflict. Refund checks all saved rooms with one owner-scoped layout query under the existing write lock.

The server can sell all twelve catalog items at their existing public prices. It rejects unsupported IDs and free items on fresh purchases. A previously committed key can still retry. Existing entitlements and receipts are retained, including older items and differing historical spend amounts. The active input is furniture and its confirmed price or spend receipt ID. No unrelated life records are read by the market service.

## Deletion and compatibility

| Candidate | Previous consumer | Surviving owner and proof |
| --- | --- | --- |
| Refund form, phrase and submit state in the Stamps dialog | The dialog's active unlock rows | Removed. Those rows link to the matching item in Workshop, which owns purchase and refund confirmation. Unit and browser tests moved with the action. |
| Static shop copy in the temporary cosmetic catalog | Priced item inspector | Replaced by the exact-item Workshop link. The starter sample and its existing links remain available for the durable placement migration in [#593](https://github.com/Vivekpsps3/vivek-monorepo/issues/593). |
| Caller-selected Stamp cost and layout-blind refunds | Existing Stamp API | The same endpoints and ledger price all new purchases from the catalog. The atomic refund gate reads saved layouts. Existing bodies and receipt retries stay usable, with preserved data and expected spend identity on new refunds. |

The comparison against `f26e9213` adds 408 and removes 91 physical production lines, with no file moves. Tests and route fixtures add 418 and remove 142 lines. Feature and Town guidance replace two lines. Counts include comments and blank lines. Generated bundles and review captures stay outside Git. The positive production delta delivers a new market and its consistency guards. One market UI, one wallet, one layout store and one canonical write path per resource remain. There is no schema change.

## Verification

| Command | Result |
| --- | --- |
| `PATH="$PWD/.venv/bin:$PATH" make test-fast` | PASS. Planning, doc-path, route-discovery and boundary checks, 135 Python tests, 21 Node tests. |
| `make lint-python` and `make typecheck-python` | PASS. Existing Ruff, suppression and mypy baselines match. |
| `./scripts/coverage-gate.sh server` | PASS. 487 passed, one existing skip, 81.76% statements. Town passive read p50 143.28ms. |
| `make lint-web` and `make typecheck-web` | PASS. Existing lint baselines match. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 721 tests, 77.76% statements. |
| `make build-frontends` | PASS. Production manifest generated. The existing initial bundle advisory remains at 729.14 kB against a 650 kB warning budget. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 237 tests, including all five Workshop journeys. |
| `npx playwright test --project=suite` | PASS. 61 tests. |

The installed Chromium binary is `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, passed using `CHROME_BIN` or `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. An initial focused server run found a pending grandfathered entitlement in the synthetic seed. The fixture now flushes the historical row before using it. The initial build found the preview helper's required paint argument. The verified build passes the initial paint value. Existing gates and assertions stay active.

## Handoff

- The pull request closes only [#471](https://github.com/Vivekpsps3/vivek-monorepo/issues/471). Live PR and merge verification are linked from the leaf and [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).
- Next in the owner's sequence is [FIXUP-15 #593](https://github.com/Vivekpsps3/vivek-monorepo/issues/593). Use the durable Home editor and the Workshop item deep link when migrating the old catalog. The merged browser evidence uses synthetic data. Production deployment and independent owner visual review require separate evidence.
