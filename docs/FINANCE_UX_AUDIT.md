# Finance website map and user journey audit

Audit date: 2026-10-12. This is the starting map of the actual application,
followed by the target ownership model and implementation decisions. User
journeys are independent critical reviews, not reports of real customers.

## Complete starting map

The authenticated shell has five hubs, desktop navigation, mobile abbreviated
navigation, a Guide, theme selection, vault locking, sign-out, and an account
menu. Administrators also have Users. Financial records are decrypted in the
browser; the server stores ciphertext and public market data.

| Destination | Contents and actions | Financial source / writes |
| --- | --- | --- |
| `/login` | First administrator setup, username/passphrase login, bounded legacy migration | Auth keys, sessions, vault wraps; no finance edits |
| `/signup`, `/enroll` | Enrollment; `/enroll` redirects to signup | Auth and initial vault |
| `/vault/setup`, `/vault/unlock` | Create or unlock browser-owned vault | Vault wraps / browser key |
| `/` Home | Net worth tile, recorded current-month income/spend tile, scheduled current-month income/spend tile; review queue; six largest holdings with gains; cashflow, category, allocation charts | Derived balance sheet, ledger, schedules, receipts; no direct record editors |
| `/have?t=assets` | Asset/debt totals and lists; create/edit/delete; bulk changed/unchanged balance review, source dates and review intervals | `assets`, `liabilities`; current net worth facts |
| `/have?t=holdings` | Holding totals/list, account labels, prices/gains/source dates, manual positions, Fidelity preview/staged replacement/resume, explicit quotes | `holdings`, `brokerage_accounts`, holding import stages |
| `/spending?t=review` (default) | Category/merchant comparisons for equal elapsed periods, confirmed account selection, coverage gaps, transaction drilldown | Complete `transactions`, `bank_accounts`, receipts; analysis only |
| `/spending?t=activity&v=all|spending|income` | Month/scope, totals, search/category/review filters, dense desktop and expandable phone rows; transaction editor, review flags, bulk categorization/merchant/category cleanup, export | `transactions`; original imported descriptions retained |
| `/spending?t=calendar` | Recorded monthly/day activity, income/spend/category summaries, highest purchases, Add transaction handoff | Ledger analysis; add navigates to Activity |
| `/spending?t=imports` | Multi-file bank CSV selection, per-file explicit confirmed account identity, coverage confirmation, purchase/refund/excluded/ambiguous preview; commit/resume/undo receipts | `transactions`, `bank_accounts`, `import_batches`; neither balances nor schedules |
| `/recurring?t=pay` (default) | Current annual/monthly net pay; job list, employer/dates/base/frequency/taxes/deductions, promotions, dated bonuses, stock grants/ESPP/sales/valuations; full editor, automatic configured employer ticker lookup and manual price controls | `job_incomes`; scheduled cashflow facts and compensation history |
| `/recurring?t=spend` | Combined Upcoming commitments table; separate fixed-bill totals/list/editor and subscription totals/cards/editor below | `fixed_expenses`, `subscriptions`; scheduled costs, no balance changes |
| `/planning?t=path` (default) | Evidence/source disclosures, annual spending composition and explicitly accepted covered-ledger estimate; nested Overview, Monte Carlo, FIRE, Goals, Debt tools; saved inputs, baseline/scenario annual events, advanced rates/allocation | Reads balance sheet/jobs/schedules/ledger; writes encrypted `planning_profiles` only |
| `/planning?t=compensation` | Employer/year/custom-range compensation transform; **a second rendering of the complete job editor** below | Same `job_incomes` as Jobs & pay; speculative location is misleading for historical facts |
| `/planning?t=growth` | Current portfolio seed; contribution/return/inflation/withdrawal assumptions, projection curve, baseline/contribution increase, milestones | Reads holdings; local speculative assumptions, no balance edits |
| `/planning?t=stocks` | Public ticker research, comparisons, owned exposure, purchase/dividend scenarios, encrypted save/load | Market research and `stock_lab_scenarios`; never buys or changes holdings |
| `/embed` | Authenticated compact current net worth | Balance-sheet transform |
| `/admin/users` | Enrollment/invitation and user/session management, disable/delete/reset contents, metrics | Administrative records; cannot recover vault keys |
| unmatched route | Page-not-found and navigation | No writes |

Legacy links: `/balance-sheet` → Have; `/portfolio` → Holdings;
`/transactions` → Spending; `/calendar` → Spending Calendar; `/income` →
Recurring; `/fixed-expenses`, `/subscriptions` → recurring costs;
`/investment-insights` → Portfolio projection; `/stock-lab` → Stock research.
Spending `t=pay` / `t=spend` translate to Activity Income / Spending.
`/charts` is intended as a Home alias. Query parameters supply month, search,
category, and Calendar's selected Add transaction date.

## Starting issues verified from code and the live site

- Public and loopback HTML had identical bundle references and content during
  the audit. No cache collision or simultaneous differing release was observed.
- Both HTML responses lacked `Cache-Control`. Hashed production bundles already
  existed, so there is no reason to allow heuristic caching of the HTML shell.
- `/missing-cache-audit.js` returned HTTP 200 and HTML on both origins. A removed
  lazy chunk can therefore masquerade as a successful script response.
- There is no configured Angular service worker. Clearing arbitrary browser
  storage would risk vault state and would not fix the server policies.
- There is no release identity or detection for already-open tabs.
- Holdings only refresh through explicit Portfolio actions. Employer stock has
  its own page-owned automatic refresh and update queues, so refresh behavior
  depends on which page a person opens.
- Compensation renders the same job editor a second time under Planning.
- Recurring costs repeat each obligation in Upcoming and a separate management
  list, without an edit handoff from Upcoming.
- Home repeats position-level details already owned by Holdings and then adds a
  second allocation presentation. Summaries and visual transforms are useful;
  duplicate record lists are not necessary.
- Activity has no exact account filter, and Review sends broad text searches
  rather than its exact category/merchant/account context.
- Planning's outer “Retirement simulation” contains five different questions;
  essential source facts, saved assumptions, and hypothetical overrides need
  clearer separation. Stock research rate inputs use raw decimals unlike other
  planning tools.

## Target financial ownership

| Fact | One editing destination | Allowed transformations elsewhere |
| --- | --- | --- |
| Current asset/debt balance and review date | What you have → Assets and debts | Home net worth, planning starting balance, review prompts |
| Position shares, cost basis, brokerage account | What you have → Holdings | Home allocation, projection seed, Stock research owned exposure |
| Public ticker quote | Shared market refresh; applied to holdings and dated employer valuations | Every dependent value uses the same refresh outcome and source date |
| Recorded purchase/refund/income and review metadata | Spending → Activity | Review comparisons, Calendar day/month view, Home charts |
| Account identity, imported coverage, receipt outcome | Spending → Imports | Coverage disclosures and review prompts |
| Actual employment/pay/promotions/awards/sales | Recurring → Jobs & pay | Same destination's expandable compensation history; scheduled cashflow and planning baseline |
| Bill/subscription obligation | Recurring → Bills & subscriptions, one combined list | Upcoming ordering, annual renewals, scheduled cashflow, planning fixed costs |
| Saved assumptions and hypothetical events | Planning → relevant question/tool | Baseline/scenario comparison, never changes actual records |

No database migration is justified for these duplications: jobs already share
one encrypted collection, and bills and subscriptions have distinct useful
schedule fields. Consolidate presentation and update coordination while keeping
encrypted records, old profiles, APIs, and deep links readable.

## Five independent user stories

### 1. Maya — first-time salaried renter

Ideal path: sign up → dated checking/savings/card balances → retirement holdings
or an account total, with a clear choice → bank statements → basic salary →
repeating costs → weekly review → first plan with missing costs disclosed.

“Tell me clearly that importing my checking file is activity only, and let me
update the balance as a separate step.” “Let me start with my salary and pay
schedule; I’ll add tax estimates or stock history when I need them.” “Before I
run a plan, show me that rent is included and everyday card spending is missing.”

Current friction: Home's empty zero totals look complete; Guide must be found;
one Guide link promises holdings but opens assets; the job form exposes detailed
stock/tax history immediately; bills/subscriptions compete for entry; an empty
holding state can also be a failed load. Improve onboarding links, progressive
disclosure, source choices, and errors without inventing financial facts.

### 2. Daniel — daily investor with employer equity

Ideal path: login starts prices immediately → current portfolio status → import
and maintain positions in Holdings → maintain employment/RSUs/ESPP once in Jobs
& pay → expand historical employer compensation there → choose a distinctly
explained portfolio, retirement, or ticker what-if question.

“Why can I add and edit the same job under Jobs & pay and Compensation?” “Show
me that my unsold stock compensation and my Fidelity shares aren’t two amounts
to add together.” “If I mean 8%, don’t make me guess between 8 and 0.08.”

Current friction: separate quote orchestration for holdings/employer stocks;
duplicate job editor; stock awards plus annual equity estimates require clearer
additive guidance; no global price-refresh outcome; decimal research inputs.
Keep distinct meaningful analyses while removing duplicate ownership.

### 3. Elena — five-minute phone spending reviewer

Ideal path: attention queue → import statements for remembered accounts → resolve
or understand each outcome → exact card/month review → compare unusual category
or merchant → open precisely those charges in Activity → save/retry without
losing context → inspect and edit one upcoming obligation directly.

“Let me check one card without searching every card’s activity.” “When I tap a
chart or large charge, take me to its transactions and keep my month and card.”
“Tell me what did not save, and let me retry without losing my place.”

Current friction: Activity lacks an account selector; Review handoff broadens
into a text search and drops its exact group/account; charts lack actionable
drilldowns; Upcoming has no edit action and repeats management lists; import
outcomes require hunting across tabs. Improve exact filters and handoffs,
attention links, receipt outcomes, accessible small-screen layouts and errors.
Household ownership is still a future feature, not invented by this change.

### 4. Priya — retirement/car/sabbatical decision maker

Ideal path: choose a question → see actual source facts, dates, and omitted
variable costs → add a labeled purchase or time-off event → compare baseline
and scenario → save assumptions with explicit live sources/overrides → reopen
after a fact change with fresh inputs and clearly stale previous results.

“Show me which real numbers you used and how recent they are.” “Don’t say my car
fund is covered just because I own a home.” “Let me see which debt this estimate
refers to.” “When I reopen my baseline, tell me which figures are today's facts
and which are saved guesses.”

Critical findings: saving default Planning inputs freezes inferred income,
cashflow, and allocation because non-null inferred values become manual on
reopen. The “override net annual cashflow” control is added to income minus
spending in Monte Carlo, but treated as a total in FIRE. Goal savings default to
all net worth, and one debt defaults to all liabilities. Fix these semantics
with regression tests and backward-readable optional fields. Preserve saved
manual assumptions and legacy additional contributions. Plans save assumptions;
do not imply saved simulation results unless they are actually persisted.

### 5. Sam — returning self-hosted user across tabs/devices

Ideal path: reopen current release → known username/account → automatic prices
with an honest saved-price fallback → edit one canonical fact → see other
summaries/tabs update → understand failed/conflicting saves → lock/sign out
consistently → next browser sees the same persisted records.

“Is this the current version, are these today's prices, and did my change reach
the other numbers?” “If the release finished, tell me whether this old tab needs
updating.” “If the other tab is newer, explain what happened before I retry.”

Current friction: no build identity or release check; no cross-tab invalidation;
local snapshots can remain old; revision conflicts protect storage but errors
are vague; shell shows email while login asks for username; lock/sign-out has
no tab coordination. Keep drafts safe and never silently reload a dirty page.

## Detailed implementation plan

### A. Frontend release freshness

1. Give `/index.html` and every SPA fallback explicit no-store/revalidation
   policy; disable stale HTML ETag shortcuts. Give hashed JS/CSS immutable
   caching, unversioned assets revalidation, and missing static assets genuine
   404 responses with no-store. API responses remain uncached private requests.
2. Generate a deterministic release identifier from built entry artifacts,
   embed it in the HTML, and serve a no-store version manifest. Ensure the
   production Docker build runs this step; direct development builds work
   without it. No service worker or blanket browser-storage clearing.
3. Compare the loaded HTML release with a fresh manifest on startup and return
   to a tab. Show an accessible Update available banner and an explicit Reload
   action; preserve unsaved work. Handle lazy-chunk load failure with the same
   recoverable affordance. Do not loop reloads or treat offline as a new release.
4. Verify the real Nginx config in isolation: route HTML headers, hashed asset
   caching, missing chunk 404, and two consecutive releases in a real browser
   with cache enabled. Record observed live headers separately from assumptions.

### B. Automatic market updates and shared facts

1. Start a nonblocking refresh once each authenticated/unlocked app entry,
   including login, restored session, and unlock. One coordinator handles
   deduplicated symbols from active holdings and configured employer stocks;
   bounded concurrency, timeout, and per-symbol failures protect responsiveness.
2. Share public quote results between holdings and dated employer valuations.
   Validate requested symbol, positive finite price, and source dates. Preserve
   shares, basis, position-review dates, manual balances, transactions and
   schedules. A failure preserves saved prices and shows partial/failure state.
3. Keep explicit refresh/retry, routed through the same coordinator. Show
   refresh progress/outcome and ticker disclosure in the shell. Remove
   page-entry employer quote duplication and duplicate Portfolio refresh buttons.
4. Guard asynchronous work at session/user boundaries and serialize relevant
   record updates against manual edits. Refresh Home, projection inputs, and
   derived totals after prices save; no cached dashboard may overwrite them.
5. Coordinate same-origin tabs using only scoped invalidation metadata, never
   decrypted records or keys. Reload clean source snapshots, preserve drafts,
   explain revision conflicts, and propagate lock/sign-out. Avoid event loops.

### C. Canonical recurring owners

1. Jobs & pay becomes the only employment editor. Move the employer/date-range
   compensation transform to expandable history in this destination, remove its
   nested job editor and Planning tab, and redirect old compensation links while
   retaining relevant range context. Improve job/add labels and keep advanced
   taxes, compensation and stock history expandable.
2. Use one combined bills/subscriptions management list with type/status filters,
   date ordering, account, autopay, frequency and amount. Direct add/edit/delete
   actions reuse existing forms without repeating their full lists. Include
   inactive/undated obligations so they are not lost from the owner surface.
3. Keep the distinct encrypted collections and APIs. Explain scheduled amounts
   and actual stock history versus annual additive estimates; never create
   transactions or balances from an obligation/job edit.
4. Preserve all legacy recurring/compensation aliases, including browser back
   behavior, and test keyboard/phone forms, failed saves and date boundaries.

### D. Focused Home and connected spending review

1. Home becomes summaries, attention and charts: remove the repeated position
   list, retain quote/position provenance beside portfolio summary and allocation.
   Show a useful empty-vault starter checklist with links to each exact owner.
2. Add exact account, merchant, category, review state and month filters to
   Activity, serialized in the URL; summaries operate on the complete matching
   dataset independent of row pagination. Preserve missing/legacy-account rows.
3. Make Review and Calendar handoffs keep exact selected account/group/period;
   open a selected transaction directly when appropriate. Add clear attention
   links for unreviewed rows, ambiguous credits and imports without duplicating
   the Activity editor or the Imports workflow.
4. Move Activity's import action to the canonical Imports destination. Add
   actionable recorded chart/table drilldowns, labeled time scopes and coverage
   limitations. Scheduled drilldowns go to schedule owners, not posted activity.
5. Preserve phone expandable rows, keyboard controls, filters and draft edits
   through failures. Use clear inline save/load errors. Update Guide, navigation
   and headings to use consistent task language; show username in account menu.

### E. Planning questions and source semantics

1. Keep distinct portfolio projection and stock research tools. Replace the
   misleading outer Retirement simulation label with Retirement & goals and
   use one explicit question selector inside (overview, simulation, retirement
   target, savings goal, debt payoff), with URL-deep-link state. Hide irrelevant
   shared spending/advanced controls for independent goal/debt questions.
2. Present compact source facts with owner links and real balance/quote dates,
   separate live facts from overrides, and explicitly disclose when scheduled
   spending excludes variable card costs. Detailed evidence remains expandable.
3. Serialize profile saves using the same normalized effective overrides as
   simulation requests: null means use current facts, non-null means a saved
   manual estimate. Old profiles retain their recorded manual values.
4. Add explicit optional net-cashflow override semantics; apply it consistently
   in Monte Carlo and retirement targets without also adding income minus spend.
   Preserve legacy `extra_contributions` as additional contributions. Test both
   meanings with deterministic arithmetic, events and growth assumptions.
5. Goal saved funds and a single debt must not silently equal whole net worth or
   all liabilities. Use clearly hypothetical manual amounts or an explicitly
   selected source record with a link to its owner; defaults must be honest.
6. Use simple labeled purchase/time-off scenario events. Refresh source facts
   when real records change without discarding saved assumptions; invalidate old
   results or mark them stale. Never quietly rerun or mutate actual finance.
7. Display Stock research growth/dividend/inflation as percentages, retaining
   decimal persistence and existing saved scenarios; retain advanced controls.

### F. Independent verification and documentation

- Each implementation stream runs focused meaningful tests. Root inspects code,
  integration and financial semantics independently, and directs fixes.
- Run backend suite, full ChromeHeadless frontend suite, required development
  build and production build including release metadata.
- Run synthetic encrypted-vault Playwright across desktop and phone: onboarding,
  automatic login/unlock quotes and partial failures, quote/edit/session races,
  exact drilldowns, canonical editor deep links, unified commitments, profile
  reopen after fact changes, scenario arithmetic, two tabs, and failed saves.
- Verify isolated Nginx responses and cached-browser release rollover. Do not
  use a real user's vault or alter production data for tests.
- Update architecture, financial model, frontend, design, security disclosure and
  deployment instructions. Preserve unrelated working-tree changes.

## Scope choices

The user explicitly requests automatic price refresh; that supersedes the prior
explicit-action-only quote policy. Disclose ticker sharing and retain the
encryption boundary. Transaction-to-bill matching, household ownership,
automatic manual-balance reconciliation, and broker position feeds are not
required to fix these journeys. No new parallel editor, financial plaintext
server endpoint, service worker, or database migration is necessary.

## Final execution record — Streams A–E

- **A — Release freshness:** Added HTML cache policy, deterministic release
  identity, update detection and recovery for stale chunks. No actual cache
  collision was observed; the missing HTML caching policy was fixed. The
  manifest fixture, isolated Nginx checks and cached-browser release rollover
  passed.
- **B — Shared market updates:** Centralized automatic and explicit quote
  refresh, disclosure, failure handling and scoped cross-tab invalidation.
- **C — Recurring owners:** Consolidated employment editing and compensation
  history under Jobs & pay, and recurring bills/subscriptions under one owner,
  while preserving legacy routes and encrypted records.
- **D — Home and spending:** Removed duplicate Home holding details, added
  owner-linked setup and attention states, exact Activity filters and review
  handoffs, direct Calendar/chart drilldowns, and refreshes for mounted import
  and review views. Phone navigation and deep-linked account selection were
  corrected during independent review.
- **E — Planning:** Added URL-backed planning questions, live source facts,
  explicit cashflow semantics, honest goal/debt defaults, scenario events,
  stale-result handling and percentage-based research inputs.
- **Verification:** Backend tests passed 63/63; full ChromeHeadless frontend
  tests passed 255/255; synthetic-vault Playwright passed 34/34 across desktop
  and mobile, including keyboard use, failures and multiple tabs. Development
  and production Angular builds and the production Docker web image succeeded.
  Documentation path checks passed. Root independently inspected the changes
  and directed the equal-timestamp import recovery and phone navigation fixes.
