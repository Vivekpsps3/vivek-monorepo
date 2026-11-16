# Execution queue

Start here for [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).
Follow the steps below for each task. One leaf produces one complete PR.

## 1. Select the next leaf

If the user named a task, use that packet. Otherwise run from the repo root:

```sh
python3 planning/implementation/plan.py list --live
```

Read top to bottom: `queue.json` task order is the default priority. Select the
first open leaf without `wait=...` whose prerequisite outcomes are present on
current main and whose live issue has no competing claim or overlapping PR.
`check-merged-outcomes` means verify those facts before claiming. A closed
prerequisite can have been superseded; closure alone does not prove implementation.

If the first candidate is claimed or externally blocked, record the concrete
reason and continue down the same list. Do not invent a new backlog or dependency.
An explicit user-selected domain can narrow the list with `--parent NUMBER`.
Without `--live`, listing shows the remaining queue snapshot. Completed packets
are kept only in the [completion archive](completed/README.md); they are never
listed or launchable as future work. `--live` also rejects a reopened archived
issue until the queue is reconciled.

For the owner-selected Living World workstream, read the
[product specification](../living-world/README.md), then filter this same queue:

```sh
python3 planning/implementation/plan.py list --live --parent 304
```

This does not establish readiness: verify the named existing Town/UX/safety/route
outcomes, then follow the exact PLACE packet. Unrelated tasks retain their relative
order; the design documents do not introduce a second ready list.

## 2. Open its exact packet

For example, launch the account-experience packet:

```sh
python3 planning/implementation/plan.py launch HUB-01
```

Substitute the selected key as work progresses. Launch prints the packet path and
deduplicated verification commands. Read `issues/KEY.md`, applicable app AGENTS,
and only the parent requirements/prerequisite evidence that packet needs.
Dependencies may reference merged packets in `completed/issues/`; verify their
registered merge and acceptance evidence on current main. They remain guarantees
to preserve, not unfinished jobs. If packet and live scope conflict, reconcile
them before editing code.

## 3. Claim and implement

Follow [workflow](workflow.md) to fresh-read source/claims, create an isolated
worktree and implement every acceptance/deletion requirement. Use the
[deletion contract](deletion-strategy.md) for simplification and compatibility.
Keep public behavior, domain rules, privacy and migration guarantees intact.

## 4. Verify and record

Run launch's commands plus root AGENTS gates required by the actual diff. Record
results and acceptance/deletion proof once in `evidence/KEY.md` using the
[evidence template](templates/evidence.md). Keep test cases readable under
[Quality](../../docs/QUALITY.md#test-readability-and-parametrization).
Checks must pass locally before a PR; an unrun or rejected check remains unrun.

## 5. Deliver and continue

Open the PR closing only the leaf, with parent references. Merge/deploy only with
user authorization. Append a scoped status note to #134; the integration owner
reconciles its body and parent ledgers from fresh evidence. Rerun step 1 after
merge. For interrupted work, update the evidence file's handoff section with the
exact next action; use [handoff](templates/handoff.md) before evidence exists.

## Authority

| Question | Single authority |
| --- | --- |
| What goes next by default? | Ordered tasks in [queue.json](queue.json), filtered by live status and actual prerequisites/claims |
| What must this task deliver? | `issues/KEY.md`, mirrored to its GitHub leaf |
| What dependencies/conflicts/profiles apply? | `queue.json`; merged prerequisite proof in [completion registry](completed/registry.json) |
| What is its live execution state? | GitHub leaf, PR and current source |
| How is it performed? | [Workflow](workflow.md), root/app AGENTS and deletion contract |
| Which commands and results prove it? | [Profiles](verification.json), actual-diff root gates, then `evidence/KEY.md` |

Only unfinished leaves belong in `queue.json` and `issues/`. After verified
completion, the integration owner moves a packet to `completed/issues/`, registers
its merged PR/SHA in `completed/registry.json`, and removes tracking parents with
no remaining leaves. Preserve dependency IDs and issue-specific evidence; keep
the original forty-item TD ownership ledger in that registry.

Dated reviews and completed packets are supporting evidence. Keep task order out
of their recommendations and out of additional ready tables. The planner's
`validate --self-test` checks packet/metadata structure and fixtures; it does not
establish merged readiness, product correctness or deployment.
