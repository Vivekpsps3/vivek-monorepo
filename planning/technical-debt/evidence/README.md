# Review evidence and disposition

Review started 2026-11-08 UTC; report synthesis continued 2026-11-09. Files here
are dated evidence, not automatically regenerated product or CI configuration.

## What this review actually did

- Spawned one independent antagonistic reviewer at the owner's explicit request.
  It read source/configuration and executed controlled in-memory probes. The parent
  preserved its full report as [the independent appendix](../2026-11-08-independent-review.md).
- Read current repository guidance, architecture/tooling, production sources,
  quality baselines, test discovery and current GitHub issue/roadmap bodies.
- Cross-checked callback binding, Health publication and Media read-side repair
  in actual source; the separate report contains the exact probe procedures/results.
- Generated [the source inventory](source-inventory-2026-11-08.json), separating
  tests and migrations. No semantic-clone percentage, bundle saving or full-suite
  timing was invented.
- Ran actual Town wrapper discovery: [28 tests in five files](town-test-discovery-2026-11-08.txt).
  This does not claim those tests were executed in this review.
- Ran the standalone release-manifest fixture check successfully. It remains a
  task to establish every standalone check's canonical CI/local owner.
- Created engineering issues
  [#197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197),
  [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198),
  [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199) and
  [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200), and prepared the
  roadmap sequence without changing runtime behavior.
- Wrote the assessment, forty-task work breakdown, feature-addition playbook and
  this evidence/disposition record. Linked the report from maintained indexes.
- Asked the independent reviewer to check the synthesis for omissions/overclaims.
  It confirmed all A01–A15 were represented and requested one material clarification:
  the narrow vault port must include browser-local codec/encryption/decryption
  capability, not only envelope transport. The plan, assessment, playbook and #198
  were clarified accordingly; keys remain inaccessible.

No application fix, API change, collection migration, production mutation,
deployment, bulk deletion, framework replacement, secret inspection, full regression
pass or incident investigation is claimed. Concurrent user/agent application-test
changes were preserved. Issues remain open until actual implementation and acceptance.

## Independent finding disposition

Every A-number is retained in the full appendix; this table maps all of them to
synthesis and work owners rather than silently omitting inconvenient findings.

| Independent ID | Parent finding | Remediation / owner |
| --- | --- | --- |
| A01 callback slot collision | F-01 | TD-02/TD-09, #198 |
| A02 late Health publication/retention | F-02 | TD-03/TD-08/TD-10, #198 with #90/#121 |
| A03 saved GET provider repair | F-03 | TD-04/TD-17/TD-18/TD-28, #85 with #200 |
| A04 coarse enforcement/parser/sink coverage | F-05 | TD-05/TD-13, #197/#199 |
| A05 obsolete Profile assertion | F-04 | TD-01/TD-06/TD-16, #196 with #197/#199 |
| A06 hidden test journeys/coverage limits | F-09/F-11 | TD-14/TD-15, #199 with #81/#196/#125 |
| A07 concrete Finance vault coupling | F-07/F-08 | TD-07/TD-08, #197/#198/#121 |
| A08 mixed generic/domain UI package | F-06 | TD-05/TD-08/TD-31, #197/#198 |
| A09 orphan World integration | F-12 | TD-11/TD-21/TD-29, #200/#198 |
| A10 large mixed-responsibility files | F-13/F-14 | TD-17–TD-23, #200 with domain owners |
| A11 inconsistent async liveness | F-15 | TD-09/TD-10, #198 |
| A12 typing/declaration/runtime mismatch | F-10/F-16 | TD-12/TD-13/TD-35, #199/#200 |
| A13 stale dependency/decision authority | F-18/F-19 | TD-29/TD-30, #200/#197 and owning product issues |
| A14 wrong reuse of habit/budget weeks | F-22 | TD-26, #81 with #197/#200 |
| A15 scattered feature registration | F-20 | TD-00/TD-06/TD-07/TD-31/TD-37, #197 |

Parent additions F-17 (style/interaction ownership) and F-21 (operations/recovery)
map to TD-24/TD-25 and TD-27/TD-33/TD-34/TD-36 respectively. They are grounded in
source/current obligations, not presented as independent-agent discoveries.

## Proof limits and corrections to tempting claims

- Callback/Health probes execute existing logic with synthetic controlled dependencies.
  They reproduce those mechanisms, not a production plaintext leak or network exposure.
- `export … from` is recognized by the current import regex. Aliases, `require` and
  Python relative ownership resolution are gaps; do not broaden that into a false claim.
- The World wrapper has no statically named consumer found; it may tree-shake away.
  Its source is confusing debt, not demonstrated runtime bundle weight.
- No byte-identical selected production file of at least20 lines was found. That
  says nothing about smaller repeated functions or near-duplicate workflows.
- Some wrappers reexport an authoritative implementation; the Pixels score-spec
  shim is not duplicate assertions. Domain money/date rules can legitimately differ.
- Media's provider-repair path is verified in the current local MusicBrainz work;
  deployed behavior was not checked. Explicit discography metadata browsing can
  legitimately fetch providers; hidden repair/mutation remains a separate concern.
- Current lint counts are committed baselines, not a new full lint measurement.
  Current coverage floors are thresholds, not a measured full-suite result.
- The earlier frontend report contains real synthetic browser observations. This
  review adds source/probe evidence without claiming another complete browser audit.

## Inventory reproduction

The inventory used physical line counts from `rg --files apps packages scripts`
with `.ts`, `.py`, `.html`, `.css`, `.mjs`, `.cjs`, `.js` suffixes. It excluded
`node_modules`, `dist`, `.angular`, `coverage`, `vendor`, `__pycache__`,
`playwright-report` and `test-results`. Test-labelled paths/names were `tests`,
`e2e`, `testing`, `test_*`, `.test.*` and `.spec.*`; Python Alembic files were
classified separately. Paths not in those sets are production-labelled, which
includes scripts/configuration and is not a claim every line ships to the browser.

For exact-file duplicates, it SHA-256-hashed selected production file contents with
at least20 lines. Baseline rule counts were summed from committed tab-separated
quality files. Concurrent changes and different suffix/classification choices can
change totals; repeat the same method for comparisons. Do not turn this artifact
into a deletion quota.

Useful read-only checks from repo root:

```bash
npx playwright test --config apps/web/e2e/playwright.config.ts --list --reporter=list
node scripts/test-release-manifest.mjs
python3 scripts/check-shared-boundaries.py
```

The appendix preserves runnable callback/Health/import probes. Implementation PRs
must convert the relevant mechanisms into maintained behavioral regressions rather
than relying on temporary VM scripts.

## Local validation for the report changes

`make test-fast` passed: doc paths, blame revisions, shared boundaries, Finance UX
source checks, 44 Python script tests and seven Node script tests. The inventory
JSON parsed, all forty TD-00–TD-39 headings were checked present exactly once, and
`git diff --check` passed. New engineering issue bodies were read back and matched
their prepared files. The final roadmap update is also read back before handoff.

No Python/frontend source was modified by this debt review; full runtime suites
are required for the future fixes, not claimed by this documentation-only handoff.
The standalone release-manifest fixture check passed; the Town command listed
tests but did not execute them. Controlled probes are recorded separately above.
