# CON-02 — Catch server/Angular route drift with explicit route examples

- Stable key: `CON-02`
- GitHub leaf: [#207](https://github.com/Vivekpsps3/vivek-monorepo/issues/207)
- Parents: [#197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197), [#196](https://github.com/Vivekpsps3/vivek-monorepo/issues/196)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `UX-01`
- Conflict groups: `private-routes`, `server-composition`
- Verification profiles: `server_back`, `web_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

New mounted pages work through direct load and refresh and omissions fail before merge.

Add a small route parity contract over existing declarations; do not build a route-generation framework.

## Requirements

- TD-06
- TD-01 systemic prevention; UX-01 owns the concrete Profile fix
- #197 mounted/reserved/alias/private distinctions

## Source paths

- `apps/web/routes.json`
- `apps/web/src/app/routes.ts`
- `apps/web/src/app/settings/settings.registry.ts`
- `apps/server/frontend.py`
- `apps/server/tests/test_composition.py`
- `apps/web/src/app/private-layout.component.ts`

## Target paths

- `apps/web/routes.json`
- `apps/server/tests/test_composition.py`
- `scripts/`
- `apps/web/src/app/`
- `docs/ARCHITECTURE.md`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. After UX-01 merges, inventory current routes with owner and representative examples, explicitly separating mounted routes, reserved document patterns, aliases and unknown paths. Preserve existing code-shaped lazy route declarations.
3. Implement a small checked example table or parity test that exercises the real server handler and the Angular registered route contract. Reuse settings registry entries rather than hand-maintaining another settings list where feasible.
4. Cover parameterized paths, public/private CSP and auth policy, assets/API404s, aliases and deep query fragments. Keep app-switcher placement optional; not every page is a top-level app.
5. Remove obsolete duplicated route expectation lists when the new parity owner covers the same behavior. Record all intended exceptions with actual callers/tests.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A mounted settings route is deliberately omitted from the document route manifest fixture | the parity check runs | it fails with the missing route/owner rather than passing an obsolete404 assertion | negative omission fixture |
| LOCAL2 | A registered page and alias are opened fresh and reloaded | server composition and client route checks run | correct page/auth/CSP/redirect behavior is preserved | real route matrix plus client/browser evidence |
| LOCAL3 | Unknown page, asset and API paths are requested | the route machinery handles them | they remain404 rather than a permissive SPA success | existing neighboring404 tests |
| LOCAL4 | The parity contract is used | route declarations are edited for a new representative example | no new manually copied universal route list is needed | registration/edit-site ledger |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Overlapping handwritten route expectation tables covered by the new examples | Consolidate shared facts into one reviewed example source and retain semantic API/asset tests | required | existing assertions mapped to surviving parity/behavior tests |

## Non-goals

- No wildcard SPA fallback
- No route plugin/code generator
- No changing auth/CSP trust class
- No duplicate implementation of UX-01

## Test scenarios

- Profile and Birthday fresh load/reload; route params/query aliases
- missing declaration negative fixture
- unknown page/asset/API404 and public/private document policy

## Risks

- Server reserved routes can intentionally precede client pages. Treat reserved as a declared state, not proof the feature is mounted. Generating Angular code solely to reduce a small list may add more machinery than a parity test.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
