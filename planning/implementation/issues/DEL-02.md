# DEL-02 — Retire only proven unreachable runtime compatibility paths

- Stable key: `DEL-02`
- GitHub leaf: [#214](https://github.com/Vivekpsps3/vivek-monorepo/issues/214)
- Parents: [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200), [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `identity-origin`, `identity-session`, `vault-compatibility`, `schema-head`
- Verification profiles: `finance_back`, `server_back`, `finance_front`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

Normal operation carries fewer dead authentication/data-format branches without stranding any supported user or ciphertext.

Investigate and remove runtime migration/fallback machinery only where supported-data and caller evidence proves it obsolete; preserve historical migration records.

## Requirements

- TD-29 compatibility eligibility
- TD-30 lifecycle documentation
- #200 supported-data preservation and exact retirement evidence
- #121 current signing/wrap protocol preservation

## Source paths

- `docs/LIFECYCLE.md`
- `apps/server/identity/routes.py`
- `apps/server/identity/session.py`
- `apps/server/identity/schemas.py`
- `apps/finance/backend/legacy_schema_guard.py`
- `apps/finance/frontend/src/app/crypto/vault-crypto.ts`
- `apps/finance/frontend/src/app/crypto/encrypted-store.persistence.ts`

## Target paths

- `apps/server/identity/routes.py`
- `apps/server/identity/session.py`
- `apps/server/identity/schemas.py`
- `apps/server/identity/models.py`
- `apps/finance/backend/tests/`
- `docs/LIFECYCLE.md`
- `planning/implementation/`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Inventory legacy runtime routes/fields/fallbacks with current supported database generation, startup preflight behavior, browser caller and admin/enrollment caller. Start with login/migrate and passwordless/enroll versus current startup refusal, not active invitation enrollment.
3. For each candidate record an eligibility decision: already unreachable for all supported states; still needed by a valid fixture/client; or requires an explicit owner support-policy decision. Do not inspect private production contents or purchase/change service configuration.
4. For eligible runtime-only branches, remove route/helper/schema imports and superseded tests while adding a behavior test for supported current login/invitation/bootstrap/reset and the intentional retired-route result. Keep Alembic history, saved ciphertext/AAD compatibility and still-supported browser rewrites.
5. If every candidate still has supported callers/data, do not silently end support or close a deletion claim; return the exact prerequisite/policy question with a reviewed retirement disposition. A docs-only eligibility outcome must be labelled as such, not a landed runtime deletion.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A compatibility branch is proposed for removal | all supported-state and caller evidence is reviewed | only branches with a proven unreachable or explicitly retired support contract are eligible | retirement ledger with fixture/caller evidence |
| LOCAL2 | Eligible old runtime endpoints are removed | current login/bootstrap/invitation and actual supported legacy fixture run | current users remain usable and intended retired route behavior is explicit | auth/API regression matrix |
| LOCAL3 | Persisted v1/v2 ciphertext or a still-needed browser migration is present | normal data loads | no supported format is deleted or silently made unreadable | current legacy crypto fixture tests |
| LOCAL4 | Evidence is insufficient to end a support path | agent reaches the stop condition | no destructive deletion occurs and issue records the exact unmet prerequisite instead of false completion | PR/issue evidence distinguishes investigation from implementation |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Proven unreachable runtime password-only migration handlers/helpers/schema fields | Delete only after supported-data/startup/caller proof; keep active invitation/bootstrap paths | conditional | eligibility record plus supported-state tests |
| Runtime compatibility branches with no supported data/client consumer | Remove associated redundant runtime code and only superseded assertions | conditional | fixture-backed retirement proof |

## Non-goals

- No automatic removal of v1 ciphertext migration or legacy blind indexes
- No deleting/reformatting applied Alembic history
- No data purge or private production inspection
- No ending a supported enrollment/data policy by assumption

## Test scenarios

- current passwordless login, invitation/bootstrap/admin enrollment
- startup refusal and supported legacy fixture matrix
- retired endpoint404/410 behavior without widened auth fallback

## Risks

- Documentation calls some flows historical while code still registers them; contradiction is investigation evidence, not proof deletion is safe. This packet may be gated on an explicit support decision; do not fabricate negative LOC.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.

## Concrete deletion plan

Start with routes.py login_migrate (/auth/login/migrate) and enroll_passwordless (/auth/passwordless/enroll). For each, trace browser/admin callers, startup checks and supported database fixtures. Build a row for each route, request schema, helper and field that becomes unreachable; remove only that dependency closure. Active invitations, bootstrap/signup and /auth/passwordless/wraps are separate supported paths.

Do not equate an old-looking name with dead state. A supported v1/v2 ciphertext fixture, current browser migration, signing wrap or invitation consumer blocks that removal. Immutable revisions AND helper functions imported by them remain intact. A verified 404/410 contract must be deliberate and covered alongside current login/enrollment/reset.

Use the common identity-origin, identity-session and schema-head scheduling groups. SEC-01/02 and this packet overlap even when their original group labels differed. An eligibility report is not runtime deletion evidence.
