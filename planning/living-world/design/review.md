# Visual review and implementation obligations

Review date: 2026-11-14. Reviewer: implementation agent. This is a reasoned design
review of rendered static compositions; owner taste approval and independent
human usability research are not claimed. Rendering and source are distinct
from a working application. [Render inventory](render-results.json) records the
64 state/theme/size combinations plus the catalog sheet.

## Rubric

| Criterion | Evidence and judgment | Disposition |
| --- | --- | --- |
| Composition | Town's coast/path/garden form one place; Today remains an adjacent desktop work panel and a direct phone jump. The first garden has a deliberate focal target. | Suitable reference for PLACE-04; retain practical controls before ambience |
| Legibility | Warm ink/paper and dark ink/luminous text use separate palettes. Headings and button labels wrap at doubled text size. Narrow atlas uses a dated table when targets cannot fit. | Corrected clipping and button spacing; all 65 final renders have no text outside their canvas |
| Silhouette recognition | Library books/window, inn luggage/sign, garden trellis, forge chimney and beacon distinguish source kinds at the common baseline. | Catalog studies establish vocabulary; final existing stage variants still require PLACE-04 review |
| Selection | The scene selection has a visible boundary; the named inspector repeats the selected object/date. Pixels adds an outline and date panel. | Production must add focus/pattern/high-contrast equivalents and named DOM controls; color alone is insufficient |
| Purposeful detail | Chalk paths lead between civic buildings and habit lots. A book/concept is inspectable history, not an unexplained badge. | Keep public facts and private overlays distinct; no decoration may imply an earned state before save |
| Consistency | Town, World and atlas share quiet UI chrome, date language and source explanations; only the scene owns the coastal colors. | Keep the same asset vocabulary while retaining DOM Town and canvas World owners |

## Defects found and corrected in this review

- Enlarged headings clipped in phone inspectors and Hall: wrap at the same text
  size and allow vertical scrolling.
- Doubled-text Menu/action labels exceeded their button width or touched the next
  line: enlarge/wrap buttons and preserve spacing after them.
- A current-week study initially showed an August book inspector: current week
  now selects the 29 October habit; the August source belongs to the memory study.
- Phone atlas initially made the legend remote from useful context: show an
  orientable eight-week window and a separate narrow/enlarged table treatment.
- The first garden initially omitted the fixed Treasury silhouette: keep the
  fixed civic structures in the composition and explain its locked source.

The final Chromium text-bound check is a useful constraint, not a proof of all
typographic spacing, accessibility or beauty. Representative desktop light/dark,
phone, 320px, doubled-text and catalog renders were visually inspected after the
corrections. No participant task-success rate or accessibility score is invented.

## Explicit implementation checks

These are retained acceptance requirements, not unresolved design alternatives:

- Use the existing suite navigation/menu; the study's sibling links do not
  authorize a new global nav system or an extra top-level Hall app.
- Scene targets need visible names or a nearby equivalent named list, 44px hit
  areas, keyboard inspection and source actions. Decorative SVG remains hidden
  from the accessibility tree. A painted selected box is not a DOM control.
- Keep legend, selected date and weekday/month references discoverable during
  actual Pixels scrolling. Preserve UX-05's calendar geometry and existing score.
  The sample tints are illustrative, not computed sample intensity levels.
- Show actual lot locks, all supported lots and Clinic/Gym stage availability.
  The mature study establishes composition and does not remove any retained lot
  or assert that every stage variant is authored. Inspect and verify final labels,
  stage silhouettes, long names and private lock clearing in PLACE-04.
- Reduced motion, forced colors, focus restoration, screen-reader semantics,
  pointer/touch hit testing, storage failure and browser history need real browser
  execution in their owning feature leaves. Static SVG text reflow cannot prove
  browser zoom behavior or interactive accessibility.
- Keep the [performance budgets](../acceptance.md) and current factual/safety
  gates. Measured baseline figures are recorded separately; an unimplemented
  future feedback animation has no measured input-to-feedback result.

Owner review should assess the coastal identity, scale of the garden and balance
between scene and practical Today work before the remaining catalog expands.
This pack gives concrete artifacts for that review; it does not record approval.
