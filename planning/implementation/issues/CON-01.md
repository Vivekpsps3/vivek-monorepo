# CON-01 — Enforce actual feature boundaries with resolved import fixtures

- Stable key: `CON-01`
- GitHub leaf: [#206](https://github.com/Vivekpsps3/vivek-monorepo/issues/206)
- Parents: [#197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197)
- Kind: `implementation`
- Base checked: `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Re-read current `main` before editing.
- Dependencies: none
- Conflict groups: `architecture-checker`, `root-typescript-config`, `server-composition`
- Verification profiles: `docs`, `server_back`

Read [root AGENTS](../../../AGENTS.md), [planning instructions](../../AGENTS.md), [the queue index](../README.md), [deletion contract](../deletion-strategy.md) and [verification profiles](../verification.json) before editing. Record proof with the [evidence template](../templates/evidence.md) and end with the [handoff template](../templates/handoff.md).

This file is the executable packet. The parent issue is a scope ledger. Close only this leaf, with `Closes` on this leaf and a reference to each parent.

## Outcome

A new feature cannot silently couple to another feature’s internals while the architecture gate says pass.

Replace regex-only ownership shortcuts with the smallest language-aware graph check that covers current aliases/import forms and nested feature roots.

## Requirements

- TD-00 import baseline
- TD-05
- TD-39 evidence before architectural machinery
- #197 legal/illegal feature graph enforcement

## Source paths

- `scripts/check-shared-boundaries.py`
- `scripts/test_check_shared_boundaries.py`
- `tsconfig.json`
- `apps/web/src/app/routes.ts`
- `apps/server/main.py`
- `apps/server/schema.py`
- `packages/ui/src/public-api.ts`

## Target paths

- `scripts/check-shared-boundaries.py`
- `scripts/test_check_shared_boundaries.py`
- `scripts/`
- `docs/ARCHITECTURE.md`

## Steps

1. Read root AGENTS.md, planning/AGENTS.md, this packet and the retained parent requirements. Work from fresh main in an isolated branch/worktree; verify dependencies are merged and compare active PR #193 before assuming the reviewed source is current. Preserve unrelated edits.
2. Capture the current actual edges by owner; declare shell/platform/feature/composition roles below apps/web and apps/server. Enumerate legitimate composition files instead of exempting all server source.
3. Use Python ast with package-relative resolution and TypeScript’s already-installed parser/module resolver for TS/JS aliases, type-only/dynamic/reexport/require forms actually used. Do not add a graph service or package-per-folder.
4. Preserve the existing private-sink and generic UI checks while expressing their scopes honestly. Adopt a reviewed baseline only for real existing violations with named removal owners; block new violations immediately.
5. Exercise the complete checker with small legal/illegal module-tree fixtures including alias bypass, nested feature internals, comments/strings, Python relatives, package→app edges and allowed composition. Remove redundant regex/import-path code once the new path is active.
6. Run all applicable local AGENTS gates before opening the PR; record exact commands, source revision, results and acceptance evidence. Open one complete reviewable PR for this issue; update only its issue/evidence and its own fresh-read roadmap row. Do not close the parent epic or claim deployment.

## Acceptance

| ID | Given | When | Then | Proof |
| --- | --- | --- | --- | --- |
| LOCAL1 | A fixture imports private Finance or nested World internals through an alias/relative path | the checker runs | the forbidden dependency fails with an owner/path diagnostic | negative graph fixtures through full checker entry point |
| LOCAL2 | The same feature is composed through a public entry point or documented server aggregation seam | the checker runs | legitimate composition passes without a whole-root exemption | positive graph fixtures and repository check |
| LOCAL3 | A comment/string resembles an import and a real reexport/require is present | the graph is built | non-code text is ignored and actual resolved edges are checked | parser fixture matrix |
| LOCAL4 | The checker replacement lands | old detection paths are inspected | one authoritative import ownership implementation remains and current graph has explicit dispositions | source/deletion ledger plus make test-fast |

## Deletion

| Candidate | Action | Classification | Proof |
| --- | --- | --- | --- |
| Regex-only import ownership extraction and blanket source_app==server exemption | Replace with resolved ownership and explicit composition exceptions; delete old bypass logic | required | negative fixtures formerly missed now fail and allowed composition remains green |

## Non-goals

- No new runtime package loader
- No mass move of all domains into packages
- No broad increase to allowed imports
- No claim reexports were universally ignored by the old regex

## Test scenarios

- run checker on real tree and miniature fixture roots
- alias, require, type-only, lazy, reexport and Python-relative paths
- cycle/owner diagnostics and explicit same-origin sink scope

## Risks

- Typed/reflective imports and legitimate aggregation require deliberate exceptions. Check whether current PR193 adds edges; do not snapshot old source as permanent truth. Source count may increase for real enforcement; keep implementation small and delete superseded parsing.

## Completion evidence

- Acceptance matrix maps each LOCAL criterion to a concrete test/assertion or recorded observation, with current-main baseline and final commit.
- Deletion ledger lists removed implementation/comment/compatibility paths, replacement owner and every migrated caller; report production, test, generated and documentation LOC separately. Splitting/moving files is not claimed as deletion.
- PR description names preserved behavior, actual removed complexity, relevant local test results and any explicit compatibility/safety overhead retained. No skipped meaningful suite, reduced threshold or relabelled failure.
