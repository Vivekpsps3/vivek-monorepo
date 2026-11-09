# Frontend and UX review — 2026-11-08

## Method and limits

Built the current checkout with `make build-frontends`, then used the existing
production-composition browser fixture server with a disposable database and
synthetic records. Reviewed Hub, Media library/detail, Travel home/create, Town,
Pixels Year, World and Settings. Tested 390×844 and 1280×900 in light mode;
repeated Hub, Media detail, Town, Pixels and World in dark mode. Checked the Hub
header at 641, 768 and 1024 pixels. Used reduced motion, keyboard/DOM inspection,
screenshots and axe. No private production records or external provider results
were used. Unlocked Finance screens were inspected in source, not included in
this browser walkthrough.

Checkout at build: `8b53c8005008839208bc3d9160fb2c02078119f7`.
Generated release manifest:
`35e1739d7c5c489b301f4dc8b099bffddd521d89a5b37cf8b1f365e1fe5f928b`.
This includes local work beyond the earlier GitHub main review; findings here
describe this local build and are not claims of independently verified production bugs.

Synthetic screenshots and machine-readable results were saved outside the repo
in `/tmp/suite-ux-review-2026-11-08/`: `findings.json`, `followup.json`, and named
page/width/theme PNGs. No screenshot or personal-data fixture is committed.

## Keep these strengths

- The warm paper/ink/teal palette feels coherent. Dark mode has its own readable
  surfaces. Reuse these tokens for Cards and Sidequests rather than introducing
  another UI kit.
- The app switcher, explicit locked Finance state, source-specific retry states,
  and Media's safe editable draft are useful foundations.
- No document-level horizontal overflow appeared at the reviewed widths.
  The sampled Hub, Media, Travel, Pixels and Settings screens produced no axe
  violations in the reviewed states. Town/World had the landmark findings below.
- Most controls have understandable labels and generous sizes. Existing table/list
  alternatives in Pixels/World are worth preserving.

## Reproduced defects

| ID | Finding and reproduction | Required outcome / ownership |
| --- | --- | --- |
| UX-1 | Open Settings, choose Profile: the Angular page works. Reload `/settings/profile`: HTTP 404 with `{"detail":"Not found"}`. Direct loads fail at both widths. Angular registers Profile, but the server route manifest omits it. | Fix route continuity in the focused UX follow-up. Direct load, refresh, back/forward and birthday links work under the same auth/CSP policy; unknown routes remain 404. Enable the currently omitted Pixels settings browser coverage. Coordinate #93/#125. |
| UX-2 | Town and World expose zero `main` landmarks. Town's root `header` is a second banner beside the suite header. Axe reports moderate `landmark-one-main`/`region` violations on both and duplicate/unique banner violations on Town, in both themes/widths. | Provide one main content landmark and a page heading without creating nested mains or duplicate banners. The shell's arrival-focus query requires `#workspace-content main h1`; test keyboard route transitions and that subsequent user focus is never stolen. Town markup coordinates with #81. |
| UX-3 | Click an old day in the Hub strip: it navigates to `/pixels?year=2026&day=…`. The target is a `div aria-hidden="true"` with no role/tabindex, so the date action is unavailable as a keyboard/assistive-technology control. | Give pointer and keyboard users equivalent date navigation, using existing date labels/roving focus, or make the strip genuinely decorative for everyone with an equivalent explicit date-selection action. Avoid 91 sequential tab stops. No hidden interactive targets. Coordinates with #93. |
| UX-4 | World displays two adjacent buttons both visibly labelled “Week”. Their aria-labels are Previous week and Next week, but sighted users have to guess the direction. | Show distinct direction text or arrows plus week context; preserve accessible names and deterministic navigation. Own in the focused follow-up; #102 need not be reopened. |

Source evidence: [route manifest](../apps/web/routes.json),
[settings registry](../apps/web/src/app/settings/settings.registry.ts),
[Town template](../apps/web/src/app/town/town.component.html),
[World template](../apps/web/src/app/world/ui/world.component.html),
[arrival focus](../apps/web/src/app/private-layout.component.ts),
[Hub template](../apps/web/src/app/hub/hub.component.html),
[World copy](../apps/web/src/app/world/world.types.ts).

## Design critique and bounded improvements

These are judgments from the walkthrough, not automated accessibility failures.

| ID | Observation | Proposed improvement / existing owner |
| --- | --- | --- |
| UX-5 | Hub's 13-week strip expands with the full-width card. At 1280 its grid measures 1046×562px; at 390 it is 324×173px. A glanceable summary becomes a large mostly blank calendar. | Bound the miniature's cell size/width independently of its panel and keep all 13 weeks. Review an approximately 180px maximum grid height at both widths. #93 owns Hub hierarchy; the focus issue tracks this regression until that slice has evidence. |
| UX-6 | A phone Pixels grid is a long field of squares without visible month/day axes; its legend follows the full grid. Screen-reader date names exist, but sighted orientation still requires selecting squares or switching views. | Add unobtrusive month/day references suited to the rotated phone layout, keep selected date and legend discoverable, and preserve table/keyboard access. This is a small follow-up to closed #100, not another Pixels rewrite. |
| UX-7 | Hub gives a large empty Next trip panel similar visual weight to useful activity, and stacks full-width Finance/Town/Pixels panels. It reads as separate summaries rather than “what should I do next?” Media's phone detail is a long generic form; Travel initially disables Save without showing validation. | Let #93's compact Up next lead, keep independent source states and condense empty/locked summaries. In #85, use progressive disclosure and kind-specific field language without discarding drafts. In #84, allow submission to explain errors and focus the first invalid field. Existing acceptance already covers these forms; do not duplicate their implementation here. |
| UX-8 | Town Today shows two rows called “Auto”, with `+0/10 XP` and `+0/15 XP`, without visibly identifying Media and Travel. “Auto ✓” also looks more conclusive than the currently stubbed source integration warrants. | #81 should name the source beside the earned/cap text and distinguish actual availability from no activity. Show how a source action changes the building; do not paint missing integration as completed. |

Source evidence: [Hub styles](../apps/web/src/app/hub/hub.component.css),
[Pixels grid](../apps/web/src/app/pixels/year-grid.component.html),
[Pixels legend](../apps/web/src/app/pixels/pixels-legend.component.html),
[trip creation](../apps/travel/frontend/src/new-trip.component.ts),
[Media detail](../apps/media/frontend/src/detail.component.html),
[Town Today](../apps/web/src/app/town/town-today.component.html).

## Sequence and verification

Fix UX-1–UX-4 before extending navigation for new app proposals. UX-5–UX-8
follow as small owned slices, alongside the existing core journeys. Keep #84's
spending link as the next product feature. Do not hold it behind a visual redesign
or convert every observation into a new framework/component rewrite.

For each implemented repair, exercise the actual trigger and result: reload
Profile, navigate with keyboard, select a date, change week, or correct a form.
Run applicable AGENTS checks locally, including relevant route/server, root
Karma and browser coverage. Check light/dark at 390/1280 and keyboard/reduced
motion. Fix the reported moderate landmark problems rather than relying only on
a serious/critical axe threshold. Existing gates and meaningful assertions remain.

For new proposals, [Sidequests #194](https://github.com/Vivekpsps3/vivek-monorepo/issues/194)
can have a field-notebook/stamp identity and
[Cards #195](https://github.com/Vivekpsps3/vivek-monorepo/issues/195) a tactile card
gallery. Keep their functional hierarchy distinct from their decoration: trying
an experience and recording a memory, or seeing dates/benefits that need attention.
Neither warrants another permanent top-level tab before navigation placement is
designed. This review authorizes issue tracking, not implementation or deployment.
