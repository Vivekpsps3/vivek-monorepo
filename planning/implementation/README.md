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
Without `--live`, listing is an offline inventory including completed leaves.

For the owner-selected Living World workstream, read the
[product specification](../living-world/README.md), then filter this same queue:

```sh
python3 planning/implementation/plan.py list --live --parent 304
```

This does not establish readiness: verify the named existing Town/UX/safety/route
outcomes, then follow the exact PLACE packet. Unrelated tasks retain their relative
order; the design documents do not introduce a second ready list.

## 2. Open its exact packet

For example, the current first deletion candidate is MED-11:

```sh
python3 planning/implementation/plan.py launch MED-11
```

Substitute the selected key as work progresses. Launch prints the packet path and
deduplicated verification commands. Read `issues/KEY.md`, applicable app AGENTS,
and only the parent requirements/prerequisite evidence that packet needs.
If local packet and live issue scope conflict, reconcile them before editing code.

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
| What dependencies/conflicts/profiles apply? | `queue.json` |
| What is its live execution state? | GitHub leaf, PR and current source |
| How is it performed? | [Workflow](workflow.md), root/app AGENTS and deletion contract |
| Which commands and results prove it? | [Profiles](verification.json), actual-diff root gates, then `evidence/KEY.md` |

Dated reviews and completed packets are supporting evidence. Keep task order out
of their recommendations and out of additional ready tables. The planner's
`validate --self-test` checks packet/metadata structure and fixtures; it does not
establish merged readiness, product correctness or deployment.
