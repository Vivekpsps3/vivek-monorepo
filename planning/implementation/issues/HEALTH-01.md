# HEALTH-01 — Build the complete private Clinic with shared units and entry-dialog shell

- Stable key: `HEALTH-01`
- GitHub leaf: [#256](https://github.com/Vivekpsps3/vivek-monorepo/issues/256)
- Parents: [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `SAFE-02`, `SAFE-03`, `SAFE-04`, `TOWN-01`, `CON-02`, `SEC-05`, `SEC-06`
- Conflict groups: `health-store`, `health-clinic`, `health-units-dialog`, `private-routes`
- Verification profiles: `web_front`, `finance_front`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

An owner can inspect and correct health measurements with useful history, safe drafts and clear locked/retry behavior.

## Requirements

- #90 implementation1/Clinic half,2/shared units+dialog,3/all Clinic kinds,5/Clinic dialog/privacy; #88/#96 retained supporting source; no new collection/endpoint.

## Source paths

- `apps/web/src/app/town/health/health-store.service.ts`
- `apps/web/src/app/town/health/health.types.ts`
- `apps/web/src/app/town/health/health-validate.ts`
- `apps/web/src/app/town/health/health-units.ts`
- `apps/web/src/app/town/health/health-math.ts`
- `apps/web/src/app/town/health/index.ts`
- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`

## Target paths

- `apps/web/src/app/town/health/`
- `apps/web/src/app/town/`
- `apps/web/src/app/routes.ts`
- `apps/web/routes.json`
- `apps/web/e2e/`

## Steps

1. Read fresh main, the parent retained scope and this packet; inspect current open PRs and consumers before editing. Capture baseline behavior and mark each owned requirement as already proved or requiring a change.
2. Mount /town/clinic using existing store/validators and approved narrow vault adapter; skeleton/8s unavailable+Retry/corrupt count/locked states, unlock/setup next returns to origin.
3. Use one display-only owner/device units preference town.health.units.v1 defaultlb/mi and a small reusable entry dialog shell; conversions never rewrite persisted records/revisions.
4. Render latest value/date,12point accessible sparkline/equivalent text, lab groups with in/below/above/no-range text, checkups and100-per-kind initial window with Show more.
5. Deliver create/edit/delete for weight,restingHR,bloodpressure,sleep,lab,checkup with unit labels/canonical limits/linked errors/first invalid, focustrap/Escape/return and exact permanent-delete confirmation.
6. Keep save/failure/retry/conflict drafts safe; clear records/derived values on lock/owner/routeleave, abort obsolete loads and include collection in recovery.
7. Remove the superseded live path in this PR after migrating its consumers. Record actual production/test LOC and independent implementations before/after; added layers need a named safety reason and a real consumer.
8. Run all applicable verification profiles expanded by the planning guide, add the specific behavior regressions below, and record exact commands/results and acceptance IDs in issue-specific evidence. Open a PR only after applicable local gates pass.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| CLINIC1 | all six Clinic kinds,existing records and >100-per-kind history | create/edit/delete/show-more and change units | limits/history/sparklines/ranges correct; display conversions leave stored bytes/revisions unchanged | pure validators plus full Clinic browser record roundtrips |
| CLINIC2 | locked/new vault,corrupt/slow/error rows and conflict | open deep link/unlock/setup,retry or correct dialog | return-to-origin,8s/local retry/corrupt notice/draft/errors/focus behave as intended | route/load/dialog browser and promise-gate tests |
| CLINIC3 | marker lab/name during held decrypt/save | lock/switch owner/leave then release and export/restore | no retained digits/text or plaintext network/storage; restored allowed records work under current owner | marker and all-collection recovery/browser evidence |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| potential Clinic-specific units/conversion/form lifecycle copies | use one shared Health unit control/dialog shell and existing canonical functions | required | Gym can adopt same mechanics without copying validators or persisted conversions |
| helper-only/unmounted Clinic seams | replace with actual routed CRUD and remove empty buttons/state | required | real create/edit/delete journey, no duplicate endpoint/store |

## Non-goals

- No medical advice, Health endpoint, new collection, persisted derived units or general form builder.

## Test scenarios

- sixkinds;limits;unitsinvariance;12points/text;lab ranges;100/showmore;corrupt/timeout;unlocknext;conflict;deletefocus;markers

## Risks

- Current main or an overlapping open PR may already change part of this surface. Preserve landed behavior and user edits; do not recreate a stale implementation or claim acceptance from an old snapshot.

## Completion evidence

- Every acceptance ID links to an executed behavior test or explicit reviewed disposition, with source revision and fixture description.
- The PR lists migrated callers, removed paths/duplicate state, actual before/after production and test LOC, and any retained compatibility with reason.
- Applicable local commands pass before PR creation; issue evidence distinguishes local execution, CI, merge and deployment.
- After merge, freshly read the roadmap and update only this packet row and owning parent checklist; do not close its parent until all retained scope is disposed.
