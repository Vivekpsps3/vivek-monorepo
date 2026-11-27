# FIXUP-12 — Compact Hub summaries

- Leaf [#590](https://github.com/Vivekpsps3/vivek-monorepo/issues/590) and tracking parents [#578](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- Sole implementer on `agent/fixup-12` in `/tmp/vivek-fixup-12`. [Issue claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/590#issuecomment-7222332078)
- Base main `849d34452688090f7442f1e596ab39c36af66da6`. Implementation `44bb99eb4aa7e6101de541d9c51542b378698e5d`.
- FIXUP-01 `57caac17c49e3eeab63bcc48d09b6704ef1f6ef7`, NAV-03 `18c8553f95fc78a0c14c7ecd461609964a4f20de`, HUB-01 `874c873112b07dcec3787910605326465002018c`, and HUB-05 `9cc92d45eb366e65c114c8c0099c13d70d1f3750` are ancestors. Fresh main still has the Health shortcut, compact arrival, account-settings redirect, and Quick add. No competing claim or open PR for #590.

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| Baseline | Fresh main `849d3445` still renders the 13-week Hub strip, Town progress disclosure, empty Next trip and In progress cards, Open Travel/Media/Finance links, and Unlock in both Up next and Net worth. The packet's audited phone height is 1847px at `27c99dc2`. This pass did not rebuild that revision. | Reproduced in source |
| FIXUP-12-A1 | Production bundle. Empty locked Hub, populated Hub (Kyoto trip, Example series, locked bills), and a Media 503 that retries alone. Quick add, Up next, and the seven shortcuts (six domains plus Weekly review) lead. One Unlock link, in Up next. Net worth keeps "Finance is locked. Unlock to see net worth." with no second control. Empty trip and continuation cards are absent. Axe reports no violations. | PASS at 390×844 and 1280×800, light and night |
| FIXUP-12-A2 | Explore agenda, complete and undo Check in, mark the next episode watched, filter Travel, move months, and go back and forward. Pins reorder, survive reload, and reset from the keyboard. Source reads stay on travel, media, and the two calendar months. Hub does not request `/api/pixels`. | PASS |
| Date route | Pixels shortcut opens `/pixels`. The year grid selects 2026-10-22 and keyboard ArrowRight/Enter selects 2026-10-30 at 1280. Birthday dates 1990-05-04 and 1980-01-01 stay off Hub and off those day reads. | PASS |
| Town preview | Non-empty town shows level text and an Open Town target of at least 44px. Empty town hides the card. The Town shortcut still opens `/town`. Loading, retry, and session-ended copy remain. No Treasury or progressbar. | PASS |
| Finance disclosure | Populated amount links to the dashboard at 320, 390, and 1280, light and night, including forced colors and 200% text. Empty vault keeps Add an account. | PASS |
| Weekly review | The existing shortcut still opens the SCENE-07 editor. This leaf does not change that route. | PASS |

Measured `documentElement.scrollHeight` on the production bundle, same synthetic fixtures, light and night:

| State | 390×844 | 1280×800 |
| --- | --- | --- |
| Populated trip, continuation, locked bills, town preview | 1672px | 988px |
| Empty travel and media, locked Finance | 908px | 800px |

Net worth on the empty page is 138px at 390 and 114px at 1280. Quick add, the last Up next action, and the Town shortcut fit inside 844px and 800px. Both themes match. Keyboard and touch journeys are the Hub Playwright specs, including 320px enlarged text.

## Deletion and compatibility

| Candidate | Disposition and owner | Proof |
| --- | --- | --- |
| Hub year strip and `pixels-hub-card.ts` | Removed. Date selection stays on the Pixels year grid (`/pixels?year=&day=`). Hub no longer reads Pixels. | Year-grid browser journey and zero `/api/pixels` requests from Hub |
| Open Travel, Open Media, Open Finance | Removed. The Trips shortcut, Media app link, continuation row, and net-worth amount remain the routes. | Compact Hub, coastal Finance tap, travel map journey, episode undo after leaving Hub |
| Second Unlock | Removed from Net worth. Up next keeps the one Unlock, including on the agenda. | One Unlock link; locked sentence remains |
| Empty Next trip, In progress, and Town setup cards | Hidden when there is nothing to continue. Failure and loading cards stay, with retry. | Empty and 503 browser checks |
| Town progress disclosure | Replaced by one level line and a small preview link. | TF5 Hub card |
| Reviewed Hub imports of `pixels-data.service.ts` and `pixels-model.ts` | Removed from the boundary allowlist with the imports. The allowlist regression now uses the remaining search-to-hub-load edge. | `make test-fast` |

`hubWindow` remains exported from `apps/web/src/app/pixels/pixels-dates.ts` and has no caller. Pixels source was left unchanged.

Against `849d3445`, Hub production files add 71 lines and delete 406, including the deleted card. Tests add 89 and delete 301. The boundary checker deletes 15 lines. No routes, editors, or stored records changed. Weekly review stays a shortcut.

## Verification

Commands ran in `/tmp/vivek-fixup-12` with Node v20.20.2, the repository `.venv`, and `CHROME_BIN` set to Playwright Chromium 156. `make test-fast` uses that venv on `PATH` because system Python has no Alembic. The production build's existing initial-bundle warning remains 731.13 kB against the 650 kB threshold. Release manifest `5bd63322e4cabeed39a7015430b2ef36922e30bd5d92d61f3f01675e95961493`.

| Command | Result |
| --- | --- |
| `make test-fast` | PASS. Path, planning, ownership, and discovery checks, 135 Python tests, 21 Node tests. |
| `make lint-web` | PASS. Existing ESLint baselines. |
| `make typecheck-web` | PASS. Seven TypeScript projects. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 734 tests. Statements 77.86% (12393/15916). |
| `make build-frontends` | PASS. Hub lazy chunk 55.83 kB. |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 287 tests. |
| `npx playwright test --project=suite` | PASS. 75 tests, including bundle-0 locked copy and empty vault. |
| `npx playwright test --project=finance apps/finance/frontend/e2e/coastal-theme.spec.ts` | PASS. 5 tests. Extra gate for the Hub amount link. |

The first Hub Playwright run failed before the bundle existed (`index.csr.html` 503). It was rerun after `make build-frontends`. One year-grid assertion was then corrected: the Pixels page's own Birthday navigation is not a leaked birthday date.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/641
- Roadmap #134 append-only status-note URL:
- Merged/activation status: not merged. Not deployed.
- Remaining external prerequisites or approved scope decisions: none for this leaf. `hubWindow` stays in Pixels with no caller.
- Next actor: merge after GitHub checks are green. #277 stays open.
