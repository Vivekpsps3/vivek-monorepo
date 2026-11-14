# Roadmap handoff — 2026-11-14

Read live status again before execution. This is a review of current evidence,
not another queue or a change to task priority. The only execution authority is
the ordered [queue](../../implementation/README.md) filtered by real merged
outcomes and live claims.

## What is next

At main `5bc07c2aab4345446f408d6e331cd1bef193f4d6`, the live unfiltered planner's
first open leaf is **CON-02 / #207**, route drift checks. Its outcome still needs
verification before implementation; open status alone does not establish that
current source lacks every acceptance row. There were no open PRs at the read.
The first open leaf in the owner-selected Living World scope is
**PLACE-01 / #305**, the rendered design, storyboard and baseline in this pack.
Neither this local work nor the prior planning merge proves product delivery.

The product target is one complete, modest loop: **save a habit → tend its garden
→ see confirmed feedback → inspect a dated object → select that day in Pixels →
visit World → return to the same selection**. Validate that before expanding the
catalog, residents or customization. The fourteen existing PLACE packets already
own the rest of the product; no new tracking parent or duplicate backlog is needed.

## Dependencies that matter to this design

| Required outcome | Existing owner / packet | Why it matters |
| --- | --- | --- |
| Rendered design and measured reference | [PLACE-01](../../implementation/issues/PLACE-01.md) | Establish the visual target, state/focus contract and baseline before new consumers |
| Bounded dated facts and learning annotations | [PLACE-02](../../implementation/issues/PLACE-02.md) | Let inspectors explain real source dates/counts without a central activity warehouse |
| Route drift protection | [CON-02](../../implementation/issues/CON-02.md) | Required by the exact-date route work and Hall |
| Finance-backed Treasury | [TOWN-03](../../implementation/issues/TOWN-03.md) | Current source still uses habit-week presentation; new art must not disguise that gap |
| Retained Town interaction regressions | [TOWN-04](../../implementation/issues/TOWN-04.md) | Preserve actual action, failure and lifecycle guarantees before replacing the scene |
| Working Hall and appearance owner | [TOWN-05](../../implementation/issues/TOWN-05.md) | PLACE-04 consumes the real season/rules outcome |
| Exact-date passage | [PLACE-03](../../implementation/issues/PLACE-03.md) | Requires PLACE-01 and CON-02; date restoration precedes cross-scale effects |
| Composed garden, confirmed response and World inspector | [PLACE-04](../../implementation/issues/PLACE-04.md), [PLACE-05](../../implementation/issues/PLACE-05.md), [PLACE-06](../../implementation/issues/PLACE-06.md) | These complete the first playable experience with the preceding outcomes |

This explains the relevant dependency edges; it is not a recommendation to skip
unrelated queue leaves or to infer that a closed prerequisite is satisfied.
After PLACE-01, run the planner again. PLACE-02 has no additional dependency;
PLACE-03 and PLACE-04 retain the route and Town dependencies above. Verify actual
source and prerequisite evidence, not just the task flags.

```sh
python3 planning/implementation/plan.py list --live
python3 planning/implementation/plan.py list --live --parent 304
python3 planning/implementation/plan.py launch PLACE-02
```

## The remainder stays attached to its real owner

PLACE-07 makes the memory atlas informative after World inspection and the merged
phone-orientation fix. PLACE-08/09 add twelve revision-safe anchors and existing
milestone choices; the preserving TOWN-07 ownership migration remains required.
PLACE-10/11 derive Media keepsakes and trip souvenirs from their actual records.
PLACE-12 adds purposeful residents. PLACE-13 unifies compact Hub arrivals and
range recaps using the existing Hub summary. PLACE-14 proves the integrated
experience and release. Exact order and full dependencies stay in `queue.json`.

Clinic/Gym remain HEALTH-01–03, with private vault records and stage-only map
presentation. Encrypted weekly reflection stays TOWN-06 and still depends on the
selected export/restore contracts. Hub account/agenda/quick-add/calendar work
stays HUB-01–06. Sidequests and Cards stay their bounded discovery packets; this
design does not create top-level apps for either. Existing cancelled proposals
are not revived by “etc.”

The first scene must represent locked/unavailable sources honestly while those
features are unfinished. None of them is an excuse to fabricate progress or
replace missing integration with a green fixture demonstration.
