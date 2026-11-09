# Maintaining concise agent guidance

AGENTS.md is a routing map plus consequential local invariants. Task steps, status,
reviews and acceptance evidence belong in the implementation packet, workflow or
GitHub issue. This policy applies whenever an instruction file is added or edited.

## Scope and navigation

Root instructions govern all work. Nested files add only the differences for the
subtree they govern. An agent starting at root must explicitly read applicable
child instructions before editing: instruction discovery at session startup follows
the working-directory ancestry, not every possible future edit target.

Use uppercase AGENTS.md, one per ownership boundary. Root links the app owners;
web links its specialized Town/Health, World and Pixels owners. Add another file
only when a distinct subtree has consequential rules that would otherwise distract
unrelated tasks. Do not create files for every component or repeat parent rules.

Start with the task's owning files and direct callers/tests. Search named symbols
with rg and expand only as evidence requires. For roadmap work read the quick start,
exact packet and workflow; do not load every packet, dated audit or manifest.

## Maintenance laws

1. Update the applicable instruction/link in the same PR that changes its owner,
   supported command or invariant. Delete or redirect guidance when its owner retires.
2. Replace stale guidance; do not append amendments, dated status or PR histories.
   Use Git history for rationale and the issue/evidence file for current execution.
3. Root has a 650-word ceiling; each nested file has 300. A repository ancestry
   chain has a 1,200-word ceiling. These are repo maintenance budgets, not model
   context limits. Refactor text into task-specific linked docs rather than raise them.
4. Keep one authoritative statement of each rule. Link commands and procedures
   instead of copying them. Never remove a safety/test requirement while shortening
   prose: preserve it at the linked authority and retain an explicit applicability rule.
5. Keep rules about observable outcomes and the safe path. Do not freeze incidental
   private function names as architecture, add generic style advice already enforced
   by tooling, or require every task to read unrelated design documents.
6. Describe the invariant precisely enough to prevent a known mistake. Remove a
   rule that no longer changes a decision. A one-time bug does not automatically
   justify a permanent paragraph for every future task.
7. Required local test gates remain mandatory. Token savings come from focused
   reading and deduplicated commands; they never authorize skipping a required gate.

The existing scripts/check-doc-paths.sh enforces links and the word budgets as part
of make test-fast. It excludes dependency/build directories. For a guidance change,
review the applicable root-to-leaf chain, check linked paths, and run make test-fast.
If its mechanical checks pass, still inspect the rules for duplication, obsolete
facts and loss of an invariant; the checker cannot establish semantic correctness.

## Sources and local choices

OpenAI documents [root-to-working-directory instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
Its guidance recommends [small, scoped, durable review rules](https://developers.openai.com/blog/custom-code-review-rules-for-codex)
and [reading only task-relevant documents](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra).
The file map, word budgets, deletion discipline and update-in-the-same-PR rule are
repository policy chosen for this codebase; they are not requirements of Codex.
