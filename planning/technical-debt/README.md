# Making future features cheaper

This report answers the owner's request for an independent antagonistic review,
a roadmap update, and a detailed account of technical-debt reduction. Review
started 2026-11-08 UTC and the synthesis was completed 2026-11-09. The live queue
remains [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).

**Assessment:** useful domain and security foundations exist, but inconsistent
contracts, repeated lifecycle code, incomplete quality discovery and concentrated
responsibilities make additions unnecessarily expensive. Three correctness findings
come before broad cleanup: colliding lock callbacks, late Health publication after
invalidation, and provider-backed repair on the local Media saved-library read path.
A confirmed callback/state defect is not evidence of a production data leak.

Read the report in this order:

1. [Assessment and finding register](2026-11-09-assessment.md): evidence, confidence,
   root causes, architecture target, inventory and limitations.
2. [Detailed remediation plan](2026-11-09-remediation-plan.md): TD-00–TD-39,
   individual steps, dependencies, validation and stop conditions.
3. [Feature-addition playbook](feature-addition-playbook.md): the desired workflow
   for UI-only, SQL-backed, encrypted, provider and cross-domain features.
4. [Independent antagonistic review](2026-11-08-independent-review.md): the separate
   agent's complete findings and probe limitations, preserved as an appendix.
5. [Evidence and disposition](evidence/README.md): inventory, discovery output,
   validation performed and a record of what this review actually changed.

| Engineering workstream | First outcome |
| --- | --- |
| [#198 Lifecycle safety](https://github.com/Vivekpsps3/vivek-monorepo/issues/198) | Multiple consumers invalidate safely; late async work cannot republish private state |
| [#199 Trustworthy verification](https://github.com/Vivekpsps3/vivek-monorepo/issues/199) | Shipped code and intended journeys have explicit owners in checks; obsolete assertions are corrected with behavior |
| [#197 Contracts and boundaries](https://github.com/Vivekpsps3/vivek-monorepo/issues/197) | Adding a route, capability or encrypted collection does not require inconsistent manual declarations |
| [#200 Domain simplification](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) | One responsibility and one live implementation per owned workflow; smaller modules have actual consumers |

Existing product/security/operations issues retain their outcomes. In particular,
[#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) owns Media's read-path
correction; [#196](https://github.com/Vivekpsps3/vivek-monorepo/issues/196) owns
visible route/keyboard repairs; [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121)
owns credential change and encrypted recovery; [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125)
owns operational recovery. Shared engineering issues supply foundations and link
acceptance evidence; they do not create a second implementation backlog.

The objective is low, predictable **platform overhead** for future features.
Novel product rules, migrations, integrations and privacy obligations still require
work. No universal framework can make every imaginable feature equally cheap.
This report does not authorize an unbounded rewrite or claim the proposed repairs
have been implemented.
