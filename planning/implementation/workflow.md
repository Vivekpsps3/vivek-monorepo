# Roadmap implementation workflow

Root AGENTS and current user instructions remain authoritative. Root AGENTS
references this workflow for roadmap implementation outside `planning/`.

## Read order and authority

1. Read root `AGENTS.md`, `planning/AGENTS.md`, the queue quick start and this file.
2. Open the exact work packet named by the GitHub issue. Use its stable key,
   not a similarly titled historical issue.
3. Read its current parent scope ledger, prerequisite evidence and required source
   files. Historical issue snapshots/reports explain context; they do not override
   current decisions, acceptance or authorization.
4. Fresh-read the remote leaf, current `main`, open PRs and relevant source. Paths
   and line numbers are starting points. Local/unmerged code is not merged evidence.

Tracking parents are not implementation jobs. Pick one executable leaf. Discovery
jobs deliver a concrete design/spec PR; they do not authorize app implementation.
Operational-evidence jobs need their stated real configuration/access/authorization.

## Before claiming work

- Check that each dependency's required outcome is merged and present on current
  main, or explicitly documented satisfied with passing evidence. An open/closed
  issue flag or a helper's existence alone is insufficient.
- Check open PRs and conflict groups in the packet. A conflict group is a scheduling
  constraint, not a prerequisite; coordinate or serialize overlapping edits. Schema
  head, identity/vault protocol, shared test fixtures, styles and CI are single-owner
  surfaces while an issue edits them.
- Read the live issue for an existing claim/PR. Claim with a short issue note naming
  the stable key, agent/context, branch/worktree and base SHA. Claims are coordination
  notes, not atomic locks; resolve competing claims before implementation.
- Use one isolated branch/worktree per leaf. Preserve user work and other agents'
  changes. Never reset/clean/stash the shared checkout or force-push to obtain a clean
  state. Use the normal supported `main` base and merge it when needed.

For a selected leaf (substitute its key and branch):

```sh
git fetch origin main
git worktree add -b agent/med-08 /tmp/vivek-med-08 origin/main
```

## One issue through one complete PR

1. Reproduce the starting behavior or establish a precise baseline with synthetic
   fixtures. Inspect all acceptance rows, source requirements and deletion targets.
2. Implement the smallest correct owned change. Reuse existing authoritative math,
   persistence, UI and protocol behavior. Do not add a framework, universal registry,
   parallel state store or facade hierarchy simply because a plan mentions a seam.
3. Migrate the actual callers in this packet and remove the obsolete path. A shared
   helper with no migrated users, or code moved to more files, is not completion.
4. Prove positive, negative, failure/retry, owner/lifecycle/version and interaction
   criteria as applicable. Bind async publication to the current owner/epoch; starting
   unlocked or racing a timeout alone is not sufficient.
5. Record issue-specific evidence in `planning/implementation/evidence/KEY.md`,
   using the evidence template. Keep synthetic screenshots/traces in test artifacts,
   not committed binary files or public issues containing private information.
6. Run the packet's concrete verification commands plus every additional root AGENTS
   gate applicable to the actual changed files. Focused checks aid iteration; they
   do not replace the required suites. Discovery/listing is not test execution.
7. Only after required local checks pass, open one reviewable PR with `Closes #leaf`.
   Reference parent issues without closing them. Describe behavior, deleted paths,
   adopted consumers, proof and any material limitation. Do not merge/deploy unless
   the user has authorized that action; PR readiness is not deployment evidence.

If required checks fail, leave them failing until the code or assertion is genuinely
fixed. Do not skip suites, lower coverage/performance/lint gates, add retries, remove
meaningful assertions, or label an unresolved failure as a pass. Preserve existing
counterexamples when replacing brittle source-text assertions with behavior tests.

## Deletion is a deliverable

- Use the packet's deletion ledger: candidate, current consumers, action, surviving
  owner, compatibility proof, before/after production and test changes.
- Separate deleted, moved, generated, newly necessary and test-only code. Never
  inflate savings through minification, deleted rationale, bundled assets, migration
  history or lost behavior. Report semantic decision/implementation paths removed.
- Simplification jobs must remove their named redundant paths and demonstrate lower
  responsibility/maintenance cost. A positive production delta requires an explicit,
  narrowly explained safety/compatibility exception in the PR; it is not automatically
  accepted as simplification. Rescope an inadequate extraction before calling it done.
- Safety repairs may add essential guards/tests. Report that honestly and delete
  superseded workarounds where covered. Do not remove lock/owner/recovery guarantees
  or change money/date/domain meaning to hit a line quota.
- Conditional compatibility removal requires proof that supported users/data/clients
  no longer need the path. Preserve immutable migrations. Retiring a product feature,
  supported format or active recovery capability requires a separate explicit user
  decision; write a concrete proposal first, not a silent deletion.

## Boundaries and sensitive state

Finance/Health/review plaintext stays browser-local under the authenticated vault
protocol. Cross-domain views receive only approved narrow aggregates/stages/counts.
No real CSV, passphrase, key, card number/CVV, private note, internal host address or
feed token belongs in tests/logs/issues. Keep owner/revision/AAD/format compatibility.
Travel multi-currency costs, Finance USD totals, habit streaks, budget-kept weeks,
Pixels scoring and World generation retain their distinct meanings.

## Status and concurrent updates

- Status meanings are distinct: queued, claimed/in progress, local verification,
  PR open, merged, activation pending, independently verified. A PR is not a merge;
  a merged code adapter is not an activated backup/monitor.
- Update only the leaf's execution evidence in your PR. Do not regenerate the global
  queue, parent ledgers or all issue files from a stale context. Queue metadata is a
  planning snapshot; GitHub merged evidence is live execution status.
- After PR creation, update the leaf with its PR/evidence and append a key-specific
  status note to roadmap #134. An append-only comment avoids replacing another
  agent's roadmap edit. Read the roadmap fresh first and keep the note scoped.
- The integration owner folds verified notes into the roadmap body and parent
  ledgers after merges, using a fresh-read/compare/re-read workflow. Serialize that
  body update; GitHub issue PATCH is not an atomic multi-agent lock.
- Parents close only after every retained requirement has merged acceptance evidence
  or an explicit user-approved disposition. Design/proof/helper jobs never close a
  product parent as implemented. External prerequisites remain visibly pending.

## Scope discoveries and handoff

If a leaf is unsafe to finish in one reviewable PR, first prepare a concrete plan
amendment with complete replacement packets, requirement ownership, dependencies
and validation. Preserve the source requirement ledger and keep the original open;
do not silently deliver half and promise a later unspecified ticket. Routine internal
choices stay with the implementer when consistent with the packet and user intent.

If current main already satisfies a row, prove it with current tests/merged source
and record it; do not recreate the implementation or open an empty fake-fix PR.
For a fully satisfied leaf, the integration owner can close it with exact merged
evidence and verification instead of manufacturing changes.

Keep one evidence record with issue/key, branch/base/tested revision, changed paths,
acceptance/deletion proof, exact passed/failed/not-run checks and remaining work.
At a context boundary update its handoff section with the PR, actual state and next
action; link the existing tables instead of copying them. Before evidence exists,
use `planning/implementation/templates/handoff.md`. No private conversation should
be necessary to resume. These maintenance steps do not wait for REF-01.
