# Deletion-first implementation contract

The owner explicitly prioritized strong LOC and complexity reduction. The active
queue therefore treats removal of redundant decisions/paths as an outcome, not an
optional polish step after adding more layers.

## Three classes of removal

1. **Authorized implementation cleanup:** verified orphan wrappers, independent
   copies of the same lifecycle/format/transport behavior, stale state caches,
   obsolete source comments, duplicated selectors and pass-through machinery.
   Migrate callers and prove behavior, then delete the old path in the same PR.
2. **Compatibility retirement:** runtime fallback/enrollment/version paths can be
   removed only after current supported data/users/clients and upgrade/recovery
   requirements are checked. A conditional target is not permission to break
   existing records. Preserve applied migrations and fixtures proving supported
   history. DEL-02 owns the eligibility inventory and eligible retirement work.
3. **Product simplification:** removing Stock Lab, a planning mode, provider/media
   type, World behavior, history or existing user journey can have a larger LOC
   effect, but changes the product. Record the exact tradeoff and get the owner's
   explicit selection; no leaf silently cancels that scope to report savings.

## What every leaf must prove

- Identify the authoritative owner and actual consumers before editing.
- State which old implementation, state variable, branch, class, listener, adapter,
  selector or manual contract copy disappears.
- Show migrated consumers; no parallel complete implementation remains.
- Record production code deleted/moved/added separately from tests/docs/generated
  content and explain any necessary guard/codec additions.
- Demonstrate the named behavior and negative/race cases still work. Removing
  tests, useful rationale or compatibility without proof does not count as savings.
- For new product functionality, reuse the existing engine instead of adding a
  second one. A feature may add lines while eliminating duplicate machinery; say so.

## Architecture budget

Default to one plain owned helper/adapter plus a parity check. A new layer or
framework must identify two actual consumers, duplicated decisions removed, a
bounded public surface, failure/disposal ownership and deletion of the replaced
paths. No generated form engine, plugin loader, universal event store, second vault
or database, generic repository hierarchy or package-per-helper is required here.

Moving a1,000-line component into ten files is not inherently a saving. A successful
refactor eliminates competing authorities, reduces repeated decisions and has
negative production delta where that can be achieved without losing guarantees.
Safety/correctness additions are reported honestly rather than hidden in a quota.

The dated technical-debt report remains evidence. The executable packet is the
bounded scope; all forty recommendations are not prerequisites to every useful fix.
