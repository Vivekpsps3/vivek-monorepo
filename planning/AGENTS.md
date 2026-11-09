# Roadmap work

For a roadmap implementation, read the queue's [quick start](implementation/README.md),
the exact issue packet, and the [workflow](implementation/workflow.md). These rules
apply by root reference to roadmap changes outside this directory. Read only the
relevant parent scope, prerequisite evidence and source; dated reviews are evidence,
not another backlog. General instruction maintenance lives in
[AGENT_GUIDANCE.md](../docs/AGENT_GUIDANCE.md).

- One dependency-ready leaf, isolated worktree and complete PR. Verify prerequisite
  outcomes on current main; issue status and conflict-group names alone are insufficient.
  Read active PRs and coordinate actual shared files before claiming work.
- Follow the [deletion contract](implementation/deletion-strategy.md): migrate real
  callers and delete superseded paths in the same PR. File moves and extra abstraction
  do not establish simplification. Preserve supported data and behavioral guarantees.
- Record acceptance, actual deletion and exact local verification in the issue's
  [evidence file](implementation/templates/evidence.md). Root test gates still apply;
  do not skip, weaken or relabel a failure. Open the PR after they pass.
- Close only the leaf. Append a scoped status comment to roadmap #134; the integration
  owner reconciles its body from fresh merged evidence. Never overwrite global queue
  state from a worker's stale checkout. A design, PR or merge does not prove activation.
- For an unsafe/oversized leaf, prepare a complete scope amendment retaining every
  requirement. For an already-satisfied leaf, record merged proof instead of an empty PR.
- End a context with the [handoff](implementation/templates/handoff.md). Put temporary
  status there or on GitHub, never in AGENTS.md. Read the full workflow for claim,
  compatibility, sensitive-state, completion and concurrent-update requirements.
