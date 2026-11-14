# DEL-06 — implementation evidence

- Leaf: [#358](https://github.com/Vivekpsps3/vivek-monorepo/issues/358); parent #200 remains open.
- Branch/worktree: `agent/deletion-sweep`, `/tmp/vivek-deletion-sweep`.
- Base main: `5bc07c2aab4345446f408d6e331cd1bef193f4d6`.
- Selection: explicit owner request for a broad deletion PR; no open PRs at claim.
- Claim: https://github.com/Vivekpsps3/vivek-monorepo/issues/358#issuecomment-6873610059
- Scope and acceptance: [packet](../issues/DEL-06.md).

## Acceptance

Implementation and verification in progress. Results below are recorded only after execution.

## Deletion and compatibility

- Global `ui-card` and page-header copies were shadowed by their component styles.
- Menu triggers now load the existing button stylesheet directly; the public demo uses `UiButtonComponent`.
- Global back-link styling remains because Travel and Media templates use it directly.
- Dynamic button/badge variants, chart swatches and child result KPI variants remain.
- Finance parent result selectors cannot style child-owned elements under Angular encapsulation; child styles remain.
- Finance orphan helpers have no import/template/test/config consumer or public-barrel reexport: `transactionIncome`, `transactionSpending`, `liabilityReviewState`, `validatePlanningPaths`, `validateGrowthPercent`, `isRecordedDate`, `centsToStoredDollars`.
- Legacy migration login/enrollment is retained: LoginComponent and backend fixtures still call it. Unified `schema.assert_ready` checks revision compatibility, not password-only account eligibility; historical Finance preflight is insufficient retirement evidence.
- Completed archive provenance is pinned at the base commit. Active queue packets, evidence, technical-debt requirements and Living World scope remain.
- No tests, migration revisions, domain formulas, vault formats or product features are removed.

## Verification

- Unchanged production build: PASS, `make build-frontends` at the base tree.
- Unchanged baseline capture: PASS, temporary Playwright runner; 36 route/viewport/theme combinations, screenshots and computed styles in `/tmp/deletion-baseline*`.
- Final required checks: NOT RUN yet.

## Handoff

- PR: not opened; implementation and local checks in progress.
- Merged/activation: neither merged nor deployed.
- Next action: finish consumer parity and run packet/root gates, then record exact results and open the PR.
