# FUX-01 — Make Holdings compact and immediately useful

- Leaf [#390](https://github.com/Vivekpsps3/vivek-monorepo/issues/390), parent [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304) and roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).
- Agent `issue_390`, branch `agent/fux-01`, worktree `/tmp/vivek-fux-01`.
- Base main `1a111853a413180fdab1946fde9cb6e56b032685`. Tested implementation `ea8b0decff43ec767b24354adecb45efd1a43fee`. Final browser verification `6bc8d8ed67e4fa27942fa90de2c2d6e4dc775108` adds only the alert-locator correction.
- Fresh main contained the NAV-01 canonical Holdings destination from [PR #498](https://github.com/Vivekpsps3/vivek-monorepo/pull/498) and the STYLE-03 compact table from [PR #496](https://github.com/Vivekpsps3/vivek-monorepo/pull/496). Checked live open PRs before the [isolated claim](https://github.com/Vivekpsps3/vivek-monorepo/issues/390#issuecomment-6985861573).

## Acceptance

| Row | Executed proof | Result |
| --- | --- | --- |
| FUX-01-A1 | Eight named encrypted synthetic positions open through `/finance/have?t=holdings`. The first symbol HARBOR and its full $249.12 value fit in the initial 390×844 and 1280×800 viewports in light and night modes. The phone account-group journey also measures the first brokerage row before scrolling. | PASS |
| FUX-01-A2 | The summary names available value, missing position value and stale quotes. TIDE retains its $51.16, quote date and stale age on 503. A failed UNLISTED refresh reports the failure while the unpriced position keeps its unavailable value and unknown basis. A failed HARBOR save preserves the three-share draft. Retry persists three shares and the displayed value becomes $373.68. Account and company queries filter the same real rows. Two identical account nicknames remain separate. CSV contains the selected symbols, basis, source and dates. | PASS |
| FUX-01-LIFE | Hold the actual row or all-prices request, create an edit draft, lock Finance from a second tab and release the quote. The draft disappears. Neither late feedback nor a write lands. Re-unlock still reads the original $249.12. Same-session holding and nickname errors retain their input and can be retried. | PASS |
| FUX-01-VIEW | `dense-holdings.spec.ts` measures first-screen visibility and width, 44px row and menu controls, menu keyboard/Escape and dialog focus return, touch edit and download, axe including the menu, and reduced motion. The 320px and 200% text cases retain no-overflow assertions. Existing Fidelity journeys retain preview, cancel, replacement, reload, staged resume, explicit price refresh and contrast checks. Account settings walks to and downloads the header-only CSV for an empty vault. | PASS |

Fixtures use synthetic ciphertext and isolated test vaults. Explicit price
requests receive synthetic quote responses and write only through the normal
Finance store. Captures attached to the browser report show the first position,
summary and group headings at both widths/themes and the opened Holdings menu.
I inspected those captures for legibility, spacing and focus. Independent owner
visual approval and production activation remain separate.

## Deletion and compatibility

| Removed path | Previous consumer | Surviving owner and proof |
| --- | --- | --- |
| Standalone refresh/import header buttons, export beside search and the duplicate empty-state action pair | Holdings arrival and settings portfolio export | One Add holding button and the shared Holdings actions menu. Filtered and empty CSV, Fidelity preview and explicit price refresh execute their existing handlers. Staged imports have a compact disclosure with their existing Resume action. |
| Two nested brokerage disclosure levels, repeated summary header and inline nickname control inside a summary | Portfolio Holdings | One disclosure per brokerage account, stable ID grouping, one manual group and one existing table template. The existing dialog owner provides nickname focus, and the same encrypted account record is used on retry. |
| Redundant brokerage import discovery subscription, forwarding methods and options type | The Fidelity dialog opened a hardcoded Fidelity flow and ignored the lookup result | Fidelity CSV parsing, preview, replacement and staged resume remain in the same owners. No other consumer of `getBrokerageImports`, `listBrokerages` or `listClientBrokerageImports` exists. |
| Repeated initial/retry holdings load handlers, unused loading subscription and unused `trackByHoldingId` | Portfolio arrival/filter | Arrival and retry use `retryLoadHoldings`. The holdings stream continues publishing the only row projection. The loop tracks persistent row IDs. |

Feature replacement. Production code and styles add 258 and remove 425 physical
lines, including whitespace and comments. Tests add 181 and remove 52 lines.
The Finance lint allowance falls by one after eliminating a loose comparison.
There are no moved or generated files in the diff. Holdings still has one source
projection, table, position editor and record owner. There is no new persisted
state, public API, valuation formula, vault protocol or canonical route. No
price, basis, position date, active import generation or supported CSV format
changes. A later Holdings presentation change still starts in the Portfolio
component. Account names, storage, import and quote policy retain their owners.

## Verification

Node 24, existing repository Python environment, installed Chromium and the
repository's locked npm dependency tree. The required gates ran locally before
PR creation.

| Exact command | Final result |
| --- | --- |
| `make test-fast` | PASS. Documentation, boundaries, planning, script checks, 135 Python and 21 Node tests. |
| `make lint-web` | PASS. Finance/Site/packages/world-engine lint and engine purity. The existing Portfolio template allowance tightens from 9 to 8. |
| `make typecheck-web` | PASS. All seven TypeScript targets. |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 503 tests and coverage. |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 417 tests and coverage. |
| `make e2e` | PASS. Production build/manifest and 245 Finance browser tests with five existing viewport skips. |
| `npx playwright test --project=suite` | PASS. 59 shared shell and cross-app browser tests. |

The initial 390px baseline reproduced the first-position failure. Iteration
found obsolete assertions for the prior toolbar, exact column order, CSV delimiter text and the visible toast glyph. Updated assertions measure actual menu paths, date/basis labels,
touch sizes and the order of the visible columns. The full first browser run
also caught the empty export path. The export still downloads the same scoped
CSV even when it contains only headers. Python backend/lint/type gates, Site
Karma and non-Finance standalone browser projects were not run locally because
the source diff is within Finance and its existing shared-shell entry. The
GitHub workflow runs those projects and release rehearsal.

## Handoff

- The closing PR and scoped roadmap note are linked from the #390 timeline.
- Published diff and exact-head CI will be vetted before authorized merge.
- The parent integration owner reconciles the roadmap and packet archive.
