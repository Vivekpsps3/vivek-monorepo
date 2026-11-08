# Test speed and stability audit

Reviewed against main `bdb96cc` on 2026-11-08. The review covered backend pytest
fixtures and coverage gates, Node contracts, Karma specs, every configured
Playwright project, CI setup and the local runner resource limits.

## Coverage ownership

| Area | Decision |
| --- | --- |
| Finance backend and identity | Keep authentication, isolation, crypto-record, rate-limit and transaction assertions. Parallelize whole files to keep process-local fixtures together. |
| Travel backend | Keep date/PTO/cost edge cases and provider contracts at the API/pure-function layer. Use two isolated pytest processes. |
| Media backend | Keep provider, progress, Undo and ownership cases; these cover distinct failure modes. Preserve offline provider fixtures and per-test databases. |
| Server backend | Keep migration, concurrency, schema, CSP, routing, Town/World and asset contracts. Real SQLite writer waits remain real integration tests. Performance gates remain serial and uninstrumented. |
| Node and Karma | Keep the existing small logic/component suites and coverage thresholds. These are the inexpensive owners of branch and arithmetic coverage. |
| Finance browser | Run chart controls, saved-input recovery and vault-return behavior once. Keep the full screenshot/a11y matrices and distinct responsive controls. Advance the fake clock for the no-ticker price check. Store Calendar screenshots in each test's output directory. |
| Media browser | Replace seven manual-add checks across four appearance combinations, plus a duplicate bundle case, with one validation/correction/save journey. Run Now, filters and episode stories once; combine mark/Undo and overlapping Now states. Keep separate outage, conflict, navigation, unsaved-note and final-episode recovery regressions. Share CSP/overflow helpers. |
| Travel browser | Seed the populated trip list once and check its groups, labels, currencies and disclosure in one journey. Combine cost presentation checks on one seeded trip; retain both row-action widths. Replace the seven-second flight wait with a held response and virtual time. Keep the screenshot/a11y matrices. |
| Town/Pixels/World browser | Retain the existing coverage: sheet/panel, keyboard and renderer cases exercise different behaviors. Use isolated worker servers. Existing legacy Town exclusions remain unchanged. |
| Shared browser/release | Keep public isolation, persistent shell, navigation, CSP, responsive and production-image checks. Schedule all five browser projects once through the root configuration. Fix heading focus stealing keyboard activation from a table row. |

No coverage floors, lint allowances, assertions about business results, retries
or required suites were relaxed. The eight pre-existing Finance viewport skips
and two expected server failures are unchanged.

## Case counts

Counts come from `playwright test --list` against an untouched copy of main and
the updated domain wrappers. They include the existing Finance skips.

| Project | Before | After |
| --- | ---: | ---: |
| Finance | 273 | 246 |
| Media | 193 | 72 |
| Travel | 187 | 144 |
| Town/Pixels/World | 28 | 28 |
| Shared suite | 24 | 24 |
| Total | 705 | 514 |

That removes 191 generated browser cases (27%). Dedicated appearance matrices
remain; the removed cases repeated theme-independent behavior or the same
setup and assertions across neighboring tests.

## Local backend measurements

Elapsed seconds include coverage reporting and the server's separate performance
gate. Both runs used the same machine and source, with one versus two pytest
workers. These are local observations, not CI timing guarantees.

| Gate | Serial | Two workers | Coverage in both runs |
| --- | ---: | ---: | ---: |
| Finance | 15.53 | 12.02 | 85.76% |
| Server | 124.65 | 65.25 | 80.63% |
| Travel | 53.17 | 29.51 | 87.97% |
| Media | 61.71 | 35.08 | 80.03% |
| Total | 255.06 | 141.86 | |

The combined gate time fell about 44%. All 1,388 ordinary backend tests and the
separate server performance test passed, with the two existing expected failures.
No fixture scopes were widened and no production password cost was changed.

For the five consolidated Media files, a separate comparison constrained both
runs to two CPUs with `taskset`, Node 24 and a fresh disposable server:

| Media form/filter/Now/episode stories | Cases | Workers | Elapsed |
| --- | ---: | ---: | ---: |
| Original main | 146 | 1 | 86.41 s |
| Updated | 26 | 2 | 11.36 s |

That workload took about 87% less time. The full appearance matrices remain in
other files; this measurement does not represent the entire browser job.

## Main failure regression

The [failed main CI run](https://github.com/Vivekpsps3/vivek-monorepo/actions/runs/42509002153)
failed both desktop Pixels year-table keyboard cases: Enter did not add the day
query parameter. The shell's deferred heading-focus guard recognized buttons and
grids but missed a row with `tabindex="0"`. Pixels also lacked the `main`
landmark that the shell uses to locate the page heading and focused controls,
so the 400 ms fallback stole focus even after the row selector was corrected.
A deterministic Karma regression
emitting the navigation event while the row held focus failed against main:
the active element became the heading. Extending the guard to explicit tab
stops fixes that regression. Two-CPU browser repeats exposed the missing
landmark; restoring it fixes the fallback path as well. The browser assertion
now also requires the Pixels heading to belong to the main landmark. The full
root Karma gate passes with 623 tests.

The [preceding main run](https://github.com/Vivekpsps3/vivek-monorepo/actions/runs/42447332525)
also failed keyboard activation of Finance's Add transaction and Edit bill.
Those button guards were already added on the latest main. Both existing
browser assertions are retained and included with the two desktop Pixels cases
in the two-CPU repetition run. Keeping the real keyboard actions catches focus
loss that switching the test to a mouse click would hide.

After both focus fixes, all four scenarios passed five repetitions each on two
CPUs: 20/20 with zero retries.

## Parallelism and maintenance

Two workers match the existing runner allocation of two CPUs and 6 GiB. Keep
that allocation: three workers would need a separate resource-budget change.
Pytest uses `--dist=loadfile`; Playwright parallelizes files, with a separate
server process, session, temporary database and OS-assigned socket per worker.
The root browser command adds Town to the shared project list and reuses the
domain definitions, eliminating the five sequential CI invocations.

Import the shared browser fixture for new stories. Use API calls for prerequisites,
the UI for the user action, observable results for waits and promise gates for
transient states. Let the initial Angular render complete before pausing virtual
time. When running two local invocations of the same domain concurrently, pass
different `--output` directories so one command cannot delete the other's traces.

The CI job installs its Node/Python/browser tooling before the hosted-runner
fallback build. The local production bundle continues to be built only once.
Runner CPU/memory limits, production release checks and coverage floors stay in
place.
