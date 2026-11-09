# Parallel agents and shared surfaces

Choose dependency-ready leaves whose conflict groups do not overlap. Dependencies
mean a merged outcome/API is needed. Conflict groups mean simultaneous edits are
unsafe even when neither job depends on the other. A group is a scheduling aid,
not an atomic lock or proof the rest of a diff cannot collide.

Use one worktree/branch/PR per leaf and a visible claim on the live issue. Read all
active PRs before starting. PR #193 merged as `495d698` and is current `main`: saved
albums, treasury level, PTO carry, phone headers and the birthday field. Treat that
SHA as landed behavior. Revalidate those surfaces before editing them; do not redo
the merged work and do not treat an older branch as the baseline.

| Shared surface | Coordination rule |
| --- | --- |
| Vault core / lifecycle / credential wraps | One contract owner at a time; consumers use the merged adapter, not a copied draft |
| Identity/session/origin | Serialize public contract changes; run owner/proof/concurrency regressions |
| Schema head | Rebase by merging current main, generate a new revision from the actual single head; never edit an applied revision |
| Browser harness / selectors / reset fixtures | One writer; discovery guards and fixture activation have different owners and coordinate |
| Shared styles / UI controls | Serialize shared selectors/interaction changes; consuming domains migrate in a defined order |
| Shell navigation / settings / Hub | Coordinate registry/layout edits; no duplicate cards/routes/forms |
| Media records/providers | Saved-read correction precedes decomposition; do not repair the same identity path twice |
| Finance services/models/import engine | Agree stable facade/data shape first; preserve one calculation/import owner |
| Travel PTO math/schema/forms | Exact policy math is server-owned; serialize schema/cadence changes |
| Town service/schema / World input/render | Keep habit/budget semantics distinct; avoid simultaneous ownership rewrites |
| CI / quality / release / Compose | One writer for each workflow/config surface, with current baseline/gate checks |
| Roadmap body / global queue | Integration owner folds verified notes; workers append issue-specific updates and edit only own evidence |

Status notes on #134 should use this shape:

```text
KEY / #leaf — PR open (or merged / activation pending)
PR: …
Tested SHA: …
Acceptance: rows passed/failed/not run; evidence file
Deletion: old paths removed, necessary additions
Dependencies / next actor: …
```

Do not check an implementation leaf complete when only a helper/design/discovery
deliverable merged for its parent. Do not close an operations parent while external
configuration/recipient/restore evidence is absent. Independent contexts can use
the packet's complete acceptance and issue-specific evidence without relying on
this conversation.
