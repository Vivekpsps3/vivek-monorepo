# Sidequests — discovery design

Parent [#194](https://github.com/Vivekpsps3/vivek-monorepo/issues/194).
Discovery leaf [DISC-01](implementation/completed/issues/DISC-01.md) / [#264](https://github.com/Vivekpsps3/vivek-monorepo/issues/264).
Evidence: [DISC-01](implementation/evidence/DISC-01.md).

Status: design only, read from `origin/main` `0022c5ef8065e08892b6eecdfa6450158ee69ef6`.
This page accounts for the parent proposal. It does not approve implementation,
add a queue entry, or close #194. The [execution queue](implementation/README.md)
remains the only work order.

The concept this design fixes is the parent's first complete version: a private
cabinet of self-chosen experiences, fed by a small bundled deck and ideas the
user writes. Personality, stamp metaphor, and which home ritual leads stay
unresolved below. Those are owner choices.

## Journey

Two paths are both available. The parent says both must be possible. Which one
leads the home screen is unresolved, so neither is given primary emphasis here.

**Pick.** Saturday, the user opens `/sidequests`, chooses the rough bands
"An hour", "Low energy", and "Free", and sees at most three invitations:

- A different way home
- A tiny museum
- A kitchen detour

Each card is an invitation. It does not claim opening hours, availability, or
price. The user can ask for three others, open the full list, write an idea,
save one for later, or leave. Leaving creates no overdue item.

Later the user marks that idea complete, picks the civil date it happened, and
may add one sentence ("Found a courtyard I had walked past for years."). The
chosen stamp is stored on that attempt. Next month the cabinet still shows
that memory.

**Capture.** From home the user records something already done: write the idea,
set the attempt status, pick the date, optional sentence, optional stamp.
The same cabinet row appears. A completion still requires the user to say so.

Nothing on either path assigns a week, posts a notification, or marks a miss.

## Screens

Authenticated private route `/sidequests`, composed by the shell the way
Travel and Media are composed. Direct load, refresh, and browser history stay
on this route. Unlock uses the existing Finance vault unlock with
`next=/sidequests`. There is no second passphrase screen.

1. **Home.** Title "Sidequests". Two peer actions: "Pick a card" and "Capture something I did". Filter controls for time, energy, and cost, each clearable. A draw region with zero to three cards. Actions: "Show three others", "See the list", "Write your own". Short line when the pool has fewer than three eligible cards, including when it has none. No due date, streak, or score.
2. **List.** Every eligible card and active idea in the same order the draw uses. Works with animation and dragging turned off. Choosing a row opens the card.
3. **Card.** Title, optional description, bands, category, optional source link. Actions: "Save for later", "Start", "I did this", "Put it down". Copy states that the card is an invitation.
4. **Idea editor.** Required title. Optional description, category, three bands, one source link, and the optional "first" label. Archive and delete. Delete states what will be removed and what remains if the request fails.
5. **Attempt.** Status, civil date, optional sentence, stamp choices with a text name for each. Completing asks for a date. An unfinished attempt may omit the date and may still keep a sentence. Undo completion returns the attempt to the status the user picks and refreshes the cabinet.
6. **Cabinet.** Memories by category and by civil date, plus the same rows as a plain list. Open and edit. Empty cabinet uses the sentence "Something you've always meant to try?" and a create action that opens the idea editor.
7. **Locked.** Personal titles, notes, links, and drafts are absent. Unlock stays on this route via `next`. The bundled deck has no personal text and may remain visible. Logout and account switch clear the same personal state.

Shared theme, focus, fields, and dialogs come from `@vivek/ui`. Light and dark follow `suite-theme`. Layout is checked at 390 and 1280. Reduced motion still shows every stamp, action, and memory. Stamp controls are buttons with accessible names, reachable from the keyboard, and focus returns to the control that opened a dialog.

Finance dashboard density, charts, and metric strips do not apply. The parent's suggested field-notebook look is an unresolved visual choice beside the metaphor question.

## Draw rules

The bundled deck is a versioned static module in the future Sidequests app.
It contains the three invitation cards above and the seven starter cards in
[#194](https://github.com/Vivekpsps3/vivek-monorepo/issues/194). It contains no
personal data and no network fetch.

Eligibility is a pure function of the active filters, the deck version, and
active ideas:

- Filters are conjunctive. A selected band matches only a card that carries that band. A missing band does not match an active filter. With no filters, band-less cards stay eligible.
- Archived ideas are out of the draw. Attempts are never cards.
- Sort bundled cards in deck-file order, then active user ideas by `client_id`.
- Show at most three. "Show three others" advances one window of three, wraps, and skips a window already shown in this draw. When the pool has fewer than three, or the next window would only repeat, the screen explains that and does not invent cards.
- Adopting a bundled card writes one idea snapshot (title, description, category, bands, `deck_id`, `deck_version`). A later deck edit does not rewrite that idea or its stamps. Drawing the same `deck_id` again opens the existing idea. Starting it again adds an attempt.

The closed list of band labels, and which starter cards carry "An hour",
"Low energy", or "Free", is an owner choice. The Saturday example is the
worked filter. The app does not infer a band from Finance, Health, location,
or browser activity. The starter deck avoids weight or fitness targets, risky
dares, and spending pressure.

## Records and data flow

One future vault collection, `sidequests`, schema version 1. Kinds live in
ciphertext. The server keeps storing opaque `/api/vault/*` rows in the
existing `encrypted_records` table. This design adds no table, migration, or
plaintext recommendation API.

```text
bundled deck (static, no personal fields)
  -> pure eligibility and draw
  -> adopt writes an idea snapshot

idea / attempt editor
  -> Sidequests codec in the future apps/sidequests owner
  -> openVaultRecords encrypt and decrypt
     (owner id + lock generation checked around the call)
  -> existing /api/vault ciphertext

lock, logout, account switch
  -> drop decrypted ideas, attempts, personal cards, and drafts

source id inside an idea
  -> later narrow public read of that Travel trip or Media library entry
  -> missing or deleted target leaves the idea and shows the link as unavailable
```

`SidequestIdea`

| Field | Rule |
| --- | --- |
| `kind` | `"idea"` |
| `title` | Required, non-empty |
| `description` | Optional |
| `category` | Optional. Cabinet groups a blank category as "No category" |
| `time_band`, `energy_band`, `cost_band` | Optional user choices. Never inferred |
| `source` | Optional `{ owner: "travel" \| "media", id: number }` or null |
| `shelf` | `"active"` or `"archived"` |
| `origin` | `"user"` or `"deck"` |
| `deck_id`, `deck_version` | Set when adopted from the deck; otherwise null |
| `first_label` | Optional user label. The app never sets it from history |

`SidequestAttempt`

| Field | Rule |
| --- | --- |
| `kind` | `"attempt"` |
| `idea_id` | `client_id` of the idea |
| `status` | `"saved"`, `"started"`, `"completed"`, or `"set_down"` |
| `civil_date` | `YYYY-MM-DD` or null. Required when completed. The user picks it. Vault `updated_at` is not the experience date |
| `note` | Optional sentence |
| `stamp` | Null, or `{ style_id, motif_id, label }` captured at selection |

Identifiers follow the existing vault client-id and ciphertext limits. One
attempt is one vault row with its own revision. A repeat is a new attempt
row. Undo edits that row. Saving one record must not replace the other.

Unknown `schema_version` stays sealed, appears as unsupported, and is still
exported. A failed delete or a conflict leaves the last good row in place and
keeps the open draft in memory until lock, logout, or account switch. Drafts
are not written to `localStorage`, the URL, or logs.

A Travel reference is `Trip.id` for the signed-in user. A Media reference is
`UserEntry.id` (the owner's library row), not a shared `CatalogItem`. The
idea stores the id only. Notes, ratings, itineraries, and costs stay with
their owners. Title lookup, when a later leaf adds it, goes through that
app's public API. Today's Media and Travel public modules export routes, not
a record lookup.

## Reuse

| Need | Owner to reuse | Leave alone |
| --- | --- | --- |
| Session and login | Server identity and the existing passwordless session | A Sidequests account or passphrase |
| Ciphertext, revision, AAD, owner, lock generation | Finance `openVaultRecords` / `VaultRecordCapability`, `/api/vault/*` | A second crypto stack or event bus |
| Which names Finance decrypts | Finance bags stay the current finance list. Health stays `health_stats` and `health_prs` | Putting `sidequests` in either subset |
| Collection allowlist | `CollectionPolicy` in `encrypted_storage.py`. Recovery membership is the union of owner subsets | A second recovery list or a new database |
| Unlock and lock | `/finance/vault/unlock?next=`, `lockFinance`, `LOCK_SIGNAL` | A Sidequests vault |
| Theme, fields, dialogs, focus | `@vivek/ui` and `suite-theme` | A new component kit or chart dashboard |
| Route mounting | `apps/web/src/app/routes.ts`, `apps/web/routes.json`, private-layout app links, `authGuard` | Shell-owned experience rules |
| Trip link | Travel `Trip` for that user | PTO math, costs, or a copied itinerary |
| Library link | Media `UserEntry` for that user | Catalog copies, provider IO, ratings |
| Dates | Calendar date, same shape Travel already stores | A timestamp treated as the day the user meant |
| Habits, learning notes, scores | Town, World, and Pixels keep their current facts | XP, habit credit, or a concept notebook for an attempt |
| Account removal | Existing user cleanup of `encrypted_records` | A side file that cleanup can miss |

Current policy has two disjoint owner subsets, Finance and Health, and
recovery is their union. A future Sidequests collection is a third disjoint
owner. Finance must not decrypt it. Health must not decrypt it. That policy
change is an implementation leaf. This PR does not make it.

This design was read on base `0022c5ef`, where recovery membership is the
finance/health union. [SEC-05](https://github.com/Vivekpsps3/vivek-monorepo/pull/362)
later merged to `origin/main` as `c461fe791251b13e02a05911531246f01f0e8290`.
That pull request states export follows the server owner policy, including a
newly registered collection, without a second export list. This branch does
not take that diff. Restore is still a later security leaf, and parent #121
is open. Writable Sidequests rows wait until restore covers this owner. The
collection leaf must re-read the merged policy before adding a name. #125
continues to own operational backup. This design does not fork a recovery
format.

No `apps/sidequests` tree, route, or collection name exists on this base.
Nothing to delete. Do not add a scaffold, sample store, or second write-up
of this proposal in the queue.

## Requirement disposition

`first version` means the future implementation slice described here.
`later candidate` means the parent kept it and this design does not put it
in that slice. `unresolved` means the owner still chooses. `excluded` means
the parent already put it outside the first version.

| Clause in #194 | Disposition | Reason |
| --- | --- | --- |
| Private cabinet of experiences the user chooses to try, with a stamp and a memory | first version | This is the concept the screens and records implement |
| Town answers upkeep, Pixels answers when, World remains the history explorer | first version | Those apps keep their facts; Sidequests does not import them |
| Proposal authorizes planning, not implementation or deployment | unresolved | The owner has not selected the app for implementation |
| Separate from the nine committed delivery stories | first version | This PR adds no queue entry and does not reorder work |
| 2026-11-08 sentence that the next build remains #84 | excluded | Dated status, not a Sidequests requirement. Live order stays in `queue.json` |
| Saturday bands and the three named invitation cards | first version | Worked pick journey |
| Redraw, save for later, write your own, or close | first version | Home and card actions |
| Nothing becomes overdue | first version | No due date exists on an idea or attempt |
| Complete later, user-chosen date, optional sentence, stamp joins the cabinet | first version | Attempt and cabinet |
| Memory still present next month | first version | Vault row, not a session cache |
| Cards are invitations, not hours, availability, or prices | first version | Card copy and deck content |
| Bundled deck plus user-written ideas | first version | Static deck plus idea snapshots |
| No location tracking or external recommendations | excluded | Parent bars them from the first version |
| Object is a self-chosen experience or experiment with an optional memory | first version | Idea plus attempt |
| Not a habit, itinerary, deadline, weekly reflection, or media review | first version | Those stay with Town, Travel, and Media |
| A sidequest can be valuable once; a trip may contain one; a trip is optional | first version | One attempt is enough; source link is optional |
| Town Hall keeps weekly reflection; a review may link later | later candidate | The link is the parent's later integration, not the cabinet |
| World keeps learning notes; a making attempt is not a second notebook | first version | The attempt stores the try and the sentence |
| No universal XP; a quiet attempt counts the same; "first" is an optional label | first version | No score field. `first_label` is user-set only |
| Intentional repeat is welcome | first version | A new attempt row; the earlier attempt stays |
| Idea create, edit, archive, delete | first version | Idea editor and shelf |
| Title plus optional description, category, bands, and one Travel or Media reference | first version | Idea fields |
| References are links, not copied records or a new cross-app ledger | first version | Id only, resolved later through the source public API |
| Date, cost, and reference are optional on the idea | first version | Completion date lives on the attempt, and only then is it required |
| Versioned local deck and saved ideas | first version | Deck module plus `deck_version` on the snapshot |
| Explicit filters, at most three cards, list alternative, "Show three others" | first version | Draw rules |
| Choose only eligible cards; explain a short pool | first version | Draw rules |
| No forced weekly assignment, background fetch, infinite scroll, or required AI | excluded | Parent bars them from the first version |
| Save, start, complete, or put down; an unfinished attempt may keep a memory | first version | Attempt statuses |
| Edit and undo completion update the cabinet | first version | One attempt row, then the cabinet reads it |
| No due dates, failure state, streak loss, or push notification | excluded | Parent bars them from the first version |
| User-chosen attempt date and optional note | first version | `civil_date` and `note` |
| Bounded local SVG/CSS stamps and a user-chosen motif, saved with the memory | first version | `stamp` is stored on the attempt |
| Readable stamp text, keyboard access, reduced motion keeps the full experience | first version | Screen 5 and screen 6 |
| Cabinet by category and date, open and edit, plain list | first version | Cabinet screen |
| Empty state sentence and a working create action | first version | Exact parent sentence |
| A completion is never manufactured from another app's event | first version | Only an attempt the user saves |
| Lock and unlock from the originating route | first version | Existing unlock `next` parameter |
| Lock, logout, and account change clear personal text and drafts | first version | Locked screen |
| Export and restore include every Sidequests record | first version | Required before user-writable rows ship; waits on #121 |
| Delete explains the effect and survives a failed request | first version | Idea editor |
| Proposed route `/sidequests` | first version | Future shell composition. Not added in this PR |
| Proposed field-notebook and stamp-cabinet identity | unresolved | Parent also asks which metaphor to use |
| Hub card | later candidate | Parent defers it so the Hub stays as it is |
| Seven named starter cards | first version | Bundled deck content |
| Bands are rough choices the user can change | first version | Optional idea fields |
| Do not infer bands from Finance, Health, location, or browser activity | first version | Eligibility uses stored bands only |
| Starter deck avoids weight or fitness targets, risky dares, and spending pressure | first version | Deck content rule |
| Domain lives in `apps/sidequests/` and the shell uses a narrow public API | first version | Future leaf boundary. No folder in this PR |
| Reuse suite UI and vault contracts; no separate login, crypto, event bus, or Town/World engine | first version | Reuse table |
| Personal fields are versioned, owner-bound vault records; the deck is non-personal | first version | Records section |
| Settle the minimal collection schema in design | first version | Collection `sidequests`, schema 1, two kinds |
| No plaintext activity backend | excluded | Parent bars it |
| #121 collection, export, restore, and lock contracts cover the new collection before implementation | first version | Gate on the future writable slice. #121 is open |
| Town, Health, and current core journeys stay ahead of this app; #125 keeps operational recovery | first version | No queue insertion and no new ops store |
| Travel and Media links tolerate missing and deleted records | first version | Unavailable link label |
| No new provider APIs, Finance totals, Health measurements, calendar tokens, background surveillance, or geolocation | excluded | Parent bars them |
| Future Town/World cameo uses an explicit coarse opt-in through a public facade, without a second XP or completion source | later candidate | Parent excludes it from the first version and describes the later shape |
| Create, choose, start, record, reload, edit, undo, archive, delete | first version | Acceptance for the future slice |
| Repeat is explicit and does not overwrite the earlier memory | first version | New attempt row |
| Deterministic eligibility, empty pools, and redraw; list works without animation or drag | first version | Draw rules and list screen |
| 390 and 1280, light and dark, keyboard, focus return, reduced motion, accessible names | first version | Screen requirements |
| Loading, unavailable, retry, corrupt record, and revision conflict keep a useful draft | first version | Failure behavior in the records section |
| Personal titles, notes, and references stay out of plaintext requests, `localStorage`, URLs, logs, and other accounts | first version | Ciphertext plus lock clearing |
| Lock during load or save drops stale results and clears personal content | first version | `openVaultRecords` eligibility |
| Export and restore recover ideas and memories; corrupt, unsupported, or interrupted input does not partially replace rows | first version | Same gate as #121 |
| Applicable AGENTS checks pass before any implementation PR; suites are not skipped | first version | Future leaves use the root gates for the files they touch |
| Center of gravity: tiny local adventures, learning and making, or memorable firsts | unresolved | Parent asks the owner. The deck keeps every parent example until then |
| Cabinet metaphor: passport stamps, specimen drawer, or trading cards | unresolved | Parent asks the owner. Stored stamp ids do not depend on the choice |
| Lead ritual: pick for the weekend, or capture something already done | unresolved | Both actions exist. Neither is marked primary |
| Seasonal bingo, a structured multi-attempt experiment, a sealed note | later candidate | Parent calls these seeds. A second attempt row is already in the first version; a structured experiment is the later seed |
| Photos, uploads, sharing, leaderboards, AI coaching, recurring reminders | excluded | Parent places them outside the first version |

## Future leaf boundaries

These are review boundaries for a later scheduling decision. They are not
queue entries, and DISC-01 does not authorize them.

1. **Collection owner.** Add `sidequests` as a third disjoint owner subset, with the codec, unknown-version behavior, and Finance/Health exclusion. Prove account cleanup removes the rows. No page.
2. **Shell route.** Lazy public API from `apps/sidequests`, mounted in `routes.ts` and `routes.json`, one private-layout link, `authGuard`, direct load and refresh. No Hub card.
3. **Shelf, attempt, stamp.** Idea and attempt screens, reload, conflict, undo, archive, delete, repeat. Lock and privacy tests. Depends on boundary 1, and on merged export/restore that includes the collection.
4. **Deck and cabinet.** Versioned deck, draw, list, cabinet, empty state, 390/1280, theme, keyboard, reduced motion. Depends on boundary 3.
5. **Source links.** Optional trip and library-entry ids, missing-target state, narrow public lookups. No provider calls. Depends on boundary 3.
6. **Recovery proof.** Round-trip the collection through the export contract merged in SEC-05 and the restore leaf that actually lands. Restore stays with that security owner.

Likely files once implementation is selected: a new `apps/sidequests/` owner;
`apps/web/src/app/routes.ts`; `apps/web/routes.json`;
`apps/web/src/app/private-layout.component.ts`;
`apps/finance/backend/services/encrypted_storage.py` and its policy test;
`scripts/check_collection_policy.py`; Finance foreign-collection copy only to
refuse decrypt. Media and Travel public modules change only if boundary 5
adds a lookup. Town, World, Pixels, Hub, and Finance math stay out of
boundaries 1–4.

Future tests, none of which this PR runs against an app: draw windows and a
short pool; missing band versus an active filter; adopt-once then repeat;
undo completion; conflict keeps the draft; lock drops personal plaintext and
stale saves; a second account cannot read the rows; unsupported schema is
not rewritten; delete failure keeps the row; no personal field in the URL,
`localStorage`, or logs.

## Unresolved owner choices

- Whether to implement Sidequests at all.
- Which center of gravity leads the voice and deck order.
- Passport stamps, a specimen drawer, or trading cards, including whether the suggested field notebook is the identity.
- Which home action leads, "Pick a card" or "Capture something I did".
- The closed band vocabulary, and the band tags on starter cards other than the Saturday example.
- Whether a later Hub card, search hit, or Town review link is wanted. The parent already defers the Hub card and the cameo; it does not choose them.

## Machinery that must not be added

A second vault, login, crypto stack, event bus, XP ledger, plaintext
recommendation service, image upload, background fetch, geolocation, provider
client, Finance total, Health measurement, or generic form engine. A prototype
folder "for later." A copy of this proposal in `queue.json`. A Sidequests
fact derived from a trip, a habit, a pixel, or a library save the user did
not record here.
