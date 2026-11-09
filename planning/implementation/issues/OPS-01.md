# OPS-01 — Prove runner/release routing and simplify the current operations contract

- Stable key: `OPS-01`
- GitHub leaf: [#272](https://github.com/Vivekpsps3/vivek-monorepo/issues/272)
- Parents: [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `ci-release`, `operations-docs`, `runner-config`
- Verification profiles: `ops`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

The owner can tell what is verified, what is trusted, and what still needs configuration without maintaining another deployment controller.

Reconcile configured CI/release/prod boundaries and document actual trusted routing/governance with redacted evidence.

## Requirements

- #125 Acceptance1/2 runner routing/protection/release evidence and settled trusted-runner policy.
- TD-33 diagnostics subset; TD-36 dependency/host/security update policy; broader host changes remain separate.

## Source paths

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `ops/actions-runner/compose.yml`
- `ops/actions-runner/pool.sh`
- `ops/actions-runner/register.sh`
- `docs/LOCAL-RUNNER.md`
- `docs/OPERATIONS.md`
- `docs/SRE-FOLLOWUPS.md`

## Target paths

- `.github/workflows/ci.yml (only demonstrated routing fix)`
- `.github/workflows/deploy.yml (only demonstrated guard fix)`
- `ops/actions-runner/`
- `docs/LOCAL-RUNNER.md`
- `docs/OPERATIONS.md`
- `docs/SRE-FOLLOWUPS.md`

## Steps

1. Read current main workflow and runner configuration; compare trusted/fork routing, production environment guards, labels and actual supported GitHub protection settings through authorized read-only tools.
2. Record resource/capacity and access prerequisites with redacted output; separate code configuration from runtime installation and do not publish addresses, tokens or host state.
3. Reproduce/fix only proven routing/release check defects; preserve exact-tested-SHA, migration rehearsal and rollback restrictions.
4. Consolidate duplicate/contradictory operating instructions and document a small owned update cadence for pinned dependencies/images/actions without adding an installed controller.
5. Carry exact missing governance/runtime evidence as explicit external prerequisites rather than treating historical success as proof today.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| A01 | Current configuration and available authorized read-only runner/settings access | routing/protection evidence is collected | trusted test/release/prod boundaries and unsupported/missing settings are accurately documented | redacted configuration/API evidence with source SHA |
| A02 | Fork/untrusted workflow or unsuccessful CI/rehearsal | production deployment path is evaluated in fixtures | production cannot promote an untested/untrusted build | workflow/deploy script behavioral fixtures |
| A03 | A historical operations claim differs from current config | docs are reconciled | one current command/policy owner replaces conflicting instructions without new controller state | doc/source comparison and local script tests |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Competing runner/deploy controller instructions and copied configuration authorities | Remove obsolete guidance/helpers only after proving they are unreferenced; keep tracked Compose/workflows as authority. | required | Read-only consumer inventory and release script regressions. |

## Non-goals

- Do not change the signing/AES-GCM protocol or move private plaintext server-side.
- Do not add a second ledger, state store, background daemon or generic framework.
- Do not claim external activation, deployment or merged completion without evidence.

## Test scenarios

- Trusted vs fork routing, missing protection features
- Stale SHA/failed rehearsal/manual gate rejection
- Redaction and declared update/host-control ownership

## Risks

- Actual host-wide privilege/firewall changes and new accounts are outside this PR; missing access remains explicit.

## Completion evidence

- Issue-specific acceptance matrix with test/artifact for every row, exact commands and source/base revision.
- Deletion ledger: removed vs moved vs necessary new production code, surviving consumers and compatibility proof.
- One reviewable PR closing this leaf only, with parent references and a fresh roadmap status note.
