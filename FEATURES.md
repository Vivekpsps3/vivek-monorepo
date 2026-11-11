# Complete feature reference

Snapshot: main at [`80b9ca0`](https://github.com/Vivekpsps3/vivek-monorepo/commit/80b9ca0e0776297f3addcdfdac78542f6a7ced40), inspected November 10, 2026 (UTC). Planning facts, the combined PTO forecast, the release guard, library Back, the Hub miniature, and challenge origins below were re-read on main at [`939984d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/939984de389b9e33510aecb12a80eb50ff3ef06b) (November 11, 2026, UTC). One other accepted leaf is named by pull request and is not in that commit.

This document describes the implemented product, its workflows, data rules, privacy boundaries, and operational capabilities. It covers the public portfolio, shared Workspace, Finance, Travel, Media, Town, World, and Pixels. “Available” means implemented in the named source. It does not establish that a particular image, migration, provider credential, or feature has been activated in production. [Daily versions](DAILY_VERSIONS.md) records how the repository reached this state.

## Contents

1. [Product and route map](#product-and-route-map)
2. [Shared Workspace, identity, and settings](#shared-workspace-identity-and-settings)
3. [Finance](#finance)
4. [Travel](#travel)
5. [Media](#media)
6. [Town and Health foundations](#town-and-health-foundations)
7. [World and concepts](#world-and-concepts)
8. [Pixels](#pixels)
9. [Public portfolio](#public-portfolio)
10. [Security and data ownership](#security-and-data-ownership)
11. [Delivery, operations, and verification](#delivery-operations-and-verification)
12. [Implementation boundaries and exclusions](#implementation-boundaries-and-exclusions)
13. [Source guide and maintenance](#source-guide-and-maintenance)

## Product and route map

The suite runs as one Angular web application, one FastAPI service, and one SQLite database. Each domain owns its records and business rules. The shared shell composes summaries and navigation without duplicating domain stores. Public pages are accessible without a session; private routes require the shared account session. Finance additionally requires an unlocked vault.

| Surface | Main routes | Purpose and access |
| --- | --- | --- |
| Portfolio | `/`, `/home`, `/work`, `/about`, `/secrets` | Public profile, work, background, and interactive encryption demonstration |
| Identity | `/auth/login`, `/auth/signup` | Passwordless sign-in and permitted enrollment |
| Workspace | `/hub` | Independent domain summaries and next actions |
| Administration | `/hub/admin` | Admin-only user and session management |
| Settings | `/settings/account`, `/settings/profile`, `/settings/appearance`, `/settings/travel`, `/settings/finance`, `/settings/about` | Shared account, preferences, profile, and domain configuration |
| Finance | `/finance`, `/finance/have`, `/finance/spending`, `/finance/recurring`, `/finance/planning` | Encrypted personal finance tools |
| Vault | `/finance/vault/setup`, `/finance/vault/unlock` | Create or unlock browser access to encrypted records |
| Compact Finance | `/finance/embed` | Authenticated, unlocked compact net-worth view; framing is denied by security policy |
| Travel | `/travel`, `/travel/trips/new`, `/travel/trips/:id`, `/travel/calendar`, `/travel/pto`, `/travel/settings` | Trips, itinerary, maps, leave balances, and policy settings |
| Media | `/media`, `/media/library`, `/media/search`, `/media/calendar`, `/media/add`, `/media/item/:id`, `/media/item/:id/discography` | Personal media journal and public metadata discovery |
| Town | `/town` | Habits, check-ins, history, buildings, and XP |
| World | `/town/world` | Navigable week-based world, concepts, and activity projections |
| Pixels | `/pixels`, `/pixels/life` | Daily year grid and weekly life view |

Older login/signup/enroll, account, and Finance page URLs redirect into current owners. For example, `/finance/transactions` opens Spending, `/finance/portfolio` opens the holdings tab of Net worth, and `/finance/stock-lab` opens Planning's stocks tab. `/blog` redirects to `/home`. Route definitions, rather than historical standalone apps, determine current navigation.

## Shared Workspace, identity, and settings

### Workspace and navigation

Workspace summarizes Finance, Travel, Media, Town, and Pixels through their supported integrations. Travel shows the next trip and its next action. Media shows in-progress items, next episodes (including a compact mark-next action), upcoming works, and recent notes when appropriate. Finance shows current net worth; Town and Pixels supply their own bounded summaries. Finance summaries depend on vault eligibility; public-domain summaries must stay usable when Finance is locked. Cards distinguish loading, empty, locked, unavailable, stale, and expired states where their source supports them. A failed card has local recovery rather than making the entire Hub unusable.

Persistent navigation connects private sections, Workspace, account settings, and sign-out. Section tabs follow deep links and browser navigation. Responsive controls, loading skeletons, route headings, keyboard focus, reusable dialogs, menus, and confirmation flows provide shared interaction behavior. Light/dark/system appearance belongs in Settings.

### Unified search

The header search control and Ctrl/Cmd-K open a keyboard-accessible search dialog. Queries of at least two characters are debounced. Results are grouped, support keyboard selection, and link to their owning pages. Recent result references can be reopened; server reads recheck ownership. Query cancellation and generation checks prevent obsolete responses from replacing newer results.

The server searches owner-scoped Travel and Media data through `/api/search`. Finance contributes a locked-vault unlock row when applicable. **Matching decrypted Finance record names is not implemented in this snapshot.** An unlocked vault does not imply that Finance name results exist. Search is separate from Media's provider-discovery screen.

### Accounts and authentication

Enrollment creates browser-generated encryption/signing material. Sign-in uses the enrolled username and a locally signed challenge after the passphrase unwraps the signing key. The server verifies the signature and issues the shared HttpOnly session cookie; ordinary authenticated writes use CSRF protection. Legacy `/login`, `/signup`, and `/enroll` links redirect to shared routes.

Signup is controlled by server configuration: closed by default, with explicit invitation, allowlist, or open modes. The setup flow makes the first account an administrator. Invitations have bounded, single-use enrollment semantics. Unknown usernames receive decoy login material so lookup responses do not directly establish account existence. Auth challenges are bound to account and purpose, expire, and are consumed atomically. Rate limits protect lookup, signup, challenge, and verification flows. The accepted landing in [PR #324](https://github.com/Vivekpsps3/vivek-monorepo/pull/324) makes login and username-change share one origin check: a proof is accepted only for `CORS_ORIGINS`, or for the documented development origins when that variable is unset. A present `Origin` must match that set. When the header is absent, the request URL's scheme and host count only if that origin is configured. The check does not read `Forwarded`, `X-Forwarded-Host`, or `X-Forwarded-Proto`. A missing, malformed, foreign, or swapped origin keeps the existing 401 challenge failure and does not create a session or rename the account. This is on main as [`939984d`](https://github.com/Vivekpsps3/vivek-monorepo/commit/939984de389b9e33510aecb12a80eb50ff3ef06b) ([#324](https://github.com/Vivekpsps3/vivek-monorepo/pull/324)).

Account settings let users save their display name and change username with validation and actionable field errors. Profile saves or removes an owner-only birthday and the Show my age preference for Life in Pixels. Appearance selects a theme. Finance settings expose Lock Finance and inactivity auto-lock choices (Off, 5, 15, or 60 minutes); activity across tabs participates in that timer. Travel settings expose domain configuration through the same settings shell.

Locking Finance clears local keys and decrypted Finance projections while preserving the suite session for other tools. Sign-out or session expiry clears private state and recovery drafts. Unlock honors a safe local return path; late unlock completion must not redirect after another lock or session change. Lock propagation supports multiple listeners and cross-tab invalidation.

### Administration

Admins can manage account access, invitations, active state and roles, revoke sessions, reset supported user data, and delete accounts through confirmed destructive actions. Account deletion removes owned domain data and authentication/vault material; shared market caches remain. The API prevents self-deletion and removal of the final active administrator. Typed destructive confirmations make the selected action and target reviewable.

Administrators cannot recover a lost vault passphrase or decrypt another user's Finance records. Resetting/deleting encrypted contents is a destructive start-over operation, not recovery.

## Finance

### Financial model and separation

Finance keeps four distinct data planes:

| Plane | Records | Used for |
| --- | --- | --- |
| Balance sheet | Assets, liabilities, holdings, brokerage accounts | Current net worth |
| Posted ledger | Transactions, bank accounts, import receipts | Recorded activity, spending, date-based summaries |
| Recurring cashflow | Jobs/pay, fixed bills, subscriptions | Scheduled income/costs and combined cashflow |
| Speculative planning | Profiles and Stock Lab scenarios | Goal/debt estimates, portfolio projections, Monte Carlo, research |

All private records are encrypted before upload. Computation and CSV parsing run in the browser after unlock. Net worth equals manual assets plus available portfolio value minus liabilities. Transactions, income, imports, stock-compensation reports, and planning results do not automatically change balances. There is no server net-worth or private cashflow calculation endpoint.

### Home

Home shows current financial summaries, a single combined cashflow series, category spending, and links into detailed activity. Empty-vault first steps, due-soon information, retry/error states, readable charts/tooltips, and plain-language copy support initial setup and routine use. Clicking a monthly chart value preserves that month in Activity. Clicking a category opens its matching activity; the synthetic Other bucket expands the category list instead of pretending to be a saved category.

The combined cashflow view counts posted and scheduled effects once under the matching rules below. It remains a derived view: opening Home never writes a balance or creates synthetic ledger transactions.

### Net worth, balances, and holdings

Users create, edit, and delete manual assets and debts with category, amount, balance date, and optional notes. Net worth presents balances and holdings as separate tabs, with row actions and account naming. Assets can represent cash accounts, property, vehicles, and other values; liabilities represent credit cards, loans, and mortgages.

Holdings retain quantity, basis, account grouping, valuation provenance, and position dates. Available market value is included in portfolio value. A supplied Fidelity market value is preserved exactly; when only value is supplied, per-share price is derived from value/quantity. Known cost basis can supply a provisional fallback, while unknown basis makes gains unavailable. Unknown gains do not erase otherwise known market value.

Freshness is based on the source's recorded balance, position, or market date. A quote more than three calendar days old is stale; missing and future dates have unknown freshness. Fetch time is not a balance date. There is no stored historical net-worth series. Users must avoid recording the same dollars as both a manual cash asset and a brokerage sweep: the product adds both and does not infer overlap.

### Fidelity import and public prices

Fidelity CSV import previews positions and existing-versus-replacement values per selected brokerage account, stages the replacement, verifies it, and then activates it. It preserves reported market values, optional market prices/dates, and cost basis independently. Import provenance remains separate from a later market quote. Replacement scope must be selected explicitly so unrelated accounts remain intact.

After unlock, bounded background refresh deduplicates public symbols from holdings and configured employers, including former jobs with stock history, while the per-user preference stays on. The accepted landing in [PR #322](https://github.com/Vivekpsps3/vivek-monorepo/pull/322) gives the Finance account menu and the one-time Home notice that same preference. Turning checks off persists for that user, and the next unlock sends no automatic quote. Manual Refresh still works. Opening stock research still does not fetch until Look up. The Home notice and About price checks use one ticker sentence. That pull request is not on main at `939984d`. Users can retry quotes, use one-off lookup, and perform Stock Lab research. Partial failures preserve saved prices. Manual valuations remain available for unsupported/private shares. Public market lookups disclose ticker symbols to the server/provider; the browser explains this privacy exception. Shares, balances, account names, basis, and scenario budgets remain encrypted.

### Spending: Activity

The posted ledger supports manual transactions and imported activity with dates, amount, direction, category, original description, normalized merchant, account identity, and optional transaction kind. Activity supports account/category/merchant/month/date-range filters, URL-preserved filters, browser back/forward, pagination, summary totals, CSV export, and opening a selected transaction.

Totals and exports use the complete matching ledger, even when only 100 rows are displayed. Blank merchants have an Unassigned merchant group; transactions with no account can be filtered explicitly. Merchant cleanup does not overwrite original source descriptions. Imported transactions retain receipt association and an edited marker when changed.

| Kind | Spending effect | Income effect |
| --- | --- | --- |
| Purchase | Adds spend | None |
| Refund | Reduces spend | None |
| Payment or transfer | None | None |
| Income | None | Adds income |
| Ambiguous credit | Excluded until classified | Excluded until classified |
| Legacy row without kind | Uses saved expense/income direction | Uses saved direction |

Deleting a transaction offers exact Undo with idempotent restoration. Failure remains visible and retryable. Receipt Undo has stricter ownership/value rules so it cannot erase edits made after import.

### Spending: Calendar

Calendar combines posted activity, dated job pay, fixed bills, and subscription occurrences. It shows selected-day details and links to Activity while preserving date/month context. Fixed bills use their due day, and subscriptions use their next-bill anchor. A scheduled bill already matched by a posted purchase is omitted from the duplicate projection. Grid/summary presentation and accessible tooltips help inspect individual dates rather than only monthly totals.

### Spending: Imports

Supported browser parsers are Capital One, Chase, American Express, Citi, Bank of America, and X Money (`capital_one`, `chase`, `amex`, `citi`, `bank_of_america`, `x_money`). Users attach multiple CSVs, choose a bank independently per file, preview diagnostics, map each source to a confirmed account, select rows, and commit encrypted transactions.

Preview reports parsed, new, duplicate, skipped, and error rows by filename. Deduplication checks saved data and the other selected files. Valid files can proceed despite another file's parse failures. Failed commits preserve selection; retry checks saved keys again. Stable source-account keys keep same-mask accounts distinct, and renames target an explicit account ID.

Encrypted receipts retain staged/completed/unresolved rows, account mapping, diagnostics, outcomes, and user-confirmed statement coverage. Users can resume a receipt or reattach a corrected CSV to replace only that file's staged rows. Raw CSV bytes stay local. Receipt chunks are bounded to 100 rows or 160 KB; checkpoints write at most 200 records. Missing staged row chunks require reattachment before activation/resumption.

Confirmed coverage is the date interval the user says the file represents, separate from observed first/last transaction dates. It is not proof of statement completeness. Receipt Undo removes only receipt-created transactions still matching their imported values, preserves changed rows with an explanation, and withdraws coverage. That withdrawn receipt cannot qualify a spending estimate as complete history.

### Recurring: jobs, compensation, bills, and subscriptions

Jobs record employer, base-pay unit, estimated taxes/deductions, start/end dates, enabled status, and optional annual bonus/equity/other estimates. Promotions preserve starting pay and apply replacement annual base pay from their dates. Optional payday schedules are weekly, biweekly, semimonthly, or monthly with a first-pay anchor; semimonthly pay also has a second day clamped to month end. No paychecks are inferred before the anchor. Without a schedule, base pay is an estimated monthly accrual with unknown individual dates.

Dated compensation payments retain kind, gross amount, and label. Stock grants record quantity, date, grant price, and partial sales with fixed cash proceeds. Employee-funded ESPP purchases retain employee-paid basis separately from market value and partial sales. Public employer tickers can supply dated quotes; a current manual price supports private/unsupported stock.

Compensation history groups employer names case-insensitively, includes former/inactive jobs, supports all-history/year/date ranges, labels future projections, and shows base, annual estimates, dated payments, stock change, sale proceeds, and remaining value. Starting base pay is preserved when promotions are added. Stock compensation is the period-to-period change in economic value after ESPP contributions; later years do not recount the entire award. Sales remain fixed when later marks change. Manual price saves replace older manual marks while preserving market quotes on other dates; manual price history is not a feature.

Users must avoid entering the same payout in both annual estimates and dated payments. Realized stock-sale cash counts on the sale date, including sales from disabled jobs; unrealized gains and grant value do not become recurring cash income or net-worth changes. Historical valuations obey acquisition, observed-date, and cutoff rules rather than applying future knowledge backward.

Fixed bills support amount, frequency, start/end bounds, and due day. Subscriptions support recurring amount and next billing date. Forms retain field-level validation and one authoritative pay schedule across responsive layouts.

### Combined cashflow rules

Observed cashflow is posted activity alone; scheduled cashflow is the full recurring projection. Combined cashflow reconciles both. Job pay and posted income within 20% count once using the larger figure; the smaller side appears as a negative undated aggregate adjustment, not a claimed one-to-one deposit match. A recurring bill within four days and 2% or $1 of a posted purchase counts once.

Home, Calendar, and finite-period Income summaries use the same engine. Income details show recorded income, scheduled pay, overlap adjustment, and combined total. Open-ended/all-history periods do not invent scheduled projections. Dates that are unknown remain unknown. This reconciliation does not create, change, or delete source transactions.

### Planning and projections

Planning organizes questions, portfolio growth, and stock research. Current facts name the records behind each figure: zero-value assets, debts, holdings, active jobs, bills, and subscriptions count, and inactive jobs, ended or future jobs, inactive bills and subscriptions, and inactive or staged holdings stay out under the same filters as the money totals. Take-home appears only when those active jobs record taxes or deductions. Otherwise the card says yearly pay before taxes and “Take-home: not set”. Undated prices still warn, with Check prices. Saved-input failures stay in their card and do not show internal source keys. This is on main as [`aebe5e7`](https://github.com/Vivekpsps3/vivek-monorepo/commit/aebe5e7997a12634ab171ad3c16b1a68b004939d) ([#320](https://github.com/Vivekpsps3/vivek-monorepo/pull/320)). Goal funding starts with zero already saved; debt payoff starts with zero manual debt until the user selects a liability. The app does not substitute total net worth for one goal or total liabilities for one debt.

Named encrypted profiles preserve assumptions. Live-source fields save as `null` and follow current facts on reopen; manual overrides retain their entered values. Income/spending defaults come from eligible jobs and recurring costs. Spending can instead use fixed + variable + irregular annual components or a manual annual total. Source edits refresh facts and mark prior results stale without silently rerunning them.

The variable-spending suggestion uses the last three completed browser-local months. Every selected confirmed account must have complete eligible receipt coverage for every day, checked by interval union. Users must select categories, can exclude recurring-charge transaction IDs, and must explicitly accept the suggestion. Refunds reduce the estimate; transfers/payments/ambiguous credits are excluded. A fully covered period with zero spend yields zero rather than “missing data.” Profiles retain the accepted period, receipt IDs, selected accounts/categories, exclusions, amount, and acceptance time.

A total annual net-cashflow override replaces income minus spending and any legacy extra contribution. Without it, legacy extra contributions remain additive. Growth allocation uses portfolio/gross assets, bounded to 0–100%. The straight-line retirement timeline excludes investment growth; Monte Carlo is a separate browser-local simulation. Baseline/scenario events use one shared seed for a comparable run, with events scoped to baseline, scenario, or both. Car-purchase/time-off templates start at zero for user-entered costs.

Portfolio projection compares a flat contribution with a chosen dollar increase, and presents an answer plus chart/table. Rate controls display percentages and save decimals. Stock Lab saves encrypted symbol comparisons, budgets, quantities, target prices, dividend/return assumptions, and horizons; only public ticker research goes to the market service. Monte Carlo runs are ephemeral, not saved server records. No planning tool changes financial facts.

### Budget-kept integrations

Finance exposes bounded weekly and per-day budget-kept projections through its public API for Treasury, World chests, and Pixels. Consumers receive the approved projection, not raw transactions or a second private store. Locked, no-plan, no-data, expired, unavailable, and canceled states stay distinct. Finance budget weeks and Town habit-streak weeks have different semantics and must not be substituted for one another.

## Travel

### Trip creation and itinerary

Create a trip with departure/return dates and an initial destination. Dates are inclusive; reversed ranges are rejected, and same-day/one-night trips have explicit wording. Destination changes start on the first date in the next city. The trip opens as a day-based itinerary, with an optional editable trip name.

Add/edit cities, transport, daily plans, parking, reminders, notes, and extra costs in their relevant context. Optional editors appear when needed. Home surfaces open reminders, necessary unbooked parking, and PTO overlaps. Transport, plan, and parking costs roll up; extra budget rows represent additional costs. Costs remain separate by currency rather than becoming an invented converted total.

Save failures retain drafts, and route/document exit guards protect unsaved work. Creation retries reuse a database-backed owner/request key across restarts and concurrent submissions; omitting that key intentionally creates a separate trip. Trip deletion requires confirmation and removes children and its leave usage. Individual row deletion supports snapshot-based Undo and explicit restore retry.

### Flights and places

Flight number/date lookup uses server-side FlightAware AeroAPI credentials and bounded requests. Multiple matches require selection. Scheduled, estimated, and actual times remain separate, with local timezones, offsets, and date-line context. Manual overrides survive lookup; Use flight schedule deliberately resets them. Missing credentials, provider authentication, throttling, timeout, and no match are separate outcomes from an expired suite session.

Place resolution requires explicit search and selection; ordinary trip reads never geocode. Nominatim requests are identified, paced at an aggregate one second, and cached with separate positive/empty expiry. Leaflet maps use the app-owned DOM adaptation compatible with Trusted Types. Failed tiles/library loads keep a textual place list and recovery. Theme changes update map presentation. Tile requests disclose the site origin as Referer rather than private trip paths or queries.

### Calendar and leave allocation

Calendar, trip details, home summaries, and leave forecast share dated PTO charges. Each trip day stores 0, 0.5, or 1 day: weekdays default to 1, weekends to 0. Switching trip PTO off retains choices. Date edits preserve intersecting selections and default new dates. Overlaps show dates and trip labels instead of silently merging allocations.

Migrated custom aggregate leave totals stay explicitly unallocated until the owner confirms dated allocation. Zero and fractional legacy totals remain preserved; migration never guesses which dates they represented.

### PTO and sick leave policies

The PTO screen manages separate PTO and sick buckets using hours, with configured hours per workday for day equivalents. History and projection share one chart and one Balance by month table. The plot uses the existing `/pto/series` points: PTO circles and the accent color, Sick squares and series-2, solid history and dashed projection meeting at Today, and a below-zero band. A failed series request shows “Couldn't load the balance chart.” with Retry and leaves the tiles and forms usable. Policy save, entry save, and a return from Hours in a workday each refresh that one chart. Exact balances stay in the server leave engine. This is on main as [`1b5a133`](https://github.com/Vivekpsps3/vivek-monorepo/commit/1b5a133aac38220fd9924266db7bb6c46443c424) ([#326](https://github.com/Vivekpsps3/vivek-monorepo/pull/326)). The screen still shows current balances, horizon balances, cap status, leave entries, and a preview of balance before/after planned leave. Negative projections are surfaced rather than hidden. History distinguishes trip-linked leave and manual entries.

Policy editing includes starting balance/as-of date, accrual amount/cadence, cap, and carry-forward behavior. Accrual begins after the end-of-day starting balance: annual/365, monthly ×12/365, semimonthly ×24/365, biweekly /14, weekly /7, converted using the configured workday length. Caps pause accrual while reached. A configurable policy-year start controls rollover. With carry-forward off, positive unused hours reset to zero at that boundary; negative balances are not forgiven. Reset/carry rules and historical policy records belong to the server's leave engine, and chart points come from that engine. Policy removal preserves historical entries and conflict behavior.

Manual/legacy aggregate leave retains recorded start-date charging; dated trip allocation charges its actual selected dates. Leave forecasts are planning estimates rather than payroll records. Travel spending and leave never alter Finance balances, ledger, or net worth; cross-app spending context uses the existing integration boundary.

## Media

### Library, Now, and manual entry

The journal supports movies, series, books, games, artists, albums, and songs. Now surfaces continuing activity and favorites; Library offers kind/status/favorite/tag filtering, title/rating ordering, counts, and pagination. SQL performs filtering/counts and Unicode ordering, with page-bounded relationship/progress reads. Tag matching casefolds Unicode without rewriting saved spelling; users can filter by up to ten tags. Back clears a pending library filter, so a debounced type or search change does not request `/media/api/library` again after that navigation. Search, tags, favorites, clear, focus, and Add validation stay on the existing helpers. This is on main as [`8201296`](https://github.com/Vivekpsps3/vivek-monorepo/commit/82012961e85eb5d43c05caab0d151d2804b2f3fa) ([#321](https://github.com/Vivekpsps3/vivek-monorepo/pull/321)).

Users can save provider search results or create a manual entry. Personal records carry state, a 0–10 rating in half-point steps, progress/unit, note, favorite, and anticipated flags as applicable. States include Want to, Anticipating, In progress, Completed, Paused, and Dropped. Artists use Following/Unfollowed rather than listening progress. A zero rating is meaningful; clearing means unrated.

Following an artist does not save every album/song. Saved children appear in a collapsed expansion; explicit discography browsing is separate. Albums and songs require their own saves, and unfollowing/removing the artist preserves independently saved music. Shared catalog identity is separate from each owner's membership, rating, note, progress, experience history, and artwork override.

### Search and metadata

Provider search is transient and does not write query history or library rows to SQLite. A bounded process cache limits age, entries, bytes, and in-flight work. Results rank by relevance before the cap and support Previous/More results. The UI identifies type/query, source coverage, partial failure, missing configuration, timeout, throttling, no results, and retry.

| Source | Implemented role |
| --- | --- |
| TMDB | Movie/series metadata using a server key; public movie-search fallback without one |
| TVMaze | Keyless series discovery and explicit episode refresh |
| MusicBrainz | Artist/album/song identity and explicit discography with pacing |
| Cover Art Archive | Album artwork by release identity |
| Open Library | Books, editions, and covers |
| RAWG / Steam | Keyed game discovery or keyless Steam fallback |
| iTunes Search | Additional movie discovery when `MEDIA_SCRAPE_MODE=1` |
| Wikimedia Commons | Explicit artist portrait discovery/selection with attribution |
| Wikidata | Explicit movie sequel/spin-off calendar discovery |

Saving hydrates metadata by stable provider identity. Same-name works remain separate when source identities differ. Saved library/detail/summary reads are database-only and remain usable without provider keys or during outages. They do not silently repair MusicBrainz history. Explicit album refresh resolves that album's release group with a deadline; unresolved metadata stays pending without losing the saved title or personal data. Pressings and release groups remain distinct identities. Ordinary reads never repair another owner's saved entry.

### Detail editing and recovery

Detail separates catalog facts and personal edits. Explicit Save changes sends only changed fields and checks the saved review base for conflicts. Typing after a save begins remains on the form. Failure retains editable input. Route guards protect unsaved changes.

Up to ten per-tab drafts are scoped to the signed-in owner. Matching-version drafts can restore locally; stale drafts require Restore/Discard. Restoring never sends data until Save. Sign-out/expiry clears private drafts. Removal and bulk-progress Undo preserve operation ownership so recovery does not overwrite later edits.

Artist portraits use explicit Commons search, preview, selection, source/license attribution, and reset. Broken candidates cannot be selected. The server resolves a trusted source identity instead of fetching an arbitrary browser-supplied URL. Overrides belong to one owner and reset reveals the shared catalog artwork.

### Series and episode progress

Shows retain episodes/seasons, season ratings, personal watched marks, and lifecycle state. Mark next episode uses the expected episode identity; competing writes return conflict rather than silently marking another episode. Ordinary watched writes and next-episode writes share the same underlying ownership policy.

Mark caught up includes known aired episodes once, excludes specials unless requested, and excludes future/unknown dates. Unknown-date episodes can still be handled individually. Undo changes only marks still owned by that operation, preserving later manual edits; repeat catch-up/Undo is idempotent. No metadata does not establish completion.

Production lifecycle (ongoing/ended/canceled/unknown), metadata freshness/completeness, and personal completion are separate. Explicit refresh reconciles provider episode identities without losing marks. Newly aired episodes return to Now/Hub and detail/library progress after prior catch-up. A manual show can link to an explicitly chosen provider identity; title alone never selects a match.

### Calendar and partial implementation boundaries

Calendar GET uses saved/cached data. Explicit refresh performs provider work outside the write transaction; previous dates remain visible if refresh fails. Episodes use browser timezone. Month/year-only movie dates occupy an imprecise band rather than an invented day. Anticipation and discovered follow-ups are separate from personal library membership.

Some later Media work supplies tag editing, related-item, rating, and discovery model helpers ahead of complete component wiring. The existence of `tag-model`, `related`, `rating-model`, or `popular` helpers does not establish a finished screen. The current library tag filter is wired; the detail form still uses its existing rating input and does not expose a complete tag/related editor. Treat commit packet names as implementation history, not proof of a shipped UI.

## Town and Health foundations

### Habits and growth

Town is a personal visual projection with a name, founding date, XP, level progress, fixed buildings, and habit lots. First run invites the user to choose a habit, including suggestions; Media/Travel contributions start from founding rather than inventing earlier activity. The scene uses an app-owned sprite set and discrete building stages.

Users create/edit habits, choose cadence, assign available lots, check in, undo, and inspect history through dialogs. Today shows actionable habits with announcements. Cadence changes and archived streak runs preserve history; name normalization/uniqueness and input bounds are server validated. The server's clock owns local-day check-in eligibility, calendar rules, XP, streaks, and levels. The client displays that result instead of maintaining a competing ledger.

Current Town tuning awards 10 XP for a manual check-in, 5 per eligible Media episode, 10 for finishing an eligible movie/series/book/game, 5 for a travel reminder, 30 for a completed trip, and 10 for the seven-day streak event. Library/Inn daily XP caps are 10/15. Town level thresholds are 0, 100, 250, 500, 900, 1,400, 2,000, 2,800, 3,800, and 5,000; six habit lots unlock at levels 1, 1, 3, 5, 7, and 9. These are source tuning values, subject to the server's eligibility/history rules.

The Library and Inn reflect eligible Media/Travel activity. Treasury uses Finance's approved weekly budget-kept projection, with a visible locked state and no raw monetary evidence in server Town payloads. Habit streak completion and budget-kept completion use their own distinct week rules. Workspace has a Town summary card; the page links to World. Loading, first-run, unavailable, and expired-session behavior is explicit.

### Encrypted Health groundwork

Implemented Health foundations include `health_stats` and `health_prs` vault collections, typed records for weight, resting heart rate, blood pressure, sleep, lab results/checkups and lift/run/custom personal records, unit conversion, validation, personal-record events, XP/badge/stage calculations, revision-aware encrypted persistence, and a narrow stage-only public integration. Approved outputs can represent clinic/gym stages; underlying measurements, records, XP, and counts do not cross that stage-only API.

Lock/account changes invalidate pending loads, saves, deletes, and returned plaintext after asynchronous stages. Unsupported/corrupt rows and revision conflicts must remain recoverable. Health uses a narrow public vault capability rather than importing the entire Finance store.

**There is no standalone Health route or complete Health entry screen in this snapshot.** These foundations must not be described as an available end-to-end health tracker or proof that clinic/gym interactions are fully wired into Town.

## World and concepts

World is an accessible, week-based explorer at `/town/world`. A deterministic engine uses canonical inputs, seeded generation, and golden vectors so the same supported inputs generate the same world. The visible page combines habit history, trips, finished-media content, concepts, and private Finance-derived chest eligibility through separate projections.

Controls step backward/forward by week, jump to a date, return to today/Town, switch map/list mode, and toggle Lit Map/fog. Pointer/keyboard camera navigation, responsive layout, reduced motion, theme redraw, arrival focus, a textual week panel, and a list alternative make information available beyond the decorative canvas. Older weeks can be loaded explicitly. Loading/retry behavior separates Town failures from World content failures.

Concepts have a name, optional note/source, and optional understood date. Users create/edit, mark understood, undo, change date, archive/unarchive, and delete with confirmation. Tabs separate Not yet, Understood, and Archived. Source text can be copied without turning arbitrary entered text into executable content. Understanding dates are bounded by the server-provided current day. Changes invalidate affected concept/world projections.

Lit Map uses understood concepts to affect the lit/fog presentation. Budget chests are joined locally from Finance's public budget projection after unlock; lock clears private chest content, and unavailable budget work offers retry without exposing underlying amounts. World leaves/reentries and owner changes invalidate the prior controller; a timed-out result cannot publish later. World is an activity visualization, not a multiplayer or arbitrary world-editing game.

## Pixels

### Year

Year represents calendar days as activity squares with a shared pure score engine. Town, Media, and Travel contribute owner-scoped server activity counts; Finance's budget-kept days join locally. Intensity and dominant-source color modes explain activity without uploading Finance amounts or account names. The daily score is `min(Town, 3) + min(Media, 3) + 2 × min(trip, 1) + min(Finance, 1)`, with a maximum of 9; locked/no-plan Finance contributes zero to scoring while retaining its separate status. Daily levels 1–4 begin at scores 1, 3, 5, and 7. Dominance compares capped weighted contributions, breaking ties in Travel, Town, Media, Finance order. Raw activity counts remain separate from the capped score. Future days, empty history, unavailable sources, no plan, locked vault, and session expiry remain distinct.

Users change year, inspect summary statistics, select a day, and view a detail panel (a dialog sheet on phones). Detail explains each source and links to Town, Media, a relevant trip, or Finance unlock. A table alternative provides equivalent date/activity access. Keyboard grid navigation, focus restoration, legend text, and live announcements support non-pointer use. Route/query state and browser navigation retain the selected view context.

### Life

Life shows one square per week since the stored birthday, with rows for life years, partial spans, leap-day handling, and a selected-week detail. Each life-year row has 52 cells: the first 51 contain seven days and the last contains the remaining eight or nine. The poster has at least 90 rows; this is display geometry, not a lifespan prediction. Week intensity sums daily scores, with levels starting at 1, 8, 18, and 30; a separate Sunday-week helper must not replace birthday-relative life spans. It supports a poster/table switch, keyboard movement by week/year, decade jumps, row endpoints, and a jump to the current week. Legends distinguish activity intensity, lived weeks without suite data, future weeks, this week, and recorded/planned trips. Trip listings retain titles and dates when available.

Birthday is required for the age-based view; the empty state links to Profile. Show my age controls displayed age without deleting birthday. Owner-only birthday writes and logging controls avoid leaking submitted dates through SQL errors or client-error frames. Missing sources have independent banners/retry; the suite does not invent historical activity before records exist. Life is a retrospective/planning visualization rather than a life-expectancy prediction.

### Aggregation and Workspace

The Pixels data service bounds work across requested windows, joins eligible sources, and rejects obsolete owner/route responses. Hub uses a smaller projection without unnecessary birthday/profile and trip-title attachment. That 13-week miniature has one date action for pointer and keyboard: one tab stop, arrow keys move inside the strip, and Enter or a click opens the same `/pixels?year=&day=` URL, including a future day. Hidden clickable cells are gone. Cells cap at 22px so the grid stays within 180px, and the Open Pixels link is unchanged. This is on main as [`71c11f6`](https://github.com/Vivekpsps3/vivek-monorepo/commit/71c11f6ee731dc55111dee1cccc8b14cd11e5c1c) ([#325](https://github.com/Vivekpsps3/vivek-monorepo/pull/325)). Source failures do not convert healthy contributions into an all-or-nothing error. Score/date guards cover century leap rules, negative values, row counts, and span edges.

## Public portfolio

The public site contains Home, Work, About, and Secrets, with route-specific titles and descriptions and a Workspace entry. Home presents the portfolio; Work presents selected engineering projects; About covers background, experience, education, and skills. Public rendering does not load private account tracking data.

Secrets is an interactive browser-only ECDH key-agreement and authenticated AES-GCM encryption demonstration. It uses local WebCrypto and escaped presentation; it does not provide a server-held secret vault. Five public routes are prerendered in the root production build. The old Me app and blog destination are not current product surfaces.

## Security and data ownership

| Data | Storage/computation boundary |
| --- | --- |
| Finance balances, ledger, account masks, compensation, assumptions, Health values | Browser plaintext; encrypted vault records on server |
| Sessions, account identities/roles, challenges, sync revisions, blind indexes | Server authentication/sync metadata |
| Travel trips/leave and Media personal records | Owner-scoped application data in the shared database; not Finance-style end-to-end encryption |
| Town habits, World concepts, activity counts, birthday/profile | Owner-scoped server records/projections |
| Public market/catalog metadata | Server/provider-visible, with source/cache rules |
| Ticker quote/research requests | Deliberate symbol disclosure; private position and scenario values stay encrypted |

The browser generates a random per-user AES-GCM data key and signing keypair. Passphrase-derived wraps use PBKDF2-HMAC-SHA256 (new wraps at least 600,000 and at most 5,000,000 iterations); compatible older wraps upgrade after unlock. A non-extractable CryptoKey is stored in IndexedDB with owner checks for reload persistence. Legacy raw-key localStorage migration removes the old item. HKDF-derived HMAC keys separate blind-index use from data encryption; resumable background reindexing handles legacy index compatibility.

Lock/sign-out remove the active local key and clear decrypted projections. Expected revisions, collection/session eligibility, generation checks, and authenticated record formats guard sync and asynchronous publication. The server stores ciphertext and metadata and does not compute over private Finance amounts. No recovery-key or admin password-reset path can recover lost vault secrets.

Security is server-blind storage, not protection against a malicious server replacing the delivered JavaScript, a compromised browser, or allowed same-origin script abusing an unlocked key. Domains currently share an origin; a Finance subdomain split remains future work. The non-extractable key prevents raw export but does not stop authorized script from using it.

Production middleware supplies per-response CSP nonces, strict script policy, Trusted Types in the private app, anti-framing, referrer/content-type protections, and bounded CSP reporting. Provider calls keep credentials server-side, bound waits, and release database transaction ownership before network I/O. Domain authorization checks ownership even for guessed IDs. Startup rejects unsupported/unmigrated database states without opportunistic schema changes.

See the authoritative [security model](docs/SECURITY_MODEL.md) for protocol details, caveats, and any future origin-cutover procedure.

## Delivery, operations, and verification

One root production build ships the public prerenders, private application, and release manifest in one image. Root Compose/Dockerfile are supported deployment owners. CI tests the source. Deploy rebuilds from the candidate SHA rather than promoting the byte-identical CI image. A manual run uses the latest same-repository push CI run for that SHA, so a newer failure overrides an older success. The SHA must still be current main, and the Seeded schema rehearsals step must have succeeded. Fork pull requests and unsuccessful CI do not deploy. Unmodified fork pull requests stay on GitHub-hosted runners; this landing did not change that routing expression. This is on main as [`8b9f099`](https://github.com/Vivekpsps3/vivek-monorepo/commit/8b9f0998abecac065887230a8e1a2257f6b2a496) ([#323](https://github.com/Vivekpsps3/vivek-monorepo/pull/323)). It does not prove an off-host backup destination or an alert recipient, and a merge is not a deployment. Temporary deployment checkouts supply versioned Compose configuration and are removed afterward. Development data lives under `.local/`, apart from production.

Unified offline Alembic migrations own `site.db`. Startup checks schema readiness without applying migrations. Adoption/upgrade preserves users, ciphertext, and supported histories; legacy plaintext Finance/password-only accounts block unsafe cleanup. Compatible rollback revisions are explicitly declared. Database backups, verification, recovery/restore, route checks, health checks, and monitoring belong to the operations workflow. Backup retention and restore steps are defined in the linked operations documents rather than inferred from old commits.

Quality capabilities include documentation/link checks, guidance budgets, shared-boundary checks, migration-preservation tests, script tests, Ruff/mypy and ESLint ratchets, Python coverage floors, Angular Karma coverage suites, Node tests for pure/runtime helpers, and domain Playwright journeys against the production bundle. Discovery checks fail when a browser spec is omitted. Isolated workers and deterministic suite clocks prevent shared state and real-time date changes from invalidating acceptance tests.

Supported setup is `make install`, `make build-frontends`, and `make dev`. Use [Development](docs/DEVELOPMENT.md), [Quality gates](docs/QUALITY.md), [Operations](docs/OPERATIONS.md), and [Migrations](docs/MIGRATIONS.md) for exact commands and requirements. Listing a test or having a test file is not evidence that it passed on a particular release.

## Implementation boundaries and exclusions

- The original Me/calendar-vault agent application is retired; its historical entries in Daily versions do not describe the current suite.
- Plaintext Finance HTTP, server-side transaction/import/planning calculations, tax-document storage, and password-only legacy enrollment are retired current-runtime paths. Historical migration code remains where needed for safe adoption.
- Automatic bank aggregation is not implemented. SimpleFIN is discussed as a future direction; Plaid placeholders do not establish a working integration.
- There is no stored net-worth history, automatic cash-overlap deduplication, saved Monte Carlo run archive, or automatic currency conversion for Travel totals.
- Finance name matching in unified search, complete Health entry screens, and all Media helper-backed editors are not complete user workflows in this snapshot.
- Provider-dependent actions require usable credentials/network or the stated fallback. Database-only saved reads should remain useful during provider outages.
- Public portfolio details, dates, balances, and activity projections describe saved data; they do not prove production deployment, financial reconciliation, payroll accuracy, or absence of defects.
- Roadmap issues, review documents, completed project records, and reserved schema fields are evidence/planning inputs, not additional shipped features.

## Source guide and maintenance

| Concern | Authoritative entry points |
| --- | --- |
| Route composition | [Web routes](apps/web/src/app/routes.ts), [Finance routes](apps/finance/frontend/src/app/app.routes.ts), [Travel routes](apps/travel/frontend/src/public-api.ts), [Media routes](apps/media/frontend/src/public-api.ts), [public routes](apps/site/src/app/app.routes.ts) |
| Finance rules/imports/planning | [Data model](docs/DATA_MODEL.md), [frontend behavior](docs/FRONTEND.md), [Finance owner](apps/finance/AGENTS.md) |
| Travel/leave | [Travel behavior](docs/TRAVEL.md), [Travel owner](apps/travel/AGENTS.md), [leave engine](apps/travel/backend/services/leave_math.py) |
| Media/catalog | [Media behavior](docs/MEDIA.md), [Media owner](apps/media/AGENTS.md), [detail form](apps/media/frontend/src/detail.component.html) |
| Town/Health | [Town owner](apps/web/src/app/town/AGENTS.md), [Town screen](apps/web/src/app/town/town.component.html), [Health stage API](apps/web/src/app/town/health/index.ts) |
| World | [World owner](apps/web/src/app/world/AGENTS.md), [World screen](apps/web/src/app/world/ui/world.component.html), [concept editor](apps/web/src/app/world/ui/concept-sheet.component.html) |
| Pixels | [Pixels owner](apps/web/src/app/pixels/AGENTS.md), [routes](apps/web/src/app/pixels/pixels.routes.ts), [score engine](packages/ui/pixels/pixels-score.ts) |
| Shared search/settings | [Search implementation](apps/web/src/app/search/search-dialog.component.ts), [settings registry](apps/web/src/app/settings/settings.registry.ts) |
| System ownership | [Architecture](docs/ARCHITECTURE.md), [lifecycle](docs/LIFECYCLE.md), [security](docs/SECURITY_MODEL.md) |

Update this reference when visible behavior or consequential data rules change, verify the relevant source owner, and update the snapshot commit/date. Keep dated integration history in [Daily versions](DAILY_VERSIONS.md). This inventory explains the whole product; focused domain and operations documents retain authority for implementation and commands.
