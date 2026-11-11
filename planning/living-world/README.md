# Living World — your life leaves a place behind

Tracking parent: [#304](https://github.com/Vivekpsps3/vivek-monorepo/issues/304); roadmap [#134](https://github.com/Vivekpsps3/vivek-monorepo/issues/134).

Status: owner-requested implementation plan, 2026-11-11. Planned, not implemented,
visually approved, merged or deployed. The owner priorities are **beautiful,
interactive and informative**; all three are release requirements. This plan
extends shipped Town/Pixels/World rather than replacing their domain engines.

Town is home; World is the journey around it; Pixels is the view from above.
A real action creates a legible consequence, an opportunity for expression, and
an accurate memory that can be revisited. Visiting should feel worthwhile even
when nothing new was recorded. The experience serves life outside the app.

## Start here

| Question | Authority |
| --- | --- |
| What are we making and why? | [Experience and art direction](experience.md) |
| Which initial assets, anchors and ornaments are included? | [Initial catalog](catalog.md) |
| What does every interaction actually do? | [Interaction and information specification](interactions.md) |
| Who owns facts, dates, privacy and persistence? | [Architecture and compatibility](architecture.md) |
| How do we prove beauty, usability, truth and performance? | [Acceptance and release](acceptance.md) |
| What existing commitments survive? | [Scope reconciliation](scope.md) |
| Which PR is next and what must it deliver? | [Execution queue](../implementation/README.md), `queue.json`, exact `PLACE-xx` packet |

The numbered design documents are requirement context, not a second execution
queue. Executable acceptance lives in the linked packets. Changes to this scope
must update its packet and GitHub leaf together. Evidence is recorded only after
execution in `planning/implementation/evidence/PLACE-xx.md`.

## Product shape

- **Town / Tend:** a composed coastal garden and civic buildings, with a fast
  Today panel, personal placement and understandable progression.
- **World / Explore:** inspectable habit structures, media artifacts, learning
  beacons and travel landscapes, each tied to its real source and civil date.
- **Pixels / Remember:** an orientable Year/Life atlas, factual patterns and
  selected moments, with exact date passage into World and back.
- **Hall / Understand:** rules, history, appearance and the existing selected
  encrypted weekly review. No competing editor, currency or activity warehouse.

## Delivery milestones

**First playable loop:** PLACE-01–05 plus PLACE-06's dated inspector. One garden,
one habit, one immediate response, one selected day reached through Pixels and
World and returned to intact. This slice must be beautiful enough to evaluate
before expanding the asset catalog. Existing TOWN-02/03/04 outcomes remain real
prerequisites where packets specify them; a fixture demonstration is not live
activity integration.

**Personal place:** PLACE-07–09 add the readable memory atlas, bounded placement
and milestone choice. **A place with history:** PLACE-10–13 add source-specific
keepsakes, residents, coherent arrivals and recaps. PLACE-14 proves the completed
experience and stages release. Exact dependencies/order are only in the queue;
these milestones describe review outcomes, not extra readiness rules.

See the [planning delivery record](planning-delivery.md) for issue locators, reconciliation and checks performed on this amendment.

## Deliberate limits

No avatar platformer, combat, crafting economy, universal XP, multiplayer, social
comparison, loot boxes, paid assets, AI-generated dialogue service, push reminder
system or new top-level app. No mandatory daily attendance, decay, missed-day
punishment, or rewards for spending more money. No automatic claim that an
unrecorded day was restful, bad, or unlived. Cosmetic variety never changes facts.

This is feature work and will add necessary code and art. Delete superseded
render/selection paths as consumers migrate; report net growth honestly. Keep
historical migrations, useful tests and the shipped accessible alternatives.
