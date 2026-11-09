# SAFE-02 — implementation evidence

- Leaf issue and parent(s): #202; parents #198 and #90 stay open
- Agent/context, branch/worktree: SAFE-02 completion in `/home/vivek/Deployments/worktrees/vivek-safe-02`, branch `agent/safe-02`
- Base main SHA, current tested SHA: base `f143d2ecb5bffb60784585f95f65b990fa4c19bb`; tested code `721ebc7baf62ab01ac3f3487cea2b66a34072f17`
- Fresh-main/prerequisite/active-PR checks: SAFE-01 is in this base via #279. DEL-01 #287, UX-02 #288, and DEL-05 #289 are merged in the base. No competing SAFE-02 claim.

## Acceptance

| Row | Current proof/test | Result | Artifact or command |
| --- | --- | --- | --- |
| LOCAL1 | Held decrypt, then lock/abort, including a vault that is present again; stage facade; older load cannot overwrite the newest | PASS | `health-store.service.spec.ts` inside web Karma, 645 SUCCESS |
| LOCAL2 | Held load, save, and conflict refetch during an owner switch; held list/save/delete cancel on abort, logout, or service disposal | PASS | same spec |
| LOCAL3 | `fakeAsync` deadline, then the late decrypt resolves | PASS | same spec; result stays `unavailable` and snapshots stay empty |
| LOCAL4 | Existing load/save/delete/conflict/corrupt-row specs, plus marker assertions on the new races | PASS | same spec; v1/corrupt rows still counted, conflict still refreshes kg |

## Deletion and compatibility

| Candidate | Previous consumers | Surviving owner | Removed / moved / retained | Proof |
| --- | --- | --- | --- | --- |
| Start-only `financeVaultPresent()` check and unguarded assignment after decrypt, upsert, refetch, and delete | `HealthStoreService.load`, `upsert`, `refetch`, `remove` | One generation plus load id checked before every snapshot write | Removed the assumption that the entry-time check is enough. `requirePresent()` is gone. | LOCAL1–LOCAL3 fail if a late assignment lands |
| In-flight vault list/upsert/delete left subscribed after abort or lock | Health store vault calls | `observe()` unsubscribes on the caller signal or the store stop signal | Replaced bare `firstValueFrom` for those calls | `listCancelled`, `upsertCancelled`, and `deleteCancelled` |

- Production added/deleted/moved: `health-store.service.ts` +189 / −37 in the implementation diff. Net increase is the owner/generation/abort guard. No second store.
- Tests/docs/generated changes separately: `health-store.service.spec.ts` +329 / −46. No docs or generated files.
- Remaining necessary overhead and why: generation, load owner, and abort linking stay. WebCrypto decrypt itself is not cancellable; the store drops the result instead.
- No behavior/data/meaningful assertion silently removed: v2 refusal, corrupt-row counts, revision conflicts, and `logged_on` preservation remain.

## Verification

Commands ran from `/home/vivek/Deployments/worktrees/vivek-safe-02` with `CHROME_BIN` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` set to `/home/vivek/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` and `PYTHON` set to the main checkout `.venv`.

| Command | Result |
| --- | --- |
| `make lint-web` | PASS. eslint baselines matched, including 469 finance findings |
| `make typecheck-web` | PASS |
| `npm run test:web -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 645 SUCCESS |
| `npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI` | PASS. 755 SUCCESS |
| `make e2e` | PASS. 239 Finance Playwright tests passed |
| `npx playwright test --config apps/web/e2e/playwright.config.ts` | PASS. 52 passed |
| `npx playwright test --project=suite` | PASS. 24 passed |

The focused health spec was run once before the final `const` lint fix. The full web Karma run above is the final source.

## Handoff

- PR URL (leaf closure keyword only): https://github.com/Vivekpsps3/vivek-monorepo/pull/290
- Roadmap #134 append-only status-note URL: posted with this evidence update
- Merged/activation status: not merged, not deployed
- Remaining external prerequisites or approved scope decisions: none for this leaf. SAFE-03 still depends on this merge.
- Next actor: review and merge #202
