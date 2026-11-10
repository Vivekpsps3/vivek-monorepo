# Shared surfaces

Use the claim, worktree and fresh-state procedure in [workflow](workflow.md).
A conflict group schedules potentially overlapping work; it is neither an API
dependency nor a lock. Inspect actual files and public contracts before proceeding.
The same current main is required for every worker; a historical PR is evidence,
never a permanent base revision.

| Shared surface | Coordination rule |
| --- | --- |
| Vault / lifecycle / credential wraps | One contract owner; consumers adopt the merged adapter |
| Identity/session/origin | Serialize public contract changes; retain owner/proof/concurrency tests |
| Schema head | Generate from the actual single head; never edit applied revisions |
| Browser harness / selectors / fixtures | Coordinate discovery and journey activation owners |
| Shared styles / controls | Serialize shared rules and migrate consumers in a defined order |
| Shell / Hub / navigation | Coordinate composition; domain rules stay with their owner |
| Media records/providers | Keep saved reads database-only; distinguish identity repair from transport |
| Finance services/imports | Preserve one store, calculation and import owner |
| Travel PTO | Server owns exact policy math; serialize schema/cadence changes |
| Town / World | Keep habit and budget semantics distinct; coordinate render/input changes |
| CI / quality / release / Compose | One writer per workflow/config surface |
| Roadmap body / global queue | Integration owner reconciles fresh evidence; leaf workers append scoped notes |

A roadmap status note needs only the key/leaf, PR, tested revision, evidence link,
actual state and next actor. Link acceptance/deletion/tests rather than copying
those tables again. Merged and activated remain separate states. Use packet
conflict groups from queue.json; obsolete labels in dated reports are not aliases
that establish safety. Preserve intervening requirements and claims when updating
a live issue body.
