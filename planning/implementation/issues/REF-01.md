# REF-01 — Prove a lean feature workflow and publish measured deletion guidance

- Stable key: `REF-01`
- GitHub leaf: [#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219)
- Parents: [#197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197), [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199), [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: `CON-01`, `CON-02`, `CON-03`, `SAFE-03`, `SAFE-04`, `VER-01`, `VER-02`
- Conflict groups: `planning-guidance`, `architecture-docs`, `deletion-scorecard`
- Verification profiles: `docs`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

An agent can implement a small field, provider or private-record feature using explicit existing owners and known checks.

Exercise current contracts with a disposable vertical slice and a compact agent playbook; retain no toy production app or scaffold framework.

## Requirements

- TD-00 change-cost baseline
- TD-30 current docs
- TD-31
- TD-37
- TD-38
- TD-39
- #197 executable extension proof; #199 measured feedback; #200 deletion-first completion

## Source paths

- `planning/technical-debt/feature-addition-playbook.md`
- `planning/technical-debt/2026-11-09-remediation-plan.md`
- `planning/implementation/`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/ADDING_A_BANK_IMPORT.md`
- `AGENTS.md`

## Target paths

- `planning/implementation/`
- `docs/DEVELOPMENT.md`
- `docs/ADDING_A_BANK_IMPORT.md`
- `docs/ARCHITECTURE.md`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Choose three representative changes and record semantic registration sites/unrelated-module edits/check times: a field/filter, one provider fixture adapter and one encrypted record list/editor. Use disposable fixtures/worktree examples; do not ship a fake app.
3. Exercise the merged route, collection, lifecycle and discovery contracts on the smallest synthetic private-record flow, including create/reload/conflict/lock/export membership and removal/unregistration. Delete all temporary production scaffolding before the PR.
4. Update one concise feature-addition guide and agent completion checklist from the actual proof. Link authoritative verification/architecture files instead of copying their volatile counts and commands into many independent documents.
5. Compare before/after registration counts and actual verification timings; give a deletion ledger for redundant boilerplate and explicit stop rules for new layers. Map remaining TD items to actual owning leaves so no broad parent closes merely because this guide exists.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A contributor follows the guide with the current merged contracts | a disposable record or field proof is implemented | it needs no private Finance/World import or guessed quality inclusion | reproducible proof log with exact semantic edit sites |
| LOCAL2 | The proof feature is removed | registration and discovery checks run | no toy route/source/collection implementation or dead scaffolding remains in production | unregistration/consumer diff and zero leftover symbol check |
| LOCAL3 | Before/after cost is reported | a reader checks claims | timings and independent edits are actual observations with source/machine context, not LOC-only promises | measured scorecard |
| LOCAL4 | The guide is used to plan Cards/Sidequests | scope is assessed | only discovery/product selection changes status; no app/banking/provider implementation is silently authorized | links to DISC-01/DISC-02 and retained parent scope |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Disposable proof production code and registrations | Remove before merge; retain only minimal test fixture/docs needed to prove the extension contract | required | zero live production route/collection/symbol for the toy feature |
| Copied obsolete onboarding facts/boilerplate superseded by current authoritative guides | Consolidate into one concise current guide and links | required | docs consumer and link validation |

## Non-goals

- No generator/scaffold framework
- No new runtime registry beyond merged minimum contracts
- No implementation of Sidequests/Cards
- No claiming arbitrary future integrations become free

## Test scenarios

- repeatable disposable proof with route/storage/lifecycle/discovery
- removal/unregistration and retained compatible data policy
- agent launch read order and actual applicable checks

## Risks

- A reference pattern can become another platform project. Keep the deliverable small, delete toy code and measure actual repeated decisions removed. Encrypted recovery execution requires the SEC restore packet to exist; otherwise prove membership and leave real roundtrip evidence with its owner.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.

## Concrete deletion plan

Use the existing work packets, scoped guidance and launch command. Do not add a second scaffold/registry or copy packet details into queue.json. The queue is scheduling metadata; each Markdown packet is the only local source of detailed steps and acceptance.

For the disposable feature proof, record production files and policy owners touched, duplicated decisions introduced/removed, applicable instructions read and executed checks. Remove the toy route/collection/exports after the proof. Compare a second small change against the same owners: a feature is cheaper when fewer independent policies must be edited, not when a component is merely shorter.
