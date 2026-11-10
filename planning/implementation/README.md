# Implementation queue

Executable packets for [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).
Parents retain scope; implement one dependency-ready leaf per worktree and PR.

## Find work

Run from the repository root:

```sh
python3 planning/implementation/plan.py list --live --parent 200
python3 planning/implementation/plan.py launch MED-08
```

Omit `--parent` to see all open leaves. `--live` reads GitHub through authenticated
`gh`, hides closed leaves and marks open prerequisites as `wait=...`. It fails if
issue state is incomplete. `check-merged-outcomes` is a candidate, not authorization
or proof: verify the prerequisite's actual merged outcome on current main, read the
live leaf/claims, and inspect open PRs and actual overlapping files. Closed issues
can be superseded rather than implemented. `list` without `--live` is an offline
metadata inventory, including completed packets; it makes no readiness claim.

## Implement

Read [planning instructions](../AGENTS.md), the exact packet under `issues/`,
[workflow](workflow.md) and applicable app instructions. Read parent scope and
prerequisite evidence only as needed. The launch command prints deduplicated
verification commands; add gates required by the actual diff.

Claim the leaf, create a worktree from fresh `origin/main`, implement its complete
acceptance and deletion contract, and record [evidence](templates/evidence.md).
Run required local gates before opening the PR. Close only the leaf and append its
scoped status to #134; the integration owner reconciles the roadmap body.
For interrupted work, use the evidence file's handoff section; the
[handoff template](templates/handoff.md) is for work without an evidence file.

## Focus

The [merged-PR review](../loc-review-2026-11-10.md) distinguishes production growth
from test and planning growth. Choose a bounded removal with real consumers:

- **MED-08:** reuse `_catalog_by_source` in `_public_catalog`, preserving kind
  rejection; consolidate additional runtime operations only if proven equivalent.
  Keep migration SQL and distinct catalog/personal projections.
- **MED-11:** remove verified no-caller Media helpers and portrait enrichment;
  retain migration/cache behavior and the live episode command.
- **DEL-04:** consolidate repeated Finance collection publication in the existing
  service. It does not require SAFE-04's browser notification adapter; preserve
  current session/collection/lock guards and serialize actual overlapping files.
- **SAFE-04:** remove the Hub/Pixels/World notification parsers after adopting one
  existing-owner adapter. SAFE-01 and SAFE-03 are merged; verify current outcomes.
- **DEL-02:** remove only compatibility paths proved unreachable for supported
  users/data. It is conditional, with no promised LOC windfall.

MED-07, DEL-03, DEL-05 and FIN-02 have merged. Do not repeat their completed
tranches. Their broader parents remain open. Unrelated product fixes can proceed
with their actual dependencies; this focus is not a whole-platform prerequisite.
`DISC-01`/`DISC-02` deliver designs. `OPS-06` needs a real destination, recovery key
and alert recipient; a code adapter alone cannot establish activation.

## Authority and maintenance

| Information | Authority |
| --- | --- |
| Detailed requirements, acceptance, deletion | `issues/KEY.md`; mirror approved scope changes to its GitHub leaf |
| Dependencies, parent/TD ownership, conflicts, verification profile names | [queue.json](queue.json) |
| Live status, claims, merged PRs | GitHub leaf and linked PRs; verify current source |
| Required procedures and measured deletion | [workflow](workflow.md), [deletion contract](deletion-strategy.md) |
| Verification commands | [profiles](verification.json), plus root AGENTS gates for the actual diff |
| Acceptance and local test results | `evidence/KEY.md`, tied to a tested revision |

Do not maintain another ready table, parent-to-leaf list, TD map or completed-key
ledger here. Query metadata/status instead. Dated reviews are evidence, not jobs.

```sh
python3 planning/implementation/plan.py validate --self-test
```

Validation covers metadata/packet parity, required sections/proof cells, source
paths and the dependency graph. It does not establish semantic coverage, test
execution, merged readiness or deployment. See [coordination](coordination.md)
for shared surfaces when other workers are active.
