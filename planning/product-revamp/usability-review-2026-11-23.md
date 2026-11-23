# Follow-up UI, usability and product vision review

The strongest direction is a small coastal Town that is fun to visit, backed by
practical apps that open directly at the work. Reading Hall already has a
recognizable three-quarter room, a grounded desk and a shelf you can inspect.
Apply that same care to what happens after a tap. A result, next input or useful
object should appear in reach of the selection, and leaving should take you back
to the task you were doing.

Three reproduced defects come first. Search can open a result from the previous
query. Weekly review can discard an unsaved note when leaving for Hall. Memory
Shelves drops keyboard focus after a successful match. These need behavioral
fixes alongside the work on density, placement and art.

## What the interface should ask people to read

| Situation | Leave on screen | Move to the place it helps |
| --- | --- | --- |
| Arriving at a screen | A recognizable title, useful current state and the next likely action or actual record | General background, repeated route labels and dormant alternatives |
| Choosing an object | Its name, selection feedback and the action or information it opens | Camera instructions, empty inspector text and secondary measurements |
| Entering or editing a record | The field needed now, its unit or constraint and a truthful Save, Apply or Finish action | Advanced settings, storage details and contributions that only matter when editing |
| Waiting or correcting | A short local status, a next action and any protection against irreversible loss | Extra success banners and repetitive descriptions of what the control just did |
| Browsing past activity | The date or period, actual record, and a direct path to its source | Provenance rules shared across rows. Keep uncertainty, coverage and meaningful missing states close to the value. |

A phone should show a real task entry, record or useful empty action in the first
viewport of the journeys below. Put tightly related controls and feedback in the
same visual area. An optional panel should earn its place through repeated use
or make the primary task safer. Keep genuine range, money, irreversibility,
accessibility and source distinctions at the point of decision. In Town, make
art and object feedback carry the place and interaction. Keep practical text
legible and the scene optional for anyone who already knows the task.

## Review baseline

Four reviewers covered the shell, public pages and Settings, Town and games,
Finance and Travel, and Media, Pixels and Health. We read the selected design,
live issues, prior FIXUPs and new merge evidence. All browser measurements refer
to the compiled bb300824 build with isolated synthetic data unless noted. That
revision includes the changes to Home, Weekly review, Memory Shelves, Clinics,
Treasury, the rest timer and Stamps through PR #602. Phone and desktop reviews used
390×844 and 1280×800 with light/night fixtures, with selected 320px runs and
keyboard/touch journeys. Coordinates are approximate CSS pixels from the start
of the document unless they refer to a menu or dialog. The deployed site was
checked signed out. [Selected design](design.md) · [Acceptance](acceptance.md) ·
[Prior audit](fixup-audit-2026-11-23.md) ·
[Reviewed revision](https://github.com/Vivekpsps3/vivek-monorepo/commit/bb3008249f2f97d88ce89a32a1715fda4c00ab46)

## Central routes and preferences

| Journey | Browser or source evidence | Owner |
| --- | --- | --- |
| Search from anywhere | Searching Portland, changing the text and pressing Enter immediately opens Portland at 320, 390 and 1280px. The loss of server search also clears the client Finance options in the response handler. | [FIXUP-16](../implementation/issues/FIXUP-16.md) |
| Switch apps | The 390px switcher opens with 35 links. Town begins near y744 and Pixels near y942, after the earlier apps' sublinks. Lead with app names and keep frequent direct destinations within two navigation actions. | [FIXUP-17](../implementation/issues/FIXUP-17.md) |
| Change a preference and resume | Trip → account menu → Settings → Appearance has an index back link and a generic Town preview. It has no named return to the trip. At 390px the season panel begins around y490 and Save season around y1357. The same button applies Sound. | [FIXUP-18](../implementation/issues/FIXUP-18.md) · [FIXUP-19](../implementation/issues/FIXUP-19.md) |
| Start from the Hub | The new Weekly review link is reachable. Preserve it while the existing Hub work compacts duplicate domain panels and fixes Health destinations. | [FIXUP-01](../implementation/issues/FIXUP-01.md) · [FIXUP-12](../implementation/issues/FIXUP-12.md) |
| Manage account, calendars and connections | The grouped Settings index is useful. Flight schedules and Travel both expose the FlightAware form. Game mostly links to Appearance and Town today. Give each preference or connection one obvious home as the remaining preferences and connectors land. | [GAME-14](../implementation/issues/GAME-14.md) · [PHOTO-02](../implementation/issues/PHOTO-02.md) · [NOTE-02](../implementation/issues/NOTE-02.md) |
| Sign in and use the public site | Home, Work, About, the encryption demo and private sign-in return were checked on the deployed origin. Sign in and its fields fit at 320px. The Account self-link and long welcome paragraph are candidates for less recurring copy. At 390px the demo puts Encrypt message near y977 after its explainer. The public demo would benefit from putting the exercise above the optional explanation. The selected private revamp leaves portfolio presentation outside its scope. | [Public demo](https://vivekpanchagnula.com/secrets) · [Sign in](https://vivekpanchagnula.com/auth/login) |

## Town, rooms and play

| Journey | Browser or source evidence | Owner |
| --- | --- | --- |
| Arrive and explore | New links push a first-visit map to about y1215 and Today to y2498. The first FIXUP pass owns phone arrival, exterior art, Harbor and Hall/Reading Hall inspection. | [FIXUP-02](../implementation/issues/FIXUP-02.md) · [FIXUP-03](../implementation/issues/FIXUP-03.md) · [FIXUP-04](../implementation/issues/FIXUP-04.md) · [FIXUP-10](../implementation/issues/FIXUP-10.md) |
| Enter Treasury and inspect a record | The locked door unlocks back into Town. An unlocked door with no spending plan opens Finance Planning. The real rooms are in Finance Accounts. Inside, a drawer opens Edit asset on selection. Gallery duplicates selected records, has ten leading filters, and a ledger selection scrolls to the position inspector without moving useful focus. | [FIXUP-20](../implementation/issues/FIXUP-20.md) · [FIXUP-21](../implementation/issues/FIXUP-21.md) |
| Visit and decorate Home | The default Home view presents a top-down 12×12 grid. At 390px the floor fills y343–800 and the first inspector is near y1117. A browse visit needs a readable room and purposeful objects. Put the explicit grid in decoration mode and keep the same placement owner. | [FIXUP-30](../implementation/issues/FIXUP-30.md) · [FIXUP-15](../implementation/issues/FIXUP-15.md) |
| Reflect and leave | Earlier guards a dirty note. Hall leaves with no prompt and reopening the same week shows the last saved entry. With 52 saved weeks the form starts near y1686 and Save near y2256. Keep the current editor and explicit return first. | [FIXUP-22](../implementation/issues/FIXUP-22.md) |
| Play Memory Shelves | Matching shelves 1 and 12 drops keyboard focus to the page body and leaves no enabled tile in the roving tab order. Resume, matching, feedback and finish need one uninterrupted path. | [FIXUP-23](../implementation/issues/FIXUP-23.md) · [FIXUP-06](../implementation/issues/FIXUP-06.md) |
| Discover, spend and revisit | The Stamps screen exposes internal receipt wording before the workshop owns the user-facing purchase. Prioritize chosen item, price, current balance and immediate result in the shop. Keep chapters, residents and discoveries optional and let the World migration preserve sources before the separate surface retires. | [GAME-02](../implementation/issues/GAME-02.md) · [GAME-13](../implementation/issues/GAME-13.md) · [MERGE-03](../implementation/issues/MERGE-03.md) |

## Practical journeys

| Journey | Browser or source evidence | Owner |
| --- | --- | --- |
| Browse accounts, holdings, activity, bills, pay and imports | Holdings remains a useful direct destination. Activity’s first mobile row appeared around y959 after month controls, summary and toolbar. Keep cashflow provenance and dates where they change interpretation. Starter import handoff and Treasury inspection already have focused owners. | [FIXUP-13](../implementation/issues/FIXUP-13.md) · [FIXUP-21](../implementation/issues/FIXUP-21.md) |
| Open a Finance Planning tool | Retirement’s first input sits near y1636. With holdings and no spending evidence, the UI shows a $0 target, $0 gap and zero years. Start at the chosen tool and distinguish a missing input from deliberate zero. | [FIXUP-26](../implementation/issues/FIXUP-26.md) |
| Navigate and edit a trip day | A direct nine-day trip link for Nov 23 starts at scroll position zero. The named day is near y2230 on phone and y1903 on desktop. Edit activity opens an Add activity dialog. A lower reminder form saves its visible row about 1,780px above. | [FIXUP-24](../implementation/issues/FIXUP-24.md) |
| Set up PTO or plan a new trip | PTO leads with optional Sick. At 390px the first actual PTO setup field is near y1983. With a policy, Add time off still starts around y1445. New trip modes and Memories density already have an owner. Travel Home also places its PTO prompt above a current trip in the measured fixture. | [FIXUP-25](../implementation/issues/FIXUP-25.md) · [FIXUP-09](../implementation/issues/FIXUP-09.md) · [FIXUP-14](../implementation/issues/FIXUP-14.md) |
| Find or capture Media | First partial-provider match is near y1824 on a phone. Two Add manually links and a second manual form compete with that result. Return from a prefilled manual Book drops the original Search query. | [FIXUP-27](../implementation/issues/FIXUP-27.md) |
| Resume a series | Mark next watched starts around y1780 on the saved detail, below generic edit fields. A return from the August Calendar goes to the Series library and loses the month. Keep the episode action and source return close to the title. | [FIXUP-31](../implementation/issues/FIXUP-31.md) · [FIXUP-05](../implementation/issues/FIXUP-05.md) |
| Open a particular date | Pixels Year uses 25px touch cells at 390px and about 19px at 320px. Its alternate table gives all 365 rows sequential Tab stops with Enter-only activation. Preserve the overview and provide deliberate exact-date navigation and keyboard parity. | [FIXUP-28](../implementation/issues/FIXUP-28.md) · [FIXUP-07](../implementation/issues/FIXUP-07.md) · [FIXUP-08](../implementation/issues/FIXUP-08.md) |
| Log a set and see the next field | Gym Add session begins as Completed, gives competing Save and Finish paths and starts first Load near y1089 on phone. After adding a set, focus stays on the button below the growing list while the next field has scrolled out of view. Existing Escape and same-tab draft recovery worked. | [FIXUP-29](../implementation/issues/FIXUP-29.md) · [FIXUP-11](../implementation/issues/FIXUP-11.md) |
| Read or correct a Clinic result | Lab results appear as chart data, separate range rows and separate editable duplicates. The first Edit is near y1449 at 390px even after selecting the folder. Keep one useful trend summary and one action per actual row. | [FIXUP-32](../implementation/issues/FIXUP-32.md) |

## Execution and review

Apply the existing interaction and data-preservation gates to each fix. For
integrated review, run the same small journeys in both input modes and both
themes. Measure when a first useful action is visible, where focus lands after
it, what is recoverable after failure, and whether source context survives
return. Use a first-visit account, an ordinary weekday, long history and an
unavailable source. Use synthetic owner changes for privacy and held-response
tests. Ask the owner to judge the art and perceived effort from the actual
build during the existing visual review.

The [FIXUP tracker](https://github.com/Vivekpsps3/vivek-monorepo/issues/578) and
[single execution queue](../implementation/README.md) own the work. The new
packets cover concrete gaps. Existing implementation and integration packets
still own upcoming connective features, owner art review, protected-source
checks and frame/query budgets. Production account data, release activation,
owner art approval and a full accessibility certification were outside this
audit. [QA-02](../implementation/issues/QA-02.md) · [QA-04](../implementation/issues/QA-04.md)
