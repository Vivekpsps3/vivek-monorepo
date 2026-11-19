# FUX-02 — Simplify account, asset and debt browsing and editing

- Leaf [#391](https://github.com/Vivekpsps3/vivek-monorepo/issues/391) and parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304).
- `agent/fux-02`, isolated `/tmp/vivek-fux-02`. [Leaf claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/391#issuecomment-7002355503).
- Starting main `9ae590269cde2f2cda1b03f54eb717d163efee94`. Integrated main `402f86eb01a242d3097a61d9fe482d73d38b9299` after a non-overlapping planning update. Tested source `73b620cec7e120e5722106660fe6f31368f5e31f`.
- Fresh main contained [NAV-01](https://github.com/Vivekpsps3/vivek-monorepo/pull/498)'s canonical Accounts link and [STYLE-03](https://github.com/Vivekpsps3/vivek-monorepo/pull/496)'s shared compact table. The live leaf and open PRs showed no competing Finance claim.

## Acceptance

| Row | Current proof | Result |
| --- | --- | --- |
| FUX-02-A1 | Finance Home opens the visible Accounts heading at the existing `/finance/have` route. Search locates the synthetic Harbor checking account, which is edited locally. A failed encrypted write keeps the draft and $950.00 net worth. The retry uses the same expected revision and the only observed total change is to $1,149.25. The date, notes and review metadata survive. The card activity link opens the separate Pier groceries transaction and browser Back returns to the same Accounts route and updated total. | PASS |
| FUX-02-A2 | The synthetic checking asset, the zero-value unbroken-name reserve, $300.00 of holdings and $250.00 owed show an authoritative $1,250.00 total. The reserve has one readable $0.00 balance with No source date, and the name fits clear of the value column on mobile. The debt shows −$250.00 and its own Oct 11 source date. Searches filter the displayed rows without changing totals. The existing invalid-amount and empty-state journeys still run. | PASS |
| FUX-02-LIFE | Held synthetic asset save fails after another tab locks the vault. Accounts and its editor disappear, the losing response shows no draft or feedback, and unlocking returns the saved $1,200.00 account without the draft. A component test also resolves a cancelled save after a different editor opened and verifies the new editor stays intact. Existing two-tab record identity, lock and planning coherence tests run. | PASS |
| FUX-02-VIEW | `dense-accounts.spec.ts` executes the keyboard or touch arrival, search, 44px row actions, invalid amount correction focus, Escape return, content overflow and axe at 390×844 and 1280×800 in light and night with reduced motion. Synthetic screenshots show layout and correction focus in each theme and viewport. | PASS |

Reviewed the synthetic visual captures separately from automated assertions. The
compact toolbar leaves the first balance usable on phones, and the desktop
groups align their values and actions across tables. The first reviewed phone
layout still overlapped the unbroken name and the zero column. Added a geometry
assertion that reproduced it, then fixed the column placement and confirmed the
corrected captures.

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner and disposition |
| --- | --- | --- |
| Separate desktop tables and phone lists, each with duplicated identity, amount, warning, date and actions | Accounts via `HaveHubComponent` and its Finance and suite browser consumers | Removed all four presentation loops and phone-only list styles. One compact table template renders both groups, and one row appears at either width. A suite lock check now reads the row header and retains its complete private-state assertions. |
| Separate asset/debt forms, validation state, modal close and write feedback | Add, edit and invalid-amount correction in Accounts | One scoped editor and form use the same two existing validators and FinanceService write types. Correcting an excluded amount still opens its editor. Date, category, notes and review metadata remain supported. One remove flow retains the confirmed delete and same-session retry. |
| Hidden route heading plus an embedded Accounts header, and duplicate empty add actions | Accounts arrival and empty-state navigation | Accounts renders one visible heading and one Add asset/Add debt pair. The legacy `?t=assets` alias and Holdings route continue to resolve. Existing empty-state copy remains. The Planning link uses the Accounts destination name. |
| Unused per-kind date-summary methods and duplicated view-level formatter markup | Former Accounts templates | Removed unused methods and use the existing summary and date formatter once per presentation. No money or date rules moved. |

Production delta against integrated main is +455/−651 physical lines. There are
no moved or generated files in the change. Tests and this evidence are separate.
FinanceService and its encrypted store still own data, revision checks and net
worth, with no public API or protocol change. A later Accounts presentation
change starts in the existing Finance component and its shared table/dialog
controls.

## Verification

Commands ran using the installed dependency tree, existing repository Python
environment and Chromium. All fixtures use synthetic browser-local encrypted
records and test responses.

| Exact command | Result |
| --- | --- |
| `make test-fast` | PASS. Documentation paths, boundaries, Finance UX, planning, 135 Python tests and 21 Node tests. |
| `make lint-web` | PASS. All existing lint baselines and engine purity. |
| `make typecheck-web` | PASS. All seven TypeScript targets. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 504 tests and coverage. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 417 tests and coverage. |
| `make e2e` | PASS. Production bundle, release manifest, 251 Finance tests and five existing viewport skips. |
| `npx playwright test --project=suite` | PASS. 59 shell and cross-app browser tests. |
| `npx playwright test --project=finance dense-accounts.spec.ts --grep 'groups readable' --workers=1 --output=/tmp/fux-02-final-account-capture-results --reporter=html` | PASS. All four visual review cases and their attached images. |

The initial production compile caught the union of the two write observables
and the missing monetary parse options. Corrected the shared editor typing and
kept the existing validation and money parser. The first lint run found an
additional constructor injection warning. The new vault dependency uses
`inject`, and the lint baseline remains unchanged. The first suite run found
an obsolete plain-cell selector in the cross-tab lock journey. The semantic
row-header selector now preserves the same visible synthetic marker before locking.
An intermediate full Finance run passed 250 other cases and hit a Chromium
`browserContext.close` timeout in the unchanged passphrase network case. The
final complete run passed that case unchanged.
The phone long-name geometry assertion failed against the initial layout and
passes with the corrected layout.

Python backend gates, Site Karma, and standalone Media, Travel and Town browser
gates were not run locally. The implementation touches Accounts, one Finance
Planning link, and existing Finance/shared-shell browser assertions. PR CI runs
all projects and release verification.

## Handoff

- The #391 timeline links the closing PR, the scoped roadmap note and pre-merge evidence.
- The integration owner owns roadmap reconciliation and packet archiving.
