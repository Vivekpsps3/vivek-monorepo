# Daily version history

Coverage: the complete reachable Git history through main at [`80b9ca0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80b9ca0e0776297f3addcdfdac78542f6a7ced40), inspected November 10, 2026 (UTC). Read [Complete feature reference](FEATURES.md) for the current product, data rules, and implementation limits.

## How to read the versions

These are **documentation versions**, labeled `day-YYYY.MM.DD`; they are not historical release tags or semantic versions. The root package manifest reports `0.0.0`, which does not supply a meaningful per-day release series. A daily version means the cumulative state after that UTC day's last mainline integration. No claim is made that it was deployed that day.

Dates use the **committer timestamp converted to UTC on the first-parent main history**. Branch author dates, local dates, PR opening dates, and deployment times can differ. This avoids dating a feature before it actually reached main. A side-branch commit is assigned to its first reachable mainline integration, including commits authored on earlier days.

The report contains 197 mainline integrations across 27 active UTC dates and accounts for all 622 reachable commits. Each active day has feature, bug-fix, and maintenance explanations plus an auditable ledger. Generic commit titles support only limited conclusions; they are preserved without inventing a specific incident. Feature work and security fixes can share a commit. An entry describes historical work and does not imply the capability remains available today.

The 2026-11-11 section records twelve owner-accepted leaves: the original seven, including FIN-01's squash, and five later leaves. It does not re-audit every commit after `80b9ca0`, and it does not change the integration or commit totals above. Other mainline commits that UTC day stay in their own records.

The first commit is an imported baseline; Git cannot date the original creation of everything it contains. Squashed PRs preserve one mainline commit even if their body describes many intermediate steps. Expanded implementation commits below are included once, at first integration; merge-only bookkeeping is labeled separately. Test fixes are distinguished from confirmed product fixes. Old commit bodies that say a test passed are historical claims, not new verification of those releases.

## Version index

| Daily version (UTC) | Mainline integrations | End-of-day snapshot |
| --- | --- | --- |
| [day-2026.08.30](#2026-08-30) | 3 | [`81594aa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/81594aae0a3c065f931a816feb26b4105318e9e8) |
| [day-2026.08.31](#2026-08-31) | 5 | [`33585c4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/33585c4709c1eadca0342efb580c1165f8a4c821) |
| [day-2026.09.01](#2026-09-01) | 3 | [`3ee2a27`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3ee2a272dba369585708b45360fe676c2243079e) |
| [day-2026.09.03](#2026-09-03) | 2 | [`f750422`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f75042266d0c3dcd5a657ff36f5a51a97150d978) |
| [day-2026.10.09](#2026-10-09) | 5 | [`da15bfb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/da15bfb8dac89c5f0a9d49a72168bebd1b01079f) |
| [day-2026.10.11](#2026-10-11) | 2 | [`1ac473f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1ac473f51061bc8c5c47187746038f1ac48951e3) |
| [day-2026.10.13](#2026-10-13) | 2 | [`351a72b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/351a72b20fdd9eb56667c28c9d9aba11bf939afa) |
| [day-2026.10.14](#2026-10-14) | 5 | [`c9c877a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c9c877a92293728c7839f911cea91db70938e413) |
| [day-2026.10.15](#2026-10-15) | 5 | [`0b007b9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0b007b9ba8087491716e00473da53b5f78d336fe) |
| [day-2026.10.16](#2026-10-16) | 4 | [`1bfd550`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1bfd5504a4b3ae5b4b0a364e89ca485a6f40d787) |
| [day-2026.10.18](#2026-10-18) | 5 | [`53d9be7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/53d9be7f7df428653cc6acf6aad642924665c5e4) |
| [day-2026.10.19](#2026-10-19) | 1 | [`43bf25b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/43bf25b89c9796cfd6e512d10d27a193a8410997) |
| [day-2026.10.20](#2026-10-20) | 4 | [`78b802c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/78b802c6b6ab9f8c233e4651dadd32bcb96a091a) |
| [day-2026.10.21](#2026-10-21) | 12 | [`1c5d0bf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1c5d0bff05d5447f95b08132552c3a4d0a5db299) |
| [day-2026.10.22](#2026-10-22) | 15 | [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37) |
| [day-2026.10.24](#2026-10-24) | 6 | [`24e4ccf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/24e4ccfe54afe251e053b094691c8b55af2f1c75) |
| [day-2026.10.25](#2026-10-25) | 5 | [`e439da2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e439da28ce90178b73e1d8de2b668b52068c7037) |
| [day-2026.10.27](#2026-10-27) | 1 | [`4efc3ed`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4efc3eda2d067eb7945a45bca2a13a44c917493a) |
| [day-2026.10.28](#2026-10-28) | 1 | [`97b6750`](https://github.com/Vivekpsps3/vivek-monorepo/commit/97b6750d91974511ce37ee39e286b52778695247) |
| [day-2026.10.30](#2026-10-30) | 8 | [`ea474d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea474d8977ee48878fd51f62e21aafd33936df60) |
| [day-2026.10.31](#2026-10-31) | 12 | [`a234bdf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a234bdfef7ead270a425ffa11b178acd0c6e54d4) |
| [day-2026.11.01](#2026-11-01) | 6 | [`ad6441c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ad6441c0270467655be86ddd62ce20d7d5d54cd4) |
| [day-2026.11.06](#2026-11-06) | 7 | [`b1eff60`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b1eff609c742fc357ea11c6024063e1a0d97fe58) |
| [day-2026.11.07](#2026-11-07) | 55 | [`9a709dc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a709dc0c30b2fb1917cd9dbeaba9b7820721305) |
| [day-2026.11.08](#2026-11-08) | 5 | [`ab67b90`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ab67b90fdcbcea7802d6ee724585127181959f9c) |
| [day-2026.11.09](#2026-11-09) | 12 | [`08be484`](https://github.com/Vivekpsps3/vivek-monorepo/commit/08be484ba3b3535dbcb500749245f2e75ee1f2e4) |
| [day-2026.11.10](#2026-11-10) | 6 | [`80b9ca0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80b9ca0e0776297f3addcdfdac78542f6a7ced40) |
| [day-2026.11.11](#2026-11-11) | accepted landings, not a full recount | [`1268f8d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1268f8d8a61b4b0116fc10eedc6739dfed1f8b78) |

## Days without a mainline version

The following calendar dates/ranges have no first-parent integration in the inspected history. Their repository version remains the previous active day's snapshot; no new feature or fix is claimed. Side-branch work can exist on these dates without having reached main.

- 2026-09-02: no mainline integration.
- 2026-09-04 through 2026-10-08 (35 days): no mainline integration.
- 2026-10-10: no mainline integration.
- 2026-10-12: no mainline integration.
- 2026-10-17: no mainline integration.
- 2026-10-23: no mainline integration.
- 2026-10-26: no mainline integration.
- 2026-10-29: no mainline integration.
- 2026-11-02 through 2026-11-05 (4 days): no mainline integration.

## Daily explanations and complete integration ledger

### 2026-08-30

Version: **day-2026.08.30** · 3 mainline integration(s) · end state [`81594aa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/81594aae0a3c065f931a816feb26b4105318e9e8).

**Features added or changed.** The initial repository establishes the starting portfolio/application codebase. The historical Me kiosk receives tabs and shared navigation, and unused site styles are removed. This is the recorded baseline, not evidence that every baseline capability was newly written that day.

**Bugs fixed and recovery.** No separately described product bug fix is recorded. Deployment synchronization is corrected to leave the live tree attached to main after syncing a SHA.

**Maintenance and limits.** Initial import and CI setup; the old Me surface is historical and later retired.

**Mainline evidence, in integration order:**

- [`c8d3b1e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c8d3b1ee38086b417ce18f5385847a32e32ca88f) — chore: initial commit
- [`b3e8a62`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b3e8a6216f8a19a43894e2bc8df6ea8592c7d4bc) — ui: tabs in me-app kiosk, shared nav story, drop dead site styles
- [`81594aa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/81594aae0a3c065f931a816feb26b4105318e9e8) — ci: keep live tree attached to main after SHA sync

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-08-31

Version: **day-2026.08.31** · 5 mainline integration(s) · end state [`33585c4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/33585c4709c1eadca0342efb580c1165f8a4c821).

**Features added or changed.** The historical Me app adopts one canonical filesystem vault and a multi-session agent model. A design specification precedes the implementation/refactor; standing questions are removed from the interaction.

**Bugs fixed and recovery.** No separately identified user-facing bug fix is established by the commit messages. The pending-working-tree import and broad refactor are recorded below without treating their vague subjects as a complete feature specification.

**Maintenance and limits.** Canonical-vault design and Me refactoring are historical context, not the current Finance encryption contract.

**Mainline evidence, in integration order:**

- [`00ac14f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/00ac14fb9d0cf39b520117af14bdf3b011b8d179) — Add single canonical vault design spec
- [`43faa2f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/43faa2f5697e09e4d78fcd01d1e5c524444d33b0) — me: single canonical vault at /home/vivek/Deployments/Vault
- [`2cc3fe1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2cc3fe17196320eab66b1c3d938c9bd861840d9f) — chore: commit pending working tree
- [`349133b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/349133bf0091dad7761187b63aa72ef6c55cfca7) — me-refactor
- [`33585c4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/33585c4709c1eadca0342efb580c1165f8a4c821) — me: drop standing questions, keep multi-session agent

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-09-01

Version: **day-2026.09.01** · 3 mainline integration(s) · end state [`3ee2a27`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3ee2a272dba369585708b45360fe676c2243079e).

**Features added or changed.** Me gains a zoomable Calendar-backed Memory timeline, deeper calendar navigation, automatic note creation, an era picker, and an operations layout divided into thirds. Finance unlock persists across the historical browser workflow.

**Bugs fixed and recovery.** No separately labeled defect fix is recorded; persistence and navigation work are behavior changes rather than an independently proven production incident.

**Maintenance and limits.** These Me workflows belong to the retired app; only source history supports their former scope.

**Mainline evidence, in integration order:**

- [`de1d7cb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/de1d7cbb582fdd334de77e109e012a2c4bd2765b) — me: Memory reads Calendar/ as a zoomable timeline
- [`9c6f6e3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9c6f6e3406c9de9b95b4fd074c621648ebd9780e) — me: dive calendar and auto-create notes
- [`3ee2a27`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3ee2a272dba369585708b45360fe676c2243079e) — me: ops thirds, era pick, persist finance unlock

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-09-03

Version: **day-2026.09.03** · 2 mainline integration(s) · end state [`f750422`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f75042266d0c3dcd5a657ff36f5a51a97150d978).

**Features added or changed.** Finance adds Bank of America CSV parsing for Posted Date/Payee exports, monthly spending charts, and spending-list filters. Users can import that bank format and inspect spending by month.

**Bugs fixed and recovery.** No separate bug-fix integration is recorded for this day.

**Maintenance and limits.** Two Finance integrations; later imports and Spending navigation supersede the original presentation.

**Mainline evidence, in integration order:**

- [`9c1ca23`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9c1ca23c95616fb61b91bce73fc631a287a573ee) — finance: import Bank of America Posted Date/Payee CSV
- [`f750422`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f75042266d0c3dcd5a657ff36f5a51a97150d978) — finance: month spend charts and spend-list filters

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-09

Version: **day-2026.10.09** · 5 mainline integration(s) · end state [`da15bfb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/da15bfb8dac89c5f0a9d49a72168bebd1b01079f).

**Features added or changed.** Finance gains employment start/end dates, employer-grouped compensation history, multiple CSV files with an independent bank choice for each, stock bonuses/grants and partial sales, compensation-growth reporting, ESPP purchases, and public market pricing for employer stock.

**Bugs fixed and recovery.** Deployment removes its dependency on the retired Me app. The stock work separates employee funding basis, realized proceeds, and market value instead of treating every stock movement as salary.

**Maintenance and limits.** Compensation remains a separate plane from holdings and net worth; recording grants does not create balance-sheet positions.

**Mainline evidence, in integration order:**

- [`ceffffa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ceffffad0d5f3647fc35de4e07a2a864ac3ac2f8) — finance: track job dates and compensation by employer
- [`e7d16d2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e7d16d2e8e32e9dc087941fe73486b0db4298f05) — finance: import multiple CSV files with per-file bank selection
- [`eb1c3cf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/eb1c3cf1ad616136c84c48dea4144c658b1acfa9) — deploy: remove retired me app dependency
- [`d426f4f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d426f4fdcc05db04ead8f31ce1a837189cb5290e) — finance: track stock bonuses, sales, and compensation growth
- [`da15bfb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/da15bfb8dac89c5f0a9d49a72168bebd1b01079f) — Support ESPP purchases and market pricing for employer stock

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-11

Version: **day-2026.10.11** · 2 mainline integration(s) · end state [`1ac473f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1ac473f51061bc8c5c47187746038f1ac48951e3).

**Features added or changed.** Public portfolio content is refreshed and the Me app is retired. Finance review workflows are streamlined around more trustworthy totals.

**Bugs fixed and recovery.** The Finance totals/review change addresses correctness and review friction. Its broad subject does not justify inventing a more specific historical incident than the linked diff establishes.

**Maintenance and limits.** This is a significant product boundary: historical Me entries stop being available current features.

**Mainline evidence, in integration order:**

- [`c8fc48c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c8fc48c2e2346152829845718954627055a58764) — finance: make totals trustworthy and streamline review
- [`1ac473f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1ac473f51061bc8c5c47187746038f1ac48951e3) — Refresh personal website and retire Me app

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-13

Version: **day-2026.10.13** · 2 mainline integration(s) · end state [`351a72b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/351a72b20fdd9eb56667c28c9d9aba11bf939afa).

**Features added or changed.** Finance consolidates financial ownership and refreshes the active product surfaces. Redundant review chores and tooltips are removed to make the daily workflow more direct.

**Bugs fixed and recovery.** No separately named production defect is recorded; ownership consolidation and UX cleanup are reported as maintenance/behavior changes.

**Maintenance and limits.** Use the current feature reference for final data-plane ownership rather than the older page layout.

**Mainline evidence, in integration order:**

- [`2d2a0e6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2d2a0e619b4e3da7cca8b8acb311c2b7dc7ca5a7) — finance: unify financial ownership and refresh current releases
- [`351a72b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/351a72b20fdd9eb56667c28c9d9aba11bf939afa) — finance: remove review chores and redundant tooltips

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-14

Version: **day-2026.10.14** · 5 mainline integration(s) · end state [`c9c877a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c9c877a92293728c7839f911cea91db70938e413).

**Features added or changed.** Travel debuts as a LAN trip planner. Finance and Travel become accessible on one origin. Finance gains phone-fitting layouts, sign-in persistence across reloads, and one combined cashflow presentation; the broader frontend receives a neutral content-first design.

**Bugs fixed and recovery.** Phone layout and reload sign-in behavior are corrected. Cashflow presentation is consolidated so users do not have to reconcile competing displayed streams.

**Maintenance and limits.** The later one-service/one-database consolidation is separate; sharing an origin did not yet establish the final unified runtime.

**Mainline evidence, in integration order:**

- [`e06bf4a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e06bf4a25fdc9ff7f7ade2c7b779c05913964e45) — finance: fit the phone layout and keep sign-in across reloads
- [`e72bd0d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e72bd0d370c8a87bc02aa0af8c53ec1f56217b46) — travel: add a LAN trip planner separate from finance
- [`44a85ed`](https://github.com/Vivekpsps3/vivek-monorepo/commit/44a85ed52cc742d288c4e94ad362fcccb587554a) — Refine frontends with a neutral, content-first design
- [`93751fb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/93751fbcda7cda4edfe2c6c540dc38e9080df626) — finance: show one cashflow and fit each page
- [`c9c877a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c9c877a92293728c7839f911cea91db70938e413) — suite: serve finance and travel on one origin

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-15

Version: **day-2026.10.15** · 5 mainline integration(s) · end state [`0b007b9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0b007b9ba8087491716e00473da53b5f78d336fe).

**Features added or changed.** The private Hub and Media journal are introduced. Optional public-catalog scrape mode expands discovery when enabled.

**Bugs fixed and recovery.** WebCrypto receives an accepted ArrayBuffer type and markdown sanitization is passed through the required ngx-markdown provider, addressing runtime/integration failures.

**Maintenance and limits.** Maintainability-audit verification gaps are covered with tests. Provider-dependent discovery still requires its configured mode/network.

**Mainline evidence, in integration order:**

- [`6047640`](https://github.com/Vivekpsps3/vivek-monorepo/commit/604764043e0ff695a2e7b581f3dd3cccc1574ac6) — suite: open a private hub and media journal
- [`b81d1d9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b81d1d968588e7d358f7599a18354ea0683ffb8f) — fix: give WebCrypto an ArrayBuffer it accepts
- [`2c6f232`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2c6f2323d83a08b7963ce521126348095a236635) — fix: pass markdown sanitizer as an ngx-markdown provider
- [`33c6080`](https://github.com/Vivekpsps3/vivek-monorepo/commit/33c6080e2f66c18551a1916821073292fd78cb41) — test: close maintainability audit verification gaps
- [`0b007b9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0b007b9ba8087491716e00473da53b5f78d336fe) — media: add an optional public-catalog scrape mode

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-16

Version: **day-2026.10.16** · 4 mainline integration(s) · end state [`1bfd550`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1bfd5504a4b3ae5b4b0a364e89ca485a6f40d787).

**Features added or changed.** Media adds an episode/movie-follow-up calendar and independent season ratings. The shared theme becomes warmer, and Hub net-worth copy is quieter.

**Bugs fixed and recovery.** Mobile overflow is corrected by the shared styling change.

**Maintenance and limits.** Calendar follow-up discovery and season ratings are distinct from automatically saving new works into the personal library.

**Mainline evidence, in integration order:**

- [`0ffb688`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0ffb6884af2b5b2d2ea2c1f56854130be3534a71) — media: add a calendar for episodes and movie follow-ups
- [`f272f1b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f272f1b5c125fa108bff3d854c4cd959e09a5833) — finance: quiet the hub net worth line
- [`ea276a6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea276a6b45ef80d66d4f88d9612a985cf36e725b) — media: rate each season without a separate review
- [`1bfd550`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1bfd5504a4b3ae5b4b0a364e89ca485a6f40d787) — style: warm the shared theme and stop mobile overflow

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-18

Version: **day-2026.10.18** · 5 mainline integration(s) · end state [`53d9be7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/53d9be7f7df428653cc6acf6aad642924665c5e4).

**Features added or changed.** Finance exposes dated income sources while simplifying the encrypted schema. The original ecosystem brief and implementation status are preserved as documentation.

**Bugs fixed and recovery.** Signup validation, manual prices, checkbox behavior, Spending work-income display, and job quote validation are corrected. Schema cleanup and recovery guidance are clarified.

**Maintenance and limits.** The encrypted-schema work retains the server-blind model; dated compensation display does not update net worth.

**Mainline evidence, in integration order:**

- [`d38b88e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d38b88e4aaaf2f6be7d8489788d76fc155766688) — Simplify encrypted Finance schema and fix signup validation
- [`17aa563`](https://github.com/Vivekpsps3/vivek-monorepo/commit/17aa563eccd5b540ddc0b2ea3991da18a0023ab5) — Clarify encrypted schema cleanup and recovery documentation
- [`5097e20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5097e20eaf28361f5197b3e82d8f5633ce8df3c7) — Show dated income sources and fix manual prices and checkboxes
- [`aba3e8c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aba3e8c361a5cf3db95ed2806b2739dcbcf2bde2) — docs: preserve ecosystem brief and record implementation status
- [`53d9be7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/53d9be7f7df428653cc6acf6aad642924665c5e4) — Fix spending work income display and job quote validation

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-19

Version: **day-2026.10.19** · 1 mainline integration(s) · end state [`43bf25b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/43bf25b89c9796cfd6e512d10d27a193a8410997).

**Features added or changed.** No product feature is added in the sole integration.

**Bugs fixed and recovery.** No user-facing bug fix is recorded.

**Maintenance and limits.** Root agent workflow instructions are removed from the handoff; this is contributor documentation maintenance.

**Mainline evidence, in integration order:**

- [`43bf25b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/43bf25b89c9796cfd6e512d10d27a193a8410997) — Remove agent workflow instructions from the root handoff.

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-20

Version: **day-2026.10.20** · 4 mainline integration(s) · end state [`78b802c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/78b802c6b6ab9f8c233e4651dadd32bcb96a091a).

**Features added or changed.** Suite-wide administration replaces Finance-only administration. Travel, Media, and PTO flows are made more direct. The broadly titled More changes commit includes local-development auth support and substantial Media music/provider work; its diff is the evidence for details beyond the title.

**Bugs fixed and recovery.** Partial artist catalog handling and local-development vault unlock are fixed. CI removes stale documentation links and aligns the work-income assertion with current copy.

**Maintenance and limits.** Administration becomes a suite concern. The vague commit is retained in the ledger rather than silently omitted.

**Mainline evidence, in integration order:**

- [`99a6b09`](https://github.com/Vivekpsps3/vivek-monorepo/commit/99a6b0901c8455e07798b70e3332fe7be2151d26) — More changes
- [`32257c4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/32257c4ddca600fb162b90de59a1c275eced77da) — Fix partial artist catalogs and local-dev vault unlock.
- [`90b88b9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/90b88b96df25be34f571c0374f10ac5576bcf626) — Replace the finance admin page with a suite-wide admin and make travel, media, and PTO direct to use.
- [`78b802c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/78b802c6b6ab9f8c233e4651dadd32bcb96a091a) — Fix CI by dropping links to removed agent docs and matching the work-income spec to the current copy.

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-21

Version: **day-2026.10.21** · 12 mainline integration(s) · end state [`1c5d0bf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1c5d0bff05d5447f95b08132552c3a4d0a5db299).

**Features added or changed.** Administration moves to /hub/admin, with session revocation and usable enrollment links. Trips open as days and support contextual entry/editing for rides, cities, costs, reminders, day plans, and parking. Named cities produce a map; song detail better exposes its connections.

**Bugs fixed and recovery.** Local edits stop reloading the whole app, preserving working context. Artist search remains usable when one MusicBrainz query fails. Enrollment and admin sign-out actions are corrected.

**Maintenance and limits.** Duplicate styles, unused animations, and excess instructional copy are removed; these are UX/maintenance changes rather than new domain engines.

**Mainline evidence, in integration order:**

- [`1706c94`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1706c94e32e5bf99c03d6d91727fa3087f1c8519) — Keep local edits on the page instead of reloading the whole app.
- [`a641737`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a6417379372f891fea043e122c6dd9b368099bbf) — Remove duplicated styles and unused page animations.
- [`ab9f705`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ab9f70543bda51e5b7b8ac1be1b8f87ab9e944ed) — Move suite admin to /hub/admin and show what needs action.
- [`b8d3338`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b8d3338d336d31a4ec03db7d4e8ad4145f9daac5) — Let admins sign people out and send a working enrollment link.
- [`7e6d2de`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7e6d2de8c13e26f6d871d89b1255623c421133aa) — Make the suite something you use instead of something you read.
- [`a37a0f1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a37a0f154bab364933a997931ecf07a355734040) — Open a trip as its days, and put a song in the middle of its connections.
- [`ea5430f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea5430f5916e27e2920e841bd2f3047d7b42165e) — Add a ride, city, cost, or reminder by typing it on the trip.
- [`f997e4f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f997e4ff1aea62862a48ce53eb0ec020a15fea4b) — Show the trip on a map as soon as the cities are named.
- [`8307ba2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8307ba2b4b7499ae87c621d48e990425eeaedf91) — Edit a city or ride on the same line used to add it.
- [`bafd1e3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bafd1e368a16f083c8a2f8ffe67eb5486720afdf) — Edit a day plan or parking spot on the same line used to add it.
- [`af8f6eb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/af8f6eb521958eda08499dcd370aa0f83a424527) — Remove the remaining how-to sentences from Travel and Media.
- [`1c5d0bf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1c5d0bff05d5447f95b08132552c3a4d0a5db299) — Keep artist search working when one MusicBrainz query fails.

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-22

Version: **day-2026.10.22** · 15 mainline integration(s) · end state [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37).

**Features added or changed.** Portfolio and private tools are integrated into one site/database. Spending navigation centers on Activity/Calendar. Unified Alembic migrations, enforced per-app CSP, and Media navigation/progress/calendar feedback and design tokens land.

**Bugs fixed and recovery.** Auth hardening raises protection against offline passphrase guessing from exposed wraps. Media Phase 0 fixes navigation/progress/today behavior. Seeded migration rehearsals and shallow-clone ancestry checks are corrected; deployment no longer depends on an empty host env file.

**Maintenance and limits.** Deployment uses temporary checkouts, backup retention is clarified, and lint/type/coverage/Playwright quality gates are added. Integration records are not proof that production deployed each commit.

**Mainline evidence, in integration order:**

- [`9a28389`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a283895b4a2563a945f6ee3ade8ab76cc5ef20f) — Unify portfolio and private tools into one site and database ([PR #3](https://github.com/Vivekpsps3/vivek-monorepo/pull/3))
- [`9e885cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9e885cc44e1fa5fff746c018ac17709f7a680552) — Clarify stateless deployment ownership and transition cleanup
- [`86d0527`](https://github.com/Vivekpsps3/vivek-monorepo/commit/86d05273f9f240ef4dbd4f6cd1831d4658b6af12) — Deploy from temporary checkouts without a permanent source tree
- [`48c83e2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/48c83e2ee062f28d3af6333938c2394eb25a8c0a) — Retain only the latest verified database backup
- [`d75828c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d75828c4445685ab17f0f9d4c4d4b10515330790) — Remove the empty host environment file dependency
- [`50c0413`](https://github.com/Vivekpsps3/vivek-monorepo/commit/50c0413ee31330136138def3be2ae7e45ae1dafe) — Flatten Spending navigation onto Activity and Calendar.
- [`8dc554e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8dc554e8094237419571551ff82b0fbfe115bfbd) — Close offline passphrase guessing from passwordless key wraps ([PR #4](https://github.com/Vivekpsps3/vivek-monorepo/pull/4))
- [`4a869f3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4a869f3aab5452e71856f555c4fe532ab5d1cf02) — Add reviewed Alembic migrations for the unified site database ([PR #5](https://github.com/Vivekpsps3/vivek-monorepo/pull/5))
- [`b69231b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b69231bd0ec6a436a8e1e619967b44e321bc17ba) — Enforce a per-app Content-Security-Policy ([PR #7](https://github.com/Vivekpsps3/vivek-monorepo/pull/7))
- [`7af9906`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7af9906055e1d86404dfe26e5dda8883d5fb18c7) — Keep seeded schema rehearsals valid after main is adopted (#9)
- [`e4cca40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e4cca400cc00e0ee3620c46ee9ce58650ce5d4ad) — Fix Media Phase 0 navigation, progress, and calendar today ([PR #8](https://github.com/Vivekpsps3/vivek-monorepo/pull/8))
- [`5ec7bdf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5ec7bdf9be5a5a30dad0f27e4506f35549170903) — Unshallow the rehearsal clone before ancestry checks. (#10)
- [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae) — Add lint, type, coverage, and Playwright gates ([PR #6](https://github.com/Vivekpsps3/vivek-monorepo/pull/6))
- [`dd85c7b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/dd85c7bc40ede9998969243e11dd373131707079) — Address review nits from PRs 6, 7, 9, and 10 ([PR #13](https://github.com/Vivekpsps3/vivek-monorepo/pull/13))
- [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37) — Media UX Batch 1: feedback layer and design tokens ([PR #11](https://github.com/Vivekpsps3/vivek-monorepo/pull/11))

<details>
<summary>Constituent branch history first integrated today (46 commits)</summary>

- [`93c0e73`](https://github.com/Vivekpsps3/vivek-monorepo/commit/93c0e73a3ed8e09428027eeecf2c8196be728b8e) — Unify the personal site and database with verified releases and recovery (first integrated by [`9a28389`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a283895b4a2563a945f6ee3ade8ab76cc5ef20f)).
- [`daed052`](https://github.com/Vivekpsps3/vivek-monorepo/commit/daed0520699163edb61158499430a16cf49196dd) — Keep deployment stateless with one Compose definition and two data volumes (first integrated by [`9a28389`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a283895b4a2563a945f6ee3ade8ab76cc5ef20f)).
- [`ff6cde7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff6cde75800b08f60f165abb12e19eb7e663d13e) — Use a verified private subnet and keep runtime settings in Compose (first integrated by [`9a28389`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a283895b4a2563a945f6ee3ade8ab76cc5ef20f)).
- [`eaa20dc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/eaa20dc8c6807dc68cb7f9d83d41a47cd2c48f3b) — Test the real Compose lifecycle and pass release parameters through sudo safely (first integrated by [`9a28389`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a283895b4a2563a945f6ee3ade8ab76cc5ef20f)).
- [`ce125aa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ce125aaf16ba39081b2fa5b2b21b8e1074059928) — Close offline passphrase guessing from passwordless key wraps. (first integrated by [`8dc554e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8dc554e8094237419571551ff82b0fbfe115bfbd)).
- [`190d628`](https://github.com/Vivekpsps3/vivek-monorepo/commit/190d628b6d0fe1066dd476089413930c52c330ef) — Stop one address from locking passwordless login. (first integrated by [`8dc554e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8dc554e8094237419571551ff82b0fbfe115bfbd)).
- [`f4ce098`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f4ce098b54ce0ae0071dc785a69ca9b2a0a4e40d) — Let a valid vault signature through the failed-verify cap. (first integrated by [`8dc554e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8dc554e8094237419571551ff82b0fbfe115bfbd)).
- [`f3b0538`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f3b0538b3bf82ad9a5fa88dab070c0a2dce41e7f) — Add reviewed Alembic migrations for the unified site database. (first integrated by [`4a869f3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4a869f3aab5452e71856f555c4fe532ab5d1cf02)).
- [`dc557d6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/dc557d65670177dcf75816edfb4f9c5b01f8a785) — Stop batch migrations from deleting child rows and keep startup read-only. (first integrated by [`4a869f3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4a869f3aab5452e71856f555c4fe532ab5d1cf02)).
- [`6566338`](https://github.com/Vivekpsps3/vivek-monorepo/commit/656633841023bbcbf162319c03382a7ada1d6825) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/db-migrations (first integrated by [`4a869f3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4a869f3aab5452e71856f555c4fe532ab5d1cf02)).
- [`cac8040`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cac80405a32c7d78c5c04d51c404240d3b8523cd) — Validate schema adoption on a seeded database and close the review gaps. (first integrated by [`4a869f3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4a869f3aab5452e71856f555c4fe532ab5d1cf02)).
- [`efadd44`](https://github.com/Vivekpsps3/vivek-monorepo/commit/efadd4459f83122553843e760b2176ff4d0939b3) — Stop the adoption rehearsal from leaking the monitoring network. (first integrated by [`4a869f3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4a869f3aab5452e71856f555c4fe532ab5d1cf02)).
- [`18ea4d5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/18ea4d5dd6f9e77095a82fcbd3feb174eee0a45f) — Enforce a per-app Content-Security-Policy on the shared origin (first integrated by [`b69231b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b69231bd0ec6a436a8e1e619967b44e321bc17ba)).
- [`9166fd3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9166fd32ca30f12da8746e7276b68b18052977ba) — Close the media cover-art gap and the CSP review notes (first integrated by [`b69231b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b69231bd0ec6a436a8e1e619967b44e321bc17ba)).
- [`8ad67d4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8ad67d45b90b9f59097501bf1a32f29efd8bc8f2) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/csp-enforce (first integrated by [`b69231b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b69231bd0ec6a436a8e1e619967b44e321bc17ba)).
- [`c2ece69`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c2ece69704b938a3d55951fc66f37120c018b8d2) — Bound CSP report logs and cover the signed-in finance shell. (first integrated by [`b69231b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b69231bd0ec6a436a8e1e619967b44e321bc17ba)).
- [`d933f4f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d933f4f131fd522abf356dbf4b1b30f078a2cc91) — Fix Media Phase 0 entry, progress, calendar today, and stale renders. (first integrated by [`e4cca40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e4cca400cc00e0ee3620c46ee9ce58650ce5d4ad)).
- [`91ef2b5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91ef2b5397b0c2fa29f5d0f8c72f9f151dfe9bbd) — Address the Media Phase 0 review on progress, notes, and contrast. (first integrated by [`e4cca40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e4cca400cc00e0ee3620c46ee9ce58650ce5d4ad)).
- [`6b43802`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6b43802a1b9f9c450eef4214762d34d1acd733ac) — Keep a failed progress draft from replacing a newer server value. (first integrated by [`e4cca40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e4cca400cc00e0ee3620c46ee9ce58650ce5d4ad)).
- [`a215756`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a2157564f14a42b1d3816897f8412b0b12ad696d) — Save a restored progress value on blur and clear its prompt. (first integrated by [`e4cca40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e4cca400cc00e0ee3620c46ee9ce58650ce5d4ad)).
- [`777187d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/777187d0388f8c2011eb9af60fd8e32950232207) — Merge bookkeeping: Merge origin/main into feat/media-p0. (first integrated by [`e4cca40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e4cca400cc00e0ee3620c46ee9ce58650ce5d4ad)).
- [`0fcae80`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0fcae8021f783f836160bcd8f6a86ad1a98eacbe) — Format Python sources with Ruff. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`a1cb6cb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a1cb6cbab0348b843797c103d155ba6b3633e930) — Add lint, type, coverage, and Playwright gates. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`5919205`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5919205e94f015f4eb40290f3563e9e5937c887d) — Merge bookkeeping: Merge main into feat/ci-quality-gates. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`0e8949c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0e8949c176cdc6e18867e45620da0cc8e9899952) — Address quality-gate review without rewriting history. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`1b3141b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1b3141b9646a82959ce3c64a754604f4dc01bb25) — Merge bookkeeping: Merge main into feat/ci-quality-gates. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`2c41a00`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2c41a00fecfabaefd4acab7229f613f7951a1d2a) — Format the auth-hardening Python with Ruff. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`c0ca829`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c0ca829f7f3329f4d12a187797ecba2fd57dac54) — Ignore the auth-hardening format commit in blame. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`5c287f8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5c287f8c2eeede28a35c0d95693ea6bc19ebe9af) — Keep the auth-hardening gates green without new debt. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`04ffdc2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/04ffdc2331487ea682d537ce4d7575a986fb616d) — Merge bookkeeping: Merge origin/main into feat/ci-quality-gates. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`0ccfa2c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0ccfa2cb0696d2c6c278fa21093cdeb3828fb9de) — Format the merged Python with Ruff. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`6810963`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6810963ec731c11679d2c5b5144874027518ec97) — Ignore the merged-tree format commit in blame. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`7388310`](https://github.com/Vivekpsps3/vivek-monorepo/commit/73883104d3d9e4ab0cfa0907c8b4cbf62c9b74c5) — Re-pin the quality gates to the merged tree. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`14745e1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/14745e1ab4ea3db674327e9303fb51a6bdbdebc0) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/ci-quality-gates (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`f3df556`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f3df556afedd31788ea38c061348c841faf794b3) — Apply the round-4 quality nits on top of main. (first integrated by [`fdc9c16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fdc9c16d80945580c7917a5b8ab89d3f8bf4f2ae)).
- [`d207866`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d20786640d8f8429447ef8e8f79e1fcebfe0b463) — Address the remaining review nits from PRs 6, 7, 9, and 10. (first integrated by [`dd85c7b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/dd85c7bc40ede9998969243e11dd373131707079)).
- [`b8b3541`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b8b35415a4f1a49d7a8a025b8e31e75dce822dd2) — Add the media feedback layer and finish the Batch 1 tokens. (first integrated by [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37)).
- [`a008716`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a008716cc3a1973bd7e2838dadd5298e0bc14c27) — Apply control borders and lock their contrast at 3:1. (first integrated by [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37)).
- [`6520812`](https://github.com/Vivekpsps3/vivek-monorepo/commit/65208123b0edc022870916d9704b8d637eee4848) — Merge bookkeeping: Merge origin/main into feat/media-ux-batch1. (first integrated by [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37)).
- [`3353605`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3353605ce439cbff7c5507dc4d136745e1e35d29) — Fix the batch 1 review gaps in toasts, focus, and skeletons. (first integrated by [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37)).
- [`6d0675b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6d0675b5186773876ca49f738c23b553276e8e59) — Merge bookkeeping: Merge origin/main into feat/media-ux-batch1. (first integrated by [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37)).
- [`80a05b0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80a05b0beca09e1cbc3a807bd3ceb91e9265f42d) — Serialize note saves and keep failed drafts on screen. (first integrated by [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37)).
- [`034860b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/034860b33da166e265e9da2cf8cc1bdceb4e0302) — Time out a stalled note save and retire toasts when the save succeeds. (first integrated by [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37)).
- [`e9d68f3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e9d68f304ccc988a36bcaad9cef379331ed34729) — Merge bookkeeping: Merge origin/main into feat/media-ux-batch1. (first integrated by [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37)).
- [`ed861f5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ed861f5296fd28797164e6dae35fac20e083edf6) — Time out a stalled CSRF preflight and accept a retry of the same note. (first integrated by [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37)).
- [`1693972`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1693972fc0e961d12274f31aa75472f529a9ff4f) — Wait for the withdrawn import receipt before reading its undo summary. (first integrated by [`ff5cb67`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff5cb67451e60eef11e278016e89e62898e11a37)).

</details>

### 2026-10-24

Version: **day-2026.10.24** · 6 mainline integration(s) · end state [`24e4ccf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/24e4ccfe54afe251e053b094691c8b55af2f1c75).

**Features added or changed.** Media receives shell/item/browse UX batches; Finance receives cents/date/validation/contrast/toast improvements; Travel receives its TR1–TR4 UX bundle. Owners can change username from the account/Hub flow.

**Bugs fixed and recovery.** Legacy email-shaped usernames can be changed instead of being rejected by the new-name flow. Finance form/format feedback and Travel/Media UX fixes are captured in the bundled integrations.

**Maintenance and limits.** These PRs have October 23 local dates in some metadata but reach main on October 24 UTC, which is the convention used here.

**Mainline evidence, in integration order:**

- [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7) — Media UX batches 2–4: shell, item page, and browse ([PR #14](https://github.com/Vivekpsps3/vivek-monorepo/pull/14))
- [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795) — Finance UX F1: cents, dates, validation, contrast, and toasts ([PR #12](https://github.com/Vivekpsps3/vivek-monorepo/pull/12))
- [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478) — Travel UX bundle T (TR1–TR4) ([PR #15](https://github.com/Vivekpsps3/vivek-monorepo/pull/15))
- [`17134e1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/17134e1363380c5a2b3086fe558dddadfc5f2dfa) — Let the owner change their username ([PR #16](https://github.com/Vivekpsps3/vivek-monorepo/pull/16))
- [`4a19f6d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4a19f6d23710890829e00d4ccf2f62a589011d2e) — Add a Change username form on the hub ([PR #17](https://github.com/Vivekpsps3/vivek-monorepo/pull/17))
- [`24e4ccf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/24e4ccfe54afe251e053b094691c8b55af2f1c75) — Let a legacy email username change its name ([PR #18](https://github.com/Vivekpsps3/vivek-monorepo/pull/18))

<details>
<summary>Constituent branch history first integrated today (67 commits)</summary>

- [`7377cbd`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7377cbdb13f8bd1f680564daeba0eefc27f28814) — Share the suite theme key and Sunday week start. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`7c452cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7c452cc9a0c36db9cfb3fae6082641a8d9836e21) — Map a silent timeout to Can't reach Media. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`ea1a178`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea1a17857bf4ba8eaf7d94079061de91d36b9982) — Stop reinstalling Playwright system libraries on a cache hit. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`e1d36d6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e1d36d647de275695c523646420e0dc85b175064) — [B2] Add the five-tab shell, route titles, and not-found view. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`ab8b311`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ab8b311ff77f4e25445d0c662013f9b7591780f7) — [B2] Stage signup, skip a signed-out session probe, and link the Hub. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`a7e80fb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a7e80fb87abbfd194f72f5f000cb6db3ca45bac9) — [B2] Keep the Cloudflare beacon out of Media and Finance. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`00a1361`](https://github.com/Vivekpsps3/vivek-monorepo/commit/00a136119d1ba2549851de9ebbe42614bcd18803) — [B3] Make status a radiogroup and the score a half-step control. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`38394f7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38394f71358d31a1b4ebf22569019ae49887b968) — [B3] Finish the item page, add sheet, shows, and related. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`e94f2ab`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e94f2abf8228533d8f0cf6950f937846f4424159) — [B4] Fan out search, return library continue, and capture the screens. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`950c326`](https://github.com/Vivekpsps3/vivek-monorepo/commit/950c326e715f26b196771e70f93871e9d2cba0f5) — [B2] Delete the leftover episode-open rule. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`afbfea2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/afbfea27e0ed1a450ab0f2b0810cb7419d5839ff) — Close the review gaps for item toasts, search timeouts, and axe. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`9dad721`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9dad721a6e1dbff559f780fb9e75a58c5cdaf1b5) — Format the media app module and sign the synthetic vault in. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`bc95c4e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bc95c4eb0873542e58326775bd6c78ea22ab3bcc) — Drop the stale ruff allowances for media datetime imports. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`ac87e84`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ac87e8411f609fc2e89bf7e5961aba2e8f41673c) — [B3] [B4] Fix contrast, overflow, the calendar grid, and late saves. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`65807a9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/65807a9011d9a07b2a61472bebd4476ffa004f16) — [B3] [B4] Restore the 16px note gap and delete e2e fixtures. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`d3ffd57`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d3ffd5744b4f275edc11b8e87702d0fbe49b1170) — [B3] [B4] Wait for the held note save before reading it back. (first integrated by [`183087e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/183087ec39a56535bb09837e77a2d6b1b1239cd7)).
- [`1957346`](https://github.com/Vivekpsps3/vivek-monorepo/commit/19573465c0616669e788c645ec67ee3b58157735) — Add the finance UX foundation for money, dates, and validation. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`38e8a3d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38e8a3d5770a97d2f4ff924050150e4087efe1c3) — Merge bookkeeping: Merge origin/main into feat/finance-ux-f1 (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`26af526`](https://github.com/Vivekpsps3/vivek-monorepo/commit/26af526f8254bf52424f0c11154fe9615b1284d9) — Keep finance validation lint-clean and dialogs above toasts. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`e182a8c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e182a8c6f1d9f5d483d7183f25532615f27e5beb) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/finance-ux-f1 (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`87e8f97`](https://github.com/Vivekpsps3/vivek-monorepo/commit/87e8f97c74dede8f29e6c513bc8c6f4858a131c7) — Address the Painter and Cyborg review on finance F1. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`cca2be8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cca2be8e97bba1e52ecbdc4cbfe2f4cd22963441) — Type the planning net-worth fixtures so Karma compiles. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`9d53a7a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9d53a7a22ce317a3af3b0c587d88f8729d8dde35) — Expect the planning start field to stay readable while locked. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`3525b89`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3525b8953d1b789ddb3fffadc78cf6326f69cf38) — Show each failed save and undo, and finish the second design pass. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`37aa6e9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/37aa6e95c286fe05f11264a14ec28d8f290eb183) — Silence each vault write on its own request and finish the third design pass. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`e71185c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e71185c789f12bead8f5829af767bf6ec665b9d0) — Keep a saved transaction editor closed when the ledger refreshes. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`1611b28`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1611b2829fff5f002879b994d3261b3297d0207d) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/finance-ux-f1 (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`bda0d0b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bda0d0ba7a285ef45e590f477c1c400ced30df8a) — Use the shared focus ring on page headings. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`5ac57b3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5ac57b36746be68ed182075e340b4bab860c7673) — Show a planning delete failure and pin the silent write paths. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`a404f40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a404f404b1639522fa040a6e13a1043d2750c12d) — Lower the finance ESLint baseline after one fewer any. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`5c55349`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5c55349a488cf193482a4fffa358c35d3690feb7) — Share one vault load and retry a failed legacy rewrite. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`db2afd9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/db2afd95e276dc71d4a1c448f0a8f723133e3460) — Wait for a pending vault rewrite before any other write. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`65af571`](https://github.com/Vivekpsps3/vivek-monorepo/commit/65af5715f5d3b22e2140a9b879bd7c86ee7dd612) — Keep a timed-out media note visible after the item redraws. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`cab1b8d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cab1b8d7c5261e5f2cfc49fd5d8f5143aa4b4e19) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/finance-ux-f1 (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`fbe2379`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fbe23796a09c2f0e9eaddba3f9258eccb09038f5) — Serialize same-record asset saves instead of skipping the queue. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`d2c88a1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d2c88a13bbd89636a06e5eaed3b0b59346b88ae0) — Queue every same-record update and delete. (first integrated by [`91b3966`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91b3966bdcf3a5bb102004f37d0761580ec27795)).
- [`5779fe6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5779fe6013dbd855fd0973bb3c68e1dd9f1e3800) — [TR1] Share the keyed toast layer so Travel can adopt it. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`bdf1ae3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bdf1ae3902a12b9c607ac081ac5812db323f2148) — [TR1] Adopt the feedback layer for errors, loading, and PTO saves. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`8746066`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8746066a81e0a280e6146f094355f032c43404a3) — [TR2] Add trip form rows, inline validation, and undo deletes. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`51fda7b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/51fda7b7c72f2e9febef9fe359d9e0b2101500ab) — [TR3] Rebuild the composer, PTO board, map, and calendar. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`4f9c543`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4f9c5438c0656676849c49f645dd05f052be12bb) — [TR4] Put navigation on one row and tighten the upcoming page. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`f8589fe`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f8589fe8319ace96c7f30255cd17ebf267c31d96) — [TR1] Mark a route busy before its request returns. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`d40b616`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d40b616125a2fa950b0b513edd6960f3c0eb93d7) — [TR2] Hide the confirm error until a delete fails. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`ef930d6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ef930d692ea04310c56f2e8a060986cffbeae1e4) — [TR3] Fix the composer grid and the missing-city error. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`ca08a8d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ca08a8d1703286b4944ff8ba5880ab50dfc21522) — [TR4] Add the travel screenshot harness. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`2803fb7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2803fb757c8306f7607b76b5990b2e5bbd4dfbcc) — [TR3] Give composer weekday heads a columnheader role. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`8bc3342`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8bc334230cddbfb30c68f6911c9624e729ab9bd5) — [TR4] Format the screenshot server and check the pages with axe. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`ac4f69c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ac4f69c8e15c2df6bd57a3834a655a73d1eb00d1) — [TR4] Keep the screenshot database path from shadowing the module. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`6cfac44`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6cfac44ae657b9dd89ae0462df6d013d012ef880) — [TR1] Dismiss a persistent Retry toast when the save succeeds. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`ad2cf2a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ad2cf2aa13ba718cae1586432a818a04545370f7) — [TR2] Require a mode, retry the chosen flag, and keep stored PTO precision. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`bb5cf9d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb5cf9d8ef998c1210c5157ffc9aa34764fce66e) — [TR3] Keep composer focus, the city error, and PTO cadence values. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`6c96544`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6c96544120f3dfbe27d6c9ee596c48303ba82ccf) — [TR4] Pin the 390 tab bar under the header and check the blockers. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`33c2727`](https://github.com/Vivekpsps3/vivek-monorepo/commit/33c2727c1b8f72017a8d07b366f3ae2a90e2f655) — [TR2] Finish focus, labels, theme radios, and the Travel Playwright job. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`1dc8b79`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1dc8b79a3b1b0cdd2418992116897742cf0fa25d) — Merge bookkeeping: Merge origin/main into feat/travel-ux-bundle-t. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`a41cf58`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a41cf581e9d738ff5075fa34ac97627e1708ca8e) — [TR4] Install Travel Playwright from its lockfile and shrink the ruff baseline. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`588b82a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/588b82a8eed92502f3e550c9cd8cae0cfce6f3b7) — [TR4] Drop empty composer weeks and honor suite-theme in screenshots. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`03c20c3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/03c20c3eaa2556009cdc416e333bcb68d8f8f7b9) — [TR2] Keep note-conflict toasts out of the shared late-failure rewrite. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`864e66d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/864e66d8c05602fa126c7767c9abd864a3e133b9) — Merge bookkeeping: Merge origin/main into feat/travel-ux-bundle-t. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`00182b5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/00182b503184e5d6309143bb2beabefa717329e8) — [TR4] Paint the focused skip link above the sticky header. (first integrated by [`6fc6f52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fc6f5252ecbc5bd894a043e36b390d91d0c0478)).
- [`36aac6c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/36aac6c633e744a09a3816c2d07c727e63fa7ee9) — Merge bookkeeping: Merge origin/main into feat/account-change-username. (first integrated by [`17134e1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/17134e1363380c5a2b3086fe558dddadfc5f2dfa)).
- [`c7ec1f0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c7ec1f053b9017169f3e0b4c5920e489bc73a639) — Add an authenticated endpoint to change the account username. (first integrated by [`17134e1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/17134e1363380c5a2b3086fe558dddadfc5f2dfa)).
- [`ac87996`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ac87996dc76c063b1cd276982a2f008a72da0fda) — Merge bookkeeping: Merge origin/main into feat/account-change-username. (first integrated by [`17134e1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/17134e1363380c5a2b3086fe558dddadfc5f2dfa)).
- [`b4e6377`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b4e637752d56369e229a95b072f73a773ffe8cf7) — Bind challenge signatures to the issued challenge and action. (first integrated by [`17134e1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/17134e1363380c5a2b3086fe558dddadfc5f2dfa)).
- [`1665248`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1665248e5081f104117058a4482d8b68250284d3) — Format the challenge-binding tests. (first integrated by [`17134e1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/17134e1363380c5a2b3086fe558dddadfc5f2dfa)).
- [`301c1b3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/301c1b36e64d97060fc9d3a70ce4753043ca4b8a) — Add a Change username form on the hub. (first integrated by [`4a19f6d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4a19f6d23710890829e00d4ccf2f62a589011d2e)).
- [`354e996`](https://github.com/Vivekpsps3/vivek-monorepo/commit/354e99686333ea4645471c0853a8be6c36c42911) — Let a legacy email username change its name. (first integrated by [`24e4ccf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/24e4ccfe54afe251e053b094691c8b55af2f1c75)).
- [`29d7698`](https://github.com/Vivekpsps3/vivek-monorepo/commit/29d769800d641aafda8330eb1953a31d59e41fe6) — Leave a missing CSRF cookie unchanged on session read. (first integrated by [`24e4ccf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/24e4ccfe54afe251e053b094691c8b55af2f1c75)).

</details>

### 2026-10-25

Version: **day-2026.10.25** · 5 mainline integration(s) · end state [`e439da2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e439da28ce90178b73e1d8de2b668b52068c7037).

**Features added or changed.** Media, account, and Finance screens are reshaped around their actual use, with controls scoped to the appropriate screen.

**Bugs fixed and recovery.** Two follow-up integrations fix CI failures introduced/exposed by the UX cleanup. They are test/build stabilization, not additional product features.

**Maintenance and limits.** The archived Finance GSD planning tree is removed. Removing planning records does not itself simplify runtime behavior.

**Mainline evidence, in integration order:**

- [`719cccf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/719cccf363ae013bdf2a4e984a518668a27a9a2b) — Clean up media, account, and finance UX so each screen shows only the control that belongs there.
- [`766375e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/766375ef76347fd2c4e9bdee428e92d692c87528) — Fix CI after the UX cleanup (#19)
- [`1c7bb5c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1c7bb5cc4dd4649bc8d1a9875d12748249e64330) — Fix remaining main CI failures (#20)
- [`f67ae44`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f67ae44874451a623c9c98eea402c1493a209110) — Match media and finance screens to how they are used (#21)
- [`e439da2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e439da28ce90178b73e1d8de2b668b52068c7037) — Remove the archived Finance GSD planning tree.

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-27

Version: **day-2026.10.27** · 1 mainline integration(s) · end state [`4efc3ed`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4efc3eda2d067eb7945a45bca2a13a44c917493a).

**Features added or changed.** The suite completes its unified runtime and major Travel/Media workflows: one server/application/session/database composition and one Angular entry, per-date trip PTO allocation with explicit legacy backfill, explicit media membership, artist/song/album identity, private portrait selection, and saved/progress/calendar flows.

**Bugs fixed and recovery.** Provider calls move outside database write transactions; provider authentication errors stop masquerading as suite session expiry. Trip creation retries become idempotent, failed saves/Undo preserve recoverable state, places resolve explicitly, and saved Media reads avoid provider dependency. Browser security and ownership regressions are covered.

**Maintenance and limits.** This large squashed integration includes implementation and verifier history. Consult its diff and current domain documents for final behavior; intermediate checklist comments do not establish current defects.

**Mainline evidence, in integration order:**

- [`4efc3ed`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4efc3eda2d067eb7945a45bca2a13a44c917493a) — Unify the suite runtime and complete Travel and Media workflows (#22)

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-28

Version: **day-2026.10.28** · 1 mainline integration(s) · end state [`97b6750`](https://github.com/Vivekpsps3/vivek-monorepo/commit/97b6750d91974511ce37ee39e286b52778695247).

**Features added or changed.** The suite header and favicons are refreshed, improving the shared entry/navigation presentation.

**Bugs fixed and recovery.** No separately named domain bug fix is recorded.

**Maintenance and limits.** Supporting documentation is updated with the presentation change.

**Mainline evidence, in integration order:**

- [`97b6750`](https://github.com/Vivekpsps3/vivek-monorepo/commit/97b6750d91974511ce37ee39e286b52778695247) — Refresh the suite header, favicons and supporting docs (#23)

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-10-30

Version: **day-2026.10.30** · 8 mainline integration(s) · end state [`ea474d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea474d8977ee48878fd51f62e21aafd33936df60).

**Features added or changed.** Town foundations land: owned schema, pure XP/levels/lots/streak/cadence/name engine, and account-delete integration. Finance exposes weekly budget-kept calculation. Health gains encrypted vault collection support. World gains deterministic core/chunk generation with seed normalization and golden vectors. Media gains expected-identity next-episode writes.

**Bugs fixed and recovery.** Town cascade/integrity/uniqueness follow-ups protect ownership. These integrations are backend/engine foundations, not evidence of complete Town, World, or Health screens.

**Maintenance and limits.** Core algorithms and schema arrive ahead of later UI integrations; Finance budget semantics remain distinct from habit streak semantics.

**Mainline evidence, in integration order:**

- [`bba16f2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bba16f2d7dc2037250a8689d0582c276f67ef5ee) — Town TB1: schema and site_town_v1 migration ([PR #27](https://github.com/Vivekpsps3/vivek-monorepo/pull/27))
- [`e6a4377`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e6a4377702cf759cdefa87b4658c42eb7485b1a8) — Town TB1F: account-delete cascade, integrity checks, uniqueness tests ([PR #29](https://github.com/Vivekpsps3/vivek-monorepo/pull/29))
- [`54b4bf9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/54b4bf91c808f11a77a13881b155f0e2d55a3966) — Town TB2A: constants + pure engine (levels, lots, streaks, cadence, names) ([PR #26](https://github.com/Vivekpsps3/vivek-monorepo/pull/26))
- [`333907e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/333907e8f322216ec6bff0971d2adc58d677b8ba) — Finance: shared weekly budget-kept helper (TK1) ([PR #31](https://github.com/Vivekpsps3/vivek-monorepo/pull/31))
- [`8d7ec23`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8d7ec232f7cdab91bce764cc2ddde99610fd7b22) — THV1: Town Health vault collections (health_stats, health_prs) ([PR #30](https://github.com/Vivekpsps3/vivek-monorepo/pull/30))
- [`8deb4c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8deb4c0b2d0e1e661a29dc7558f4514f07a29dad) — World W1a: engine core (FNV-1a 64, Mulberry32, canonical JSON, constants) ([PR #25](https://github.com/Vivekpsps3/vivek-monorepo/pull/25))
- [`aaf10cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaf10cc6d66ae955a90fdc8a20c0bfa2ce541e5c) — World W1b: chunk generation (seed, normalize, generate, golden vectors) ([PR #28](https://github.com/Vivekpsps3/vivek-monorepo/pull/28))
- [`ea474d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea474d8977ee48878fd51f62e21aafd33936df60) — M1: mark next episode with expected_episode_id and marked payload (Suite UX v2) ([PR #36](https://github.com/Vivekpsps3/vivek-monorepo/pull/36))

<details>
<summary>Constituent branch history first integrated today (53 commits)</summary>

- [`983ebb6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/983ebb60f676ddb627876a278ad913137edb3db2) — feat(town): add Town models and register TownBase (first integrated by [`bba16f2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bba16f2d7dc2037250a8689d0582c276f67ef5ee)).
- [`2c1c4a8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2c1c4a8fc77fb46fa7c98b0c06b9f8d4f6417f1f) — feat(town): add site_town_v1 migration and add-only columns (first integrated by [`bba16f2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bba16f2d7dc2037250a8689d0582c276f67ef5ee)).
- [`d9aadfa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d9aadfaf2653fe56483a685107aede7e84595dc8) — test(town): migration, constraints and owner scoping (first integrated by [`bba16f2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bba16f2d7dc2037250a8689d0582c276f67ef5ee)).
- [`984fefd`](https://github.com/Vivekpsps3/vivek-monorepo/commit/984fefd4c0ce340f4a137d82c968b713a8f9d7ed) — fix(town): delete habit rows with the account (first integrated by [`e6a4377`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e6a4377702cf759cdefa87b4658c42eb7485b1a8)).
- [`d0d8203`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d0d8203cd5faa8fb1edc8a1aeca2e2e6ee07237d) — fix(town): flag habit rows owned by a different user (first integrated by [`e6a4377`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e6a4377702cf759cdefa87b4658c42eb7485b1a8)).
- [`4b6aecf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4b6aecf088987310b4d7ee207daf765447102696) — test(town): pin per-user slot and name uniqueness (first integrated by [`e6a4377`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e6a4377702cf759cdefa87b4658c42eb7485b1a8)).
- [`7dac599`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7dac5991ca21289bf946657d26778352c10788aa) — feat(town): cap name_key after casefold (first integrated by [`e6a4377`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e6a4377702cf759cdefa87b4658c42eb7485b1a8)).
- [`40b6a70`](https://github.com/Vivekpsps3/vivek-monorepo/commit/40b6a700ac1df18df7d716d6b2a3ff48d0864789) — docs(town): record deferred schema carryovers (first integrated by [`e6a4377`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e6a4377702cf759cdefa87b4658c42eb7485b1a8)).
- [`b9fcb42`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b9fcb426b6c765f01f0d2d047a19e7096ceb3769) — feat(town): add server constants (CONSTANTS_VERSION=1) (first integrated by [`54b4bf9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/54b4bf91c808f11a77a13881b155f0e2d55a3966)).
- [`a2d5fbf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a2d5fbfc1d217213f21649fd4c9bdc525d26e320) — feat(town): add pure level, lot and cadence math (first integrated by [`54b4bf9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/54b4bf91c808f11a77a13881b155f0e2d55a3966)).
- [`4de69a8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4de69a8d273092a4e68cfe2cc203f10972cfda1c) — feat(town): add streak engine (first integrated by [`54b4bf9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/54b4bf91c808f11a77a13881b155f0e2d55a3966)).
- [`a715634`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a71563424bbcba141e20d6f8fc560543b4f0ff64) — feat(town): add habit name normalization (first integrated by [`54b4bf9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/54b4bf91c808f11a77a13881b155f0e2d55a3966)).
- [`24d4640`](https://github.com/Vivekpsps3/vivek-monorepo/commit/24d46400f758c6d5a7f9a609c15c6dd3c329349d) — Merge bookkeeping: Merge origin/main into feat/town-tb2a-engine (first integrated by [`54b4bf9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/54b4bf91c808f11a77a13881b155f0e2d55a3966)).
- [`e35e7ce`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e35e7ce2e4405f7fa29a292f30bcf001ad7c7284) — test(town): make worked examples A/B/C table-driven (first integrated by [`54b4bf9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/54b4bf91c808f11a77a13881b155f0e2d55a3966)).
- [`67c4b84`](https://github.com/Vivekpsps3/vivek-monorepo/commit/67c4b842f9e690c7e402ea2856bad00016336ad8) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/town-tb2a-engine (first integrated by [`54b4bf9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/54b4bf91c808f11a77a13881b155f0e2d55a3966)).
- [`63d8bb3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/63d8bb3ee8fdbb47eb9418f8406c50fc83efe998) — feat(finance): add pure budget-kept core (plan resolution, weekly spend, unknown weeks) (first integrated by [`333907e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/333907e8f322216ec6bff0971d2adc58d677b8ba)).
- [`6816f4d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6816f4dd96d2da20ca99a399fd5ea8e72efdc01d) — feat(finance): add loadFinanceBudgetKept facade and export it (first integrated by [`333907e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/333907e8f322216ec6bff0971d2adc58d677b8ba)).
- [`b08d6a0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b08d6a0476f58168c63eda7d9839fdf37bc13f53) — Merge bookkeeping: Merge origin/main into feat/finance-budget-kept (first integrated by [`333907e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/333907e8f322216ec6bff0971d2adc58d677b8ba)).
- [`41f4efa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/41f4efaebd5377e9289e518d08d13aacec4b15c8) — fix(finance): close budget-kept mode, window, and startup deadline gaps (first integrated by [`333907e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/333907e8f322216ec6bff0971d2adc58d677b8ba)).
- [`1d84e47`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1d84e47f2458a1b5fe1b9a604f2c0d2ffbe3a851) — Merge bookkeeping: Merge origin/main into feat/finance-budget-kept (first integrated by [`333907e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/333907e8f322216ec6bff0971d2adc58d677b8ba)).
- [`09a8204`](https://github.com/Vivekpsps3/vivek-monorepo/commit/09a820463ce942d753e4aa9ea6240bf80ef74d69) — fix(finance): budget-kept import deadline and failure precedence (first integrated by [`333907e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/333907e8f322216ec6bff0971d2adc58d677b8ba)).
- [`3d71d73`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3d71d7378caeaf4c7b216a297e5664789b4b3706) — fix(finance): one budget-kept deadline across import and read (first integrated by [`333907e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/333907e8f322216ec6bff0971d2adc58d677b8ba)).
- [`ecb953f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ecb953f464f48dc73011252797c0faf0a8b2e974) — feat(finance): allow health_stats and health_prs vault collections (first integrated by [`8d7ec23`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8d7ec232f7cdab91bce764cc2ddde99610fd7b22)).
- [`3f15f2f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3f15f2f7b6cb174c5ebfde7ddcbe97dfca658065) — feat(finance): skip foreign (health) collections explicitly when loading the store (first integrated by [`8d7ec23`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8d7ec232f7cdab91bce764cc2ddde99610fd7b22)).
- [`1e42f4f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1e42f4ff398b4c666382c69e19f04bce972fadca) — Merge bookkeeping: Merge origin/main into feat/town-health-v1-vault (first integrated by [`8d7ec23`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8d7ec232f7cdab91bce764cc2ddde99610fd7b22)).
- [`ea746f5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea746f50874605abb18f00c39ed090109c94dbd4) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/town-health-v1-vault (first integrated by [`8d7ec23`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8d7ec232f7cdab91bce764cc2ddde99610fd7b22)).
- [`05d14e3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/05d14e3730e398be48c47bb0ba05373d81972777) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/town-health-v1-vault (first integrated by [`8d7ec23`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8d7ec232f7cdab91bce764cc2ddde99610fd7b22)).
- [`afc6c54`](https://github.com/Vivekpsps3/vivek-monorepo/commit/afc6c54a77047cb6c677ca72db5c4076bbc273d9) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/town-health-v1-vault (first integrated by [`8d7ec23`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8d7ec232f7cdab91bce764cc2ddde99610fd7b22)).
- [`96c4aa3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/96c4aa39e8e04f9dcac495ddac4ad6330269ff50) — Ban impure APIs in the worldgen engine. (first integrated by [`8deb4c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8deb4c0b2d0e1e661a29dc7558f4514f07a29dad)).
- [`3b65c76`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3b65c76d3c1e72cce5aa22ec46dcda926dd53fda) — Add worldgen geometry, biome, and artifact constants. (first integrated by [`8deb4c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8deb4c0b2d0e1e661a29dc7558f4514f07a29dad)).
- [`abcaf98`](https://github.com/Vivekpsps3/vivek-monorepo/commit/abcaf98c801cbad0019e3fbf924c44c4dcf7bc6f) — Add the FNV-1a 64 hash for worldgen seeds. (first integrated by [`8deb4c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8deb4c0b2d0e1e661a29dc7558f4514f07a29dad)).
- [`7b3d297`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7b3d297a35adb4bfa753fc0477f60c69c8056253) — Add the Mulberry32 generator for worldgen streams. (first integrated by [`8deb4c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8deb4c0b2d0e1e661a29dc7558f4514f07a29dad)).
- [`f48de70`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f48de70d456bc6d6b4233279ee3e129b3e74c981) — Add canonical JSON for worldgen inputs. (first integrated by [`8deb4c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8deb4c0b2d0e1e661a29dc7558f4514f07a29dad)).
- [`b6bed4c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b6bed4cb05ebc519a0e10d24da4442a1b064c4dd) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/world-w1a-engine-core (first integrated by [`8deb4c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8deb4c0b2d0e1e661a29dc7558f4514f07a29dad)).
- [`c554d74`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c554d74a3bfffdc663da1d3186a7cbb21e66cb7c) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/world-w1a-engine-core (first integrated by [`8deb4c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8deb4c0b2d0e1e661a29dc7558f4514f07a29dad)).
- [`9e5d10d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9e5d10dab934f70662c3a539c3005a09806d52c9) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/world-w1a-engine-core (first integrated by [`8deb4c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8deb4c0b2d0e1e661a29dc7558f4514f07a29dad)).
- [`480df08`](https://github.com/Vivekpsps3/vivek-monorepo/commit/480df08710f3bb78e4d4e7db8dd30a251bfd6a25) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/world-w1a-engine-core (first integrated by [`8deb4c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8deb4c0b2d0e1e661a29dc7558f4514f07a29dad)).
- [`0a865e8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0a865e81a88e15c0adedb259928dfb9fff7da21a) — Add worldgen input and chunk types. (first integrated by [`aaf10cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaf10cc6d66ae955a90fdc8a20c0bfa2ce541e5c)).
- [`ef2dbae`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ef2dbaeef946ae204d08c18306da47017305c693) — Add the world seed for a user id. (first integrated by [`aaf10cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaf10cc6d66ae955a90fdc8a20c0bfa2ce541e5c)).
- [`5365633`](https://github.com/Vivekpsps3/vivek-monorepo/commit/53656333d4e327001bc7399d28eabf27903f0ef3) — Add week normalization for worldgen inputs. (first integrated by [`aaf10cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaf10cc6d66ae955a90fdc8a20c0bfa2ce541e5c)).
- [`adccf85`](https://github.com/Vivekpsps3/vivek-monorepo/commit/adccf85fbf1fd935b54cf409fef3d8cc7ddec2ef) — Add deterministic chunk generation. (first integrated by [`aaf10cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaf10cc6d66ae955a90fdc8a20c0bfa2ce541e5c)).
- [`f262488`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f26248882fddbbca95bb01061d5a39a5aeef57d0) — Add golden, property, and fuzz tests for worldgen. (first integrated by [`aaf10cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaf10cc6d66ae955a90fdc8a20c0bfa2ce541e5c)).
- [`213213e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/213213e087de5b03fc52731bf7f7966964aa4b04) — Merge bookkeeping: Merge remote-tracking branch 'origin/feat/world-w1a-engine-core' into feat/world-w1b-chunkgen (first integrated by [`aaf10cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaf10cc6d66ae955a90fdc8a20c0bfa2ce541e5c)).
- [`ead11bf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ead11bf01a6aaa0609289d8ea293944665529c53) — Merge bookkeeping: Merge remote-tracking branch 'origin/feat/world-w1a-engine-core' into feat/world-w1b-chunkgen (first integrated by [`aaf10cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaf10cc6d66ae955a90fdc8a20c0bfa2ce541e5c)).
- [`4b32d78`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4b32d787b3ce0816eaa02f9efc623d1f2f62ab86) — Merge bookkeeping: Merge remote-tracking branch 'origin/feat/world-w1a-engine-core' into feat/world-w1b-chunkgen (first integrated by [`aaf10cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaf10cc6d66ae955a90fdc8a20c0bfa2ce541e5c)).
- [`c205d8c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c205d8c4c19ee51fd7392de2d16c5af99deb8b4d) — Merge bookkeeping: Merge remote-tracking branch 'origin/feat/world-w1a-engine-core' into feat/world-w1b-chunkgen (first integrated by [`aaf10cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaf10cc6d66ae955a90fdc8a20c0bfa2ce541e5c)).
- [`466b8a9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/466b8a975a7a7c7d4c88420434d3ed8566fd2c77) — feat(media): add pick-next, the stale-id check, and the marked payload (first integrated by [`ea474d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea474d8977ee48878fd51f62e21aafd33936df60)).
- [`41314cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/41314ccd5c45d2c6ffe5871a27fa1b56b62ffbb7) — feat(media): accept expected_episode_id and return marked on next-episode (first integrated by [`ea474d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea474d8977ee48878fd51f62e21aafd33936df60)).
- [`4bbc009`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4bbc009035007d473076ba2783598bc204f4941f) — test(media): cover next-episode 409s, 422s, undo, and owner scope (first integrated by [`ea474d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea474d8977ee48878fd51f62e21aafd33936df60)).
- [`5d0e3aa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5d0e3aa3996cd550f76a537d2a6c05c3f1fe596e) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-ux-v2-m1 (first integrated by [`ea474d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea474d8977ee48878fd51f62e21aafd33936df60)).
- [`b4ead2b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b4ead2bc3fa893f34dde6c150d5412b21f38c395) — ci: re-run (unrelated timing flake in test_bundle_m search timeout) (first integrated by [`ea474d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea474d8977ee48878fd51f62e21aafd33936df60)).
- [`4874f38`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4874f3828c201627bcacc935be04275fd8ee8241) — fix(server): build included-route matchers before the first request (first integrated by [`ea474d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea474d8977ee48878fd51f62e21aafd33936df60)).
- [`bd03e6c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bd03e6cdb45bda1f937ae994496552da4798c044) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-ux-v2-m1 (first integrated by [`ea474d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ea474d8977ee48878fd51f62e21aafd33936df60)).

</details>

### 2026-10-31

Version: **day-2026.10.31** · 12 mainline integration(s) · end state [`a234bdf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a234bdfef7ead270a425ffa11b178acd0c6e54d4).

**Features added or changed.** Travel adds trip-cost buckets/list API fields. Pixels gains its pure score/week helpers and owner-only birthday storage. Media gains the library tag-filter API. Town gains client constants/sprites/contracts. Cross-suite Bundle 0 adds settings/navigation/lock foundations.

**Bugs fixed and recovery.** Finance budget helpers validate bounds/errors; Media next-episode concurrency returns conflict and hides foreign entries; Town name/type validation is hardened. Birthday values are removed from exception chains/logging. World generation purity/lint and security follow-ups receive coverage.

**Maintenance and limits.** Birthday persistence and score helpers are foundations; Year/Life screens do not land until November 8 UTC.

**Mainline evidence, in integration order:**

- [`50692d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/50692d849490af185c0546cf3c97d6ed5f848a5a) — T1: Travel trip-cost buckets and trips-list fields API ([PR #32](https://github.com/Vivekpsps3/vivek-monorepo/pull/32))
- [`cafd690`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cafd69099ea29d630eccb164bbbfab8238e1526c) — Pixels: pure score and week helpers (PF2) ([PR #33](https://github.com/Vivekpsps3/vivek-monorepo/pull/33))
- [`2854c40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2854c401e70ac187b32dcb95a90647c2ea17d6dd) — Media: library tags filter API (M2) ([PR #34](https://github.com/Vivekpsps3/vivek-monorepo/pull/34))
- [`7dcece2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7dcece2b21b4c46385c5603ac412aa2de99a774d) — World: worldgen lint and test hardening (WF1) ([PR #39](https://github.com/Vivekpsps3/vivek-monorepo/pull/39))
- [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2) — PB1: owner-only birthday storage and route (site_user_birthday_v1) ([PR #35](https://github.com/Vivekpsps3/vivek-monorepo/pull/35))
- [`6b41a4f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6b41a4f7ad37db3381688a41430575be6fc38b23) — TB2B-2: Town name-key validation and write-path tests ([PR #40](https://github.com/Vivekpsps3/vivek-monorepo/pull/40))
- [`90c1f20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/90c1f20902fac9b4ed58b92e95b71cc69e04df72) — TC1: Town client contracts (constants, sprites, levels, types, barrel, parity test) ([PR #42](https://github.com/Vivekpsps3/vivek-monorepo/pull/42))
- [`4e7ba20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4e7ba20ab0d0bc7ff142a3224b55ea88f78ed12e) — Finance: budget-kept hardening (TK1F) ([PR #37](https://github.com/Vivekpsps3/vivek-monorepo/pull/37))
- [`77909e0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/77909e0a511ba92308e49f83ac1779e55f2a6d3d) — M1F: Security follow-ups on next-episode (concurrency 409, foreign-entry 404 pins, warm-up guard) ([PR #41](https://github.com/Vivekpsps3/vivek-monorepo/pull/41))
- [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751) — Suite UX v2 Bundle 0: cross-suite foundation ([PR #24](https://github.com/Vivekpsps3/vivek-monorepo/pull/24))
- [`3213483`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3213483730fa43f5fcb3a56073ab5a89930431f7) — SF2: Security follow-ups for #37, #40 and #42 ([PR #44](https://github.com/Vivekpsps3/vivek-monorepo/pull/44))
- [`a234bdf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a234bdfef7ead270a425ffa11b178acd0c6e54d4) — fix(pixels): keep birthdays out of chained errors and engine logs (SF1) ([PR #45](https://github.com/Vivekpsps3/vivek-monorepo/pull/45))

<details>
<summary>Constituent branch history first integrated today (106 commits)</summary>

- [`2cdf5e8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2cdf5e87ba68aa3f5311691ab731fdae2310d9a1) — Add per-currency cost buckets to the trip budget rollup. (first integrated by [`50692d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/50692d849490af185c0546cf3c97d6ed5f848a5a)).
- [`abc44bc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/abc44bcc9c34a1bde4cf2358523a3cc573f0077b) — Add cents and bucket rows to the trip budget payload. (first integrated by [`50692d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/50692d849490af185c0546cf3c97d6ed5f848a5a)).
- [`014a063`](https://github.com/Vivekpsps3/vivek-monorepo/commit/014a063c086b499c482e7e895cb360bf2a4a0caf) — Add days_until and next_action to in-progress and upcoming home cards. (first integrated by [`50692d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/50692d849490af185c0546cf3c97d6ed5f848a5a)).
- [`130f673`](https://github.com/Vivekpsps3/vivek-monorepo/commit/130f67349327e0c5943a4c160346518610ef1de7) — Cover trip budget buckets and home card fields in API tests. (first integrated by [`50692d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/50692d849490af185c0546cf3c97d6ed5f848a5a)).
- [`959c40d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/959c40dc0f0028075844eea712e5b94e9f437d63) — Return each rolled line's bucket from rollup. (first integrated by [`50692d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/50692d849490af185c0546cf3c97d6ed5f848a5a)).
- [`d20bbad`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d20bbad69991ed3a58ba1c4b196b23f99aa6a43d) — Merge bookkeeping: Merge origin/main into feat/suite-ux-v2-t1 (first integrated by [`50692d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/50692d849490af185c0546cf3c97d6ed5f848a5a)).
- [`8a792e5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8a792e58485c0600160f519d64bf4c4b23480a92) — Merge bookkeeping: Merge origin/main into feat/suite-ux-v2-t1 (first integrated by [`50692d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/50692d849490af185c0546cf3c97d6ed5f848a5a)).
- [`38fd2a8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38fd2a8c8d334ddab9c964eeee69c0ae30f7d65a) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-ux-v2-t1 (first integrated by [`50692d8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/50692d849490af185c0546cf3c97d6ed5f848a5a)).
- [`638ffce`](https://github.com/Vivekpsps3/vivek-monorepo/commit/638ffce1648617e19fe08b5a99e3f3a363506f21) — feat(pixels): add pure score and week helpers (first integrated by [`cafd690`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cafd69099ea29d630eccb164bbbfab8238e1526c)).
- [`f069729`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f069729bb82578fab090cb6a67e4f8ba93d8d8c9) — fix(pixels): keep four-digit years in civil dates (first integrated by [`cafd690`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cafd69099ea29d630eccb164bbbfab8238e1526c)).
- [`12b1031`](https://github.com/Vivekpsps3/vivek-monorepo/commit/12b103131710d0e7ffd9d73f7a414b0780de55ee) — fix(pixels): apply Tinkerer rulings on dominant app and lint scope (first integrated by [`cafd690`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cafd69099ea29d630eccb164bbbfab8238e1526c)).
- [`235c073`](https://github.com/Vivekpsps3/vivek-monorepo/commit/235c073ed30d5eb57d6a258c7dfbe7406a319348) — Merge bookkeeping: Merge origin/main into feat/pixels-pf2-score (first integrated by [`cafd690`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cafd69099ea29d630eccb164bbbfab8238e1526c)).
- [`68dca24`](https://github.com/Vivekpsps3/vivek-monorepo/commit/68dca24dfb47569bc4265fd5c5e634f360628ff5) — Merge bookkeeping: Merge origin/main into feat/pixels-pf2-score (first integrated by [`cafd690`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cafd69099ea29d630eccb164bbbfab8238e1526c)).
- [`8807b7d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8807b7d182de44474cdc1b64222c42ebc681e086) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/pixels-pf2-score (first integrated by [`cafd690`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cafd69099ea29d630eccb164bbbfab8238e1526c)).
- [`ab68adb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ab68adb5fe7de31fc64dc89a73e506cfc816b0ef) — feat(media): add library tag filter helpers (first integrated by [`2854c40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2854c401e70ac187b32dcb95a90647c2ea17d6dd)).
- [`c23055b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c23055b7ec2614adf11801152c2a27c6ccec6434) — feat(media): filter the library list by tags (first integrated by [`2854c40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2854c401e70ac187b32dcb95a90647c2ea17d6dd)).
- [`e7d0306`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e7d0306aeb3c50d60062d030e372c9320c1031e0) — test(media): cover the library tags filter (first integrated by [`2854c40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2854c401e70ac187b32dcb95a90647c2ea17d6dd)).
- [`c0e269c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c0e269c52697cce3988f0ac4b365e1292784489f) — test(media): budget one available_tags query in library query tests (first integrated by [`2854c40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2854c401e70ac187b32dcb95a90647c2ea17d6dd)).
- [`80da338`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80da338a73607d248a6c5db453838164125151de) — test(media): cover a tag containing an escaped quote-comma (first integrated by [`2854c40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2854c401e70ac187b32dcb95a90647c2ea17d6dd)).
- [`78a5a11`](https://github.com/Vivekpsps3/vivek-monorepo/commit/78a5a1188fff698171afd4635cb812ecdef637e4) — Merge bookkeeping: Merge origin/main into feat/suite-ux-v2-m2 (first integrated by [`2854c40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2854c401e70ac187b32dcb95a90647c2ea17d6dd)).
- [`ca0bdda`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ca0bdda3b36ce1a6c070aab2447ac8f95b20e3e8) — Merge bookkeeping: Merge origin/main into feat/suite-ux-v2-m2 (first integrated by [`2854c40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2854c401e70ac187b32dcb95a90647c2ea17d6dd)).
- [`f484e6a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f484e6ace206adb97311279ac107e86034f8135b) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-ux-v2-m2 (first integrated by [`2854c40`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2854c401e70ac187b32dcb95a90647c2ea17d6dd)).
- [`39bec63`](https://github.com/Vivekpsps3/vivek-monorepo/commit/39bec6360971caa0a1395bc2be3c8e03391e456b) — chore(world): add eslint-world-engine ratchet at 0 (first integrated by [`7dcece2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7dcece2b21b4c46385c5603ac412aa2de99a774d)).
- [`a4c9c93`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a4c9c938f66de74d2c39e612476eb5829b27a6e5) — chore(world): ban self/globalThis escapes in the engine (first integrated by [`7dcece2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7dcece2b21b4c46385c5603ac412aa2de99a774d)).
- [`c679568`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c67956893d813a2bd294816d1ee1eb461da12cd2) — test(world): reverse concepts and trips in the 6.6 reversal test (first integrated by [`7dcece2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7dcece2b21b4c46385c5603ac412aa2de99a774d)).
- [`ee69acd`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ee69acdbe19077129e079f11efb3eafd3d48cb50) — test(world): NFC-normalize place keys (first integrated by [`7dcece2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7dcece2b21b4c46385c5603ac412aa2de99a774d)).
- [`dbdf79b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/dbdf79b0a91b59c140a65915e89900e172a268eb) — fix(world): keep normalizeWeek habit days inside the target week (first integrated by [`7dcece2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7dcece2b21b4c46385c5603ac412aa2de99a774d)).
- [`96ef3ec`](https://github.com/Vivekpsps3/vivek-monorepo/commit/96ef3ece30906237ce4136666ad678b6bacf5704) — test(world): reverse two trips in the 6.6 reversal test (first integrated by [`7dcece2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7dcece2b21b4c46385c5603ac412aa2de99a774d)).
- [`1f6cda0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1f6cda0ed02c8387e71b7da59f84b0afcb37b3b9) — chore(world): run the engine purity fixture with lint-web (first integrated by [`7dcece2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7dcece2b21b4c46385c5603ac412aa2de99a774d)).
- [`ecccfa9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ecccfa93a675d09477b550d49ed8184a103b4775) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/world-wf1-hardening (first integrated by [`7dcece2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7dcece2b21b4c46385c5603ac412aa2de99a774d)).
- [`2163716`](https://github.com/Vivekpsps3/vivek-monorepo/commit/21637162a7d8dfd151b86b9ff6b32bce416ca490) — feat(pixels): add site_user_birthday_v1 migration and user fields (first integrated by [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2)).
- [`94d6c06`](https://github.com/Vivekpsps3/vivek-monorepo/commit/94d6c0600b62477bd22081385fedfde0c134a972) — feat(pixels): add owner-only birthday route (first integrated by [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2)).
- [`3e34dd3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3e34dd39999b3b2320afd25777cd263e58e1ef1b) — test(pixels): birthday route, migration and privacy (first integrated by [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2)).
- [`4df61ad`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4df61ad53f37375e773cbc1183dea365b76c9db5) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/pixels-pb1-birthday (first integrated by [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2)).
- [`e8fe6fa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e8fe6fabacb5f0713c53469f3c8c74cc2c69cb19) — fix(pixels): sanitize birthday write failures and invalid utf-8 bodies (first integrated by [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2)).
- [`1972112`](https://github.com/Vivekpsps3/vivek-monorepo/commit/197211256ec143bc3f25c0ab6523c24c791dc5b0) — test(pixels): cover birthday route in the finance coverage gate (first integrated by [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2)).
- [`933dcb7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/933dcb7b399280bb833ccbb6c849d59b79d47f96) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/pixels-pb1-birthday (first integrated by [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2)).
- [`d3d1fc8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d3d1fc822f9b8610c3d2b113d180c6d78dd3b2e0) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/pixels-pb1-birthday (first integrated by [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2)).
- [`f72068a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f72068ae2ae99274c0ad2aa5adcb71df2977381c) — fix(pixels): hide birthday parameters and reject unsafe bodies (first integrated by [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2)).
- [`023519f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/023519f84dd1bd3a2e65036b609809084e6958ac) — test(pixels): pin birthday write, body, and utc privacy (first integrated by [`82d2f05`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82d2f05a7a0684c06a6ae3c3ebf86b0e276347e2)).
- [`434d77a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/434d77a58a31f7f6df12374624d9971f13f72edf) — fix(town): reject a casefold name key longer than 40 characters (first integrated by [`6b41a4f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6b41a4f7ad37db3381688a41430575be6fc38b23)).
- [`c036ed4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c036ed4ad41d032c78e8d3590f6044542694f8dd) — test(town): cover cadence revert, habit delete, and write bounds (first integrated by [`6b41a4f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6b41a4f7ad37db3381688a41430575be6fc38b23)).
- [`f401623`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f401623174e6bd2ac57724cb9565b20349bb6fa4) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/town-tb2b2-validation (first integrated by [`6b41a4f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6b41a4f7ad37db3381688a41430575be6fc38b23)).
- [`58d1762`](https://github.com/Vivekpsps3/vivek-monorepo/commit/58d176263c6a30b9ecdd2dd768451f7bef43a8cb) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/town-tb2b2-validation (first integrated by [`6b41a4f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6b41a4f7ad37db3381688a41430575be6fc38b23)).
- [`ef8ec2e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ef8ec2ea0cfb52d632b2e5ca263b2ef92331d653) — fix(town): return field errors for name length and write bounds (first integrated by [`6b41a4f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6b41a4f7ad37db3381688a41430575be6fc38b23)).
- [`5cedf8c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5cedf8c3a4f68e72df073b7aac2dd51cf0281450) — feat(town): add the 29 Town sprites (first integrated by [`90c1f20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/90c1f20902fac9b4ed58b92e95b71cc69e04df72)).
- [`d7d2b81`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d7d2b81369a370358a6b7ce23abb6d9cfdf34bf3) — feat(town): add client constants, sprite ids, level math and types (first integrated by [`90c1f20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/90c1f20902fac9b4ed58b92e95b71cc69e04df72)).
- [`764cf7a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/764cf7ad6050aaa8970a6b976ecab82a9945c841) — feat(town): add the Worldgen barrel (first integrated by [`90c1f20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/90c1f20902fac9b4ed58b92e95b71cc69e04df72)).
- [`17385c1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/17385c17dabab33d81c22e2a24da3f31e30cb147) — test(town): constants parity and sprite safety checks (first integrated by [`90c1f20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/90c1f20902fac9b4ed58b92e95b71cc69e04df72)).
- [`cd3219b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cd3219b1b4ac454385084be6133f7cda9fc7bee0) — fix(town): export core TOWN_LOTS with fixed and slot kinds (first integrated by [`90c1f20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/90c1f20902fac9b4ed58b92e95b71cc69e04df72)).
- [`46ffd45`](https://github.com/Vivekpsps3/vivek-monorepo/commit/46ffd45afe4254827acfa2aeb573481f6e831fbb) — fix(finance): keep budget-kept argument errors synchronous and every fetch error unavailable (first integrated by [`4e7ba20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4e7ba20ab0d0bc7ff142a3224b55ea88f78ed12e)).
- [`ad3dbc1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ad3dbc1f7ab477022130cb297645df4527115a96) — fix(finance): validate the budget-kept deadline (first integrated by [`4e7ba20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4e7ba20ab0d0bc7ff142a3224b55ea88f78ed12e)).
- [`b0fff79`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b0fff798e107a096a5c5a90f35eb19aa3b500752) — test(finance): kill surviving budget-kept mutants (first integrated by [`4e7ba20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4e7ba20ab0d0bc7ff142a3224b55ea88f78ed12e)).
- [`61ce1f8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/61ce1f820b99cbee14b959d06c61229de058a8cf) — Merge bookkeeping: Merge origin/main into feat/finance-budget-kept-hardening (first integrated by [`4e7ba20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4e7ba20ab0d0bc7ff142a3224b55ea88f78ed12e)).
- [`be0e08c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/be0e08cc02a1a3b7bdf5e3aeba578cc1ecf3051a) — fix(finance): reject a bad budget-kept window before the chunk import (first integrated by [`4e7ba20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4e7ba20ab0d0bc7ff142a3224b55ea88f78ed12e)).
- [`2bf6c7d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2bf6c7d5c6874fd549e94e91acaa36eb8a300ad8) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/finance-budget-kept-hardening (first integrated by [`4e7ba20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4e7ba20ab0d0bc7ff142a3224b55ea88f78ed12e)).
- [`41615a8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/41615a819f3004d1f86a71660c161948ed1095fe) — refactor(finance): share planning mode inference and throw budget-kept RangeErrors synchronously (first integrated by [`4e7ba20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4e7ba20ab0d0bc7ff142a3224b55ea88f78ed12e)).
- [`778fbd6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/778fbd683637704fd3ecba0c470c5048a236e5c1) — Merge bookkeeping: Merge origin/main into feat/finance-budget-kept-hardening (first integrated by [`4e7ba20`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4e7ba20ab0d0bc7ff142a3224b55ea88f78ed12e)).
- [`63bcbf1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/63bcbf1d888d52b28ef8a0c61cb8a861538bcc34) — fix(media): return conflict for concurrent next episode writes (first integrated by [`77909e0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/77909e0a511ba92308e49f83ac1779e55f2a6d3d)).
- [`a059d6e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a059d6eac16bed58a2c253b7fcd59978ee69a5af) — test(media): pin foreign next episode ownership responses (first integrated by [`77909e0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/77909e0a511ba92308e49f83ac1779e55f2a6d3d)).
- [`bd8f940`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bd8f940b47d0fe39507366746b51648cbbf9ac35) — test(server): guard included route matcher warm-up (first integrated by [`77909e0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/77909e0a511ba92308e49f83ac1779e55f2a6d3d)).
- [`3ca24ac`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3ca24ac5d56fae96518b73529e2547b7193a56e9) — fix(media): check next-episode ownership before body validation (first integrated by [`77909e0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/77909e0a511ba92308e49f83ac1779e55f2a6d3d)).
- [`d6bd55f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d6bd55f4b8583c79f2c5b0510d55fd9ffb3c84d3) — test(media): compare malformed JSON for foreign and unknown next entries (first integrated by [`77909e0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/77909e0a511ba92308e49f83ac1779e55f2a6d3d)).
- [`176d417`](https://github.com/Vivekpsps3/vivek-monorepo/commit/176d41766b0fd09eb2dbd42800872f4db22ce261) — fix(media): reject next episode writes after a competing mark (first integrated by [`77909e0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/77909e0a511ba92308e49f83ac1779e55f2a6d3d)).
- [`116903e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/116903ebc22c48c17947200c0e19e4d5f3f56e68) — Reformat Travel and Media templates and CSS with Prettier. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`d641f41`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d641f41ffb0c21b3e779c56a6b4ae22d7496bf95) — Ignore the Travel and Media Prettier reformat when blaming. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`d0d608a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d0d608a115be73e3a67a087b94f8eb6e23df816c) — Add the suite layout, colour, and motion tokens. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`6cf0fd0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6cf0fd081e405a4ecfc8c925dc767d31ef609a7d) — Give every keyboard stop the shared 2px focus ring. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`adfcefd`](https://github.com/Vivekpsps3/vivek-monorepo/commit/adfcefddb9595a5d1c69919a84627e14f77bcb87) — Replace the suite brand with an app switcher and shared section nav. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`7a79af3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7a79af3db0c62f36571d419adbc7bf9a666eeb5e) — Share one card state component and stop showing money for a locked or empty vault. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`99f52f2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/99f52f2146b8b60f3aee7a5954b6cd184d8135ce) — Move Travel and Media onto the shared page kit. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`9f73ce2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9f73ce2f407bd0cb8c80f13caa26b3b62e4a58e7) — Add shared day formatters and keep money from breaking across a line. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`91793f6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91793f6542bfce50aef2eda387d23c01eec8b556) — Tell an expired session apart from a wrong passphrase. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`8e0a841`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8e0a84148c6387958fc48467df4f7ba855110ccb) — Add the settings shell and send the old account URLs there. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`63c97e4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/63c97e4b69f773fd26788bce017e65fbae4064d6) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-ux-v2-bundle-0 (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`a93e37e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a93e37e188e71ef54319a7287f5d78febafd1f78) — Cover the Bundle 0 shell checks and serve settings directly. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`203330b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/203330bc54cd4958850c13f87ba47105f8533eb6) — Open the compact switcher before counting the Hub link. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`66a7986`](https://github.com/Vivekpsps3/vivek-monorepo/commit/66a7986179fa45a1471b8a71fadacdf8ab150d77) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-ux-v2-bundle-0 (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`685be0b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/685be0baaf014c89ab61ab1fc3374a2b21d2487a) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-ux-v2-bundle-0 (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`1aa635b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1aa635bbc4455f010711143762bc0f5e9d4ac970) — Fix shared-boundary imports and the kit regressions those specs hit. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`6afa39d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6afa39d8ccfbf2cd6b1d9e7b9eced3af600a353c) — Merge bookkeeping: Merge origin/main into feat/suite-ux-v2-bundle-0 (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`14fec29`](https://github.com/Vivekpsps3/vivek-monorepo/commit/14fec29093385058bef7ee388e81d10b2a0bbd8f) — Fix the Codex review bugs in the shell, dates, empty states, and the 401 probe. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`9d5523d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9d5523df056d302e7615e729de80d8bb081e21cc) — Merge bookkeeping: Merge origin/main into feat/suite-ux-v2-bundle-0 (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`a3ddafe`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a3ddafe159642c4916ceaccfe1d01a2ce1048b15) — Keep the media title beside its cover and close the acceptance gaps. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`94ff840`](https://github.com/Vivekpsps3/vivek-monorepo/commit/94ff840d0599e8bfe480f34082cb4271a09c7ffc) — Assert heading-less focus without the dev-only warning. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`594be25`](https://github.com/Vivekpsps3/vivek-monorepo/commit/594be25f939c893d8c2ce7f1df7558c676262478) — Merge bookkeeping: Merge origin/main into feat/suite-ux-v2-bundle-0 (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`d434474`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d4344747ff8127fa1322212b8f507f3d446919ba) — Keep the locked Finance check inside one document. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`02d6f1f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/02d6f1ff3353b54b3e47700fba4cd41cc3e2a426) — Merge bookkeeping: Merge origin/main into feat/suite-ux-v2-bundle-0 (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`d566e91`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d566e913af3b411224403ef2387c59f5bf60ec29) — Merge bookkeeping: Merge origin/main into feat/suite-ux-v2-bundle-0 (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`39160cf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/39160cf52d3f46a6a19d9358a65665bde7da1dc6) — Lock Finance from Settings and the vault together. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`d93683f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d93683f619266b4d3332c28afc851a9a525f5231) — Route Finance lock imports through the public API. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`6712851`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6712851bb8b0bdbb2e53a3fff38172a95900c46d) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-ux-v2-bundle-0 (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`52fe0fa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/52fe0fade87e9f3f2071ec99b4798124687f5f89) — Wipe the finance key before lock imports and keep a Settings lock on Settings. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`7e3252e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7e3252e1e1e1af197af67ac51e9c36892f72972f) — Discard a finance unlock when a lock lands before the key is stored. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`2f3b87c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2f3b87c988c6ed6fb65e5f1439bd417f5da687c7) — Require a string tab id on the finance lock broadcast. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`80dfa29`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80dfa29d588b2929b999a43d355c0d05133e979f) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-ux-v2-bundle-0 (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`8c50624`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8c5062430b5e0c5c9a73cd665f1b82e81e2c88ec) — Discard a raced hydrate and keep a discarded unlock on the form. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`929f635`](https://github.com/Vivekpsps3/vivek-monorepo/commit/929f635e27fcf0fd9c32c243a7458c327d90071d) — Show a repeat finance lock wipes a replanted key without counting. (first integrated by [`91a1c8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/91a1c8bc8f7558974e545b5479d51b8c072b5751)).
- [`28fbbe4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/28fbbe45dea5eeca83bda8999d54aea96d7997bb) — fix(finance): harden budget-kept error and input handling (first integrated by [`3213483`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3213483730fa43f5fcb3a56073ab5a89930431f7)).
- [`11b2592`](https://github.com/Vivekpsps3/vivek-monorepo/commit/11b2592b5c47b4594d928ca40829af7be6e14286) — fix(town): validate input types and audit stored habit names (first integrated by [`3213483`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3213483730fa43f5fcb3a56073ab5a89930431f7)).
- [`0ea91b0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0ea91b09b30efb7d60aad197e35d2fbf0f46fd04) — test(town): harden sprite safety and constant key parsing (first integrated by [`3213483`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3213483730fa43f5fcb3a56073ab5a89930431f7)).
- [`902b14a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/902b14a651dbcbd7e78ec5b084d970eb7ea89f27) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into fix/security-followups-sf2 (first integrated by [`3213483`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3213483730fa43f5fcb3a56073ab5a89930431f7)).
- [`757cad3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/757cad3503f3c035f51396e448c6003c9c6f1089) — fix(media): share the watched write and detach the next conflict (first integrated by [`3213483`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3213483730fa43f5fcb3a56073ab5a89930431f7)).
- [`1735823`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1735823a678231d5f312aae0039f7394ae335908) — fix(pixels): keep birthdays out of chained errors and engine logs (first integrated by [`a234bdf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a234bdfef7ead270a425ffa11b178acd0c6e54d4)).
- [`5614175`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5614175a2862c84a01b9e3413ad6105fe49cb799) — fix(pixels): drop submitted birthdays from client-error frames (first integrated by [`a234bdf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a234bdfef7ead270a425ffa11b178acd0c6e54d4)).
- [`09d57f9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/09d57f9f2957a78d4667b3b6aae34cd1ef3ac2f0) — fix(pixels): drop parsed dates from client-error frames (first integrated by [`a234bdf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a234bdfef7ead270a425ffa11b178acd0c6e54d4)).

</details>

### 2026-11-01

Version: **day-2026.11.01** · 6 mainline integration(s) · end state [`ad6441c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ad6441c0270467655be86ddd62ce20d7d5d54cd4).

**Features added or changed.** Town adds its owner-scoped read service, SQL history aggregation, and read-performance guard. Cross-suite follow-ups refine settings, lock lifecycle, section navigation, and map appearance.

**Bugs fixed and recovery.** Finance drops cached money immediately on lock, rejects raced unlock/hydrate results, and clears all cached subjects. Map theme follows changes; phone targets and deep links remain usable. Additional birthday/auth security paths are hardened.

**Maintenance and limits.** Finance browser clocks, Los Angeles date boundaries, reduced-motion behavior, focus, and badge contrast are stabilized. These checks support correctness but are not separate user features.

**Mainline evidence, in integration order:**

- [`71ce58a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/71ce58ab25448167019a2ff4230060b2d11aa22c) — test(ci1): freeze the Finance Playwright clock on 2026-10-15 ([PR #50](https://github.com/Vivekpsps3/vivek-monorepo/pull/50))
- [`9edd773`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9edd7733cc5f73d06d885266075539b3b0194fb5) — TB2B-1a: Town read service, SQL aggregation, perf gate ([PR #48](https://github.com/Vivekpsps3/vivek-monorepo/pull/48))
- [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a) — B0F: Bundle 0 follow-ups and #24 Security findings P1–P6 ([PR #46](https://github.com/Vivekpsps3/vivek-monorepo/pull/46))
- [`28443e5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/28443e5b9b2548607dd7a74b3d4b8b5eeb7cc0a7) — B0F1: fast-follow for #46 (Security F1, N1, N3) ([PR #49](https://github.com/Vivekpsps3/vivek-monorepo/pull/49))
- [`6daa78f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6daa78f6f5601ff0835ca9ca645c02afbcbbb5a7) — test(ci2): LA day-boundary e2e, derived frozenToday(), Media badge contrast flake ([PR #51](https://github.com/Vivekpsps3/vivek-monorepo/pull/51))
- [`ad6441c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ad6441c0270467655be86ddd62ce20d7d5d54cd4) — fix(sf3): Security follow-ups from #44 and #45 ([PR #54](https://github.com/Vivekpsps3/vivek-monorepo/pull/54))

<details>
<summary>Constituent branch history first integrated today (33 commits)</summary>

- [`8b79e59`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8b79e59ae4c95803edabcf4245207e4660671fa4) — test(finance): freeze the Playwright clock on 2026-10-15 (first integrated by [`71ce58a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/71ce58ab25448167019a2ff4230060b2d11aa22c)).
- [`e4e4edc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e4e4edc422f6b26b0012e6dc8ff258fb34cfafdd) — test(finance): use an explicit 0.5px subpixel tolerance in phone layout checks (first integrated by [`71ce58a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/71ce58ab25448167019a2ff4230060b2d11aa22c)).
- [`8c0f46d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8c0f46d4eebdb04dd651e0a8137087cd6c2ea71d) — perf(town): walk cadence changes and sorted check-ins (first integrated by [`9edd773`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9edd7733cc5f73d06d885266075539b3b0194fb5)).
- [`ddd538d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ddd538d87bc088391699588375a567b70fa248d3) — feat(town): add owner-scoped read service with archived SQL runs (first integrated by [`9edd773`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9edd7733cc5f73d06d885266075539b3b0194fb5)).
- [`68d2987`](https://github.com/Vivekpsps3/vivek-monorepo/commit/68d29870e5c7b5984b41f1255243c54a1f6ea558) — test(town): enforce read performance outside coverage (first integrated by [`9edd773`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9edd7733cc5f73d06d885266075539b3b0194fb5)).
- [`e827101`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e827101f7289cc781c8753dcdb0a0fe95cc2b9fd) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/town-tb2b1a-read-service (first integrated by [`9edd773`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9edd7733cc5f73d06d885266075539b3b0194fb5)).
- [`b5f1366`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b5f1366467eec5e0a7f922180adfdcba9185a0ce) — perf(town): merge archived runs into one query and gate at 700ms (first integrated by [`9edd773`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9edd7733cc5f73d06d885266075539b3b0194fb5)).
- [`dff067d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/dff067d9d49dfad202ebe9a5ae803a1972370ffe) — perf(town): keep indexed two-query read and set read gate to 800ms (first integrated by [`9edd773`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9edd7733cc5f73d06d885266075539b3b0194fb5)).
- [`572165f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/572165f23b18a264269a74217e3fae61b66da3b6) — perf(town): set read gate to 600ms (2x CI p50 261.66ms) (first integrated by [`9edd773`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9edd7733cc5f73d06d885266075539b3b0194fb5)).
- [`3d7e912`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3d7e91269cf86eebe2c0db320aff3871892281c8) — test(town): correct perf budget docstring (first integrated by [`9edd773`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9edd7733cc5f73d06d885266075539b3b0194fb5)).
- [`20b20cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/20b20ccc138684336d5f3830848ed7a29f1169fb) — ci: retrigger (known Media badge contrast flake, see CI2) (first integrated by [`9edd773`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9edd7733cc5f73d06d885266075539b3b0194fb5)).
- [`4156dc2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4156dc24491947d10d609108b7617ddd900f74cf) — Discard a raced vault unlock and broadcast a lock before the coordinator loads. (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`ef5bd8d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ef5bd8d60d7690da5387941478c0f5189ac522e2) — Default wide settings to Account and toast a saved name. (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`2057c92`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2057c926528fda9b8d1a481e6456c09408c84faf) — Drop the menu theme control and the extra focus rings. (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`8ed461f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8ed461f2f3f0cc7dee2283cb21d4894bcd8c2fa3) — Keep hub cards and section tabs current after a lock or a deep link. (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`eaee78f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/eaee78f959edf7562a7942afa20c4156834d7d2d) — Route section-nav spec through public APIs and set the e2e theme from Settings > Appearance. (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`3bb360d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3bb360d1cc12b536c75a9f2f51d5913f0a333337) — fix(b0f): review round - lock epoch, unlock listener, store clear, test hardening (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`9d0f134`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9d0f13460408918d491e89e62f18b6860dd80de1) — fix(b0f): keep phone row targets and the current section (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`613edce`](https://github.com/Vivekpsps3/vivek-monorepo/commit/613edcec3d7c48786f496ec8c992242323a15e76) — fix(b0f): keep a lock from painting money and a section from going blank (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`1f4a82f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1f4a82f8163fb96a975c5aa0f0107f0a986ef194) — fix(b0f): set the color theme before the map opens (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`9804592`](https://github.com/Vivekpsps3/vivek-monorepo/commit/980459260c7993a97902ee21170ef5339d644374) — fix(b0f): drop cached money when a lock starts (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`0be1cc9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0be1cc9097288644c901fa72ac6426f811bca698) — fix(b0f): clear every cached finance subject when a lock starts (first integrated by [`c317620`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c3176205506ac1daebcc5f7e6915df7673f0ca6a)).
- [`74c0f6c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/74c0f6cec11ddfd02b1d162a13be3628b4fdd84f) — fix(b0f): emit asset rows when the data epoch moves during a read (first integrated by [`28443e5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/28443e5b9b2548607dd7a74b3d4b8b5eeb7cc0a7)).
- [`2fd294e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2fd294ebce7b8383ec2f5cebd1dc738db56d4681) — revert(b0f): restore the map-recovery theme setup from 0be1cc9 (first integrated by [`28443e5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/28443e5b9b2548607dd7a74b3d4b8b5eeb7cc0a7)).
- [`d543aec`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d543aec486a2735d62d26f9dac873afe47a6d4be) — fix(b0f): restyle the open trip map when the theme changes (first integrated by [`28443e5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/28443e5b9b2548607dd7a74b3d4b8b5eeb7cc0a7)).
- [`aed2933`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aed2933527b593f513f632fe219e26bb95805641) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-b0f1 (first integrated by [`28443e5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/28443e5b9b2548607dd7a74b3d4b8b5eeb7cc0a7)).
- [`f4beb32`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f4beb32896f7c9b7103a52fc5af4cec44e3ef993) — fix(b0f): run the map theme spec from the travel app (first integrated by [`28443e5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/28443e5b9b2548607dd7a74b3d4b8b5eeb7cc0a7)).
- [`81ad76f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/81ad76f3724b2891e52682bf17b62c0743ae1d57) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/suite-b0f1 (first integrated by [`28443e5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/28443e5b9b2548607dd7a74b3d4b8b5eeb7cc0a7)).
- [`80df429`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80df429d48ca286d9db2590d91b73f6638fee4d7) — test(ci2): pin Los Angeles dates past UTC midnight and settle badge contrast (first integrated by [`6daa78f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6daa78f6f5601ff0835ca9ca645c02afbcbbb5a7)).
- [`b885a3e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b885a3e89f4f2bd981e752e2496e1be6596bdf33) — test(ci2): honor reduced motion and hold skip-link focus (first integrated by [`6daa78f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6daa78f6f5601ff0835ca9ca645c02afbcbbb5a7)).
- [`cce0728`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cce07282bdb1f34080331df546b5b58c1f21ccce) — fix(finance): correct the ISO date end-of-input comment (first integrated by [`ad6441c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ad6441c0270467655be86ddd62ce20d7d5d54cd4)).
- [`9a33544`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a33544bd360416c3896c160bf4aae88630ad759) — fix(server): close security follow-ups from #44 and #45 (first integrated by [`ad6441c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ad6441c0270467655be86ddd62ce20d7d5d54cd4)).
- [`230519e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/230519ea8679347a25f42e3fb47e6652670a32a8) — test(server): restore SF3 cases squeezed under the line cap (first integrated by [`ad6441c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ad6441c0270467655be86ddd62ce20d7d5d54cd4)).

</details>

### 2026-11-06

Version: **day-2026.11.06** · 7 mainline integration(s) · end state [`b1eff60`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b1eff609c742fc357ea11c6024063e1a0d97fe58).

**Features added or changed.** Town becomes visible through its shell, header/scene states, habit writes, check-in/Undo, Today panel, and habit/history dialogs. Travel gains leave-bucket schema/API, PTO/sick balances, forecast series, and associated UI. Finance adopts owner-bound, non-extractable IndexedDB keys and HKDF-separated blind indexes.

**Bugs fixed and recovery.** Finance key/reindex races and lock/sign-out ordering are hardened. Travel map tiles/pins/focus work in dark mode; PTO boundary/security follow-ups and Town local-day validation land. Unified browser discovery/release regression checks are fixed.

**Maintenance and limits.** The hours-oriented PTO page is a later November 7 integration. Some branch work authored earlier becomes available on main only today.

**Mainline evidence, in integration order:**

- [`1b08d1c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1b08d1c7eda766520f8bf7df37efef7fdb7d222e) — fix(travel): N3b dark-map tiles, pins and focus ring (P6a–P6d) ([PR #56](https://github.com/Vivekpsps3/vivek-monorepo/pull/56))
- [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221) — Finance: key hardening (FK1) ([PR #38](https://github.com/Vivekpsps3/vivek-monorepo/pull/38))
- [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e) — TF1: Town frontend shell ([PR #47](https://github.com/Vivekpsps3/vivek-monorepo/pull/47))
- [`9061574`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9061574b34c88d1be12bb1c4fa561cb2872b72b9) — feat(travel): TPTO1 leave buckets backend (1a schema + 1b API) ([PR #53](https://github.com/Vivekpsps3/vivek-monorepo/pull/53))
- [`2ff8558`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2ff8558f31ab81eb385c63cd5bae43ae3b3c8937) — M2: Town TB2B-1b read models + TB2C writes (stacked on #48) ([PR #52](https://github.com/Vivekpsps3/vivek-monorepo/pull/52))
- [`e7b9314`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e7b93148b32ec904d15a566cc6c53483060ed0a9) — feat(travel): TPTO 1c series + 2a/2b UI ([PR #57](https://github.com/Vivekpsps3/vivek-monorepo/pull/57))
- [`b1eff60`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b1eff609c742fc357ea11c6024063e1a0d97fe58) — Fix release regression tests and unified browser discovery

<details>
<summary>Constituent branch history first integrated today (47 commits)</summary>

- [`731c638`](https://github.com/Vivekpsps3/vivek-monorepo/commit/731c638facb997d32a164bab583510e79489a260) — fix(travel): N3b dark-map tiles, pins and focus ring (P6a-d) (first integrated by [`1b08d1c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1b08d1c7eda766520f8bf7df37efef7fdb7d222e)).
- [`f9c8862`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f9c8862fa8c2f5d563c343215daaed515da3e9c6) — fix(finance): keep the vault key as a non-extractable CryptoKey in IndexedDB (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`e96d82c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e96d82c601a57ca1e416653c0b840a4f986df34c) — fix(finance): derive a separate HKDF subkey for blind indexes (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`51c4796`](https://github.com/Vivekpsps3/vivek-monorepo/commit/51c47963357f2b8a775c95e4ea0329f11ea9117c) — fix(finance): close blind-index re-index races and lookup gaps (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`e9dab56`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e9dab56caf8baade029fd238de4b1bd38347e24d) — Merge bookkeeping: Merge origin/main into feat/finance-key-hardening (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`1178de9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1178de94dece08ba9df0b2845fbc9f10763abb56) — fix(finance): re-index blind indexes in the background after unlock (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`8a0eef6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8a0eef6a9524b84173d8cf316c188c3606233313) — Merge bookkeeping: Merge origin/main into feat/finance-key-hardening (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`db5e55d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/db5e55d52bf55120caae2ff3f6ac7f541b195d1f) — fix(finance): bind vault keys to the signed-in user (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`1ff35e9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1ff35e9cdc33daac374b618defe8a74f7faa6b93) — fix(finance): re-index vault rows with an update-only endpoint (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`cd39118`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cd39118c8fdffdb61de13a10bcb824719210435f) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/finance-key-hardening (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`7c9bf00`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7c9bf009b27dfb99f49d95960b2d2776950d948e) — fix(finance): drop a stale vault write without erasing the next key (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`0779e48`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0779e4835aad92e8d3c24db76a2358c0325e5577) — fix(finance): keep the new vault key through signup and logout (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`5e53a68`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5e53a6894a5f537a7b731922069a6ce2f727620d) — fix(finance): skip a duplicate blind index so re-index can finish (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`472d76f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/472d76f354cfdbf764f03c45571f9225700fc226) — test(finance): wait for the lock retry until the key delete finishes (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`dbf22d4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/dbf22d4dd0deca9f792ecd8ffc7e48667fda44cf) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/finance-key-hardening (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`634a87f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/634a87ffb99fcd86c441be3ff1e72cc79da17228) — fix(finance): wait for the key delete before 401 and cross-tab sign-out navigation (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`eacd088`](https://github.com/Vivekpsps3/vivek-monorepo/commit/eacd08823f8f4ce61196ea45aeae7ac40769013d) — docs(finance): update security model for IndexedDB non-extractable DEK (FK1) (first integrated by [`82feefc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82feefc89b35bd97631b4cc8db14cb8d3a2b0221)).
- [`81c67ee`](https://github.com/Vivekpsps3/vivek-monorepo/commit/81c67ee16ed88e592e1648f11b0f36377dd05532) — feat(town): serve /town deep links and refreshes (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`e1e3a43`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e1e3a43b47a5f13e5f0d65c306df9d7a363cb144) — feat(town): add the Town API client (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`754efbe`](https://github.com/Vivekpsps3/vivek-monorepo/commit/754efbe10b4904690d85c2b733fa83c8fd32dad2) — feat(town): render the header and scene from GET /api/town (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`b21b6e0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b21b6e0958d4132f0735871b1610716dcbab084b) — feat(town): loading, unavailable, expired and first-run states (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`7be17c7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7be17c723a1ecc11f421bad70681cd38b77cb335) — test(town): page, tiles, a11y and layout browser specs (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`635de1a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/635de1a7246ec1d91ff0f79d9ae771593b7a7706) — test(town): check cross-user privacy across the full DOM (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`830903d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/830903db5988f7ca5ec0adbfb3df0ca4e3306da6) — test(town): capture the specified viewport dimensions (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`242824c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/242824c8fd801e867714fc7d166b67cbb579cd0b) — fix(town): drop the session-expired banner and lock max level (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`f0a3080`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f0a308085a2361e8e299f4fd6fe6d3c9e246d555) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/town-tf1-shell (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`cb9c8bc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cb9c8bc43851628ce3c73495635c75128221f7f9) — test(town): pin the Karma day clock and cover midnight (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`1739b54`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1739b543092f6b09a308a9b37cb7441842256942) — feat(town): add the Today panel, check-in announcements and sprite swap (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`4787850`](https://github.com/Vivekpsps3/vivek-monorepo/commit/478785054ec522d9a46ef6d3fd1d46fd8c3ee197) — feat(town): add habit and history dialogs (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`88599e5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/88599e5f15a2e563b32432af80bddf2518cb79c6) — ci: retrigger (known Media badge contrast flake, see CI2) (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`687b8b0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/687b8b0521ecb538b02ceac6f81f83f14444281c) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/town-tf1-shell (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`ce4a1ac`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ce4a1acb98315ce0c9bc847084ce88b09b1a0c0d) — fix(town): keep focus and history state honest after refresh (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`b3ce023`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b3ce023b108a67941dd1ed9bd11856886ca5f26d) — fix(town): keep pending cadence on habit edit (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`63c7cf7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/63c7cf70c0b886f09cfe95729a4ba456cebb1487) — fix(town): TF1 should-fixes — lot select binding, labelRange guard, snapshot/localStorage resilience (first integrated by [`38acf16`](https://github.com/Vivekpsps3/vivek-monorepo/commit/38acf1668d9cd05d18e90853ce8ee34e40bb2f2e)).
- [`4850837`](https://github.com/Vivekpsps3/vivek-monorepo/commit/48508378eb2a3f3bf221de7638c3c737ebbe139c) — feat(travel): add leave-bucket schema and PTO backfill (first integrated by [`9061574`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9061574b34c88d1be12bb1c4fa561cb2872b72b9)).
- [`d6817f6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d6817f68f77b581449bdf87fbf92c08293f171bd) — feat(travel): read PTO from leave buckets and dual-write the rollback copy (first integrated by [`9061574`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9061574b34c88d1be12bb1c4fa561cb2872b72b9)).
- [`aaabd07`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aaabd072055ff00a0ebcb1f46ca5561bec057b91) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/travel-tpto1-backend (first integrated by [`9061574`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9061574b34c88d1be12bb1c4fa561cb2872b72b9)).
- [`2364059`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2364059f8ca67e31cec48cad26e1c3e657c4a683) — fix(travel): TPTO1 review fixes + boundary (first integrated by [`9061574`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9061574b34c88d1be12bb1c4fa561cb2872b72b9)).
- [`b1f5e98`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b1f5e98426ab354980f12e8b2b37709daefc801b) — fix(travel): TPTO1 security review fixes (first integrated by [`9061574`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9061574b34c88d1be12bb1c4fa561cb2872b72b9)).
- [`f3fe7cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f3fe7cc00432e0c106e3a14ddad1e08022a420cd) — feat(town): add read response models and habit history (first integrated by [`2ff8558`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2ff8558f31ab81eb385c63cd5bae43ae3b3c8937)).
- [`63971cb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/63971cbc3a663b8d37cc750330a308b1a8cee1d1) — feat(town): add habit writes, check-in, and undo (first integrated by [`2ff8558`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2ff8558f31ab81eb385c63cd5bae43ae3b3c8937)).
- [`a32a63f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a32a63fadb87b1d4a0417f5eb5c950fd7e254a1c) — Merge bookkeeping: Merge remote-tracking branch 'origin/feat/town-tb2b1a-read-service' into feat/town-m2 (first integrated by [`2ff8558`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2ff8558f31ab81eb385c63cd5bae43ae3b3c8937)).
- [`cba4ef1`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cba4ef1ba0ef29ba0ecc504e7d5735e6193ef9d4) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/town-m2 (first integrated by [`2ff8558`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2ff8558f31ab81eb385c63cd5bae43ae3b3c8937)).
- [`410bee9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/410bee94cce5db907362197e4fc2af1d3fca427f) — TB2B-1a follow-ups (first integrated by [`2ff8558`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2ff8558f31ab81eb385c63cd5bae43ae3b3c8937)).
- [`395d1f2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/395d1f2f35ebe727cb0cec7cbf0b2315b984f5a5) — M2 gate ruling: restore INDEXED BY hint (first integrated by [`2ff8558`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2ff8558f31ab81eb385c63cd5bae43ae3b3c8937)).
- [`b497cf0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b497cf06c07ed33104ba173d3008620e152f7aba) — fix(town): M2 review fixes — local-day check-in window, crafted-input 422s (first integrated by [`2ff8558`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2ff8558f31ab81eb385c63cd5bae43ae3b3c8937)).
- [`b783e45`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b783e4539f504555aec2670a6f8d04791eed63f7) — feat(travel): TPTO 1c series + 2a/2b UI (replacement for #55) (first integrated by [`e7b9314`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e7b93148b32ec904d15a566cc6c53483060ed0a9)).

</details>

### 2026-11-07

Version: **day-2026.11.07** · 55 mainline integration(s) · end state [`9a709dc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a709dc0c30b2fb1917cd9dbeaba9b7820721305).

**Features added or changed.** Finance receives per-day budget-kept projections, safe unlock return/auto-lock, transaction-delete Undo, accessibility/chart/calendar/activity summaries, clearer account/row actions and empty states, import receipts, quote/privacy controls, category spending, and projection chart/table answers. Travel adds hours-based PTO, trip cost/reminder UI and trip tools. Town gains a Hub card; Health gains unit/PR/XP math and an encrypted store with stage-only API. World gains habit/trip/finished-media and concept APIs. Pixels gains its owner-scoped aggregate API and Profile birthday settings. Unified search covers Travel/Media with a Finance lock row. Media adds next-episode/detail improvements, library/Now work, and several model helpers.

**Bugs fixed and recovery.** Fixes cover SQL logging/token bypasses, invalid path IDs, Unicode tags, Fidelity replacement scope, negative/leap-year Pixels guards, encrypted-store reload silence, Planning error placement, Los Angeles quote dates, and dropped search-router registration. Session/lock polish and typed destructive confirmations improve recovery. Keyboard/date/import acceptance checks are stabilized.

**Maintenance and limits.** This is the busiest integration day. Health screens, Finance name search, and some Media editors remain incomplete despite their foundations. CI adds concurrency and tested-source deployment behavior; these are delivery improvements, not domain features.

**Mainline evidence, in integration order:**

- [`d173de4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d173de4a09aa8e4bdcadc781182af797fce2c49f) — Run trusted CI concurrently on ten local runner slots (#130)
- [`4dda0c8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4dda0c8c280522430b1de51adb5bee233966f64a) — fix(server): scope SQL log suppression and close token bypasses ([PR #139](https://github.com/Vivekpsps3/vivek-monorepo/pull/139))
- [`6f31612`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6f31612b7b4c3b73c2936bd7d0468507a29efc52) — feat(travel): hours PTO page (#110) ([PR #136](https://github.com/Vivekpsps3/vivek-monorepo/pull/136))
- [`d8867dd`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d8867dd42511def4783395ba0a71e1dc982e27db) — test(town): salvage missing write API tests (#115, #134) ([PR #137](https://github.com/Vivekpsps3/vivek-monorepo/pull/137))
- [`208da25`](https://github.com/Vivekpsps3/vivek-monorepo/commit/208da25facb8ff9433e1d219e053ec60f60d8f7b) — fix(travel/server): T1F follow-ups — nullable past-card actions, 404 for invalid path ids (#87) ([PR #138](https://github.com/Vivekpsps3/vivek-monorepo/pull/138))
- [`59ba626`](https://github.com/Vivekpsps3/vivek-monorepo/commit/59ba62664ffab2ff6ac0a7b09b709d581b659585) — fix(media): match Unicode tags and verify real search timeouts ([PR #150](https://github.com/Vivekpsps3/vivek-monorepo/pull/150))
- [`de16fc6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/de16fc69fc3e18fc08984cb99d3e4d625a0c1fed) — fix(finance): clarify Fidelity imports and replacement scope ([PR #140](https://github.com/Vivekpsps3/vivek-monorepo/pull/140))
- [`7b218cb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7b218cbd0fe37551254b66e13ad99654119f5137) — fix(pixels): PF2F century-leap, row-count and negative-score guards ([PR #141](https://github.com/Vivekpsps3/vivek-monorepo/pull/141))
- [`2bfe4b0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2bfe4b06f474c49c0d12e64ab3a79a4b3a9ada63) — fix(finance): F4 preserve encrypted-store reload options and silence semantics ([PR #142](https://github.com/Vivekpsps3/vivek-monorepo/pull/142))
- [`04b4732`](https://github.com/Vivekpsps3/vivek-monorepo/commit/04b4732cd75efb1e08bc1b174fd82ff855e6d2a3) — feat(finance): PF1 per-day budget-kept helper and Finance facade ([PR #143](https://github.com/Vivekpsps3/vivek-monorepo/pull/143))
- [`f5362c2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f5362c25fee02141d2b00d0b75191c99c6ea6db7) — fix(finance): F23 Planning saved-inputs errors live in the Saved inputs card ([PR #144](https://github.com/Vivekpsps3/vivek-monorepo/pull/144))
- [`e705f85`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e705f8557d2901c45132734588102ca22ba1a1c6) — feat(server): W2a World habits read API (habits scope) ([PR #146](https://github.com/Vivekpsps3/vivek-monorepo/pull/146))
- [`e85a4df`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e85a4df55dd87904f3832fe32de613d2811e4947) — test(finance): de-flake wizard import and budget-kept deadline specs ([PR #157](https://github.com/Vivekpsps3/vivek-monorepo/pull/157))
- [`82e8a55`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82e8a55a4216847ad4a6ec0de28050ef4db08cd1) — feat(ui): K2 confirm-and-run with typed destructive confirmation ([PR #151](https://github.com/Vivekpsps3/vivek-monorepo/pull/151))
- [`ca786d4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ca786d4b0de62b61fe2f9c1be8d2ced58ae57b81) — feat(town): THC1 health constants, validation, units, PR/XP/badge math ([PR #155](https://github.com/Vivekpsps3/vivek-monorepo/pull/155))
- [`5ee2804`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5ee2804d6c4272192c196c5bc3c89ac40a7c4528) — feat(finance): F3 admin confirms use the K2 confirm-run kit ([PR #152](https://github.com/Vivekpsps3/vivek-monorepo/pull/152))
- [`3bd1c9c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3bd1c9cde1f6486be8ef9b3f59f3f8911411dfaa) — feat(pixels): PF6 profile birthday settings section ([PR #153](https://github.com/Vivekpsps3/vivek-monorepo/pull/153))
- [`7ed1274`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7ed1274a0ad27846d4473ecafd37b3eeaac5f38f) — feat(finance): F21 transaction-delete Undo recovery ([PR #159](https://github.com/Vivekpsps3/vivek-monorepo/pull/159))
- [`ec641cf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ec641cf0459c495d8cbf56fdcb8d561a71d4327b) — feat(ui): K1 shared kit — ui-menu, ui-segmented, icons, trip-spend registry ([PR #145](https://github.com/Vivekpsps3/vivek-monorepo/pull/145))
- [`8bb2b18`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8bb2b18fbf199c7a8ae204c8336419a7bdb6e9ce) — ci: rebuild deployments from tested source without artifacts
- [`3960145`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3960145c9c5df0fc8745ea2f6128278629e13435) — T1F remainder: Town habit routes join the shared path-id contract (#87) ([PR #161](https://github.com/Vivekpsps3/vivek-monorepo/pull/161))
- [`83a8cd5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/83a8cd51b3d9472a8174d0579bd949afc0eee9f5) — feat(finance): F5 unlock return path, unlock states, FinanceLockService auto-lock ([PR #156](https://github.com/Vivekpsps3/vivek-monorepo/pull/156))
- [`639cab9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/639cab9a6eec656ea53a084e63711074aedf4c1f) — fix(ci): stabilize keyboard focus checks and cancel superseded runs ([PR #187](https://github.com/Vivekpsps3/vivek-monorepo/pull/187))
- [`7bee634`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7bee634683f6af858f8731f319cd68197cbdb42e) — Town hub card: town summary endpoint + fourth hub card (TF5) ([PR #160](https://github.com/Vivekpsps3/vivek-monorepo/pull/160))
- [`c531ad3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c531ad39af1edd3ab3c859e1bb963dcdc1854e3f) — W3a: world trips + finished-media content API ([PR #185](https://github.com/Vivekpsps3/vivek-monorepo/pull/185))
- [`52c2071`](https://github.com/Vivekpsps3/vivek-monorepo/commit/52c207103bf92016bfff990afcdc72029d1cc495) — THC2: encrypted Health store + stage-only barrel ([PR #173](https://github.com/Vivekpsps3/vivek-monorepo/pull/173))
- [`33881f5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/33881f5d0ee70914b0b1c9d522b12f1715af5fcc) — F1: accessibility baseline ([PR #165](https://github.com/Vivekpsps3/vivek-monorepo/pull/165))
- [`d8c3582`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d8c3582efe70666411ecc39fea1027ae50d6d98c) — F11: chart tooltips ([PR #166](https://github.com/Vivekpsps3/vivek-monorepo/pull/166))
- [`a103b8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a103b8b1c666456b87ea8da5b4a49f0462d0a84e) — F12: activity summary ([PR #167](https://github.com/Vivekpsps3/vivek-monorepo/pull/167))
- [`804a846`](https://github.com/Vivekpsps3/vivek-monorepo/commit/804a84675897f33ed4ca50a5b8a09c541b47968f) — chore: use monorepo production runner names
- [`f26d18d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f26d18ddd8d94e315e4330e7a901fd779fb155e9) — feat(web): B0F2 session polish — session-ended page, N2 lock gates, skeleton tokens (PR #183 content; landed directly, tree-verified: lint PASS, Karma 574+418)
- [`d217a2d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d217a2d94acb5b821bc9c5f6070313043d76bde9) — Travel T6 + T5 (partial): trip tools + menus seam ([PR #172](https://github.com/Vivekpsps3/vivek-monorepo/pull/172))
- [`10ca69f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/10ca69fc6d64b544d21d0e7c753d4496597ed256) — F20: projection answer + chart/table ([PR #178](https://github.com/Vivekpsps3/vivek-monorepo/pull/178))
- [`d841673`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d84167393faf3ed2afa6af2c9ead5c91b2ac9245) — F16: net-worth row actions + labels ([PR #179](https://github.com/Vivekpsps3/vivek-monorepo/pull/179))
- [`3d68e01`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3d68e01619056f5378a6357718351f4aeef32a2f) — Media M5-M7: model layers (components gated on K1) ([PR #180](https://github.com/Vivekpsps3/vivek-monorepo/pull/180))
- [`20255ca`](https://github.com/Vivekpsps3/vivek-monorepo/commit/20255ca2b6a2520671d883b1d7ab0bdd51079d04) — Media M8 + M11 full; M9/M10 models ([PR #181](https://github.com/Vivekpsps3/vivek-monorepo/pull/181))
- [`6e64b8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6e64b8bec12713298dc5aba11fb3be708e3f6f47) — test(finance): CI3 LA quote-date boundary pins ([PR #182](https://github.com/Vivekpsps3/vivek-monorepo/pull/182))
- [`1507710`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1507710373f1a03e2a61c33cb015a63112a9b194) — perf(tests): speed up and consolidate the test suites (#158) ([PR #175](https://github.com/Vivekpsps3/vivek-monorepo/pull/175))
- [`67609d5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/67609d5b6d5cfb0e32302240e9cb1f5e1ef7d62c) — feat(web): Bundle S scoped unified search — server search API, search dialog, locked-row Finance results (PR #174 content; landed directly, tree-verified: lint PASS, typecheck PASS, Web Karma 426/426, test_search 15/15)
- [`4df0c87`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4df0c87c51feeef1d136ba41425406e151ae678d) — feat(server): PB2 owner-scoped pixels aggregate API (PR #154 content; landed directly, tree-verified: pixels tests 18/18, ruff 101 = baseline, mypy 87 = baseline)
- [`c6a2ef8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c6a2ef85639e2e60fa0a5015385339f3ec84501f) — feat(server): L1a Lit Map concepts API + migration (PR #186 content; landed directly, tree-verified: world/concept/lit tests 63 passed, ruff 101 = baseline, mypy 87 = baseline)
- [`ef66fef`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ef66fef0e703572bb081901d20e1614b98bb1fd7) — feat(media): M3-M4 next episode + detail sections (PR #170 content; landed directly, tree-verified: media node tests 49/49, lint PASS, typecheck PASS)
- [`fe93efc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fe93efccd02d3eadf116268e51e27f561d3d2aa9) — fix(finance): quote guards use the LA calendar day (PR #184 content; landed directly, tree-verified: lint PASS, targeted Karma 60/60, all 4 guard sites on isoDateInZone America/Los_Angeles)
- [`0ea5cad`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0ea5cada63b8a45830dde4f3b3df94aed399541a) — fix(server): restore search router registration in main.py (dropped by the PB2 direct landing; search+pixels tests 33/33)
- [`c59e4fb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c59e4fb23b65c0a42c257b7c73be178c7ffb8948) — feat(finance): F6 nav labels + Guide close icon (PR #162 content; landed directly, tree-verified: lint PASS, Finance Karma 582/582 on the resolved tree)
- [`89be28b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/89be28b98fc880d27ebe163a92cbd497812eba31) — feat(finance): F10 empty states (PR #163 content; landed directly, tree-verified: lint PASS, Karma clean except two failures proven identical on pristine main)
- [`131639f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/131639ff3ee2ff88ba00abf27f8751709422e4fe) — feat(finance): F2 account actions (PR #164 content; landed directly on the verified F10 tree: lint PASS)
- [`e9a2a12`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e9a2a125daaef159969c34ab773aa955a2428d47) — feat(finance): F7 quote book, price prefs, and price-privacy copy ([PR #147](https://github.com/Vivekpsps3/vivek-monorepo/pull/147))
- [`6fdd05a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fdd05a43a5c321678de5013c47841f8485c9bc4) — feat(finance): F8 category spend math, doughnut, and calendar strip ([PR #149](https://github.com/Vivekpsps3/vivek-monorepo/pull/149))
- [`958af52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/958af522ad3decdffc0469a21c7f578ce82efbdc) — feat(finance): F9 bank import copy, receipts, and undo/delete flow ([PR #148](https://github.com/Vivekpsps3/vivek-monorepo/pull/148))
- [`263b020`](https://github.com/Vivekpsps3/vivek-monorepo/commit/263b02046db3b69a0207b29cce9f6810e028ce3f) — F13: calendar grid ([PR #168](https://github.com/Vivekpsps3/vivek-monorepo/pull/168))
- [`0af960c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0af960cb80ed30304ee87f6443a4d475dbdfdf36) — F22: net-worth copy sweep ([PR #169](https://github.com/Vivekpsps3/vivek-monorepo/pull/169))
- [`fa98749`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fa98749183f3887a0e10f041f0948a7f1b109681) — F14: Home states ([PR #176](https://github.com/Vivekpsps3/vivek-monorepo/pull/176))
- [`45bb08c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/45bb08c6768f7f72765ea3dd70590b71ed0f28d8) — F18: plain-language copy pass ([PR #177](https://github.com/Vivekpsps3/vivek-monorepo/pull/177))
- [`9a709dc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a709dc0c30b2fb1917cd9dbeaba9b7820721305) — Travel T2+T3: trip costs + reminders ([PR #171](https://github.com/Vivekpsps3/vivek-monorepo/pull/171))

<details>
<summary>Constituent branch history first integrated today (70 commits)</summary>

- [`1d68cb7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1d68cb765eb8ae20da83eca9ef2265910a53e412) — fix(server): scope SQL log suppression to engine records (first integrated by [`4dda0c8`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4dda0c8c280522430b1de51adb5bee233966f64a)).
- [`db09f63`](https://github.com/Vivekpsps3/vivek-monorepo/commit/db09f631154d36de8500ae1c72ad2f375b785751) — feat(travel): hours PTO page for #110 (first integrated by [`6f31612`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6f31612b7b4c3b73c2936bd7d0468507a29efc52)).
- [`fd36d52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fd36d52fad560d5ed8e512d92df8202aab099426) — test(town): salvage missing write API tests (#115, #134) (first integrated by [`d8867dd`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d8867dd42511def4783395ba0a71e1dc982e27db)).
- [`df9d0fb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/df9d0fb9e77035c9f573222bdf3c66f6ba68975d) — test(town): mypy ignore on xfail gap import (#115) (first integrated by [`d8867dd`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d8867dd42511def4783395ba0a71e1dc982e27db)).
- [`72d110f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/72d110f21e0651e6d581c8828adcdb358bb0413d) — test(town): drop type-ignore suppression on xfail gap import (#115) (first integrated by [`d8867dd`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d8867dd42511def4783395ba0a71e1dc982e27db)).
- [`0563233`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0563233ed094dbffdb5d99d54218ef16ef697a27) — fix(travel): require nullable action fields on past home cards (first integrated by [`208da25`](https://github.com/Vivekpsps3/vivek-monorepo/commit/208da25facb8ff9433e1d219e053ec60f60d8f7b)).
- [`efc3592`](https://github.com/Vivekpsps3/vivek-monorepo/commit/efc35927a22447f323dfa252c0ae8262ebe01d03) — fix(server): return unknown-id 404s for invalid integer path IDs (first integrated by [`208da25`](https://github.com/Vivekpsps3/vivek-monorepo/commit/208da25facb8ff9433e1d219e053ec60f60d8f7b)).
- [`5425049`](https://github.com/Vivekpsps3/vivek-monorepo/commit/54250498c12d59960ac781dd09366a8cc97b6a4c) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into feat/travel-t1f-followups (first integrated by [`208da25`](https://github.com/Vivekpsps3/vivek-monorepo/commit/208da25facb8ff9433e1d219e053ec60f60d8f7b)).
- [`c897f3f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c897f3fd9e9a9173ee918f4589d0c1cda1a3e656) — fix(server): keep range-bounded path ids on the 422 contract (first integrated by [`208da25`](https://github.com/Vivekpsps3/vivek-monorepo/commit/208da25facb8ff9433e1d219e053ec60f60d8f7b)).
- [`3bf1c10`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3bf1c1019e02d7b5d3dab972f0cd8c4f7f78ce7c) — ci: retrigger (bundle-0 390px nav clip, not T1F) (first integrated by [`208da25`](https://github.com/Vivekpsps3/vivek-monorepo/commit/208da25facb8ff9433e1d219e053ec60f60d8f7b)).
- [`a3484a7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a3484a7e2f41ac3ffe2c667f002148932c8c16d1) — fix(media): casefold whole Unicode tags without rewriting storage (first integrated by [`59ba626`](https://github.com/Vivekpsps3/vivek-monorepo/commit/59ba62664ffab2ff6ac0a7b09b709d581b659585)).
- [`15af628`](https://github.com/Vivekpsps3/vivek-monorepo/commit/15af628e1bd14804f261ed8d8585e66114190e38) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into fix/media-unicode-tags (first integrated by [`59ba626`](https://github.com/Vivekpsps3/vivek-monorepo/commit/59ba62664ffab2ff6ac0a7b09b709d581b659585)).
- [`13359ce`](https://github.com/Vivekpsps3/vivek-monorepo/commit/13359cefc774c57bf404a8666bf274c645afe4e5) — fix(finance): clarify Fidelity imports and replacement scope (first integrated by [`de16fc6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/de16fc69fc3e18fc08984cb99d3e4d625a0c1fed)).
- [`9252235`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9252235249026483204929e9bb1f108f35a178b8) — test(finance): target keyboard navigation and retain CI traces (first integrated by [`de16fc6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/de16fc69fc3e18fc08984cb99d3e4d625a0c1fed)).
- [`cf05fbf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cf05fbf20822c62ac80c6aa00900c30ea2310186) — fix(pixels): PF2F century-leap, row-count and negative-score guards (first integrated by [`7b218cb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7b218cbd0fe37551254b66e13ad99654119f5137)).
- [`006dd86`](https://github.com/Vivekpsps3/vivek-monorepo/commit/006dd867b043c1bfe8d2e2061c332a916568c234) — fix(finance): F4 preserve encrypted-store reload options and silence semantics (first integrated by [`2bfe4b0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2bfe4b06f474c49c0d12e64ab3a79a4b3a9ada63)).
- [`16e4095`](https://github.com/Vivekpsps3/vivek-monorepo/commit/16e4095c9ff6f935041153893070d73c6aa2086e) — feat(finance): PF1 per-day budget-kept helper and Finance facade (first integrated by [`04b4732`](https://github.com/Vivekpsps3/vivek-monorepo/commit/04b4732cd75efb1e08bc1b174fd82ff855e6d2a3)).
- [`7ce8a6a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7ce8a6ab5520c0c28317294530b23ca53c66a30d) — fix(finance): F23 Planning saved-inputs errors live in the Saved inputs card (first integrated by [`f5362c2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f5362c25fee02141d2b00d0b75191c99c6ea6db7)).
- [`fcdf5df`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fcdf5dfcb484eb77cf8542ff1d7e508816149499) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into fix/f23-planning-errors (first integrated by [`f5362c2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f5362c25fee02141d2b00d0b75191c99c6ea6db7)).
- [`57edeaa`](https://github.com/Vivekpsps3/vivek-monorepo/commit/57edeaa88e2f39ecc8ea50bf5988153304afb858) — test(finance): verify Planning recovery and deterministic vault failures (first integrated by [`f5362c2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f5362c25fee02141d2b00d0b75191c99c6ea6db7)).
- [`f3beebd`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f3beebd0b43c80eb187eaeaeb4812be227b2474f) — feat(server): W2a World habits read API (habits scope) (first integrated by [`e705f85`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e705f8557d2901c45132734588102ca22ba1a1c6)).
- [`01162c0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/01162c0bd241387824e41328bb026cd0a08b84ab) — test(finance): de-flake wizard import and budget-kept deadline specs (first integrated by [`e85a4df`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e85a4df55dd87904f3832fe32de613d2811e4947)).
- [`1343c9a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1343c9ac39755f57a7b11561b8aa4f874f1cf4a9) — feat(ui): K2 confirm-run dialog kit (first integrated by [`82e8a55`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82e8a55a4216847ad4a6ec0de28050ef4db08cd1)).
- [`043a740`](https://github.com/Vivekpsps3/vivek-monorepo/commit/043a740ab62a7bc8a75fa5e99446af445794d3e8) — feat(town): THC1 health constants, validation, units, PR/XP/badge math (first integrated by [`ca786d4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ca786d4b0de62b61fe2f9c1be8d2ced58ae57b81)).
- [`5adf139`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5adf13904fa36ed03cd46684b36d03b994e9a938) — feat(finance): F3 admin confirms use the K2 confirm-run kit (first integrated by [`5ee2804`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5ee2804d6c4272192c196c5bc3c89ac40a7c4528)).
- [`230ed95`](https://github.com/Vivekpsps3/vivek-monorepo/commit/230ed957963935f3a214b905b4173d5a62570cb7) — feat(pixels): PF6 profile birthday settings section (first integrated by [`3bd1c9c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3bd1c9cde1f6486be8ef9b3f59f3f8911411dfaa)).
- [`ff2cd7e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ff2cd7edd236a7b256d261fe36fd1580c2b24e64) — fix(web): drop unneeded as any in profile settings spec (first integrated by [`3bd1c9c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3bd1c9cde1f6486be8ef9b3f59f3f8911411dfaa)).
- [`5c5a9fd`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5c5a9fd161ca65ceb90aa903930c08ae34163c6f) — feat(finance): F21 exact transaction-delete Undo with idempotent restore (first integrated by [`7ed1274`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7ed1274a0ad27846d4473ecafd37b3eeaac5f38f)).
- [`a769253`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a7692531394446a24a7e8c59275773e8d7305ee9) — feat(ui): K1 shared kit — ui-menu, ui-segmented, icons, trip-spend registry (first integrated by [`ec641cf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ec641cf0459c495d8cbf56fdcb8d561a71d4327b)).
- [`a4a5c36`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a4a5c3602982b14df75d226b766d01744e523b6d) — chore(ui): K1 lint-baseline exception for spec-mandated select output (first integrated by [`ec641cf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ec641cf0459c495d8cbf56fdcb8d561a71d4327b)).
- [`0e3af12`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0e3af12b9d4c5f916aec790ac4687e7e6146c7e8) — fix(town): T1F remainder — invalid habit ids read as unknown habits (404) (first integrated by [`3960145`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3960145c9c5df0fc8745ea2f6128278629e13435)).
- [`21363af`](https://github.com/Vivekpsps3/vivek-monorepo/commit/21363afc7f7fb44cc27a83ee6401df47df9d925a) — feat(finance): F5 unlock return path, unlock states, FinanceLockService auto-lock (first integrated by [`83a8cd5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/83a8cd51b3d9472a8174d0579bd949afc0eee9f5)).
- [`f76b2d7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f76b2d7c65e808d5b5b2e3d136dd58458412236e) — fix(finance): type vault-unlock error handling (lint ratchet) (first integrated by [`83a8cd5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/83a8cd51b3d9472a8174d0579bd949afc0eee9f5)).
- [`095efbf`](https://github.com/Vivekpsps3/vivek-monorepo/commit/095efbfe11d3fd34f273f1c07a2eb1e8008f2de9) — fix(ci): keep keyboard focus visible and bound release artifact retention (first integrated by [`639cab9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/639cab9a6eec656ea53a084e63711074aedf4c1f)).
- [`a876345`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a8763456cf6ae24fcad722fb1e027cfb0450a2c2) — Merge bookkeeping: Merge remote-tracking branch 'origin/main' into fix/ci-reliability (first integrated by [`639cab9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/639cab9a6eec656ea53a084e63711074aedf4c1f)).
- [`2bdffe0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/2bdffe01f3d56ccacef0116b11bd0468fc5859d1) — Merge bookkeeping: Merge main and adopt its artifact-free deployment flow (first integrated by [`639cab9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/639cab9a6eec656ea53a084e63711074aedf4c1f)).
- [`26e1e52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/26e1e529f852bcf1941dd585eb9086f7e4476b71) — test(ci): wait for route focus and refresh Finance lock acceptance (first integrated by [`639cab9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/639cab9a6eec656ea53a084e63711074aedf4c1f)).
- [`c48e4b0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c48e4b02457c5b16c27f49cf78cc3df7c1c7a6a5) — feat(town): hub summary endpoint + Town hub card (TF5) (first integrated by [`7bee634`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7bee634683f6af858f8731f319cd68197cbdb42e)).
- [`a46bd62`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a46bd6208e5ff8bf45c2ebb14c0f6d309a71da99) — W3a: world trips + finished-media content API (first integrated by [`c531ad3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c531ad39af1edd3ab3c859e1bb963dcdc1854e3f)).
- [`d7cf002`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d7cf002bbdecf3753d80c97bd675b33958c4b527) — THC2: encrypted Health store + stage-only barrel (first integrated by [`52c2071`](https://github.com/Vivekpsps3/vivek-monorepo/commit/52c207103bf92016bfff990afcdc72029d1cc495)).
- [`a704854`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a70485490255838f537d48a8f24d2b4b925df1e6) — F1: accessibility baseline (first integrated by [`33881f5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/33881f5d0ee70914b0b1c9d522b12f1715af5fcc)).
- [`5a3f0b0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5a3f0b0bcd1723aa72d7091ac206416155a83b01) — F11: chart tooltips (first integrated by [`d8c3582`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d8c3582efe70666411ecc39fea1027ae50d6d98c)).
- [`f6f683b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f6f683b1ae34e75ce2d9af7523a8ad93de57ddb3) — F12: activity summary (first integrated by [`a103b8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/a103b8b1c666456b87ea8da5b4a49f0462d0a84e)).
- [`ba7da17`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ba7da17ebacb4793f794e3051dab1d8e5be7ee70) — Travel T5 (partial) + T6: menus seam + trip tools (first integrated by [`d217a2d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d217a2d94acb5b821bc9c5f6070313043d76bde9)).
- [`d873b29`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d873b29f194b4a563e1e9c65e6391bfe1e34b571) — F20: projection answer + chart/table (first integrated by [`10ca69f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/10ca69fc6d64b544d21d0e7c753d4496597ed256)).
- [`197e685`](https://github.com/Vivekpsps3/vivek-monorepo/commit/197e685d4334db1dc09de4883d9674404696237b) — F16: net-worth row actions + labels (first integrated by [`d841673`](https://github.com/Vivekpsps3/vivek-monorepo/commit/d84167393faf3ed2afa6af2c9ead5c91b2ac9245)).
- [`c4d7c06`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c4d7c0664717aff424f47f29f86a4037939e215c) — Media M5-M7: tag/related/rating model layers (components gated on K1) (first integrated by [`3d68e01`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3d68e01619056f5378a6357718351f4aeef32a2f)).
- [`b7ee282`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b7ee2823f1d5713cd87aa68fe9f91a7a3b084f47) — Media M8 + M11 full; M9/M10 model layers (components gated on K1) (first integrated by [`20255ca`](https://github.com/Vivekpsps3/vivek-monorepo/commit/20255ca2b6a2520671d883b1d7ab0bdd51079d04)).
- [`58f62b4`](https://github.com/Vivekpsps3/vivek-monorepo/commit/58f62b4079450d9c3f2cf5b3c61a03bf825a9dd1) — test(finance): CI3 LA quote-date boundary pins (first integrated by [`6e64b8b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6e64b8bec12713298dc5aba11fb3be708e3f6f47)).
- [`8756a8d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8756a8dac3e74ee812da36131449fc2aa25e59a4) — perf(tests): env-gated Karma coverage, quick target, Playwright server reuse (first integrated by [`1507710`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1507710373f1a03e2a61c33cb015a63112a9b194)).
- [`c765581`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c765581de9083505cddd0317a34e5b4c861d07a3) — feat(finance): F7 quote book, price prefs, and price-privacy copy (first integrated by [`e9a2a12`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e9a2a125daaef159969c34ab773aa955a2428d47)).
- [`602057f`](https://github.com/Vivekpsps3/vivek-monorepo/commit/602057f9f296f71e5507fa05d12a6a8377eded25) — F7: quote book + lint code-fixes, merged forward to current main (first integrated by [`e9a2a12`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e9a2a125daaef159969c34ab773aa955a2428d47)).
- [`1f19c22`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1f19c22ba0d31bc52328ee6b13789369e6e9c6dd) — Merge bookkeeping: Merge main into F7 and preserve current Finance and shared integrations (first integrated by [`e9a2a12`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e9a2a125daaef159969c34ab773aa955a2428d47)).
- [`5f9b2c9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5f9b2c9b00d458063c60b67fa3dafdc79ea5f265) — feat(finance): F8 category spend math, doughnut, and calendar strip (first integrated by [`6fdd05a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fdd05a43a5c321678de5013c47841f8485c9bc4)).
- [`e095ac9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e095ac91d5654b9de0dd73a281a31b6263f81029) — F8: category spend + lint fixes, merged forward (stacked on F7) (first integrated by [`6fdd05a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fdd05a43a5c321678de5013c47841f8485c9bc4)).
- [`8d785a5`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8d785a578ee5f22548564d655f3e8adc3817a68b) — Merge bookkeeping: Merge main into F8 with refund math, chart tooltips and canonical navigation (first integrated by [`6fdd05a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6fdd05a43a5c321678de5013c47841f8485c9bc4)).
- [`6799608`](https://github.com/Vivekpsps3/vivek-monorepo/commit/679960873abec6e09ae0a296cb574f3c6266443b) — feat(finance): F9 bank import copy, receipts, and undo/delete flow (first integrated by [`958af52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/958af522ad3decdffc0469a21c7f578ce82efbdc)).
- [`3ade958`](https://github.com/Vivekpsps3/vivek-monorepo/commit/3ade958e392c8efc47d07f3f1f8593031e8f9f7f) — F9: bank import + lint/e2e fixes, merged forward to current main (first integrated by [`958af52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/958af522ad3decdffc0469a21c7f578ce82efbdc)).
- [`21d4121`](https://github.com/Vivekpsps3/vivek-monorepo/commit/21d4121e4358fafc376fbd974023d7f228ae508f) — Merge bookkeeping: Merge main into F9 and preserve current Finance imports and empty states (first integrated by [`958af52`](https://github.com/Vivekpsps3/vivek-monorepo/commit/958af522ad3decdffc0469a21c7f578ce82efbdc)).
- [`33dae68`](https://github.com/Vivekpsps3/vivek-monorepo/commit/33dae68995e9049e5ca2e6f222c9ed1539c2d2ef) — F13: calendar grid (first integrated by [`263b020`](https://github.com/Vivekpsps3/vivek-monorepo/commit/263b02046db3b69a0207b29cce9f6810e028ce3f)).
- [`5341c61`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5341c6194be27b672b71023465b480faa670973f) — Merge bookkeeping: Merge main into F13 and use F8 posted-only calendar amounts (first integrated by [`263b020`](https://github.com/Vivekpsps3/vivek-monorepo/commit/263b02046db3b69a0207b29cce9f6810e028ce3f)).
- [`313d4f6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/313d4f6f914e1e4e2ba2362117d2f487f0fa0e0a) — F22: net-worth copy sweep (Save asset/Save debt, Balances as of) (first integrated by [`0af960c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0af960cb80ed30304ee87f6443a4d475dbdfdf36)).
- [`6540a33`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6540a333f63546ac59eac0dd1e3b287475aad966) — Merge bookkeeping: Merge main into F22 and retain empty states and phone row layouts (first integrated by [`0af960c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0af960cb80ed30304ee87f6443a4d475dbdfdf36)).
- [`c6ad8f3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/c6ad8f33ca815dac70db043dbc22e058b24fa0bc) — F14: Home states (empty vault, due-soon, first steps) (first integrated by [`fa98749`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fa98749183f3887a0e10f041f0948a7f1b109681)).
- [`9aae6f3`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9aae6f391538124ce099c469a2ba515ced45060a) — Merge bookkeeping: Merge main into F14 with price notices, posted spending and Guide handoff (first integrated by [`fa98749`](https://github.com/Vivekpsps3/vivek-monorepo/commit/fa98749183f3887a0e10f041f0948a7f1b109681)).
- [`cfca351`](https://github.com/Vivekpsps3/vivek-monorepo/commit/cfca351048320fc9892fd663b537d6c3ef4244e0) — F18: plain-language copy pass (first integrated by [`45bb08c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/45bb08c6768f7f72765ea3dd70590b71ed0f28d8)).
- [`1d76c35`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1d76c35b5db81c5e8f704da6cd9f89c397d0e47c) — Merge bookkeeping: Merge main into F18 and retain empty states, Home cards and undated quote warning (first integrated by [`45bb08c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/45bb08c6768f7f72765ea3dd70590b71ed0f28d8)).
- [`614be44`](https://github.com/Vivekpsps3/vivek-monorepo/commit/614be4433683e9ab1517b8c2d0c9c6b73f61dce6) — Travel T2+T3: trip reminders + spend registry seams (first integrated by [`9a709dc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a709dc0c30b2fb1917cd9dbeaba9b7820721305)).
- [`55eb508`](https://github.com/Vivekpsps3/vivek-monorepo/commit/55eb508a814c15e2def42fcfde05798901796c0e) — Travel T2+T3: complete file set (trip costs + reminders) (first integrated by [`9a709dc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a709dc0c30b2fb1917cd9dbeaba9b7820721305)).
- [`62af375`](https://github.com/Vivekpsps3/vivek-monorepo/commit/62af37585b0f71ae028d85c4ae6bafbc29c7e0e0) — Merge bookkeeping: Recover closed PR 171: merge trip costs and reminders with current main (first integrated by [`9a709dc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9a709dc0c30b2fb1917cd9dbeaba9b7820721305)).

</details>

### 2026-11-08

Version: **day-2026.11.08** · 5 mainline integration(s) · end state [`ab67b90`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ab67b90fdcbcea7802d6ee724585127181959f9c).

**Features added or changed.** Pixels Year, Life, and Hub become user-facing. World gains its accessible map/list explorer, concepts, Lit Map/fog, and private budget chests. These integrate earlier backend/engine foundations into navigable screens.

**Bugs fixed and recovery.** Post-merge Finance/Media/Travel regressions, Pixels focus, and late Finance unlock redirects are fixed.

**Maintenance and limits.** Isolated test workers and worker limits speed acceptance checks while preserving deterministic ownership/clock behavior.

**Mainline evidence, in integration order:**

- [`bfc0349`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bfc0349dd7ba6fd3c77d1ab251953188eaeb63ef) — Stabilize post-merge Finance, Media, and Travel checks (#188)
- [`9bfc520`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9bfc520959cdae952d35609fd1a779f4c1b34070) — Pixels Year, Life, and Hub (#189)
- [`bdb96cc`](https://github.com/Vivekpsps3/vivek-monorepo/commit/bdb96ccab3b649b8e2315eb48b68d03d2d6accc9) — World: accessible explorer, concepts, fog, and private chests (#190)
- [`5fdc651`](https://github.com/Vivekpsps3/vivek-monorepo/commit/5fdc651f762ed30b923c17b9255738a03a478e7f) — test: speed up suites with isolated workers and fix Pixels focus (#191)
- [`ab67b90`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ab67b90fdcbcea7802d6ee724585127181959f9c) — Fix late Finance unlock redirects and run tests with four workers (#192)

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-11-09

Version: **day-2026.11.09** · 12 mainline integration(s) · end state [`08be484`](https://github.com/Vivekpsps3/vivek-monorepo/commit/08be484ba3b3535dbcb500749245f2e75ee1f2e4).

**Features added or changed.** No new major domain screen is added. Profile direct navigation and birthday saving become reliable; Town/World arrival headings and a single main landmark improve accessible navigation.

**Bugs fixed and recovery.** Saved album metadata behavior, Treasury, PTO carry, headers, and birthday handling receive fixes. Multiple Finance lock listeners coexist. Saved Media reads stop triggering MusicBrainz repair; Health rejects late plaintext after lock/account switch. Bills/subscriptions share field-error ownership.

**Maintenance and limits.** Playwright discovery fails on omitted specs. Scoped agent rules, executable roadmap leaves, and deletion-focused planning replace duplicated/stale guidance; unused UI pass-throughs are removed.

**Mainline evidence, in integration order:**

- [`495d698`](https://github.com/Vivekpsps3/vivek-monorepo/commit/495d698aedac5c544119c30c9405c810f8038cba) — Fix saved albums, treasury, PTO carry, headers, and birthday (#193)
- [`63bc975`](https://github.com/Vivekpsps3/vivek-monorepo/commit/63bc975ede08967e61c50f78b25176b07dc07d18) — Publish one executable leaf for every roadmap issue. (#278)
- [`7347d1b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7347d1b8279c48107de10bb5f69692c1ea6796b5) — Keep every lock listener when more than one consumer registers. (#279)
- [`98c8d90`](https://github.com/Vivekpsps3/vivek-monorepo/commit/98c8d90a7a2738e1f34045e01f92b7bfb55f560c) — Serve Profile on direct load and keep birthday save (#280)
- [`ab365b6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ab365b629ec9bd0d4969b76908bd542f36467a81) — Fail the fast check when a Playwright spec is undiscovered (#281)
- [`29e1318`](https://github.com/Vivekpsps3/vivek-monorepo/commit/29e131821d138bba224e02d5d61b77e23247e08a) — Keep saved Media reads off MusicBrainz repair (#282)
- [`e16f6c9`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e16f6c93098af9ef317a07ddc232ef21cbb1501f) — Add scoped, bounded agent guidance and maintenance rules (#283)
- [`758ff0b`](https://github.com/Vivekpsps3/vivek-monorepo/commit/758ff0b8c6bc962a34381a5bf4069faee820f1df) — Prioritize concrete deletions and remove duplicate planning state (#286)
- [`4289278`](https://github.com/Vivekpsps3/vivek-monorepo/commit/4289278bb80b03fcddf212318714c8ff41fece26) — Remove stale branch claims and unused UI pass-throughs (#287)
- [`71823ff`](https://github.com/Vivekpsps3/vivek-monorepo/commit/71823ff7b2a1f405bb5e22a5df241779bf2ddf0b) — Give Town and World one main and a real arrival heading (#288)
- [`f143d2e`](https://github.com/Vivekpsps3/vivek-monorepo/commit/f143d2ecb5bffb60784585f95f65b990fa4c19bb) — Share one invalid-field owner for bills and subscriptions (#289)
- [`08be484`](https://github.com/Vivekpsps3/vivek-monorepo/commit/08be484ba3b3535dbcb500749245f2e75ee1f2e4) — Refuse late Health plaintext after lock or account switch (#290)

No separate reachable branch commits first enter main on this date. Squashed implementation steps remain in the linked integration diff/body.

### 2026-11-10

Version: **day-2026.11.10** · 6 mainline integration(s) · end state [`80b9ca0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80b9ca0e0776297f3addcdfdac78542f6a7ced40).

**Features added or changed.** No new user-facing feature screen is added. Existing movie/series TMDB detail calls share the official transport, and Health consumes a narrow vault capability.

**Bugs fixed and recovery.** Phone recurring editors use one pay schedule. Town habit journeys use the isolated worker clock. Planner-listing fixtures stop depending on incidental priority ordering.

**Maintenance and limits.** The unused World controller wrapper is deleted. The simplification audit/development guidance and linear roadmap handoff are finalized in PR #297. This is the report cutoff, before the documentation PR itself.

**Mainline evidence, in integration order:**

- [`e9cd267`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e9cd267b3c047e6e2d5153b5df0378c15ef429e0) — Share one official TMDB detail transport for movie and series (#291)
- [`6157e6a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/6157e6a7cd11c87b45598879fa9c5a12c970cf64) — Run Town habit journeys on the isolated worker clock (#293)
- [`4512977`](https://github.com/Vivekpsps3/vivek-monorepo/commit/451297726db7807e5aa68d5040d924ced946952b) — Give Health a narrow vault capability so it no longer depends on the whole Finance vault. (#294)
- [`7252b27`](https://github.com/Vivekpsps3/vivek-monorepo/commit/7252b2716ac070c409583b6151497de21ecb9acb) — Keep phone recurring editors on one pay schedule (#295)
- [`8c37ce2`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8c37ce24ee22b8a6e7d0efa96d5ad178613a6de3) — Delete the unused World controller wrapper (#292)
- [`80b9ca0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80b9ca0e0776297f3addcdfdac78542f6a7ced40) — Linearize roadmap execution and finalize monorepo simplification audit ([PR #297](https://github.com/Vivekpsps3/vivek-monorepo/pull/297))

<details>
<summary>Constituent branch history first integrated today (3 commits)</summary>

- [`0a0683a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/0a0683a88bf6239c0ee74d532eb835f9cde2d6d9) — docs: finalize monorepo simplification audit and development guidance (first integrated by [`80b9ca0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80b9ca0e0776297f3addcdfdac78542f6a7ced40)).
- [`ed0760c`](https://github.com/Vivekpsps3/vivek-monorepo/commit/ed0760c52818f01f889ffb8279d7c31d06884cdd) — docs: linearize roadmap selection and execution handoff (first integrated by [`80b9ca0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80b9ca0e0776297f3addcdfdac78542f6a7ced40)).
- [`b59e9af`](https://github.com/Vivekpsps3/vivek-monorepo/commit/b59e9afea5c6a3f6cf86d1a27747c63e3d64abca) — fix: make planner listing fixtures independent of priority (first integrated by [`80b9ca0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80b9ca0e0776297f3addcdfdac78542f6a7ced40)).

</details>

### 2026-11-11

Version: **day-2026.11.11** · accepted landings, not a full recount · latest cited main [`1268f8d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1268f8d8a61b4b0116fc10eedc6739dfed1f8b78). The first seven-leaf note below was written against [`939984d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/939984de389b9e33510aecb12a80eb50ff3ef06b).

This is an accepted-landing note for seven leaves, dated by UTC committer time. It is not a full recount of November 11. Other mainline commits that UTC day, including [#303](https://github.com/Vivekpsps3/vivek-monorepo/pull/303) and [#319](https://github.com/Vivekpsps3/vivek-monorepo/pull/319), stay in their own records. A merge is not deployment or external activation.

**Features added or changed.** Planning current facts name the asset, debt, holding, active-job, bill, and subscription records behind each figure. Zero values count. Inactive jobs, ended or future jobs, inactive bills and subscriptions, and inactive or staged holdings stay out. Take-home appears only when those active jobs record taxes or deductions; otherwise the card says yearly pay before taxes and “Take-home: not set”. Undated prices still warn. PTO and Sick history and projection share one chart and one Balance by month table, using the existing `/pto/series` points, with PTO circles and Sick squares, solid history, and a dashed projection. The Finance account menu and the one-time Home notice are accepted as one unlock-time price preference: checks stay on by default, and turning them off stops the next automatic quote for that user. Manual Refresh still works, and stock research still waits for Look up. The Hub year strip is one 13-week date action for pointer and keyboard, opening the same `/pixels?year=&day=` URL, including a future day, with one tab stop and cells capped so the grid stays within 180px.

**Bugs fixed and recovery.** A failed PTO series request shows “Couldn't load the balance chart.” with Retry and leaves the tiles and forms usable. Library Back clears a pending filter so a debounced change does not request the library again after that navigation. Login and username-change challenges share one configured-origin check. A proof is accepted only for `CORS_ORIGINS`, or for the documented development origins when that variable is unset. Forwarded headers do not choose the origin. A missing, malformed, foreign, or swapped origin keeps the existing 401 and does not create a session or rename the account. A challenge can still be spent only once. A manual production deploy now reads the latest same-repository push run for the SHA and refuses it unless that run succeeded, the SHA is still current main, and the last Seeded schema rehearsals step succeeded.

**Maintenance and limits.** Unmodified fork pull requests stay on GitHub-hosted runners; no routing defect in that expression was changed. Missing branch protection, rulesets, CODEOWNERS, and production reviewers stay unresolved. OPS-01 does not prove a real off-host destination or alert recipient. Deploy rebuilds the SHA rather than promoting the byte-identical CI image. Parents #65, #110, #85, #196, #121, and #125 stay open. Backend, Frontend, Unified Site Release, and Playwright passed on all seven pull requests, including [#322](https://github.com/Vivekpsps3/vivek-monorepo/pull/322).

**Mainline evidence, in integration order:**

- [`aebe5e7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aebe5e7997a12634ab171ad3c16b1a68b004939d) — Show which records supply Planning facts ([#320](https://github.com/Vivekpsps3/vivek-monorepo/pull/320)), squash `aebe5e7997a12634ab171ad3c16b1a68b004939d`
- [`8b9f099`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8b9f0998abecac065887230a8e1a2257f6b2a496) — Prove runner routing and reject a newer failed release ([#323](https://github.com/Vivekpsps3/vivek-monorepo/pull/323)), squash `8b9f0998abecac065887230a8e1a2257f6b2a496`
- [`1b5a133`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1b5a133aac38220fd9924266db7bb6c46443c424) — Show PTO and Sick on one accessible forecast ([#326](https://github.com/Vivekpsps3/vivek-monorepo/pull/326)), squash `1b5a133aac38220fd9924266db7bb6c46443c424`
- [`8201296`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82012961e85eb5d43c05caab0d151d2804b2f3fa) — Cancel a pending library filter when the user goes Back ([#321](https://github.com/Vivekpsps3/vivek-monorepo/pull/321)), squash `82012961e85eb5d43c05caab0d151d2804b2f3fa`
- [`71c11f6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/71c11f6ee731dc55111dee1cccc8b14cd11e5c1c) — Give the Hub miniature one date action for pointer and keyboard ([#325](https://github.com/Vivekpsps3/vivek-monorepo/pull/325)), squash `71c11f6ee731dc55111dee1cccc8b14cd11e5c1c`
- [`939984d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/939984de389b9e33510aecb12a80eb50ff3ef06b) — Bind login and rename challenges to one configured origin ([#324](https://github.com/Vivekpsps3/vivek-monorepo/pull/324)), squash `939984de389b9e33510aecb12a80eb50ff3ef06b`
- [`1b4f35a`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1b4f35a80784a3181da809784fa80b33c13c6e60) — Give Finance one unlock-time price preference ([#322](https://github.com/Vivekpsps3/vivek-monorepo/pull/322)), squash `1b4f35a80784a3181da809784fa80b33c13c6e60`

Squashed implementation steps for these seven leaves remain in the linked integration diffs.

**Five later leaves the same UTC day.** These are on main after the note above. A merge is not deployment or external activation. Backend, Frontend, Unified Site Release, and Playwright passed on each pull request. Parents #65, #84, #85, #93, #110, #121, #125, #196, #198, #199, and #200 stay open. Sidequests, Cards, and the coastal art direction stay unbuilt. OPS-03 does not prove a configured off-host destination or an alert recipient.

**Features added or changed.** Unlocked search returns at most five already-loaded Finance account, holding, and bill names. The query does not load the dashboard, call a provider, or read a server Finance index. Lock, logout, and an identity change drop those rows. Persisted recents stay `{app, kind, id}`. A time-off policy keeps stored hours exact until that field is edited. A comma is a decimal point, and quarter-hour rounding runs on blur of an edited field. The existing backup command can seal a verified snapshot for an owner-supplied directory. The default mode is off, and dry-run sends nothing.

**Bugs fixed and recovery.** A malformed Hub or Pixels payload becomes unavailable for that source and does not invent a zero, a trip, or a date. Other Hub cards still render. A response that decodes after abort or an owner change is dropped. A late Media failure stays off the item on screen. A timed-out save keeps the draft. A failed save is an inline alert, and the next success clears it without a toast. An identical note does not write again. A failed policy save keeps the draft for retry.

**Maintenance and limits.** The off-host adapter reuses the existing backup producer and scheduler. It does not configure a destination, an alert recipient, or a production transfer.

**Mainline evidence, in integration order:**

- [`19c6b51`](https://github.com/Vivekpsps3/vivek-monorepo/commit/19c6b51ebdead875fad7f62f0a18a6b7a6288c94) — Keep untouched PTO hours exact while edited ones round ([#337](https://github.com/Vivekpsps3/vivek-monorepo/pull/337)), squash `19c6b51ebdead875fad7f62f0a18a6b7a6288c94`
- [`9620ebb`](https://github.com/Vivekpsps3/vivek-monorepo/commit/9620ebb7a0b31027acb892f90e75d46a02bd6447) — Add an opt-in off-host backup adapter with dry-run ([#339](https://github.com/Vivekpsps3/vivek-monorepo/pull/339)), squash `9620ebb7a0b31027acb892f90e75d46a02bd6447`
- [`e3ff785`](https://github.com/Vivekpsps3/vivek-monorepo/commit/e3ff785e1e65315425fd24fc733b88bdf0337857) — Decode Hub and Pixels payloads before the cards trust them ([#338](https://github.com/Vivekpsps3/vivek-monorepo/pull/338)), squash `e3ff785e1e65315425fd24fc733b88bdf0337857`
- [`779f167`](https://github.com/Vivekpsps3/vivek-monorepo/commit/779f1679827de7e45f1ce3d3f09fe5d8715c3ceb) — Search unlocked Finance names from memory ([#340](https://github.com/Vivekpsps3/vivek-monorepo/pull/340)), squash `779f1679827de7e45f1ce3d3f09fe5d8715c3ceb`
- [`1268f8d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1268f8d8a61b4b0116fc10eedc6739dfed1f8b78) — Keep late Media failures and duplicate notes off the current item ([#336](https://github.com/Vivekpsps3/vivek-monorepo/pull/336)), squash `1268f8d8a61b4b0116fc10eedc6739dfed1f8b78`

## Reproducing and extending this report

Use `80b9ca0` as the immutable cutoff for the complete audit above. The 2026-11-11 notes are accepted-landing records after that cutoff, not a replacement recount. Then inspect:

```sh
git log --first-parent --reverse --format='%H %ct %s' 80b9ca0e0776297f3addcdfdac78542f6a7ced40
git log --reverse --format='%H %cI %s' 80b9ca0e0776297f3addcdfdac78542f6a7ced40
git show --stat <integration-commit>
git diff <integration-commit>^1 <integration-commit>
```

Convert `%ct` seconds to a UTC date; do not group by author date or preserve an arbitrary local timezone. For each mainline integration, its newly reachable commit set is `git rev-list <commit> ^<first-parent>` (the initial commit has no exclusion). Deduplicate globally in mainline order. Read the integrated tree/diff when a subject is vague, and distinguish foundations, component wiring, later fixes, retirement, and deployment evidence.

Append future days from the prior snapshot, retain commit links, and update counts/cutoff. These two documents intentionally stop at the inspected source snapshot: their own creation is documentation maintenance, not a retroactive product release.
