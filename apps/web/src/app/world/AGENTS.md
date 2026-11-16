# World

The [plain controller](data/world-controller.ts) owns loading and snapshots;
[component](ui/world.component.ts) owns Angular/DOM lifetime.
[Logic](logic/) and [render](render/) contain existing camera/generation/paint owners.
Read their tests before replacing repeated calculations.

Keep one live controller composition path. Verify consumers before deleting wrappers;
do not adopt an unused singleton merely because it exists. Route leave/reentry,
session change and lock must dispose or invalidate the old owner. A losing timeout
must not publish later. Keep public Town content separate from private budget/chest data.

Preserve deterministic generation/golden vectors, URL reload/back-forward,
concept invalidation, pointer/keyboard camera, reduced motion and theme redraw.
The `day=YYYY-MM-DD` query is an exact civil date; legacy `week=` links select
Monday. Explicit visits create history entries; camera movement replaces only
its settled selection. Restore browser popstate even when Angular skips the URL.
Use the renderer's `sceneObjects` bounds for both painting and picking; do not
copy sprite footprints into interaction code. Media occurrence IDs include date.
The activity overlay marks recorded ground without hiding unrecorded terrain;
future and failed reads must remain distinct. Private chest/health overlays clear
on vault lock; session clearing removes the entire previous view.
Changing habit semantics into Finance budget semantics is not a cleanup.

Measure the whole World subtree when simplifying the component: moving code to new
classes is not a reduction. Prefer existing pure helpers over new controller layers.
Use root shared/web gates and World browser regressions for affected behavior;
engine changes also require the existing purity and deterministic-output checks.
