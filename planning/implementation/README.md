# Implementation queue

This is the executable backlog for [roadmap #134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).
Parents stay open as scope ledgers. An agent implements one leaf, in one worktree, through one pull request.
Packets were checked against `main` `495d698aedac5c544119c30c9405c810f8038cba` on 2026-11-09. Fresh-read `main`, the live leaf and open pull requests before editing; this snapshot is not a lock.

Scheduling metadata (packet prose lives only in Markdown): [`queue.json`](queue.json). Check it with:

```sh
python3 planning/implementation/plan.py validate --self-test
python3 planning/implementation/plan.py list
python3 planning/implementation/plan.py launch SAFE-01
```

The validator checks packet/index metadata, required sections, acceptance proof cells, source paths and the dependency graph. It does not prove behavioral or semantic coverage. The launch command prints deduplicated verification commands; add gates for the actual diff.

## How to take a leaf

1. Pick a leaf whose dependencies are merged on current `main` and whose conflict groups are not already claimed.
2. Read the leaf file below, then the parent only for retained scope and already-landed evidence.
3. Comment on the leaf with the key, branch, worktree and base SHA.
4. Use a worktree from current `origin/main`. Leave this checkout alone.
5. Follow [planning/AGENTS.md](../AGENTS.md): implement, delete the named old path, run the verification profile plus every applicable root gate, write `evidence/KEY.md`, and open one PR that closes the leaf.
6. Append a key-specific status note to roadmap #134. Do not rewrite the roadmap body or close the parent.

Discovery leaves (`DISC-01`, `DISC-02`) produce a design pull request and do not authorize an app.
`OPS-06` waits for a real off-host destination, recovery key and alert recipient. Do not invent them.

## Deletion first

Finish or verify the active SAFE-01, MED-01, VER-02 and UX-01 PRs. In parallel,
choose actual non-conflicting cleanup: DEL-03 deletes the unused World wrapper;
DEL-05 resolves repeated control styles and coordinates with FIN-02. Then DEL-04
uses the merged lifecycle contract. MED-07/MED-08 follow MED-01 without waiting
for TypeScript decoders. Use the [measured deletion contract](deletion-strategy.md).

PTO charts/forms/Home and the trip itinerary no longer wait for unrelated private
Health/Pixels or Finance bridge work. Scheduling overlap is a conflict, not a made-up
API dependency. MED-06 now owns detail presentation; MED-09 owns library/Add, and
MED-10 owns retained runtime QA. No original acceptance row was dropped.

## Ready now

Dependency-ready at planning time only; read live issues/PRs before claiming. Conflict groups still serialize actual overlapping files.

| Leaf | Parents | Conflict groups |
| --- | --- | --- |
| [SAFE-01](issues/SAFE-01.md) ([#201](https://github.com/Vivekpsps3/vivek-monorepo/issues/201)) | #198 | finance-vault-lifecycle, pixels-data |
| [CON-01](issues/CON-01.md) ([#206](https://github.com/Vivekpsps3/vivek-monorepo/issues/206)) | #197 | architecture-checker, root-typescript-config, server-composition |
| [VER-01](issues/VER-01.md) ([#209](https://github.com/Vivekpsps3/vivek-monorepo/issues/209)) | #199 | quality-tools, root-typescript-config, eslint-config, quality-docs |
| [VER-02](issues/VER-02.md) ([#210](https://github.com/Vivekpsps3/vivek-monorepo/issues/210)) | #199, #125 | browser-config, ci-workflow, test-discovery, quality-docs |
| [VER-03](issues/VER-03.md) ([#211](https://github.com/Vivekpsps3/vivek-monorepo/issues/211)) | #199, #81 | town-api-tests, coverage-tools, quality-docs |
| [DEL-01](issues/DEL-01.md) ([#213](https://github.com/Vivekpsps3/vivek-monorepo/issues/213)) | #200 | shared-public-api, stale-source-cleanup, quality-docs |
| [DEL-02](issues/DEL-02.md) ([#214](https://github.com/Vivekpsps3/vivek-monorepo/issues/214)) | #200, #121 | identity-origin, identity-session, vault-compatibility, schema-head |
| [DEL-03](issues/DEL-03.md) ([#215](https://github.com/Vivekpsps3/vivek-monorepo/issues/215)) | #200, #198 | world-ui, world-controller, world-engine |
| [DEL-05](issues/DEL-05.md) ([#217](https://github.com/Vivekpsps3/vivek-monorepo/issues/217)) | #200, #196 | shared-controls, root-styles, finance-recurring-editors |
| [FIN-02](issues/FIN-02.md) ([#221](https://github.com/Vivekpsps3/vivek-monorepo/issues/221)) | #65 | finance-recurring-editors |
| [FIN-03](issues/FIN-03.md) ([#222](https://github.com/Vivekpsps3/vivek-monorepo/issues/222)) | #65 | finance-planning |
| [TRIP-02](issues/TRIP-02.md) ([#226](https://github.com/Vivekpsps3/vivek-monorepo/issues/226)) | #84 | travel-trip-main, travel-itinerary |
| [PTO-01](issues/PTO-01.md) ([#230](https://github.com/Vivekpsps3/vivek-monorepo/issues/230)) | #110 | travel-pto-main, travel-pto-chart |
| [PTO-02](issues/PTO-02.md) ([#231](https://github.com/Vivekpsps3/vivek-monorepo/issues/231)) | #110 | travel-pto-main, travel-settings |
| [PTO-03](issues/PTO-03.md) ([#232](https://github.com/Vivekpsps3/vivek-monorepo/issues/232)) | #110 | travel-home, travel-summary |
| [MED-01](issues/MED-01.md) ([#235](https://github.com/Vivekpsps3/vivek-monorepo/issues/235)) | #85, #200 | media-records, media-library-api, media-provider-transport |
| [UX-01](issues/UX-01.md) ([#259](https://github.com/Vivekpsps3/vivek-monorepo/issues/259)) | #196 | private-routes, server-composition, pixels-settings |
| [UX-02](issues/UX-02.md) ([#260](https://github.com/Vivekpsps3/vivek-monorepo/issues/260)) | #196 | town-main, world-ui, private-shell-focus |
| [UX-03](issues/UX-03.md) ([#261](https://github.com/Vivekpsps3/vivek-monorepo/issues/261)) | #196 | hub-main, pixels-hub-card |
| [DISC-01](issues/DISC-01.md) ([#264](https://github.com/Vivekpsps3/vivek-monorepo/issues/264)) | #194 | planning-discovery |
| [DISC-02](issues/DISC-02.md) ([#265](https://github.com/Vivekpsps3/vivek-monorepo/issues/265)) | #195 | planning-discovery |
| [SEC-01](issues/SEC-01.md) ([#266](https://github.com/Vivekpsps3/vivek-monorepo/issues/266)) | #121 | identity-origin, schema-head |
| [OPS-01](issues/OPS-01.md) ([#272](https://github.com/Vivekpsps3/vivek-monorepo/issues/272)) | #125 | ci-release, operations-docs, runner-config |

Ready leaves sharing named groups (actual PR diffs can overlap beyond this list):

- `finance-recurring-editors`: DEL-05, FIN-02
- `identity-origin`: DEL-02, SEC-01
- `planning-discovery`: DISC-01, DISC-02
- `quality-docs`: VER-01, VER-02, VER-03, DEL-01
- `root-typescript-config`: CON-01, VER-01
- `schema-head`: DEL-02, SEC-01
- `server-composition`: CON-01, UX-01
- `travel-pto-main`: PTO-01, PTO-02
- `world-ui`: DEL-03, UX-02

## Leaves by parent

### [#65](https://github.com/Vivekpsps3/vivek-monorepo/issues/65) — Finance: complete price controls, recurring forms, Planning facts and flexible CSV import

- [DEL-04](issues/DEL-04.md) ([#216](https://github.com/Vivekpsps3/vivek-monorepo/issues/216)): Remove redundant Finance orchestration while preserving one store. Depends on SAFE-04.
- [FIN-01](issues/FIN-01.md) ([#220](https://github.com/Vivekpsps3/vivek-monorepo/issues/220)): Complete automatic price controls through the existing preference and refresh coordinator. Depends on SAFE-01.
- [FIN-02](issues/FIN-02.md) ([#221](https://github.com/Vivekpsps3/vivek-monorepo/issues/221)): Simplify recurring editors and finish one exact pay schedule. Depends on none.
- [FIN-03](issues/FIN-03.md) ([#222](https://github.com/Vivekpsps3/vivek-monorepo/issues/222)): Expose accurate Planning source counts and finish current-facts copy. Depends on none.
- [FIN-04](issues/FIN-04.md) ([#223](https://github.com/Vivekpsps3/vivek-monorepo/issues/223)): Add custom CSV mapping through the existing encrypted import plan and Undo. Depends on CON-03, SAFE-04.
- [FIN-05](issues/FIN-05.md) ([#224](https://github.com/Vivekpsps3/vivek-monorepo/issues/224)): Close retained Finance store/import race findings with focused fixes and deletion. Depends on SAFE-01.

### [#84](https://github.com/Vivekpsps3/vivek-monorepo/issues/84) — Travel and Finance: complete the trip journey, itinerary, actions and private spending link

- [TRIP-01](issues/TRIP-01.md) ([#225](https://github.com/Vivekpsps3/vivek-monorepo/issues/225)): Connect encrypted trip tags to the live Finance–Travel spending bridge. Depends on SAFE-01, SAFE-03, SAFE-04.
- [TRIP-02](issues/TRIP-02.md) ([#226](https://github.com/Vivekpsps3/vivek-monorepo/issues/226)): Finish one keyboard-accessible trip itinerary and day strip. Depends on none.
- [TRIP-03](issues/TRIP-03.md) ([#227](https://github.com/Vivekpsps3/vivek-monorepo/issues/227)): Unify trip actions and typed deletion through existing menus/confirmation. Depends on TRIP-02.
- [TRIP-04](issues/TRIP-04.md) ([#228](https://github.com/Vivekpsps3/vivek-monorepo/issues/228)): Make trip forms submit-to-explain with live field recovery. Depends on TRIP-03.
- [TRIP-05](issues/TRIP-05.md) ([#229](https://github.com/Vivekpsps3/vivek-monorepo/issues/229)): Replace both trip PTO pickers with one readable day allocation control. Depends on TRIP-04.

### [#110](https://github.com/Vivekpsps3/vivek-monorepo/issues/110) — Travel PTO: finish policies, accessible forecasting, Home balances and safe Sick reset

- [PTO-01](issues/PTO-01.md) ([#230](https://github.com/Vivekpsps3/vivek-monorepo/issues/230)): Replace separate bucket charts with one accessible combined forecast. Depends on none.
- [PTO-02](issues/PTO-02.md) ([#231](https://github.com/Vivekpsps3/vivek-monorepo/issues/231)): Finish policy form decimal/draft behavior and retire duplicate validation. Depends on none.
- [PTO-03](issues/PTO-03.md) ([#232](https://github.com/Vivekpsps3/vivek-monorepo/issues/232)): Show canonical PTO/Sick day-hour balances and next-trip impact on Home. Depends on none.
- [PTO-04](issues/PTO-04.md) ([#233](https://github.com/Vivekpsps3/vivek-monorepo/issues/233)): Implement conflict-safe Remove Sick policy while preserving history. Depends on PTO-02.
- [PTO-05](issues/PTO-05.md) ([#234](https://github.com/Vivekpsps3/vivek-monorepo/issues/234)): Add explicit scheduled accrual without changing daily-prorated defaults. Depends on PTO-02, PTO-04.

### [#85](https://github.com/Vivekpsps3/vivek-monorepo/issues/85) — Media: finish detail editing, tags, Related, ratings and explicit Popular discovery

- [MED-01](issues/MED-01.md) ([#235](https://github.com/Vivekpsps3/vivek-monorepo/issues/235)): Keep saved Media reads database-only and move repair to explicit bounded work. Depends on none.
- [MED-02](issues/MED-02.md) ([#236](https://github.com/Vivekpsps3/vivek-monorepo/issues/236)): Mount the existing tag editor and preserve unrelated detail drafts. Depends on MED-01.
- [MED-03](issues/MED-03.md) ([#237](https://github.com/Vivekpsps3/vivek-monorepo/issues/237)): Replace numeric Media rating input with one accessible 0–10 editor. Depends on MED-02.
- [MED-04](issues/MED-04.md) ([#238](https://github.com/Vivekpsps3/vivek-monorepo/issues/238)): Render Related only on demand through the existing endpoint. Depends on MED-03.
- [MED-05](issues/MED-05.md) ([#239](https://github.com/Vivekpsps3/vivek-monorepo/issues/239)): Finish explicit Popular discovery through the existing service. Depends on MED-01.
- [MED-06](issues/MED-06.md) ([#240](https://github.com/Vivekpsps3/vivek-monorepo/issues/240)): Finish compact Media detail presentation and preserve progress drafts. Depends on MED-02, MED-03, MED-04.
- [MED-07](issues/MED-07.md) ([#241](https://github.com/Vivekpsps3/vivek-monorepo/issues/241)): Delete repeated provider orchestration by consolidating real Media transport/adapters. Depends on MED-01.
- [MED-08](issues/MED-08.md) ([#242](https://github.com/Vivekpsps3/vivek-monorepo/issues/242)): Collapse competing Media catalog/entry/progress/query implementations. Depends on MED-01.
- [MED-09](issues/MED-09.md) (DRAFT): Finish retained Media library and Add interaction acceptance. Depends on MED-01.
- [MED-10](issues/MED-10.md) (DRAFT): Resolve retained Media runtime race, cache and no-op findings. Depends on MED-01.

### [#93](https://github.com/Vivekpsps3/vivek-monorepo/issues/93) — Workspace: complete Hub agenda, search, quick add, settings and calendar subscriptions

- [HUB-01](issues/HUB-01.md) ([#243](https://github.com/Vivekpsps3/vivek-monorepo/issues/243)): Finish coherent account/sign-in/invite/settings UX with real data links. Depends on UX-01, SEC-04, SEC-05, SEC-06.
- [HUB-02](issues/HUB-02.md) ([#244](https://github.com/Vivekpsps3/vivek-monorepo/issues/244)): Lead the Hub with one compact Up next projection and shared source responses. Depends on SAFE-04, SAFE-05, UX-03.
- [HUB-03](issues/HUB-03.md) ([#245](https://github.com/Vivekpsps3/vivek-monorepo/issues/245)): Expand the existing Up next read model into the navigable Hub agenda. Depends on HUB-02, CON-02.
- [HUB-04](issues/HUB-04.md) ([#246](https://github.com/Vivekpsps3/vivek-monorepo/issues/246)): Finish local unlocked Finance name search through a narrow facade. Depends on SAFE-03, SAFE-04, SAFE-05.
- [HUB-05](issues/HUB-05.md) ([#247](https://github.com/Vivekpsps3/vivek-monorepo/issues/247)): Finish Quick add, shortcut help and owner-appropriate workspace affordances. Depends on HUB-02, HUB-04.
- [HUB-06](issues/HUB-06.md) ([#248](https://github.com/Vivekpsps3/vivek-monorepo/issues/248)): Deliver scoped revocable Travel/Media calendar subscriptions. Depends on HUB-03, CON-02.
- [TOWN-06](issues/TOWN-06.md) ([#254](https://github.com/Vivekpsps3/vivek-monorepo/issues/254)): Deliver encrypted weekly reflection and one Hub link through the existing vault. Depends on TOWN-05, SAFE-03, SAFE-04, CON-03, SEC-05, SEC-06.

### [#81](https://github.com/Vivekpsps3/vivek-monorepo/issues/81) — Town: complete activity credits, Treasury, Town Hall, weekly reviews and reliable interactions

- [VER-03](issues/VER-03.md) ([#211](https://github.com/Vivekpsps3/vivek-monorepo/issues/211)): Replace obsolete behavior expectations and document honest coverage ownership. Depends on none.
- [TOWN-01](issues/TOWN-01.md) ([#249](https://github.com/Vivekpsps3/vivek-monorepo/issues/249)): Activate the actual Town browser journeys using existing isolated fixtures. Depends on UX-02, VER-02.
- [TOWN-02](issues/TOWN-02.md) ([#250](https://github.com/Vivekpsps3/vivek-monorepo/issues/250)): Replace passive credit stub with bounded authoritative Media/Travel queries. Depends on TOWN-01, MED-01.
- [TOWN-03](issues/TOWN-03.md) ([#251](https://github.com/Vivekpsps3/vivek-monorepo/issues/251)): Replace habit-based Treasury with Finance budget weeks and finish the existing Hub card. Depends on TOWN-02, SAFE-04, SAFE-05.
- [TOWN-04](issues/TOWN-04.md) ([#252](https://github.com/Vivekpsps3/vivek-monorepo/issues/252)): Close every retained Town interaction finding and mutation survivor. Depends on TOWN-01, TOWN-03.
- [TOWN-05](issues/TOWN-05.md) ([#253](https://github.com/Vivekpsps3/vivek-monorepo/issues/253)): Add a small Town Hall using existing progress/rules and bounded appearance settings. Depends on TOWN-04, CON-02.
- [TOWN-06](issues/TOWN-06.md) ([#254](https://github.com/Vivekpsps3/vivek-monorepo/issues/254)): Deliver encrypted weekly reflection and one Hub link through the existing vault. Depends on TOWN-05, SAFE-03, SAFE-04, CON-03, SEC-05, SEC-06.
- [TOWN-07](issues/TOWN-07.md) ([#255](https://github.com/Vivekpsps3/vivek-monorepo/issues/255)): Enforce Town relational ownership with one preserving migration. Depends on TOWN-02.

### [#90](https://github.com/Vivekpsps3/vivek-monorepo/issues/90) — Health: deliver private Clinic, Gym, entry editing and Town integration

- [SAFE-02](issues/SAFE-02.md) ([#202](https://github.com/Vivekpsps3/vivek-monorepo/issues/202)): Prevent Health data publication after lock, cancellation or owner change. Depends on SAFE-01.
- [HEALTH-01](issues/HEALTH-01.md) ([#256](https://github.com/Vivekpsps3/vivek-monorepo/issues/256)): Build the complete private Clinic with shared units and entry-dialog shell. Depends on SAFE-02, SAFE-03, SAFE-04, TOWN-01, CON-02, SEC-05, SEC-06.
- [HEALTH-02](issues/HEALTH-02.md) ([#257](https://github.com/Vivekpsps3/vivek-monorepo/issues/257)): Build complete Gym PR editing and apply all settled badge names. Depends on HEALTH-01.
- [HEALTH-03](issues/HEALTH-03.md) ([#258](https://github.com/Vivekpsps3/vivek-monorepo/issues/258)): Integrate stage-only Clinic/Gym lots and Today rows without changing Town XP. Depends on HEALTH-02, TOWN-03.

### [#121](https://github.com/Vivekpsps3/vivek-monorepo/issues/121) — Account security: harden sessions and deliver passphrase change plus encrypted vault recovery

- [CON-03](issues/CON-03.md) ([#208](https://github.com/Vivekpsps3/vivek-monorepo/issues/208)): Check encrypted collection policy once and remove unowned membership copies. Depends on SAFE-03.
- [DEL-02](issues/DEL-02.md) ([#214](https://github.com/Vivekpsps3/vivek-monorepo/issues/214)): Retire only proven unreachable runtime compatibility paths. Depends on none.
- [SEC-01](issues/SEC-01.md) ([#266](https://github.com/Vivekpsps3/vivek-monorepo/issues/266)): Unify configured-origin challenge binding and prove auth ownership. Depends on none.
- [SEC-02](issues/SEC-02.md) ([#267](https://github.com/Vivekpsps3/vivek-monorepo/issues/267)): Make CSRF repair commit/CAS and refresh errors deterministic. Depends on SEC-01.
- [SEC-03](issues/SEC-03.md) ([#268](https://github.com/Vivekpsps3/vivek-monorepo/issues/268)): Persist both credential wraps atomically with proof and revision. Depends on SEC-01, SEC-02, CON-03.
- [SEC-04](issues/SEC-04.md) ([#269](https://github.com/Vivekpsps3/vivek-monorepo/issues/269)): Ship passphrase change UI through the atomic rotation contract. Depends on SEC-03, SAFE-03, SAFE-04.
- [SEC-05](issues/SEC-05.md) ([#270](https://github.com/Vivekpsps3/vivek-monorepo/issues/270)): Export every vault collection as one encrypted portable bundle. Depends on CON-03, SAFE-03, SAFE-05.
- [SEC-06](issues/SEC-06.md) ([#271](https://github.com/Vivekpsps3/vivek-monorepo/issues/271)): Restore encrypted bundles with validated atomic or resumable staging. Depends on SEC-05, SAFE-04.

### [#125](https://github.com/Vivekpsps3/vivek-monorepo/issues/125) — Operations: prove CI isolation, release verification, encrypted backups and recovery

- [VER-02](issues/VER-02.md) ([#210](https://github.com/Vivekpsps3/vivek-monorepo/issues/210)): Detect orphan test files and prove intended project discovery. Depends on none.
- [VER-04](issues/VER-04.md) ([#212](https://github.com/Vivekpsps3/vivek-monorepo/issues/212)): Remove duplicate verification work and include forgotten canonical checks. Depends on VER-01, VER-02.
- [OPS-01](issues/OPS-01.md) ([#272](https://github.com/Vivekpsps3/vivek-monorepo/issues/272)): Prove runner/release routing and simplify the current operations contract. Depends on none.
- [OPS-02](issues/OPS-02.md) ([#273](https://github.com/Vivekpsps3/vivek-monorepo/issues/273)): Reconcile snapshot retention and prove last-good preservation. Depends on OPS-01.
- [OPS-03](issues/OPS-03.md) ([#274](https://github.com/Vivekpsps3/vivek-monorepo/issues/274)): Add one opt-in encrypted off-host backup adapter with dry-run. Depends on OPS-02.
- [OPS-04](issues/OPS-04.md) ([#275](https://github.com/Vivekpsps3/vivek-monorepo/issues/275)): Automate a disposable all-domain restore drill and measure recovery. Depends on OPS-03.
- [OPS-05](issues/OPS-05.md) ([#276](https://github.com/Vivekpsps3/vivek-monorepo/issues/276)): Deliver independent-monitor integrations with synthetic alert proof. Depends on OPS-01, OPS-03.
- [OPS-06](issues/OPS-06.md) ([#277](https://github.com/Vivekpsps3/vivek-monorepo/issues/277)): Record real off-host restore and independent alert activation evidence. Depends on OPS-04, OPS-05.

### [#196](https://github.com/Vivekpsps3/vivek-monorepo/issues/196) — UX: repair Profile reloads, Town/World landmarks, Hub day access and visual hierarchy

- [CON-02](issues/CON-02.md) ([#207](https://github.com/Vivekpsps3/vivek-monorepo/issues/207)): Catch server/Angular route drift with explicit route examples. Depends on UX-01.
- [DEL-05](issues/DEL-05.md) ([#217](https://github.com/Vivekpsps3/vivek-monorepo/issues/217)): Delete duplicate control/form styling and reuse real interaction behavior. Depends on none.
- [UX-01](issues/UX-01.md) ([#259](https://github.com/Vivekpsps3/vivek-monorepo/issues/259)): Repair Profile direct loads and the obsolete404 assertion. Depends on none.
- [UX-02](issues/UX-02.md) ([#260](https://github.com/Vivekpsps3/vivek-monorepo/issues/260)): Give Town and World one main landmark and reliable arrival focus. Depends on none.
- [UX-03](issues/UX-03.md) ([#261](https://github.com/Vivekpsps3/vivek-monorepo/issues/261)): Make the Hub miniature compact and equivalent across input modes. Depends on none.
- [UX-04](issues/UX-04.md) ([#262](https://github.com/Vivekpsps3/vivek-monorepo/issues/262)): Make World week navigation visibly directional. Depends on UX-02.
- [UX-05](issues/UX-05.md) ([#263](https://github.com/Vivekpsps3/vivek-monorepo/issues/263)): Orient the phone Pixels grid with visible date references and discoverable legend. Depends on UX-03.

### [#194](https://github.com/Vivekpsps3/vivek-monorepo/issues/194) — Proposal: Sidequests — a private field guide to tiny adventures and memorable firsts

- [DISC-01](issues/DISC-01.md) ([#264](https://github.com/Vivekpsps3/vivek-monorepo/issues/264)): Produce a bounded Sidequests design/data-flow PR without building the app. Depends on none.

### [#195](https://github.com/Vivekpsps3/vivek-monorepo/issues/195) — Proposal: Cards — a beautiful private credit-card, benefits and renewal tracker

- [DISC-02](issues/DISC-02.md) ([#265](https://github.com/Vivekpsps3/vivek-monorepo/issues/265)): Produce a bounded Cards design/data-flow PR without building the app. Depends on none.

### [#198](https://github.com/Vivekpsps3/vivek-monorepo/issues/198) — Engineering: make vault/session invalidation safe and reusable

- [SAFE-01](issues/SAFE-01.md) ([#201](https://github.com/Vivekpsps3/vivek-monorepo/issues/201)): Fix colliding lock cleanup registrations with owned fan-out. Depends on none.
- [SAFE-02](issues/SAFE-02.md) ([#202](https://github.com/Vivekpsps3/vivek-monorepo/issues/202)): Prevent Health data publication after lock, cancellation or owner change. Depends on SAFE-01.
- [SAFE-03](issues/SAFE-03.md) ([#203](https://github.com/Vivekpsps3/vivek-monorepo/issues/203)): Expose only the vault capabilities Health consumes and migrate it. Depends on SAFE-02.
- [SAFE-04](issues/SAFE-04.md) ([#204](https://github.com/Vivekpsps3/vivek-monorepo/issues/204)): Replace duplicated lock/session transport handling in real consumers. Depends on SAFE-01, SAFE-03.
- [SAFE-05](issues/SAFE-05.md) ([#205](https://github.com/Vivekpsps3/vivek-monorepo/issues/205)): Bound Pixels and Health work and delete ad hoc timeout ownership. Depends on SAFE-02, SAFE-04.
- [DEL-03](issues/DEL-03.md) ([#215](https://github.com/Vivekpsps3/vivek-monorepo/issues/215)): Delete competing World setup and reduce component orchestration. Depends on none.

### [#197](https://github.com/Vivekpsps3/vivek-monorepo/issues/197) — Engineering: enforce feature boundaries and route/storage contracts

- [SAFE-03](issues/SAFE-03.md) ([#203](https://github.com/Vivekpsps3/vivek-monorepo/issues/203)): Expose only the vault capabilities Health consumes and migrate it. Depends on SAFE-02.
- [CON-01](issues/CON-01.md) ([#206](https://github.com/Vivekpsps3/vivek-monorepo/issues/206)): Enforce actual feature boundaries with resolved import fixtures. Depends on none.
- [CON-02](issues/CON-02.md) ([#207](https://github.com/Vivekpsps3/vivek-monorepo/issues/207)): Catch server/Angular route drift with explicit route examples. Depends on UX-01.
- [CON-03](issues/CON-03.md) ([#208](https://github.com/Vivekpsps3/vivek-monorepo/issues/208)): Check encrypted collection policy once and remove unowned membership copies. Depends on SAFE-03.
- [REF-01](issues/REF-01.md) ([#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219)): Prove a lean feature workflow and publish measured deletion guidance. Depends on CON-01, CON-02, CON-03, SAFE-03, SAFE-04, VER-01, VER-02.

### [#199](https://github.com/Vivekpsps3/vivek-monorepo/issues/199) — Engineering: prove shipped-source coverage and test discovery

- [VER-01](issues/VER-01.md) ([#209](https://github.com/Vivekpsps3/vivek-monorepo/issues/209)): Make shipped-source lint and type ownership explicit. Depends on none.
- [VER-02](issues/VER-02.md) ([#210](https://github.com/Vivekpsps3/vivek-monorepo/issues/210)): Detect orphan test files and prove intended project discovery. Depends on none.
- [VER-03](issues/VER-03.md) ([#211](https://github.com/Vivekpsps3/vivek-monorepo/issues/211)): Replace obsolete behavior expectations and document honest coverage ownership. Depends on none.
- [VER-04](issues/VER-04.md) ([#212](https://github.com/Vivekpsps3/vivek-monorepo/issues/212)): Remove duplicate verification work and include forgotten canonical checks. Depends on VER-01, VER-02.
- [TYPE-01](issues/TYPE-01.md) ([#218](https://github.com/Vivekpsps3/vivek-monorepo/issues/218)): Replace unsafe boundary casts with small owned decoders. Depends on SAFE-05.
- [REF-01](issues/REF-01.md) ([#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219)): Prove a lean feature workflow and publish measured deletion guidance. Depends on CON-01, CON-02, CON-03, SAFE-03, SAFE-04, VER-01, VER-02.

### [#200](https://github.com/Vivekpsps3/vivek-monorepo/issues/200) — Engineering: simplify domain modules and retire competing implementations

- [DEL-01](issues/DEL-01.md) ([#213](https://github.com/Vivekpsps3/vivek-monorepo/issues/213)): Delete verified dead code and stale implementation claims. Depends on none.
- [DEL-02](issues/DEL-02.md) ([#214](https://github.com/Vivekpsps3/vivek-monorepo/issues/214)): Retire only proven unreachable runtime compatibility paths. Depends on none.
- [DEL-03](issues/DEL-03.md) ([#215](https://github.com/Vivekpsps3/vivek-monorepo/issues/215)): Delete competing World setup and reduce component orchestration. Depends on none.
- [DEL-04](issues/DEL-04.md) ([#216](https://github.com/Vivekpsps3/vivek-monorepo/issues/216)): Remove redundant Finance orchestration while preserving one store. Depends on SAFE-04.
- [DEL-05](issues/DEL-05.md) ([#217](https://github.com/Vivekpsps3/vivek-monorepo/issues/217)): Delete duplicate control/form styling and reuse real interaction behavior. Depends on none.
- [TYPE-01](issues/TYPE-01.md) ([#218](https://github.com/Vivekpsps3/vivek-monorepo/issues/218)): Replace unsafe boundary casts with small owned decoders. Depends on SAFE-05.
- [REF-01](issues/REF-01.md) ([#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219)): Prove a lean feature workflow and publish measured deletion guidance. Depends on CON-01, CON-02, CON-03, SAFE-03, SAFE-04, VER-01, VER-02.
- [MED-01](issues/MED-01.md) ([#235](https://github.com/Vivekpsps3/vivek-monorepo/issues/235)): Keep saved Media reads database-only and move repair to explicit bounded work. Depends on none.
- [MED-07](issues/MED-07.md) ([#241](https://github.com/Vivekpsps3/vivek-monorepo/issues/241)): Delete repeated provider orchestration by consolidating real Media transport/adapters. Depends on MED-01.
- [MED-08](issues/MED-08.md) ([#242](https://github.com/Vivekpsps3/vivek-monorepo/issues/242)): Collapse competing Media catalog/entry/progress/query implementations. Depends on MED-01.

## Technical-debt ownership

Every TD-00–TD-39 item has one primary leaf in `queue.json`. Contributors and the mapping note are in `td_notes`. The dated report remains evidence; it is not a second backlog.

| Item | Primary | Also touches |
| --- | --- | --- |
| TD-00 | [REF-01](issues/REF-01.md) ([#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219)) | CON-01, VER-04 |
| TD-01 | [UX-01](issues/UX-01.md) ([#259](https://github.com/Vivekpsps3/vivek-monorepo/issues/259)) | — |
| TD-02 | [SAFE-01](issues/SAFE-01.md) ([#201](https://github.com/Vivekpsps3/vivek-monorepo/issues/201)) | — |
| TD-03 | [SAFE-02](issues/SAFE-02.md) ([#202](https://github.com/Vivekpsps3/vivek-monorepo/issues/202)) | — |
| TD-04 | [MED-01](issues/MED-01.md) ([#235](https://github.com/Vivekpsps3/vivek-monorepo/issues/235)) | — |
| TD-05 | [CON-01](issues/CON-01.md) ([#206](https://github.com/Vivekpsps3/vivek-monorepo/issues/206)) | — |
| TD-06 | [CON-02](issues/CON-02.md) ([#207](https://github.com/Vivekpsps3/vivek-monorepo/issues/207)) | — |
| TD-07 | [CON-03](issues/CON-03.md) ([#208](https://github.com/Vivekpsps3/vivek-monorepo/issues/208)) | — |
| TD-08 | [SAFE-03](issues/SAFE-03.md) ([#203](https://github.com/Vivekpsps3/vivek-monorepo/issues/203)) | — |
| TD-09 | [SAFE-04](issues/SAFE-04.md) ([#204](https://github.com/Vivekpsps3/vivek-monorepo/issues/204)) | — |
| TD-10 | [SAFE-05](issues/SAFE-05.md) ([#205](https://github.com/Vivekpsps3/vivek-monorepo/issues/205)) | — |
| TD-11 | [DEL-03](issues/DEL-03.md) ([#215](https://github.com/Vivekpsps3/vivek-monorepo/issues/215)) | — |
| TD-12 | [TYPE-01](issues/TYPE-01.md) ([#218](https://github.com/Vivekpsps3/vivek-monorepo/issues/218)) | — |
| TD-13 | [VER-01](issues/VER-01.md) ([#209](https://github.com/Vivekpsps3/vivek-monorepo/issues/209)) | — |
| TD-14 | [VER-02](issues/VER-02.md) ([#210](https://github.com/Vivekpsps3/vivek-monorepo/issues/210)) | TOWN-01, UX-01 |
| TD-15 | [VER-03](issues/VER-03.md) ([#211](https://github.com/Vivekpsps3/vivek-monorepo/issues/211)) | — |
| TD-16 | [VER-03](issues/VER-03.md) ([#211](https://github.com/Vivekpsps3/vivek-monorepo/issues/211)) | UX-01, UX-03 |
| TD-17 | [MED-07](issues/MED-07.md) ([#241](https://github.com/Vivekpsps3/vivek-monorepo/issues/241)) | — |
| TD-18 | [MED-08](issues/MED-08.md) ([#242](https://github.com/Vivekpsps3/vivek-monorepo/issues/242)) | — |
| TD-19 | [DEL-04](issues/DEL-04.md) ([#216](https://github.com/Vivekpsps3/vivek-monorepo/issues/216)) | — |
| TD-20 | [FIN-04](issues/FIN-04.md) ([#223](https://github.com/Vivekpsps3/vivek-monorepo/issues/223)) | FIN-05 |
| TD-21 | [DEL-03](issues/DEL-03.md) ([#215](https://github.com/Vivekpsps3/vivek-monorepo/issues/215)) | — |
| TD-22 | [PTO-01](issues/PTO-01.md) ([#230](https://github.com/Vivekpsps3/vivek-monorepo/issues/230)) | PTO-02 |
| TD-23 | [TRIP-02](issues/TRIP-02.md) ([#226](https://github.com/Vivekpsps3/vivek-monorepo/issues/226)) | TRIP-01, TRIP-04 |
| TD-24 | [DEL-05](issues/DEL-05.md) ([#217](https://github.com/Vivekpsps3/vivek-monorepo/issues/217)) | — |
| TD-25 | [DEL-05](issues/DEL-05.md) ([#217](https://github.com/Vivekpsps3/vivek-monorepo/issues/217)) | — |
| TD-26 | [TYPE-01](issues/TYPE-01.md) ([#218](https://github.com/Vivekpsps3/vivek-monorepo/issues/218)) | TOWN-03 |
| TD-27 | [TOWN-07](issues/TOWN-07.md) ([#255](https://github.com/Vivekpsps3/vivek-monorepo/issues/255)) | OPS-04 |
| TD-28 | [MED-01](issues/MED-01.md) ([#235](https://github.com/Vivekpsps3/vivek-monorepo/issues/235)) | MED-08 |
| TD-29 | [DEL-01](issues/DEL-01.md) ([#213](https://github.com/Vivekpsps3/vivek-monorepo/issues/213)) | DEL-02, DEL-03 |
| TD-30 | [REF-01](issues/REF-01.md) ([#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219)) | DEL-01 |
| TD-31 | [REF-01](issues/REF-01.md) ([#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219)) | — |
| TD-32 | [VER-04](issues/VER-04.md) ([#212](https://github.com/Vivekpsps3/vivek-monorepo/issues/212)) | — |
| TD-33 | [OPS-05](issues/OPS-05.md) ([#276](https://github.com/Vivekpsps3/vivek-monorepo/issues/276)) | OPS-01 |
| TD-34 | [SEC-06](issues/SEC-06.md) ([#271](https://github.com/Vivekpsps3/vivek-monorepo/issues/271)) | SEC-05, OPS-04, OPS-02 |
| TD-35 | [TYPE-01](issues/TYPE-01.md) ([#218](https://github.com/Vivekpsps3/vivek-monorepo/issues/218)) | VER-01, DEL-04 |
| TD-36 | [OPS-01](issues/OPS-01.md) ([#272](https://github.com/Vivekpsps3/vivek-monorepo/issues/272)) | — |
| TD-37 | [REF-01](issues/REF-01.md) ([#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219)) | — |
| TD-38 | [REF-01](issues/REF-01.md) ([#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219)) | VER-04 |
| TD-39 | [REF-01](issues/REF-01.md) ([#219](https://github.com/Vivekpsps3/vivek-monorepo/issues/219)) | — |

