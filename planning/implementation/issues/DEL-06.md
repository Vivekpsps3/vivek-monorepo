# DEL-06 — Remove obsolete UI styling paths and completed planning archives

- Stable key: `DEL-06`
- GitHub leaf: [#358](https://github.com/Vivekpsps3/vivek-monorepo/issues/358)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200)
- Kind: `implementation`
- Dependencies: none
- Conflict groups: `shared-styles`, `finance-presentation`, `private-shell`, `planning-guidance`
- Verification profiles: `shared_front`, `docs`

Owner-selected broad deletion on 2026-11-14. Base `5bc07c2aab4345446f408d6e331cd1bef193f4d6`.
Read root/app AGENTS and the [deletion contract](../deletion-strategy.md).

## Outcome

Shared Angular controls have one styling owner, obsolete scoped presentation paths
are gone, and completed planning archives no longer compete with current guidance.

## Requirements

- Owner request: largest safe functionality-preserving deletion PR, including stale planning cleanup.
- #200 TD-24/25/26/30: clear style ownership, actual caller migration and removal evidence.
- Preserve supported behavior, data, crypto/migration compatibility and active acceptance.

## Source paths

- `packages/ui/kit.css`
- `packages/ui/controls.css`
- `packages/ui/src/ui-menu/ui-menu.component.ts`
- `apps/site/src/app/components/secrets/secrets.component.html`
- `apps/finance/frontend/src/app/planning/planning.component.css`
- `planning/suite-experience-remediation/README.md`

## Target paths

- `packages/ui/`
- `apps/finance/frontend/src/app/`
- `apps/site/src/app/components/secrets/`
- `apps/travel/frontend/src/travel.css`
- `apps/web/src/app/hub/hub.component.css`
- `apps/web/src/styles.css`
- `planning/`
- `docs/`

## Steps

1. Fresh-read main, live claims and callers; work in an isolated worktree. Preserve the MED-06 claimant's detail/media.css surface.
2. Capture unchanged production control styling at 390/1280 in light/dark with synthetic data.
3. Migrate menu triggers and public demo buttons to existing component styling, then delete global card/header/button copies. Retain live back links and public navigation.
4. Remove only verified unused Finance/Hub/Travel selectors and no-caller Finance helpers. Review dynamic classes, projected content and deep selectors manually.
5. Replace completed remediation records and superseded brief/reviews with pinned history links; retain active packets, Living World requirements and implementation evidence.
6. Execute launch-expanded checks plus actual-diff root gates; record parity, consumer ledger and physical production/test/docs/binary changes separately before opening the PR.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| STYLE | Existing menu/button/card/header and public demo consumers | render and interact at phone/desktop widths in both themes | styling, focus, disabled states, touch targets and encryption/decryption remain correct | before/after computed styles and executed unit/browser journeys |
| DELETE | Scoped classes and Finance helper candidates | trace template, dynamic, import and test callers | only obsolete paths disappear; migrated live consumers use existing owners | reviewed selector/helper ledger and negative physical production delta |
| HISTORY | Completed plans and incoming references | remove obsolete checkout copies | current links resolve and immutable historical evidence remains reachable; active acceptance unchanged | doc-path/planner checks and pinned history links |
| GATES | Complete replacement closure | run required local commands | gates/assertions/discovery/retries stay intact and every required check passes before PR | exact command/results in evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Global card/header/button copies | Delete after menu/demo callers adopt the existing controls; retain native utilities | duplicate live policy | control parity and browser interaction |
| Unused scoped selectors and uncalled Finance helpers | Delete with no replacement layer | verified orphan | source/template/dynamic caller ledger and gates |
| Completed remediation archive and superseded brief/reviews | Remove checkout copies; retain immutable history links | stale docs | repaired incoming links and unchanged active packets |

## Non-goals

- No feature, supported format, migration history or useful regression-test removal.
- No retirement of legacy login/enrollment: live browser/fixture callers remain; DEL-02 stays open.
- No completion of REF-01, product parents or deployment/activation claims.

## Test scenarios

Menu keyboard/focus and icon-only triggers; demo disabled/encrypt/decrypt/error states;
Finance controls, imports, Planning and scoped child presentation; responsive shell,
Travel/Media/Town consumers; dynamic chart/result/button/badge classes; doc navigation.

## Risks

Selector name searches miss generated classes and child/projection scope. Preserve those
counterexamples and compare actual production rendering, not just static search output.

## Completion evidence

Use [DEL-06 evidence](../evidence/DEL-06.md) for exact results, surviving owners,
physical deltas and handoff. Close only #358; reference #200. Merge/deployment requires owner authorization.
